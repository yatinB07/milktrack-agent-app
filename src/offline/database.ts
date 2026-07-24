export const OFFLINE_DATABASE_NAME = 'milktrack-agent.db';

type MigrationTransaction = {
  execAsync(source: string): Promise<void>;
};

type OfflineDatabase = MigrationTransaction & {
  getFirstAsync<T>(source: string): Promise<T | null>;
  withExclusiveTransactionAsync(
    task: (transaction: MigrationTransaction) => Promise<void>,
  ): Promise<void>;
};

const CONNECTION_PRAGMAS = `
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA journal_mode = WAL;
`;

const V1_MIGRATION = `
CREATE TABLE route_snapshots (
  actor_id             TEXT    NOT NULL,
  vendor_id            TEXT    NOT NULL,
  device_id            TEXT    NOT NULL,
  service_date         TEXT    NOT NULL,
  route_sync_id        TEXT    NOT NULL,
  server_time_ms       INTEGER NOT NULL,
  expires_at_ms        INTEGER NOT NULL,
  saved_at_wall_ms     INTEGER NOT NULL,
  route_json           TEXT    NOT NULL CHECK (json_valid(route_json)),
  PRIMARY KEY (actor_id, vendor_id, device_id),
  CHECK (expires_at_ms > server_time_ms)
) STRICT;

CREATE TABLE local_sequence (
  singleton  INTEGER PRIMARY KEY CHECK (singleton = 1),
  last_value INTEGER NOT NULL CHECK (
    last_value BETWEEN 0 AND 9007199254740991
  )
) STRICT;

INSERT INTO local_sequence (singleton, last_value) VALUES (1, 0);

CREATE TABLE offline_actions (
  action_id                       TEXT    PRIMARY KEY,
  idempotency_key                 TEXT    NOT NULL UNIQUE,
  local_sequence                  INTEGER NOT NULL UNIQUE CHECK (
    local_sequence BETWEEN 1 AND 9007199254740991
  ),
  actor_id                        TEXT    NOT NULL,
  vendor_id                       TEXT    NOT NULL,
  device_id                       TEXT    NOT NULL,
  route_stop_id                   TEXT    NOT NULL,
  service_date                    TEXT    NOT NULL,
  route_sync_id                   TEXT    NOT NULL,
  payload_version                 INTEGER NOT NULL CHECK (payload_version = 1),
  occurred_at                     TEXT    NOT NULL,
  request_json                    TEXT    NOT NULL CHECK (json_valid(request_json)),
  display_json                    TEXT    NOT NULL CHECK (json_valid(display_json)),
  lease_server_time_ms            INTEGER NOT NULL,
  lease_expires_at_ms             INTEGER NOT NULL,
  lease_saved_at_wall_ms          INTEGER NOT NULL,
  retention_delete_after_wall_ms  INTEGER NOT NULL,
  state                           TEXT    NOT NULL CHECK (state IN (
    'pending', 'sending', 'synced', 'failed_retryable', 'conflict'
  )),
  blocked_reason                  TEXT CHECK (blocked_reason IN (
    'authentication', 'authorization', 'invariant'
  )),
  attempt_count                   INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at_ms              INTEGER,
  last_http_status                INTEGER,
  last_error_code                 TEXT,
  last_error_message              TEXT,
  last_error_correlation_id       TEXT,
  server_response_json            TEXT CHECK (
    server_response_json IS NULL OR json_valid(server_response_json)
  ),
  conflict_id                     TEXT,
  synced_at_ms                    INTEGER,
  created_at_ms                   INTEGER NOT NULL,
  updated_at_ms                   INTEGER NOT NULL,
  UNIQUE (actor_id, vendor_id, device_id, service_date, route_stop_id),
  CHECK (lease_expires_at_ms > lease_server_time_ms),
  CHECK (
    retention_delete_after_wall_ms =
      lease_saved_at_wall_ms + (lease_expires_at_ms - lease_server_time_ms)
  ),
  CHECK (blocked_reason IS NULL OR state = 'pending'),
  CHECK (
    (state = 'failed_retryable' AND next_attempt_at_ms IS NOT NULL)
    OR (state <> 'failed_retryable' AND next_attempt_at_ms IS NULL)
  ),
  CHECK (
    (state = 'synced' AND synced_at_ms IS NOT NULL)
    OR (state <> 'synced' AND synced_at_ms IS NULL)
  ),
  CHECK (
    (state = 'conflict' AND conflict_id IS NOT NULL)
    OR (state <> 'conflict' AND conflict_id IS NULL)
  ),
  CHECK (
    (state IN ('synced', 'conflict') AND server_response_json IS NOT NULL)
    OR (state NOT IN ('synced', 'conflict') AND server_response_json IS NULL)
  )
) STRICT;

CREATE INDEX offline_actions_claim_idx
  ON offline_actions (actor_id, device_id, local_sequence)
  WHERE state IN ('pending', 'sending', 'failed_retryable');

CREATE INDEX offline_actions_grouped_ui_idx
  ON offline_actions (actor_id, device_id, vendor_id, state, local_sequence);

CREATE INDEX offline_actions_logout_idx
  ON offline_actions (actor_id, device_id, state)
  WHERE state IN ('pending', 'sending', 'failed_retryable');

CREATE INDEX offline_actions_retention_idx
  ON offline_actions (retention_delete_after_wall_ms)
  WHERE state = 'synced';

CREATE TRIGGER offline_actions_immutable
BEFORE UPDATE ON offline_actions
WHEN
  NEW.action_id IS NOT OLD.action_id OR
  NEW.idempotency_key IS NOT OLD.idempotency_key OR
  NEW.local_sequence IS NOT OLD.local_sequence OR
  NEW.actor_id IS NOT OLD.actor_id OR
  NEW.vendor_id IS NOT OLD.vendor_id OR
  NEW.device_id IS NOT OLD.device_id OR
  NEW.route_stop_id IS NOT OLD.route_stop_id OR
  NEW.service_date IS NOT OLD.service_date OR
  NEW.route_sync_id IS NOT OLD.route_sync_id OR
  NEW.payload_version IS NOT OLD.payload_version OR
  NEW.occurred_at IS NOT OLD.occurred_at OR
  NEW.request_json IS NOT OLD.request_json OR
  NEW.display_json IS NOT OLD.display_json OR
  NEW.lease_server_time_ms IS NOT OLD.lease_server_time_ms OR
  NEW.lease_expires_at_ms IS NOT OLD.lease_expires_at_ms OR
  NEW.lease_saved_at_wall_ms IS NOT OLD.lease_saved_at_wall_ms OR
  NEW.retention_delete_after_wall_ms IS NOT OLD.retention_delete_after_wall_ms OR
  NEW.created_at_ms IS NOT OLD.created_at_ms
BEGIN
  SELECT RAISE(ABORT, 'immutable offline action');
END;

CREATE TRIGGER offline_actions_state_transition
BEFORE UPDATE OF state ON offline_actions
WHEN NOT (
  NEW.state = OLD.state OR
  (OLD.state = 'pending' AND NEW.state = 'sending') OR
  (OLD.state = 'failed_retryable' AND NEW.state = 'sending') OR
  (OLD.state = 'sending' AND NEW.state IN (
    'synced', 'failed_retryable', 'conflict', 'pending'
  ))
)
BEGIN
  SELECT RAISE(ABORT, 'invalid offline action state transition');
END;

PRAGMA user_version = 1;
`;

export async function initializeOfflineDatabase(db: OfflineDatabase) {
  await db.execAsync(CONNECTION_PRAGMAS);
  const row = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version',
  );
  const version = row?.user_version ?? 0;
  if (version > 1) {
    throw new Error(`Unsupported offline database version: ${version}`);
  }
  if (version === 1) return;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.execAsync(V1_MIGRATION);
  });
}
