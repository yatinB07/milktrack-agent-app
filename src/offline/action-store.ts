import { getLeaseFreshness, systemClock, type Clock } from './clock';
import type {
  OfflineAccessScope,
  OfflineActionDisplay,
  OfflineActionState,
  OfflineOutcomeRequest,
  PendingBlock,
  VendorRouteScope,
} from './types';

type BindValue = null | number | string | Uint8Array;
type SqlResult = Readonly<{ changes: number }>;
type SqlExecutor = {
  runAsync(source: string, ...params: BindValue[]): Promise<SqlResult>;
  getFirstAsync<T>(
    source: string,
    ...params: BindValue[]
  ): Promise<T | null>;
  getAllAsync<T>(source: string, ...params: BindValue[]): Promise<T[]>;
};
type ActionDatabase = SqlExecutor & {
  withExclusiveTransactionAsync(
    task: (
      transaction: Readonly<{
        execAsync(source: string): Promise<void>;
      }>,
    ) => Promise<void>,
  ): Promise<void>;
};

type EnvelopeKeys = 'localSequence' | 'payloadVersion' | 'routeSyncId';
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, Extract<keyof T, K>>
  : never;
export type OfflineOutcomeDraft = DistributiveOmit<
  OfflineOutcomeRequest,
  EnvelopeKeys
>;

export type EnqueueActionInput = Readonly<{
  scope: VendorRouteScope;
  actionId: string;
  idempotencyKey: string;
  routeStopId: string;
  request: OfflineOutcomeDraft;
  clock?: Clock;
}>;

export type SafeActionError = Readonly<{
  httpStatus?: number;
  code?: string;
  message?: string;
  correlationId?: string;
}>;

export type OfflineAction = Readonly<{
  actionId: string;
  idempotencyKey: string;
  localSequence: number;
  actorId: string;
  vendorId: string;
  deviceId: string;
  routeStopId: string;
  serviceDate: string;
  routeSyncId: string;
  payloadVersion: 1;
  occurredAt: string;
  request: OfflineOutcomeRequest;
  display: OfflineActionDisplay;
  leaseServerTimeMs: number;
  leaseExpiresAtMs: number;
  leaseSavedAtWallMs: number;
  retentionDeleteAfterWallMs: number;
  state: OfflineActionState;
  blockedReason: PendingBlock | null;
  attemptCount: number;
  nextAttemptAtMs: number | null;
  lastHttpStatus: number | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastErrorCorrelationId: string | null;
  serverResponse: unknown | null;
  conflictId: string | null;
  syncedAtMs: number | null;
  createdAtMs: number;
  updatedAtMs: number;
}>;

export type ActionCountGroup = Readonly<{
  vendorId: string;
  pending: number;
  sending: number;
  synced: number;
  failedRetryable: number;
  conflict: number;
  oldestPendingAtMs: number | null;
}>;

type SnapshotRow = Readonly<{
  service_date: string;
  route_sync_id: string;
  server_time_ms: number;
  expires_at_ms: number;
  saved_at_wall_ms: number;
  route_json: string;
}>;

type RouteJson = Readonly<{
  deliveries: readonly Readonly<{
    routeId: string;
    routeName: string;
    routeStopId: string;
    serviceDate: string;
    sequence: number;
    householdName: string;
    householdAccountNumber: string;
    pendingStopItems: readonly Readonly<{
      scheduledDeliveryId: string;
      expectedVersion: number;
      productName: string;
      unitName: string;
      plannedQuantity: string;
    }>[];
  }>[];
}>;

type ActionRow = Readonly<{
  action_id: string;
  idempotency_key: string;
  local_sequence: number;
  actor_id: string;
  vendor_id: string;
  device_id: string;
  route_stop_id: string;
  service_date: string;
  route_sync_id: string;
  payload_version: 1;
  occurred_at: string;
  request_json: string;
  display_json: string;
  lease_server_time_ms: number;
  lease_expires_at_ms: number;
  lease_saved_at_wall_ms: number;
  retention_delete_after_wall_ms: number;
  state: OfflineActionState;
  blocked_reason: PendingBlock | null;
  attempt_count: number;
  next_attempt_at_ms: number | null;
  last_http_status: number | null;
  last_error_code: string | null;
  last_error_message: string | null;
  last_error_correlation_id: string | null;
  server_response_json: string | null;
  conflict_id: string | null;
  synced_at_ms: number | null;
  created_at_ms: number;
  updated_at_ms: number;
}>;

const ACTION_COLUMNS = `
  action_id, idempotency_key, local_sequence, actor_id, vendor_id, device_id,
  route_stop_id, service_date, route_sync_id, payload_version, occurred_at,
  request_json, display_json, lease_server_time_ms, lease_expires_at_ms,
  lease_saved_at_wall_ms, retention_delete_after_wall_ms, state,
  blocked_reason, attempt_count, next_attempt_at_ms, last_http_status,
  last_error_code, last_error_message, last_error_correlation_id,
  server_response_json, conflict_id, synced_at_ms, created_at_ms, updated_at_ms
`;

export async function enqueueAction(
  db: ActionDatabase,
  input: EnqueueActionInput,
): Promise<OfflineAction> {
  let action: OfflineAction | null = null;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const sql = transaction as unknown as SqlExecutor;
    const snapshot = await sql.getFirstAsync<SnapshotRow>(
      `SELECT service_date, route_sync_id, server_time_ms, expires_at_ms,
              saved_at_wall_ms, route_json
       FROM route_snapshots
       WHERE actor_id = ? AND vendor_id = ? AND device_id = ?`,
      input.scope.actorId,
      input.scope.vendorId,
      input.scope.deviceId,
    );
    if (!snapshot) throw new Error('Active route snapshot unavailable');

    const now = (input.clock ?? systemClock)();
    if (
      getLeaseFreshness(
        {
          serverTimeMs: snapshot.server_time_ms,
          expiresAtMs: snapshot.expires_at_ms,
          savedAtWallMs: snapshot.saved_at_wall_ms,
        },
        () => now,
      ) !== 'fresh'
    ) {
      throw new Error('Active route snapshot is stale');
    }

    const route = JSON.parse(snapshot.route_json) as RouteJson;
    const deliveries = route.deliveries.filter(
      (delivery) => delivery.routeStopId === input.routeStopId,
    );
    const first = deliveries[0];
    const stopItems = new Map(
      first?.pendingStopItems.map((item) => [
        item.scheduledDeliveryId,
        item.expectedVersion,
      ]),
    );
    if (
      !first ||
      input.request.serviceDate !== snapshot.service_date ||
      first.serviceDate !== snapshot.service_date ||
      input.request.items.length !== first.pendingStopItems.length ||
      stopItems.size !== first.pendingStopItems.length ||
      new Set(input.request.items.map((item) => item.scheduledDeliveryId))
        .size !== input.request.items.length ||
      input.request.items.some(
        (item) =>
          stopItems.get(item.scheduledDeliveryId) !== item.expectedVersion,
      )
    ) {
      throw new Error('Action does not match active route');
    }

    const sequence = await sql.getFirstAsync<{ last_value: number }>(
      `UPDATE local_sequence
       SET last_value = last_value + 1
       WHERE singleton = 1
       RETURNING last_value`,
    );
    if (!sequence || !Number.isSafeInteger(sequence.last_value)) {
      throw new Error('Offline action sequence unavailable');
    }

    const request = {
      ...input.request,
      routeSyncId: snapshot.route_sync_id,
      payloadVersion: 1 as const,
      localSequence: sequence.last_value,
    } as OfflineOutcomeRequest;
    const display: OfflineActionDisplay = {
      routeId: first.routeId,
      routeName: first.routeName,
      routeStopId: first.routeStopId,
      sequence: first.sequence,
      householdName: first.householdName,
      householdAccountNumber: first.householdAccountNumber,
      outcome: request.outcome,
      plannedItems: first.pendingStopItems.map(
        ({ productName, unitName, plannedQuantity }) => ({
          productName,
          unitName,
          plannedQuantity,
        }),
      ),
    };
    const retentionDeleteAfterWallMs =
      snapshot.saved_at_wall_ms +
      (snapshot.expires_at_ms - snapshot.server_time_ms);

    await sql.runAsync(
      `INSERT INTO offline_actions (
        action_id, idempotency_key, local_sequence, actor_id, vendor_id,
        device_id, route_stop_id, service_date, route_sync_id, payload_version,
        occurred_at, request_json, display_json, lease_server_time_ms,
        lease_expires_at_ms, lease_saved_at_wall_ms,
        retention_delete_after_wall_ms, state, created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.actionId,
      input.idempotencyKey,
      sequence.last_value,
      input.scope.actorId,
      input.scope.vendorId,
      input.scope.deviceId,
      input.routeStopId,
      snapshot.service_date,
      snapshot.route_sync_id,
      1,
      request.occurredAt,
      JSON.stringify(request),
      JSON.stringify(display),
      snapshot.server_time_ms,
      snapshot.expires_at_ms,
      snapshot.saved_at_wall_ms,
      retentionDeleteAfterWallMs,
      'pending',
      now,
      now,
    );

    action = await selectAction(sql, input.scope, input.actionId);
  });

  if (!action) throw new Error('Offline action enqueue failed');
  return action;
}

export async function recoverSending(
  db: ActionDatabase,
  scope: OfflineAccessScope,
  updatedAtMs: number,
) {
  const filter = accessFilter(scope);
  const result = await db.runAsync(
    `UPDATE offline_actions
     SET state = 'pending', updated_at_ms = ?
     WHERE state = 'sending' AND ${filter.sql}`,
    updatedAtMs,
    ...filter.params,
  );
  return result.changes;
}

export async function claimNextAction(
  db: ActionDatabase,
  scope: OfflineAccessScope,
  now: number,
): Promise<OfflineAction | null> {
  let action: OfflineAction | null = null;
  const filter = accessFilter(scope);

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const sql = transaction as unknown as SqlExecutor;
    const head = await sql.getFirstAsync<ActionRow>(
      `SELECT ${ACTION_COLUMNS}
       FROM offline_actions
       WHERE ${filter.sql}
         AND state IN ('pending', 'sending', 'failed_retryable')
       ORDER BY local_sequence
       LIMIT 1`,
      ...filter.params,
    );
    if (
      !head ||
      head.state === 'sending' ||
      (head.state === 'pending' && head.blocked_reason !== null) ||
      (head.state === 'failed_retryable' &&
        (head.next_attempt_at_ms === null || head.next_attempt_at_ms > now))
    ) {
      return;
    }

    const result = await sql.runAsync(
      `UPDATE offline_actions
       SET state = 'sending',
           blocked_reason = NULL,
           attempt_count = attempt_count + 1,
           next_attempt_at_ms = NULL,
           updated_at_ms = ?
       WHERE action_id = ? AND ${filter.sql} AND state = ?`,
      now,
      head.action_id,
      ...filter.params,
      head.state,
    );
    if (result.changes !== 1) return;
    action = await selectAction(sql, scope, head.action_id);
  });

  return action;
}

export async function markSynced(
  db: ActionDatabase,
  input: Readonly<{
    scope: OfflineAccessScope;
    actionId: string;
    serverResponse: unknown;
    syncedAtMs: number;
  }>,
) {
  await updateSending(
    db,
    input.scope,
    input.actionId,
    `state = 'synced',
     server_response_json = ?,
     synced_at_ms = ?,
     updated_at_ms = ?`,
    [JSON.stringify(input.serverResponse), input.syncedAtMs, input.syncedAtMs],
  );
}

export async function markRetryable(
  db: ActionDatabase,
  input: Readonly<{
    scope: OfflineAccessScope;
    actionId: string;
    nextAttemptAtMs: number;
    error: SafeActionError;
    updatedAtMs: number;
  }>,
) {
  await updateSending(
    db,
    input.scope,
    input.actionId,
    `state = 'failed_retryable',
     next_attempt_at_ms = ?,
     last_http_status = ?,
     last_error_code = ?,
     last_error_message = ?,
     last_error_correlation_id = ?,
     updated_at_ms = ?`,
    [
      input.nextAttemptAtMs,
      input.error.httpStatus ?? null,
      input.error.code ?? null,
      input.error.message ?? null,
      input.error.correlationId ?? null,
      input.updatedAtMs,
    ],
  );
}

export async function markConflict(
  db: ActionDatabase,
  input: Readonly<{
    scope: OfflineAccessScope;
    actionId: string;
    conflictId: string;
    serverResponse: unknown;
    updatedAtMs: number;
  }>,
) {
  await updateSending(
    db,
    input.scope,
    input.actionId,
    `state = 'conflict',
     server_response_json = ?,
     conflict_id = ?,
     updated_at_ms = ?`,
    [
      JSON.stringify(input.serverResponse),
      input.conflictId,
      input.updatedAtMs,
    ],
  );
}

export async function releaseBlocked(
  db: ActionDatabase,
  input: Readonly<{
    scope: OfflineAccessScope;
    actionId: string;
    block: PendingBlock;
    error: SafeActionError;
    updatedAtMs: number;
  }>,
) {
  await updateSending(
    db,
    input.scope,
    input.actionId,
    `state = 'pending',
     blocked_reason = ?,
     last_http_status = ?,
     last_error_code = ?,
     last_error_message = ?,
     last_error_correlation_id = ?,
     updated_at_ms = ?`,
    [
      input.block,
      input.error.httpStatus ?? null,
      input.error.code ?? null,
      input.error.message ?? null,
      input.error.correlationId ?? null,
      input.updatedAtMs,
    ],
  );
}

export async function resumeBlocked(
  db: ActionDatabase,
  scope: OfflineAccessScope,
  actionId: string,
  updatedAtMs: number,
) {
  const filter = accessFilter(scope);
  const result = await db.runAsync(
    `UPDATE offline_actions
     SET blocked_reason = NULL, updated_at_ms = ?
     WHERE action_id = ? AND ${filter.sql}
       AND state = 'pending' AND blocked_reason = 'authentication'`,
    updatedAtMs,
    actionId,
    ...filter.params,
  );
  assertChanged(result);
}

export async function retryNow(
  db: ActionDatabase,
  scope: OfflineAccessScope,
  actionId: string,
  now: number,
) {
  const filter = accessFilter(scope);
  const result = await db.runAsync(
    `UPDATE offline_actions
     SET next_attempt_at_ms = ?, updated_at_ms = ?
     WHERE action_id = ? AND ${filter.sql} AND state = 'failed_retryable'`,
    now,
    now,
    actionId,
    ...filter.params,
  );
  assertChanged(result);
}

export function getAction(
  db: SqlExecutor,
  scope: OfflineAccessScope,
  actionId: string,
) {
  return selectAction(db, scope, actionId);
}

export async function listActions(
  db: SqlExecutor,
  scope: OfflineAccessScope,
): Promise<OfflineAction[]> {
  const filter = accessFilter(scope);
  const rows = await db.getAllAsync<ActionRow>(
    `SELECT ${ACTION_COLUMNS}
     FROM offline_actions
     WHERE ${filter.sql}
     ORDER BY local_sequence`,
    ...filter.params,
  );
  return rows.map(toAction);
}

export async function getActionCounts(
  db: SqlExecutor,
  scope: OfflineAccessScope,
): Promise<ActionCountGroup[]> {
  const filter = accessFilter(scope);
  const rows = await db.getAllAsync<{
    vendor_id: string;
    pending: number;
    sending: number;
    synced: number;
    failed_retryable: number;
    conflict: number;
    oldest_pending_at_ms: number | null;
  }>(
    `SELECT
       vendor_id,
       SUM(CASE WHEN state = 'pending' THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN state = 'sending' THEN 1 ELSE 0 END) AS sending,
       SUM(CASE WHEN state = 'synced' THEN 1 ELSE 0 END) AS synced,
       SUM(CASE WHEN state = 'failed_retryable' THEN 1 ELSE 0 END)
         AS failed_retryable,
       SUM(CASE WHEN state = 'conflict' THEN 1 ELSE 0 END) AS conflict,
       MIN(CASE
         WHEN state IN ('pending', 'sending', 'failed_retryable')
         THEN created_at_ms
       END) AS oldest_pending_at_ms
     FROM offline_actions
     WHERE ${filter.sql}
     GROUP BY vendor_id
     ORDER BY vendor_id`,
    ...filter.params,
  );
  return rows.map((row) => ({
    vendorId: row.vendor_id,
    pending: row.pending,
    sending: row.sending,
    synced: row.synced,
    failedRetryable: row.failed_retryable,
    conflict: row.conflict,
    oldestPendingAtMs: row.oldest_pending_at_ms,
  }));
}

export async function countLogoutBlocking(
  db: SqlExecutor,
  scope: OfflineAccessScope,
) {
  const filter = accessFilter(scope);
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM offline_actions
     WHERE ${filter.sql}
       AND state IN ('pending', 'sending', 'failed_retryable')`,
    ...filter.params,
  );
  return row?.count ?? 0;
}

export async function deleteExpiredSynced(
  db: ActionDatabase,
  scope: OfflineAccessScope,
  now: number,
) {
  let changes = 0;
  const filter = accessFilter(scope);
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const result = await (transaction as unknown as SqlExecutor).runAsync(
      `DELETE FROM offline_actions
       WHERE ${filter.sql}
         AND state = 'synced'
         AND lease_saved_at_wall_ms <= ?
         AND retention_delete_after_wall_ms <= ?`,
      ...filter.params,
      now,
      now,
    );
    changes = result.changes;
  });
  return changes;
}

async function updateSending(
  db: SqlExecutor,
  scope: OfflineAccessScope,
  actionId: string,
  assignments: string,
  values: BindValue[],
) {
  const filter = accessFilter(scope);
  const result = await db.runAsync(
    `UPDATE offline_actions
     SET ${assignments}
     WHERE action_id = ? AND ${filter.sql} AND state = 'sending'`,
    ...values,
    actionId,
    ...filter.params,
  );
  assertChanged(result);
}

function assertChanged(result: SqlResult) {
  if (result.changes !== 1) {
    throw new Error('Action state changed or unavailable');
  }
}

function accessFilter(scope: OfflineAccessScope) {
  return scope.accessMode === 'offline_recovery'
    ? {
        sql: 'actor_id = ? AND device_id = ? AND route_sync_id = ?',
        params: [
          scope.actorId,
          scope.deviceId,
          scope.recoveryRouteSyncId,
        ] as BindValue[],
      }
    : {
        sql: 'actor_id = ? AND device_id = ?',
        params: [scope.actorId, scope.deviceId] as BindValue[],
      };
}

async function selectAction(
  db: SqlExecutor,
  scope: VendorRouteScope | OfflineAccessScope,
  actionId: string,
): Promise<OfflineAction | null> {
  const filter =
    'accessMode' in scope && scope.accessMode === 'offline_recovery'
      ? {
          sql: 'actor_id = ? AND device_id = ? AND route_sync_id = ?',
          params: [
            scope.actorId,
            scope.deviceId,
            scope.recoveryRouteSyncId,
          ] as BindValue[],
        }
      : {
          sql: `actor_id = ? AND device_id = ?${
            'vendorId' in scope ? ' AND vendor_id = ?' : ''
          }`,
          params: [
            scope.actorId,
            scope.deviceId,
            ...('vendorId' in scope ? [scope.vendorId] : []),
          ] as BindValue[],
        };
  const row = await db.getFirstAsync<ActionRow>(
    `SELECT ${ACTION_COLUMNS}
     FROM offline_actions
     WHERE action_id = ? AND ${filter.sql}`,
    actionId,
    ...filter.params,
  );
  return row ? toAction(row) : null;
}

function toAction(row: ActionRow): OfflineAction {
  return {
    actionId: row.action_id,
    idempotencyKey: row.idempotency_key,
    localSequence: row.local_sequence,
    actorId: row.actor_id,
    vendorId: row.vendor_id,
    deviceId: row.device_id,
    routeStopId: row.route_stop_id,
    serviceDate: row.service_date,
    routeSyncId: row.route_sync_id,
    payloadVersion: row.payload_version,
    occurredAt: row.occurred_at,
    request: JSON.parse(row.request_json) as OfflineOutcomeRequest,
    display: JSON.parse(row.display_json) as OfflineActionDisplay,
    leaseServerTimeMs: row.lease_server_time_ms,
    leaseExpiresAtMs: row.lease_expires_at_ms,
    leaseSavedAtWallMs: row.lease_saved_at_wall_ms,
    retentionDeleteAfterWallMs: row.retention_delete_after_wall_ms,
    state: row.state,
    blockedReason: row.blocked_reason,
    attemptCount: row.attempt_count,
    nextAttemptAtMs: row.next_attempt_at_ms,
    lastHttpStatus: row.last_http_status,
    lastErrorCode: row.last_error_code,
    lastErrorMessage: row.last_error_message,
    lastErrorCorrelationId: row.last_error_correlation_id,
    serverResponse: row.server_response_json
      ? (JSON.parse(row.server_response_json) as unknown)
      : null,
    conflictId: row.conflict_id,
    syncedAtMs: row.synced_at_ms,
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
  };
}
