import {
  initializeOfflineDatabase,
  OFFLINE_DATABASE_NAME,
} from '../database';
import { TestDatabase } from './test-database';

describe('offline database V1', () => {
  let db: TestDatabase;

  beforeEach(() => {
    db = new TestDatabase();
  });

  afterEach(async () => {
    await db.closeAsync();
  });

  test('uses the frozen durable database name', () => {
    expect(OFFLINE_DATABASE_NAME).toBe('milktrack-agent.db');
  });

  test('configures the connection and migrates V0 to V1 once', async () => {
    await initializeOfflineDatabase(db);
    await initializeOfflineDatabase(db);

    await expect(
      db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'),
    ).resolves.toEqual({ user_version: 1 });
    await expect(
      db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys'),
    ).resolves.toEqual({ foreign_keys: 1 });
    await expect(
      db.getFirstAsync<{ timeout: number }>('PRAGMA busy_timeout'),
    ).resolves.toEqual({ timeout: 5000 });
    expect(db.executedSql[0]).toContain('PRAGMA journal_mode = WAL');
    expect(db.exclusiveTransactions).toBe(1);
  });

  test('creates the frozen strict tables, indexes, and triggers', async () => {
    await initializeOfflineDatabase(db);

    const objects = await db.getAllAsync<{ name: string; type: string }>(
      `SELECT name, type
       FROM sqlite_master
       WHERE name NOT LIKE 'sqlite_%'
       ORDER BY name`,
    );

    expect(objects).toEqual(
      expect.arrayContaining([
        { name: 'local_sequence', type: 'table' },
        { name: 'offline_actions', type: 'table' },
        { name: 'route_snapshots', type: 'table' },
        { name: 'offline_actions_claim_idx', type: 'index' },
        { name: 'offline_actions_grouped_ui_idx', type: 'index' },
        { name: 'offline_actions_logout_idx', type: 'index' },
        { name: 'offline_actions_retention_idx', type: 'index' },
        { name: 'offline_actions_immutable', type: 'trigger' },
        { name: 'offline_actions_state_transition', type: 'trigger' },
      ]),
    );
    await expect(
      db.getFirstAsync<{ last_value: number }>(
        'SELECT last_value FROM local_sequence WHERE singleton = 1',
      ),
    ).resolves.toEqual({ last_value: 0 });
  });

  test('enforces JSON, lease, identity, and state invariants in SQLite', async () => {
    await initializeOfflineDatabase(db);

    await expect(
      db.runAsync(
        `INSERT INTO route_snapshots (
          actor_id, vendor_id, device_id, service_date, route_sync_id,
          server_time_ms, expires_at_ms, saved_at_wall_ms, route_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        'actor-1',
        'vendor-1',
        'device-1',
        '2026-07-24',
        'sync-1',
        10,
        20,
        1,
        'not-json',
      ),
    ).rejects.toThrow();

    await insertAction(db);
    await expect(
      db.runAsync(
        `UPDATE offline_actions
         SET request_json = '{"changed":true}'
         WHERE action_id = 'action-1'`,
      ),
    ).rejects.toThrow('immutable offline action');
    await expect(
      db.runAsync(
        `UPDATE offline_actions
         SET state = 'synced', synced_at_ms = 5, server_response_json = '{}'
         WHERE action_id = 'action-1'`,
      ),
    ).rejects.toThrow('invalid offline action state transition');

    await db.runAsync(
      "UPDATE offline_actions SET state = 'sending' WHERE action_id = 'action-1'",
    );
    await db.runAsync(
      `UPDATE offline_actions
       SET state = 'synced', synced_at_ms = 5, server_response_json = '{}'
       WHERE action_id = 'action-1'`,
    );
    await expect(
      db.runAsync(
        "UPDATE offline_actions SET state = 'pending', synced_at_ms = NULL, server_response_json = NULL WHERE action_id = 'action-1'",
      ),
    ).rejects.toThrow('invalid offline action state transition');
  });

  test('rolls back the whole migration when a transaction fails', async () => {
    const failing = new TestDatabase();
    const originalExec = failing.execAsync.bind(failing);
    failing.execAsync = async (sql: string) => {
      await originalExec(sql);
      if (sql.includes('CREATE TABLE route_snapshots')) {
        throw new Error('injected migration failure');
      }
    };

    await expect(initializeOfflineDatabase(failing)).rejects.toThrow(
      'injected migration failure',
    );
    await expect(
      failing.getFirstAsync<{ user_version: number }>('PRAGMA user_version'),
    ).resolves.toEqual({ user_version: 0 });
    await expect(
      failing.getAllAsync('SELECT name FROM sqlite_master WHERE type = ?', 'table'),
    ).resolves.toEqual([]);
    await failing.closeAsync();
  });
});

async function insertAction(db: TestDatabase) {
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
    'actor-1',
    'vendor-1',
    'device-1',
    'stop-1',
    '2026-07-24',
    'sync-1',
    1,
    '2026-07-24T00:00:00.000Z',
    '{}',
    '{}',
    10,
    20,
    1,
    11,
    'pending',
    1,
    1,
  );
}
