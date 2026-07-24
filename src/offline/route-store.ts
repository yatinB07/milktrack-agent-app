import type {
  CachedRoutePayload,
  RouteLease,
  VendorRouteScope,
} from './types';

type BindValue = null | number | string | Uint8Array;

type SQLiteRunResult = Readonly<{ changes: number }>;

type SQLiteTransaction = Readonly<{
  runAsync(
    source: string,
    ...params: BindValue[]
  ): Promise<SQLiteRunResult>;
}>;

type SQLiteDatabase = SQLiteTransaction &
  Readonly<{
    getFirstAsync<T>(
      source: string,
      ...params: BindValue[]
    ): Promise<T | null>;
    withExclusiveTransactionAsync(
      task: (transaction: SQLiteTransaction) => Promise<void>,
    ): Promise<void>;
  }>;

export type RouteSnapshot = VendorRouteScope &
  Readonly<{
    serviceDate: string;
    routeSyncId: string;
    lease: RouteLease;
    route: CachedRoutePayload;
  }>;

type RouteSnapshotRow = Readonly<{
  serviceDate: string;
  routeSyncId: string;
  serverTimeMs: number;
  expiresAtMs: number;
  savedAtWallMs: number;
  routeJson: string;
}>;

/** Replaces an actor/vendor/device route only after its whole payload is ready. */
export async function replaceRouteSnapshot(
  db: SQLiteDatabase,
  snapshot: RouteSnapshot,
): Promise<void> {
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      `INSERT INTO route_snapshots (
        actor_id, vendor_id, device_id, service_date, route_sync_id,
        server_time_ms, expires_at_ms, saved_at_wall_ms, route_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (actor_id, vendor_id, device_id) DO UPDATE SET
        service_date = excluded.service_date,
        route_sync_id = excluded.route_sync_id,
        server_time_ms = excluded.server_time_ms,
        expires_at_ms = excluded.expires_at_ms,
        saved_at_wall_ms = excluded.saved_at_wall_ms,
        route_json = excluded.route_json`,
      snapshot.actorId,
      snapshot.vendorId,
      snapshot.deviceId,
      snapshot.serviceDate,
      snapshot.routeSyncId,
      snapshot.lease.serverTimeMs,
      snapshot.lease.expiresAtMs,
      snapshot.lease.savedAtWallMs,
      JSON.stringify(snapshot.route),
    );
  });
}

export async function getRouteSnapshot(
  db: SQLiteDatabase,
  scope: VendorRouteScope,
): Promise<RouteSnapshot | null> {
  const row = await db.getFirstAsync<RouteSnapshotRow>(
    `SELECT
      service_date AS serviceDate,
      route_sync_id AS routeSyncId,
      server_time_ms AS serverTimeMs,
      expires_at_ms AS expiresAtMs,
      saved_at_wall_ms AS savedAtWallMs,
      route_json AS routeJson
    FROM route_snapshots
    WHERE actor_id = ? AND vendor_id = ? AND device_id = ?`,
    scope.actorId,
    scope.vendorId,
    scope.deviceId,
  );
  if (!row) return null;

  return {
    ...scope,
    serviceDate: row.serviceDate,
    routeSyncId: row.routeSyncId,
    lease: {
      serverTimeMs: row.serverTimeMs,
      expiresAtMs: row.expiresAtMs,
      savedAtWallMs: row.savedAtWallMs,
      retentionDeleteAfterWallMs:
        row.savedAtWallMs + (row.expiresAtMs - row.serverTimeMs),
    },
    route: JSON.parse(row.routeJson) as CachedRoutePayload,
  };
}

export async function deleteRouteSnapshotIfExpiredAndUnreferenced(
  db: Pick<SQLiteDatabase, 'runAsync'>,
  scope: VendorRouteScope,
  now: number,
): Promise<boolean> {
  const result = await db.runAsync(
    `DELETE FROM route_snapshots
    WHERE actor_id = ?
      AND vendor_id = ?
      AND device_id = ?
      AND saved_at_wall_ms + (expires_at_ms - server_time_ms) <= ?
      AND NOT EXISTS (
        SELECT 1
        FROM offline_actions
        WHERE actor_id = route_snapshots.actor_id
          AND vendor_id = route_snapshots.vendor_id
          AND device_id = route_snapshots.device_id
          AND route_sync_id = route_snapshots.route_sync_id
          AND state NOT IN ('synced', 'conflict')
      )`,
    scope.actorId,
    scope.vendorId,
    scope.deviceId,
    now,
  );
  return result.changes === 1;
}
