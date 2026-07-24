import {
  claimNextAction,
  getActionCounts,
  listActions,
  markConflict,
  markRetryable,
  markSynced,
  recoverSending,
  releaseBlocked,
  resumeBlocked,
  resumeRecoveryAuthorizationBlocks,
  retryNow as retryActionNow,
  type OfflineAction,
  type SafeActionError,
} from './action-store';
import {
  OfflineApiError,
  reportSyncCheckpoint,
  submitOfflineOutcome,
  type OfflineOutcomeResult,
  type SyncCheckpoint,
} from './api';
import { getLeaseFreshness, systemClock, type Clock } from './clock';
import type { OfflineAccessScope, PendingBlock } from './types';

export type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'paused_authentication'
  | 'paused_authorization';

export type SyncGroupSnapshot = Readonly<{
  vendorId: string;
  pending: number;
  sending: number;
  synced: number;
  failedRetryable: number;
  conflict: number;
  oldestPendingAtMs: number | null;
  routeFreshness: 'fresh' | 'stale' | 'unavailable';
  lastRouteSyncAtMs: number | null;
  lastActionSyncAtMs: number | null;
}>;

export type SyncSnapshot = Readonly<{
  groups: readonly SyncGroupSnapshot[];
  actions: readonly OfflineAction[];
}>;

export type SyncDatabase = Parameters<typeof claimNextAction>[0] &
  Parameters<typeof listActions>[0] & {
    getAllAsync<T>(source: string, ...params: (null | number | string | Uint8Array)[]): Promise<T[]>;
  };

type SubmitOutcome = typeof submitOfflineOutcome;
type ReportCheckpoint = typeof reportSyncCheckpoint;

export type SyncRunner = Readonly<{
  readonly status: SyncStatus;
  setAccessToken(accessToken: string): void;
  wake(): Promise<void>;
  retryNow(actionId: string): Promise<void>;
  resumeAuthentication(): Promise<void>;
  getSnapshot(): Promise<SyncSnapshot>;
}>;

export function createSyncRunner(input: Readonly<{
  db: SyncDatabase;
  scope: OfflineAccessScope;
  accessToken?: string;
  getAccessToken?(): string;
  clock?: Clock;
  submitOutcome?: SubmitOutcome;
  reportCheckpoint?: ReportCheckpoint;
  onStatusChange?(status: SyncStatus): void;
}>): SyncRunner {
  const clock = input.clock ?? systemClock;
  const send = input.submitOutcome ?? submitOfflineOutcome;
  const checkpoint = input.reportCheckpoint ?? reportSyncCheckpoint;
  let status: SyncStatus = 'idle';
  let flight: Promise<void> | null = null;
  let recovered = false;
  let wakeRequested = false;
  let resumeAuthenticationRequested = false;
  let accessToken = input.accessToken ?? '';
  const getAccessToken = () => input.getAccessToken?.() ?? accessToken;

  const setStatus = (next: SyncStatus) => {
    status = next;
    input.onStatusChange?.(next);
  };

  const wake = () => {
    wakeRequested = true;
    return ensureFlight();
  };

  const ensureFlight = () => {
    if (flight) return flight;
    const current = runRequestedWork().finally(() => {
      if (flight === current) flight = null;
    });
    flight = current;
    return current;
  };

  const runRequestedWork = async () => {
    while (wakeRequested || resumeAuthenticationRequested) {
      const shouldResumeAuthentication = resumeAuthenticationRequested;
      wakeRequested = false;
      resumeAuthenticationRequested = false;
      if (shouldResumeAuthentication) {
        await clearAuthenticationBlocks();
      }
      await drain();
    }
  };

  const drain = async () => {
    if (
      status === 'paused_authentication' ||
      status === 'paused_authorization'
    ) {
      return;
    }
    setStatus('syncing');
    try {
      if (!recovered) {
        await recoverSending(input.db, input.scope, clock());
        recovered = true;
      }

      while (true) {
        const action = await claimNextAction(input.db, input.scope, clock());
        if (!action) break;
        const shouldContinue = await submit(action);
        if (!shouldContinue) break;
      }

      if (
        status === 'syncing' &&
        input.scope.accessMode === 'standard'
      ) {
        await reportCheckpoints();
      }
    } finally {
      if (status === 'syncing') setStatus('idle');
    }
  };

  const submit = async (action: OfflineAction) => {
    try {
      const result = await send({
        vendorId: action.vendorId,
        routeStopId: action.routeStopId,
        accessToken: getAccessToken(),
        idempotencyKey: action.idempotencyKey,
        request: action.request,
      });
      await complete(action, result);
      return true;
    } catch (cause) {
      const error =
        cause instanceof OfflineApiError
          ? cause
          : new OfflineApiError(
              null,
              undefined,
              true,
              undefined,
              undefined,
              null,
            );
      const block = blockedBy(error);
      const now = clock();
      if (block) {
        await releaseBlocked(input.db, {
          scope: input.scope,
          actionId: action.actionId,
          block,
          error: safeError(error),
          updatedAtMs: now,
        });
        if (block === 'authentication') setStatus('paused_authentication');
        if (block === 'authorization') setStatus('paused_authorization');
      } else {
        await markRetryable(input.db, {
          scope: input.scope,
          actionId: action.actionId,
          nextAttemptAtMs:
            now + getRetryDelayMs(action.attemptCount, error, now),
          error: safeError(error),
          updatedAtMs: now,
        });
      }
      return false;
    }
  };

  const complete = async (
    action: OfflineAction,
    result: OfflineOutcomeResult,
  ) => {
    const now = clock();
    if (result.kind === 'conflict') {
      await markConflict(input.db, {
        scope: input.scope,
        actionId: action.actionId,
        conflictId: result.response.conflictId,
        serverResponse: result.response,
        updatedAtMs: now,
      });
      return;
    }
    await markSynced(input.db, {
      scope: input.scope,
      actionId: action.actionId,
      serverResponse: result.response,
      syncedAtMs: now,
    });
  };

  const reportCheckpoints = async () => {
    const snapshot = await getSnapshot(input.db, input.scope, clock);
    for (const group of snapshot.groups) {
      try {
        await checkpoint({
          vendorId: group.vendorId,
          accessToken: getAccessToken(),
          body: checkpointBody(group),
        });
      } catch (cause) {
        if (cause instanceof OfflineApiError && cause.httpStatus === 401) {
          setStatus('paused_authentication');
          break;
        } else if (
          cause instanceof OfflineApiError &&
          cause.httpStatus === 403
        ) {
          setStatus('paused_authorization');
          break;
        }
      }
    }
  };

  const clearAuthenticationBlocks = async () => {
    if (
      input.scope.accessMode === 'offline_recovery'
      && status !== 'paused_authorization'
    ) {
      await resumeRecoveryAuthorizationBlocks(
        input.db,
        input.scope,
        clock(),
      );
    }
    const actions = await listActions(input.db, input.scope);
    for (const action of actions) {
      if (
        action.state === 'pending' &&
        action.blockedReason === 'authentication'
      ) {
        await resumeBlocked(
          input.db,
          input.scope,
          action.actionId,
          clock(),
        );
      }
    }
    if (status === 'paused_authentication') setStatus('idle');
  };

  return {
    get status() {
      return status;
    },
    setAccessToken(nextAccessToken) {
      accessToken = nextAccessToken;
    },
    wake,
    async retryNow(actionId) {
      await retryActionNow(input.db, input.scope, actionId, clock());
      await wake();
    },
    async resumeAuthentication() {
      resumeAuthenticationRequested = true;
      wakeRequested = true;
      await ensureFlight();
    },
    getSnapshot: () => getSnapshot(input.db, input.scope, clock),
  };
}

export function getRetryDelayMs(
  attemptCount: number,
  error: OfflineApiError | undefined,
  now: number,
) {
  const exponent = Math.max(0, Math.min(6, attemptCount - 1));
  const backoff = Math.min(300_000, 5_000 * 2 ** exponent);
  const retryAfterSeconds = validSeconds(error?.retryAfterSeconds);
  const retryAfterHeader = parseRetryAfter(error?.retryAfterHeader, now);
  return Math.max(
    backoff,
    retryAfterSeconds === null ? 0 : retryAfterSeconds * 1_000,
    retryAfterHeader,
  );
}

async function getSnapshot(
  db: SyncDatabase,
  scope: OfflineAccessScope,
  clock: Clock,
): Promise<SyncSnapshot> {
  const [actions, counts, routes] = await Promise.all([
    listActions(db, scope),
    getActionCounts(db, scope),
    scope.accessMode === 'standard'
      ? db.getAllAsync<RouteRow>(
          `SELECT vendor_id, server_time_ms, expires_at_ms, saved_at_wall_ms
           FROM route_snapshots
           WHERE actor_id = ? AND device_id = ?
           ORDER BY vendor_id`,
          scope.actorId,
          scope.deviceId,
        )
      : Promise.resolve([]),
  ]);
  const countByVendor = new Map(counts.map((group) => [group.vendorId, group]));
  const routeByVendor = new Map(routes.map((route) => [route.vendor_id, route]));
  const vendorIds = new Set([
    ...countByVendor.keys(),
    ...routeByVendor.keys(),
  ]);
  const groups = [...vendorIds].sort().map((vendorId) => {
    const count = countByVendor.get(vendorId);
    const route = routeByVendor.get(vendorId);
    const lastActionSyncAtMs =
      actions
        .filter((action) => action.vendorId === vendorId)
        .reduce<number | null>(
          (latest, action) =>
            action.syncedAtMs !== null &&
            (latest === null || action.syncedAtMs > latest)
              ? action.syncedAtMs
              : latest,
          null,
        );
    return {
      vendorId,
      pending: count?.pending ?? 0,
      sending: count?.sending ?? 0,
      synced: count?.synced ?? 0,
      failedRetryable: count?.failedRetryable ?? 0,
      conflict: count?.conflict ?? 0,
      oldestPendingAtMs: count?.oldestPendingAtMs ?? null,
      routeFreshness: route
        ? getLeaseFreshness(
            {
              serverTimeMs: route.server_time_ms,
              expiresAtMs: route.expires_at_ms,
              savedAtWallMs: route.saved_at_wall_ms,
            },
            clock,
          ) === 'fresh'
          ? 'fresh'
          : 'stale'
        : 'unavailable',
      lastRouteSyncAtMs: route?.saved_at_wall_ms ?? null,
      lastActionSyncAtMs,
    } satisfies SyncGroupSnapshot;
  });
  return { groups, actions };
}

function blockedBy(error: OfflineApiError): PendingBlock | null {
  if (error.httpStatus === 401) return 'authentication';
  if (error.httpStatus === 403) return 'authorization';
  return isRetryable(error) ? null : 'invariant';
}

function isRetryable(error: OfflineApiError) {
  return (
    error.httpStatus === null ||
    error.httpStatus === 429 ||
    error.httpStatus === 503 ||
    (error.code === 'OFFLINE_ACTION_PROCESSING' && error.retryable)
  );
}

function safeError(error: OfflineApiError): SafeActionError {
  return {
    ...(error.httpStatus === null ? {} : { httpStatus: error.httpStatus }),
    ...(error.code ? { code: error.code } : {}),
    message: error.message,
    ...(error.correlationId ? { correlationId: error.correlationId } : {}),
  };
}

function checkpointBody(group: SyncGroupSnapshot): SyncCheckpoint {
  return {
    pendingCount: group.pending,
    sendingCount: group.sending,
    failedRetryableCount: group.failedRetryable,
    conflictCount: group.conflict,
    ...(group.oldestPendingAtMs === null
      ? {}
      : { oldestPendingAt: new Date(group.oldestPendingAtMs).toISOString() }),
    ...(group.lastRouteSyncAtMs === null
      ? {}
      : { lastRouteSyncAt: new Date(group.lastRouteSyncAtMs).toISOString() }),
    ...(group.lastActionSyncAtMs === null
      ? {}
      : { lastActionSyncAt: new Date(group.lastActionSyncAtMs).toISOString() }),
  };
}

function validSeconds(value: number | undefined) {
  return value !== undefined &&
    Number.isFinite(value) &&
    value >= 0 &&
    Number.isSafeInteger(value * 1_000)
    ? value
    : null;
}

function parseRetryAfter(value: string | null | undefined, now: number) {
  if (!value) return 0;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const milliseconds = Number(trimmed) * 1_000;
    return Number.isSafeInteger(milliseconds) ? milliseconds : 0;
  }
  const date = Date.parse(trimmed);
  return Number.isFinite(date) && date >= now ? date - now : 0;
}

type RouteRow = Readonly<{
  vendor_id: string;
  server_time_ms: number;
  expires_at_ms: number;
  saved_at_wall_ms: number;
}>;
