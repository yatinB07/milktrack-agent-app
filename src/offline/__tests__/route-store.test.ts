import { initializeOfflineDatabase } from '../database';
import {
  deleteRouteSnapshotIfExpiredAndUnreferenced,
  getRouteSnapshot,
  replaceRouteSnapshot,
} from '../route-store';
import type { CachedRoutePayload, RouteLease, VendorRouteScope } from '../types';
import { TestDatabase } from './test-database';

const scope: VendorRouteScope = {
  actorId: 'actor-1',
  vendorId: 'vendor-1',
  deviceId: 'device-1',
};
const lease: RouteLease = {
  serverTimeMs: 100,
  expiresAtMs: 200,
  savedAtWallMs: 20,
  retentionDeleteAfterWallMs: 120,
};
const route = {
  assignments: [{ assignmentId: 'assignment-1', preserved: { nested: true } }],
  deliveries: [{ deliveryId: 'delivery-1', plannedItems: ['exactly-as-received'] }],
} as unknown as CachedRoutePayload;

describe('route snapshot store', () => {
  let db: TestDatabase;
  let storeDb: Parameters<typeof replaceRouteSnapshot>[0];

  beforeEach(async () => {
    db = new TestDatabase();
    await initializeOfflineDatabase(db);
    storeDb = {
      getFirstAsync: db.getFirstAsync.bind(db),
      runAsync: db.runAsync.bind(db),
      withExclusiveTransactionAsync: async (task) =>
        db.withExclusiveTransactionAsync(async () =>
          task({ runAsync: db.runAsync.bind(db) }),
        ),
    };
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  test('replaces and reads one complete route only for its actor, vendor, and device', async () => {
    await replaceRouteSnapshot(storeDb, {
      ...scope,
      serviceDate: '2026-07-24',
      routeSyncId: 'route-sync-1',
      lease,
      route,
    });

    await expect(getRouteSnapshot(storeDb, scope)).resolves.toEqual({
      ...scope,
      serviceDate: '2026-07-24',
      routeSyncId: 'route-sync-1',
      lease,
      route,
    });
    await expect(
      getRouteSnapshot(storeDb, { ...scope, actorId: 'actor-2' }),
    ).resolves.toBeNull();
    await expect(
      getRouteSnapshot(storeDb, { ...scope, vendorId: 'vendor-2' }),
    ).resolves.toBeNull();
    await expect(
      getRouteSnapshot(storeDb, { ...scope, deviceId: 'device-2' }),
    ).resolves.toBeNull();
  });

  test('preserves the previous complete snapshot when a replacement transaction fails', async () => {
    await replaceRouteSnapshot(storeDb, {
      ...scope,
      serviceDate: '2026-07-24',
      routeSyncId: 'route-sync-1',
      lease,
      route,
    });
    await db.execAsync(`
      CREATE TRIGGER reject_route_snapshot_replacement
      BEFORE UPDATE ON route_snapshots
      BEGIN
        SELECT RAISE(ABORT, 'injected route replacement failure');
      END;
    `);

    await expect(
      replaceRouteSnapshot(storeDb, {
        ...scope,
        serviceDate: '2026-07-25',
        routeSyncId: 'route-sync-2',
        lease: { ...lease, expiresAtMs: 300 },
        route: { assignments: [], deliveries: [] },
      }),
    ).rejects.toThrow('injected route replacement failure');

    await expect(getRouteSnapshot(storeDb, scope)).resolves.toEqual({
      ...scope,
      serviceDate: '2026-07-24',
      routeSyncId: 'route-sync-1',
      lease,
      route,
    });
  });

  test('deletes an expired snapshot only after its lease has no non-terminal action', async () => {
    await replaceRouteSnapshot(storeDb, {
      ...scope,
      serviceDate: '2026-07-24',
      routeSyncId: 'route-sync-1',
      lease,
      route,
    });
    await insertPendingAction(db, 'route-sync-1');

    await expect(
      deleteRouteSnapshotIfExpiredAndUnreferenced(
        storeDb,
        scope,
        lease.expiresAtMs,
      ),
    ).resolves.toBe(false);

    await db.runAsync(
      "UPDATE offline_actions SET state = 'sending' WHERE action_id = 'action-1'",
    );
    await db.runAsync(
      `UPDATE offline_actions
       SET state = 'synced', synced_at_ms = 200, server_response_json = '{}'
       WHERE action_id = 'action-1'`,
    );

    await expect(
      deleteRouteSnapshotIfExpiredAndUnreferenced(
        storeDb,
        scope,
        lease.expiresAtMs,
      ),
    ).resolves.toBe(true);
    await expect(getRouteSnapshot(storeDb, scope)).resolves.toBeNull();
  });

  test('suppresses cleanup after a wall-clock rollback', async () => {
    await replaceRouteSnapshot(storeDb, {
      ...scope,
      serviceDate: '2026-07-24',
      routeSyncId: 'route-sync-1',
      lease: {
        serverTimeMs: 100,
        expiresAtMs: 200,
        savedAtWallMs: 300,
        retentionDeleteAfterWallMs: 400,
      },
      route,
    });

    await expect(
      deleteRouteSnapshotIfExpiredAndUnreferenced(storeDb, scope, 350),
    ).resolves.toBe(false);
    await expect(getRouteSnapshot(storeDb, scope)).resolves.not.toBeNull();
  });
});

async function insertPendingAction(db: TestDatabase, routeSyncId: string) {
  await db.runAsync(
    `INSERT INTO offline_actions (
      action_id, idempotency_key, local_sequence, actor_id, vendor_id,
      device_id, route_stop_id, service_date, route_sync_id, payload_version,
      occurred_at, request_json, display_json, lease_server_time_ms,
      lease_expires_at_ms, lease_saved_at_wall_ms,
      retention_delete_after_wall_ms, state, created_at_ms, updated_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    'action-1',
    'key-1',
    1,
    scope.actorId,
    scope.vendorId,
    scope.deviceId,
    'stop-1',
    '2026-07-24',
    routeSyncId,
    1,
    '2026-07-24T00:00:00.000Z',
    '{}',
    '{}',
    lease.serverTimeMs,
    lease.expiresAtMs,
    lease.savedAtWallMs,
    lease.retentionDeleteAfterWallMs,
    'pending',
    20,
    20,
  );
}
