import {
  claimNextAction,
  countLogoutBlocking,
  deleteExpiredSynced,
  enqueueAction,
  getAction,
  getActionCounts,
  listAuthorizationRecoveryRouteSyncIds,
  listActions,
  markConflict,
  markRetryable,
  markSynced,
  recoverSending,
  releaseBlocked,
  resumeBlocked,
  retryNow,
} from '../action-store';
import { initializeOfflineDatabase } from '../database';
import type { OfflineAccessScope, VendorRouteScope } from '../types';
import { TestDatabase } from './test-database';

const standardScope: OfflineAccessScope = {
  actorId: 'actor-1',
  deviceId: 'device-1',
  accessMode: 'standard',
};
const vendorScope: VendorRouteScope = {
  actorId: standardScope.actorId,
  deviceId: standardScope.deviceId,
  vendorId: 'vendor-1',
};
const recoveryScope: OfflineAccessScope = {
  actorId: 'actor-1',
  deviceId: 'device-1',
  accessMode: 'offline_recovery',
  recoveryRouteSyncId: 'sync-1',
};

describe('immutable offline action store', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = new TestDatabase();
    await initializeOfflineDatabase(db);
    await insertSnapshot(db);
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  test('atomically allocates a durable sequence and stores the exact request and local overlay', async () => {
    const action = await enqueue(db, 'action-1', 'stop-1');

    expect(action).toMatchObject({
      actionId: 'action-1',
      idempotencyKey: 'key-action-1',
      localSequence: 1,
      vendorId: 'vendor-1',
      routeStopId: 'stop-1',
      serviceDate: '2026-07-24',
      routeSyncId: 'sync-1',
      state: 'pending',
      attemptCount: 0,
      request: {
        routeSyncId: 'sync-1',
        payloadVersion: 1,
        localSequence: 1,
        serviceDate: '2026-07-24',
        occurredAt: '2026-07-24T00:00:00.000Z',
        outcome: 'delivered',
      },
      display: {
        routeId: 'route-1',
        routeName: 'Route One',
        routeStopId: 'stop-1',
        sequence: 1,
        householdName: 'Household One',
        householdAccountNumber: 'H-1',
        outcome: 'delivered',
        plannedItems: [
          {
            productName: 'Cow Milk',
            unitName: 'Litre',
            plannedQuantity: '1.25',
          },
        ],
      },
    });
    await expect(
      db.getFirstAsync<{ last_value: number }>(
        'SELECT last_value FROM local_sequence WHERE singleton = 1',
      ),
    ).resolves.toEqual({ last_value: 1 });

    await expect(enqueue(db, 'action-duplicate', 'stop-1')).rejects.toThrow();
    await expect(
      db.getFirstAsync<{ last_value: number }>(
        'SELECT last_value FROM local_sequence WHERE singleton = 1',
      ),
    ).resolves.toEqual({ last_value: 1 });
  });

  test('rejects missing, stale, service-date-mismatched, and unknown-stop leases before allocation', async () => {
    await expect(
      enqueueAction(db, actionInput('wrong-vendor', 'stop-1', {
        ...vendorScope,
        vendorId: 'vendor-2',
      })),
    ).rejects.toThrow('Active route snapshot unavailable');
    await expect(
      enqueueAction(db, {
        ...actionInput('wrong-date', 'stop-1'),
        request: {
          ...deliveredRequest(),
          serviceDate: '2026-07-25',
        },
      }),
    ).rejects.toThrow('Action does not match active route');
    await expect(enqueue(db, 'unknown-stop', 'stop-404')).rejects.toThrow(
      'Action does not match active route',
    );
    await expect(
      enqueueAction(db, {
        ...actionInput('stale', 'stop-1'),
        clock: () => 1_050,
      }),
    ).rejects.toThrow('Active route snapshot is stale');

    await expect(
      db.getFirstAsync<{ last_value: number }>(
        'SELECT last_value FROM local_sequence WHERE singleton = 1',
      ),
    ).resolves.toEqual({ last_value: 0 });
  });

  test('rejects duplicate request items and cached version mismatches before allocation', async () => {
    const request = deliveredRequest();
    await expect(
      enqueueAction(db, {
        ...actionInput('duplicate-items', 'stop-1'),
        request: {
          ...request,
          items: [request.items[0]!, request.items[0]!],
        },
      }),
    ).rejects.toThrow('Action does not match active route');
    await expect(
      enqueueAction(db, {
        ...actionInput('wrong-version', 'stop-1'),
        request: {
          ...request,
          items: [{ ...request.items[0]!, expectedVersion: 2 }],
        },
      }),
    ).rejects.toThrow('Action does not match active route');

    await expect(
      db.getFirstAsync<{ last_value: number }>(
        'SELECT last_value FROM local_sequence WHERE singleton = 1',
      ),
    ).resolves.toEqual({ last_value: 0 });
  });

  test('preserves immutable evidence and rejects unique stop outcomes', async () => {
    await enqueue(db, 'action-1', 'stop-1');

    await expect(
      db.runAsync(
        `UPDATE offline_actions
         SET request_json = '{"changed":true}'
         WHERE action_id = ?`,
        'action-1',
      ),
    ).rejects.toThrow('immutable offline action');
    await expect(enqueue(db, 'action-2', 'stop-1')).rejects.toThrow();

    expect(await getAction(db, standardScope, 'action-1')).toMatchObject({
      actionId: 'action-1',
      request: { occurredAt: '2026-07-24T00:00:00.000Z' },
      state: 'pending',
    });
  });

  test('recovers abandoned sends and never skips a blocked or not-due queue head', async () => {
    await enqueue(db, 'action-1', 'stop-1');
    await insertSnapshot(db, {
      vendorId: 'vendor-2',
      routeStopId: 'stop-2',
      routeSyncId: 'sync-2',
    });
    await enqueue(
      db,
      'action-2',
      'stop-2',
      { ...vendorScope, vendorId: 'vendor-2' },
    );

    expect(await claimNextAction(db, standardScope, 1_000)).toMatchObject({
      actionId: 'action-1',
      state: 'sending',
      attemptCount: 1,
    });
    await recoverSending(db, standardScope, 1_001);
    expect(await getAction(db, standardScope, 'action-1')).toMatchObject({
      state: 'pending',
      attemptCount: 1,
    });
    await claimNextAction(db, standardScope, 1_002);
    await releaseBlocked(db, {
      scope: standardScope,
      actionId: 'action-1',
      block: 'authentication',
      error: { httpStatus: 401, code: 'AUTHENTICATION_REQUIRED' },
      updatedAtMs: 1_003,
    });

    await expect(
      claimNextAction(db, standardScope, 1_004),
    ).resolves.toBeNull();
    await resumeBlocked(db, standardScope, 'action-1', 1_005);
    await claimNextAction(db, standardScope, 1_006);
    await markRetryable(db, {
      scope: standardScope,
      actionId: 'action-1',
      nextAttemptAtMs: 2_000,
      error: { code: 'TEMPORARY', message: 'Try again' },
      updatedAtMs: 1_007,
    });

    await expect(
      claimNextAction(db, standardScope, 1_999),
    ).resolves.toBeNull();
    await expect(
      claimNextAction(db, standardScope, 2_000),
    ).resolves.toMatchObject({
      actionId: 'action-1',
      state: 'sending',
      attemptCount: 4,
    });
  });

  test('implements only the frozen compare-and-set completion and release transitions', async () => {
    await enqueue(db, 'synced', 'stop-1');
    await claimNextAction(db, standardScope, 1_000);
    await markSynced(db, {
      scope: standardScope,
      actionId: 'synced',
      serverResponse: { id: 'server-event-1' },
      syncedAtMs: 1_010,
    });
    expect(await getAction(db, standardScope, 'synced')).toMatchObject({
      state: 'synced',
      syncedAtMs: 1_010,
      serverResponse: { id: 'server-event-1' },
    });
    await expect(
      markSynced(db, {
        scope: standardScope,
        actionId: 'synced',
        serverResponse: { id: 'again' },
        syncedAtMs: 1_011,
      }),
    ).rejects.toThrow('Action state changed or unavailable');

    await resetWithSnapshot();
    await enqueue(db, 'conflict', 'stop-1');
    await claimNextAction(db, standardScope, 1_000);
    await markConflict(db, {
      scope: standardScope,
      actionId: 'conflict',
      conflictId: 'conflict-1',
      serverResponse: { conflictId: 'conflict-1', conflictStatus: 'pending' },
      updatedAtMs: 1_020,
    });
    expect(await getAction(db, standardScope, 'conflict')).toMatchObject({
      state: 'conflict',
      conflictId: 'conflict-1',
    });
    await expect(
      retryNow(db, standardScope, 'conflict', 1_021),
    ).rejects.toThrow('Action state changed or unavailable');

    await resetWithSnapshot();
    await enqueue(db, 'authorization', 'stop-1');
    await claimNextAction(db, standardScope, 1_000);
    await releaseBlocked(db, {
      scope: standardScope,
      actionId: 'authorization',
      block: 'authorization',
      error: { httpStatus: 403, code: 'FORBIDDEN' },
      updatedAtMs: 1_030,
    });
    await expect(
      resumeBlocked(db, standardScope, 'authorization', 1_031),
    ).rejects.toThrow('Action state changed or unavailable');

    await expect(
      db.runAsync(
        `UPDATE offline_actions
         SET state = 'synced', server_response_json = '{}', synced_at_ms = 1
         WHERE action_id = ?`,
        'authorization',
      ),
    ).rejects.toThrow('invalid offline action state transition');
  });

  test('scopes every read and mutation by actor/device and recovery route sync', async () => {
    await enqueue(db, 'sync-1-action', 'stop-1');
    await insertSnapshot(db, {
      vendorId: 'vendor-2',
      routeStopId: 'stop-2',
      routeSyncId: 'sync-2',
    });
    await enqueue(
      db,
      'sync-2-action',
      'stop-2',
      { ...vendorScope, vendorId: 'vendor-2' },
    );

    await expect(
      getAction(
        db,
        { ...standardScope, actorId: 'actor-2' },
        'sync-1-action',
      ),
    ).resolves.toBeNull();
    await expect(
      getAction(
        db,
        {
          ...recoveryScope,
          recoveryRouteSyncId: '',
        },
        'sync-1-action',
      ),
    ).resolves.toBeNull();
    await expect(listActions(db, recoveryScope)).resolves.toHaveLength(1);
    await expect(
      claimNextAction(db, recoveryScope, 1_000),
    ).resolves.toMatchObject({ actionId: 'sync-1-action' });
    await expect(
      markSynced(db, {
        scope: {
          ...recoveryScope,
          recoveryRouteSyncId: 'sync-2',
        },
        actionId: 'sync-1-action',
        serverResponse: { id: 'foreign' },
        syncedAtMs: 1_010,
      }),
    ).rejects.toThrow('Action state changed or unavailable');
    await recoverSending(db, recoveryScope, 1_011);
    await expect(
      claimNextAction(db, {
        ...recoveryScope,
        recoveryRouteSyncId: 'sync-2',
      }, 1_012),
    ).resolves.toMatchObject({ actionId: 'sync-2-action' });
  });

  test('isolates reads, claims, mutations, counts, logout, and cleanup from a foreign device', async () => {
    const foreignDeviceScope: OfflineAccessScope = {
      ...standardScope,
      deviceId: 'device-2',
    };
    await enqueue(db, 'action-1', 'stop-1');

    await expect(
      getAction(db, foreignDeviceScope, 'action-1'),
    ).resolves.toBeNull();
    await expect(listActions(db, foreignDeviceScope)).resolves.toEqual([]);
    await expect(
      claimNextAction(db, foreignDeviceScope, 1_000),
    ).resolves.toBeNull();
    await expect(
      getActionCounts(db, foreignDeviceScope),
    ).resolves.toEqual([]);
    await expect(
      countLogoutBlocking(db, foreignDeviceScope),
    ).resolves.toBe(0);

    await claimNextAction(db, standardScope, 1_000);
    await expect(
      recoverSending(db, foreignDeviceScope, 1_001),
    ).resolves.toBe(0);
    await expect(
      markSynced(db, {
        scope: foreignDeviceScope,
        actionId: 'action-1',
        serverResponse: { id: 'foreign' },
        syncedAtMs: 1_010,
      }),
    ).rejects.toThrow('Action state changed or unavailable');

    await markSynced(db, {
      scope: standardScope,
      actionId: 'action-1',
      serverResponse: { id: 'server-event' },
      syncedAtMs: 1_010,
    });
    await expect(
      deleteExpiredSynced(db, foreignDeviceScope, 1_050),
    ).resolves.toBe(0);
    await expect(
      getAction(db, standardScope, 'action-1'),
    ).resolves.toMatchObject({ state: 'synced' });
  });

  test('returns grouped counts, counts logout blockers, and retries only retryable evidence now', async () => {
    await enqueue(db, 'action-1', 'stop-1');
    await insertSnapshot(db, {
      vendorId: 'vendor-2',
      routeStopId: 'stop-2',
      routeSyncId: 'sync-2',
    });
    await enqueue(
      db,
      'action-2',
      'stop-2',
      { ...vendorScope, vendorId: 'vendor-2' },
    );
    await claimNextAction(db, standardScope, 1_000);
    await markRetryable(db, {
      scope: standardScope,
      actionId: 'action-1',
      nextAttemptAtMs: 5_000,
      error: { code: 'TEMPORARY' },
      updatedAtMs: 1_010,
    });

    await expect(getActionCounts(db, standardScope)).resolves.toEqual([
      {
        vendorId: 'vendor-1',
        pending: 0,
        sending: 0,
        synced: 0,
        failedRetryable: 1,
        conflict: 0,
        oldestPendingAtMs: 1_000,
      },
      {
        vendorId: 'vendor-2',
        pending: 1,
        sending: 0,
        synced: 0,
        failedRetryable: 0,
        conflict: 0,
        oldestPendingAtMs: 1_000,
      },
    ]);
    await expect(countLogoutBlocking(db, standardScope)).resolves.toBe(2);
    await retryNow(db, standardScope, 'action-1', 1_100);
    expect(await getAction(db, standardScope, 'action-1')).toMatchObject({
      state: 'failed_retryable',
      attemptCount: 1,
      nextAttemptAtMs: 1_100,
    });
  });

  test('lists only authorization-blocked route leases for the exact actor and device', async () => {
    await enqueue(db, 'recoverable', 'stop-1');
    await claimNextAction(db, standardScope, 1_020);
    await releaseBlocked(db, {
      scope: standardScope,
      actionId: 'recoverable',
      block: 'authorization',
      error: { httpStatus: 403 },
      updatedAtMs: 1_021,
    });
    await expect(
      listAuthorizationRecoveryRouteSyncIds(db, {
        actorId: standardScope.actorId,
        deviceId: standardScope.deviceId,
      }),
    ).resolves.toEqual(['sync-1']);
    await expect(
      listAuthorizationRecoveryRouteSyncIds(db, {
        actorId: standardScope.actorId,
        deviceId: 'foreign-device',
      }),
    ).resolves.toEqual([]);
  });

  test('deletes only expired synced rows and suppresses cleanup on clock rollback', async () => {
    await enqueue(db, 'synced', 'stop-1');
    await claimNextAction(db, standardScope, 1_000);
    await markSynced(db, {
      scope: standardScope,
      actionId: 'synced',
      serverResponse: { id: 'server-event' },
      syncedAtMs: 1_010,
    });
    await insertSnapshot(db, {
      vendorId: 'vendor-2',
      routeStopId: 'stop-2',
      routeSyncId: 'sync-2',
    });
    await enqueue(
      db,
      'pending',
      'stop-2',
      { ...vendorScope, vendorId: 'vendor-2' },
    );

    await expect(
      deleteExpiredSynced(db, standardScope, 949),
    ).resolves.toBe(0);
    await expect(
      deleteExpiredSynced(db, standardScope, 1_050),
    ).resolves.toBe(1);
    await expect(listActions(db, standardScope)).resolves.toEqual([
      expect.objectContaining({ actionId: 'pending', state: 'pending' }),
    ]);
  });

  async function resetWithSnapshot() {
    await db.closeAsync();
    db = new TestDatabase();
    await initializeOfflineDatabase(db);
    await insertSnapshot(db);
  }
});

function deliveredRequest() {
  return {
    serviceDate: '2026-07-24',
    occurredAt: '2026-07-24T00:00:00.000Z',
    outcome: 'delivered' as const,
    items: [
      {
        scheduledDeliveryId: 'delivery-1',
        expectedVersion: 1,
        actualQuantity: '1.25',
      },
    ],
  };
}

function actionInput(
  actionId: string,
  routeStopId: string,
  scope: VendorRouteScope = vendorScope,
) {
  return {
    scope,
    actionId,
    idempotencyKey: `key-${actionId}`,
    routeStopId,
    request: deliveredRequest(),
    clock: () => 1_000,
  };
}

function enqueue(
  db: TestDatabase,
  actionId: string,
  routeStopId: string,
  scope: VendorRouteScope = vendorScope,
) {
  return enqueueAction(db, actionInput(actionId, routeStopId, scope));
}

async function insertSnapshot(
  db: TestDatabase,
  {
    vendorId = 'vendor-1',
    routeStopId = 'stop-1',
    routeSyncId = 'sync-1',
  }: {
    vendorId?: string;
    routeStopId?: string;
    routeSyncId?: string;
  } = {},
) {
  const route = {
    assignments: [
      {
        id: `assignment-${routeStopId}`,
        routeId: `route-${routeStopId}`,
        routeName: `Route ${routeStopId}`,
        serviceDate: '2026-07-24',
      },
    ],
    deliveries: [
      {
        id: 'delivery-1',
        routeAssignmentId: `assignment-${routeStopId}`,
        routeId: 'route-1',
        routeName: 'Route One',
        routeStopId,
        serviceDate: '2026-07-24',
        sequence: 1,
        householdName: 'Household One',
        householdAccountNumber: 'H-1',
        pendingStopItems: [
          {
            scheduledDeliveryId: 'delivery-1',
            expectedVersion: 1,
            plannedQuantity: '1.25',
            productName: 'Cow Milk',
            unitName: 'Litre',
          },
        ],
      },
    ],
  };

  await db.runAsync(
    `INSERT INTO route_snapshots (
      actor_id, vendor_id, device_id, service_date, route_sync_id,
      server_time_ms, expires_at_ms, saved_at_wall_ms, route_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    'actor-1',
    vendorId,
    'device-1',
    '2026-07-24',
    routeSyncId,
    100,
    200,
    950,
    JSON.stringify(route),
  );
}
