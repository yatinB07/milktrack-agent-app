import {
  claimNextAction,
  getAction,
  markRetryable,
  type OfflineAction,
} from '../action-store';
import { OfflineApiError } from '../api';
import { initializeOfflineDatabase } from '../database';
import {
  createSyncRunner,
  getRetryDelayMs,
  type SyncRunner,
} from '../sync-runner';
import type { OfflineAccessScope } from '../types';
import { TestDatabase } from './test-database';

jest.mock('@/api/client', () => ({ api: { POST: jest.fn(), PUT: jest.fn() } }));

const standardScope: OfflineAccessScope = {
  actorId: 'actor-1',
  deviceId: 'device-1',
  accessMode: 'standard',
};
const recoveryScope: OfflineAccessScope = {
  actorId: 'actor-1',
  deviceId: 'device-1',
  accessMode: 'offline_recovery',
  recoveryRouteSyncId: 'sync-1',
};

describe('serialized offline synchronization runner', () => {
  let db: TestDatabase;
  let now: number;
  let accessToken: string;

  beforeEach(async () => {
    db = new TestDatabase();
    await initializeOfflineDatabase(db);
    now = 10_000;
    accessToken = 'access-1';
  });

  afterEach(async () => db.closeAsync());

  test('uses capped exponential delay with valid server retry floors and no attempt limit', () => {
    expect(getRetryDelayMs(1, undefined, now)).toBe(5_000);
    expect(getRetryDelayMs(2, undefined, now)).toBe(10_000);
    expect(getRetryDelayMs(100, undefined, now)).toBe(300_000);
    expect(
      getRetryDelayMs(
        1,
        new OfflineApiError(429, 'RATE_LIMITED', true, 'c', 600, null),
        now,
      ),
    ).toBe(600_000);
    expect(
      getRetryDelayMs(
        1,
        new OfflineApiError(503, 'BUSY', true, 'c', undefined, '12'),
        now,
      ),
    ).toBe(12_000);
    expect(
      getRetryDelayMs(
        1,
        new OfflineApiError(503, 'BUSY', true, 'c', -1, 'invalid'),
        now,
      ),
    ).toBe(5_000);
  });

  test('recovers abandoned sending work and replays actions in strict sequence through one flight', async () => {
    await insertAction(db, { actionId: 'action-1', state: 'sending' });
    await insertAction(db, {
      actionId: 'action-2',
      vendorId: 'vendor-2',
      routeStopId: 'stop-2',
      routeSyncId: 'sync-2',
      localSequence: 2,
    });
    const release = deferred<ReturnType<typeof synced>>();
    const submit = jest
      .fn()
      .mockImplementationOnce(() => release.promise)
      .mockResolvedValueOnce(synced('stop-2'));
    const runner = makeRunner({ submit });

    const firstWake = runner.wake();
    const joinedWake = runner.wake();
    expect(joinedWake).toBe(firstWake);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0]![0]).toMatchObject({
      vendorId: 'vendor-1',
      routeStopId: 'stop-1',
      accessToken: 'access-1',
      idempotencyKey: 'key-action-1',
    });
    expect(submit.mock.calls[0]![0].request).toEqual(storedRequest(1, 'sync-1'));

    release.resolve(synced('stop-1'));
    await firstWake;
    expect(submit.mock.calls.map(([input]) => input.routeStopId)).toEqual([
      'stop-1',
      'stop-2',
    ]);
    await expect(action('action-1')).resolves.toMatchObject({
      state: 'synced',
      attemptCount: 1,
    });
    await expect(action('action-2')).resolves.toMatchObject({
      state: 'synced',
      attemptCount: 1,
    });
  });

  test.each([
    [
      'transport ambiguity',
      new OfflineApiError(null, undefined, true, undefined, undefined, null),
      'failed_retryable',
      null,
    ],
    [
      'rate limit',
      new OfflineApiError(429, 'RATE_LIMITED', true, 'c', 9, null),
      'failed_retryable',
      null,
    ],
    [
      'service unavailable',
      new OfflineApiError(503, 'UNAVAILABLE', true, 'c', undefined, null),
      'failed_retryable',
      null,
    ],
    [
      'processing response',
      new OfflineApiError(
        409,
        'OFFLINE_ACTION_PROCESSING',
        true,
        'c',
        undefined,
        null,
      ),
      'failed_retryable',
      null,
    ],
    [
      'authentication denial',
      new OfflineApiError(401, 'AUTHENTICATION_REQUIRED', false, 'c', undefined, null),
      'pending',
      'authentication',
    ],
    [
      'authorization denial',
      new OfflineApiError(403, 'FORBIDDEN', false, 'c', undefined, null),
      'pending',
      'authorization',
    ],
    [
      'invalid request',
      new OfflineApiError(400, 'VALIDATION_FAILED', false, 'c', undefined, null),
      'pending',
      'invariant',
    ],
    [
      'idempotency hash mismatch',
      new OfflineApiError(409, 'IDEMPOTENCY_KEY_REUSED', false, 'c', undefined, null),
      'pending',
      'invariant',
    ],
    [
      'service unavailable with a hostile retry flag',
      new OfflineApiError(503, 'PERMANENT', false, 'c', undefined, null),
      'failed_retryable',
      null,
    ],
    [
      'hostile retryable validation response',
      new OfflineApiError(400, 'VALIDATION_FAILED', true, 'c', undefined, null),
      'pending',
      'invariant',
    ],
    [
      'hostile retryable non-processing conflict',
      new OfflineApiError(409, 'IDEMPOTENCY_KEY_REUSED', true, 'c', undefined, null),
      'pending',
      'invariant',
    ],
  ] as const)(
    'classifies %s without discarding local evidence',
    async (_name, error, state, blockedReason) => {
      await insertAction(db);
      const runner = makeRunner({
        submit: jest.fn().mockRejectedValue(error),
      });

      await runner.wake();

      await expect(action()).resolves.toMatchObject({
        state,
        blockedReason,
        lastHttpStatus: error.httpStatus,
        lastErrorCode: error.code ?? null,
      });
      expect(runner.status).toBe(
        blockedReason === 'authentication'
          ? 'paused_authentication'
          : blockedReason === 'authorization'
            ? 'paused_authorization'
            : 'idle',
      );
      if (blockedReason === 'authentication' || blockedReason === 'authorization') {
        await runner.wake();
        expect(runner.status).toBe(
          blockedReason === 'authentication'
            ? 'paused_authentication'
            : 'paused_authorization',
        );
      }
    },
  );

  test('retains only a backend conflict result as conflict evidence', async () => {
    await insertAction(db);
    const conflict = {
      code: 'OFFLINE_OUTCOME_CONFLICT',
      conflictId: 'conflict-1',
      conflictStatus: 'pending' as const,
      correlationId: 'correlation-1',
      message: 'Vendor review required',
      retryable: false as const,
    };
    const runner = makeRunner({
      submit: jest.fn().mockResolvedValue({
        kind: 'conflict',
        response: conflict,
      }),
    });

    await runner.wake();

    await expect(action()).resolves.toMatchObject({
      state: 'conflict',
      conflictId: 'conflict-1',
      serverResponse: conflict,
    });
  });

  test('stops at a retryable queue head and resumes authentication blocks only for the same scope', async () => {
    await insertAction(db);
    await insertAction(db, {
      actionId: 'action-2',
      vendorId: 'vendor-2',
      routeStopId: 'stop-2',
      routeSyncId: 'sync-2',
      localSequence: 2,
    });
    const submit = jest
      .fn()
      .mockRejectedValueOnce(
        new OfflineApiError(
          401,
          'AUTHENTICATION_REQUIRED',
          false,
          'c',
          undefined,
          null,
        ),
      )
      .mockResolvedValue(synced('stop-1'));
    const runner = makeRunner({ submit });

    await runner.wake();
    expect(submit).toHaveBeenCalledTimes(1);
    accessToken = 'access-2';
    await runner.resumeAuthentication();
    await runner.wake();

    expect(submit).toHaveBeenCalledTimes(3);
    expect(submit.mock.calls[1]![0]).toMatchObject({
      routeStopId: 'stop-1',
      accessToken: 'access-2',
    });
    await expect(action('action-1')).resolves.toMatchObject({
      state: 'synced',
      attemptCount: 2,
    });
    await expect(action('action-2')).resolves.toMatchObject({ state: 'synced' });
  });

  test('a newly authenticated runner resumes persisted authentication blocks before draining', async () => {
    await insertAction(db);
    const denied = makeRunner({
      submit: jest.fn().mockRejectedValue(
        new OfflineApiError(
          401,
          'AUTHENTICATION_REQUIRED',
          false,
          'c',
          undefined,
          null,
        ),
      ),
    });
    await denied.wake();

    const submit = jest.fn().mockResolvedValue(synced('stop-1'));
    const resumed = makeRunner({ submit });
    await resumed.resumeAuthentication();

    expect(submit).toHaveBeenCalledTimes(1);
    await expect(action()).resolves.toMatchObject({
      state: 'synced',
      attemptCount: 2,
    });
  });

  test('a recovery runner resumes only the authorization block for its exact actor, device, and lease', async () => {
    await insertAction(db);
    const denied = makeRunner({
      submit: jest.fn().mockRejectedValue(
        new OfflineApiError(403, 'FORBIDDEN', false, 'c', undefined, null),
      ),
    });
    await denied.wake();

    const wrongLeaseSubmit = jest.fn();
    const wrongLease = createSyncRunner({
      db,
      scope: { ...recoveryScope, recoveryRouteSyncId: 'sync-other' },
      accessToken: 'recovery-wrong',
      clock: () => now,
      submitOutcome: wrongLeaseSubmit,
      reportCheckpoint: jest.fn(),
    });
    await wrongLease.resumeAuthentication();
    expect(wrongLeaseSubmit).not.toHaveBeenCalled();
    await expect(action()).resolves.toMatchObject({
      state: 'pending',
      blockedReason: 'authorization',
    });

    const submit = jest.fn().mockResolvedValue(synced('stop-1'));
    const recovered = createSyncRunner({
      db,
      scope: recoveryScope,
      accessToken: 'recovery-access',
      clock: () => now,
      submitOutcome: submit,
      reportCheckpoint: jest.fn(),
    });
    await recovered.resumeAuthentication();

    expect(submit).toHaveBeenCalledTimes(1);
    await expect(action()).resolves.toMatchObject({
      state: 'synced',
      blockedReason: null,
      attemptCount: 2,
    });
  });

  test('serializes refreshed-token resume after an in-flight 401 transition', async () => {
    await insertAction(db);
    const response = deferred<ReturnType<typeof synced>>();
    const submit = jest
      .fn()
      .mockImplementationOnce(() => response.promise)
      .mockResolvedValueOnce(synced('stop-1'));
    const runner = makeRunner({ submit });

    const firstWake = runner.wake();
    await new Promise((resolve) => setTimeout(resolve, 0));
    accessToken = 'access-2';
    runner.setAccessToken(accessToken);
    const resumed = runner.resumeAuthentication();
    response.reject(
      new OfflineApiError(
        401,
        'AUTHENTICATION_REQUIRED',
        false,
        'c',
        undefined,
        null,
      ),
    );
    await Promise.all([firstWake, resumed]);

    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1]![0].accessToken).toBe('access-2');
    await expect(action()).resolves.toMatchObject({ state: 'synced' });
  });

  test('latches retry-now while a checkpoint is active and drains before the flight settles', async () => {
    await insertAction(db);
    const claimed = await claimNextAction(db, standardScope, now);
    expect(claimed).not.toBeNull();
    await markRetryable(db, {
      scope: standardScope,
      actionId: 'action-1',
      nextAttemptAtMs: 20_000,
      error: { code: 'UNAVAILABLE' },
      updatedAtMs: now,
    });
    const checkpoint = deferred<void>();
    const reportCheckpoint = jest
      .fn()
      .mockImplementationOnce(() => checkpoint.promise)
      .mockResolvedValue(undefined);
    const submit = jest.fn().mockResolvedValue(synced('stop-1'));
    const runner = makeRunner({ submit, reportCheckpoint });

    const wake = runner.wake();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const retry = runner.retryNow('action-1');
    checkpoint.resolve();
    await Promise.all([wake, retry]);

    expect(submit).toHaveBeenCalledTimes(1);
    await expect(action()).resolves.toMatchObject({ state: 'synced' });
  });

  test('reports best-effort grouped checkpoints without changing action success', async () => {
    await insertRouteSnapshot(db);
    await insertAction(db);
    const reportCheckpoint = jest.fn().mockRejectedValue(
      new OfflineApiError(503, 'UNAVAILABLE', true, 'c', undefined, null),
    );
    const runner = makeRunner({
      submit: jest.fn().mockResolvedValue(synced('stop-1')),
      reportCheckpoint,
    });

    await runner.wake();

    await expect(action()).resolves.toMatchObject({ state: 'synced' });
    expect(reportCheckpoint).toHaveBeenCalledWith({
      vendorId: 'vendor-1',
      accessToken: 'access-1',
      body: {
        pendingCount: 0,
        sendingCount: 0,
        failedRetryableCount: 0,
        conflictCount: 0,
        lastRouteSyncAt: new Date(9_000).toISOString(),
        lastActionSyncAt: new Date(10_000).toISOString(),
      },
    });
    expect(runner.status).toBe('idle');
  });

  test('limits recovery upload to its lease and never sends checkpoints', async () => {
    await insertAction(db);
    await insertAction(db, {
      actionId: 'foreign-lease',
      vendorId: 'vendor-2',
      routeStopId: 'stop-2',
      routeSyncId: 'sync-2',
      localSequence: 2,
    });
    const submit = jest.fn().mockResolvedValue(synced('stop-1'));
    const reportCheckpoint = jest.fn();
    const runner = makeRunner({
      scope: recoveryScope,
      submit,
      reportCheckpoint,
    });

    await runner.wake();

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0]![0].routeStopId).toBe('stop-1');
    expect(reportCheckpoint).not.toHaveBeenCalled();
    await expect(action('foreign-lease')).resolves.toMatchObject({
      state: 'pending',
    });
  });

  function makeRunner({
    scope = standardScope,
    submit = jest.fn().mockResolvedValue(synced('stop-1')),
    reportCheckpoint = jest.fn().mockResolvedValue(undefined),
  }: {
    scope?: OfflineAccessScope;
    submit?: jest.Mock;
    reportCheckpoint?: jest.Mock;
  } = {}): SyncRunner {
    return createSyncRunner({
      db: db as unknown as Parameters<typeof createSyncRunner>[0]['db'],
      scope,
      getAccessToken: () => accessToken,
      clock: () => now,
      submitOutcome: submit,
      reportCheckpoint,
    });
  }

  function action(actionId = 'action-1'): Promise<OfflineAction | null> {
    return getAction(db, standardScope, actionId);
  }
});

function synced(routeStopId: string) {
  return {
    kind: 'synced' as const,
    response: {
      routeStopId,
      serviceDate: '2026-07-24',
      outcome: 'delivered' as const,
      items: [],
    },
  };
}

function storedRequest(localSequence: number, routeSyncId: string) {
  return {
    routeSyncId,
    payloadVersion: 1,
    localSequence,
    serviceDate: '2026-07-24',
    occurredAt: '2026-07-24T05:30:00.000Z',
    outcome: 'delivered',
    items: [],
  };
}

async function insertAction(
  db: TestDatabase,
  {
    actionId = 'action-1',
    vendorId = 'vendor-1',
    routeStopId = 'stop-1',
    routeSyncId = 'sync-1',
    localSequence = 1,
    state = 'pending',
  }: {
    actionId?: string;
    vendorId?: string;
    routeStopId?: string;
    routeSyncId?: string;
    localSequence?: number;
    state?: 'pending' | 'sending';
  } = {},
) {
  const request = storedRequest(localSequence, routeSyncId);
  await db.runAsync(
    `INSERT INTO offline_actions (
      action_id, idempotency_key, local_sequence, actor_id, vendor_id,
      device_id, route_stop_id, service_date, route_sync_id, payload_version,
      occurred_at, request_json, display_json, lease_server_time_ms,
      lease_expires_at_ms, lease_saved_at_wall_ms,
      retention_delete_after_wall_ms, state, created_at_ms, updated_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    actionId,
    `key-${actionId}`,
    localSequence,
    'actor-1',
    vendorId,
    'device-1',
    routeStopId,
    '2026-07-24',
    routeSyncId,
    1,
    request.occurredAt,
    JSON.stringify(request),
    JSON.stringify({
      routeId: `route-${vendorId}`,
      routeName: `Route ${vendorId}`,
      routeStopId,
      sequence: localSequence,
      householdName: `Household ${vendorId}`,
      householdAccountNumber: `H-${vendorId}`,
      outcome: 'delivered',
      plannedItems: [],
    }),
    1_000,
    20_000,
    1_000,
    20_000,
    state,
    9_000,
    9_000,
  );
}

async function insertRouteSnapshot(db: TestDatabase) {
  await db.runAsync(
    `INSERT INTO route_snapshots (
      actor_id, vendor_id, device_id, service_date, route_sync_id,
      server_time_ms, expires_at_ms, saved_at_wall_ms, route_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    'actor-1',
    'vendor-1',
    'device-1',
    '2026-07-24',
    'sync-1',
    1_000,
    20_000,
    9_000,
    '{"assignments":[],"deliveries":[]}',
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
