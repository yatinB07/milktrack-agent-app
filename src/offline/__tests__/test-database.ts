type BindValue = null | number | string | Uint8Array;

type Statement = {
  all(...params: BindValue[]): unknown[];
  get(...params: BindValue[]): unknown;
  run(...params: BindValue[]): { changes: number; lastInsertRowid: number | bigint };
};

type Database = {
  close(): void;
  exec(sql: string): void;
  prepare(sql: string): Statement;
};

declare const process: {
  getBuiltinModule(name: 'node:sqlite'): {
    DatabaseSync: new (path: string) => Database;
  };
};

const { DatabaseSync } = process.getBuiltinModule('node:sqlite');

export class TestDatabase {
  readonly database = new DatabaseSync(':memory:');
  exclusiveTransactions = 0;
  executedSql: string[] = [];

  async closeAsync() {
    this.database.close();
  }

  async execAsync(sql: string) {
    this.executedSql.push(sql);
    this.database.exec(sql);
  }

  async runAsync(sql: string, ...params: BindValue[]) {
    return this.database.prepare(sql).run(...params);
  }

  async getFirstAsync<T>(sql: string, ...params: BindValue[]) {
    return (this.database.prepare(sql).get(...params) as T | undefined) ?? null;
  }

  async getAllAsync<T>(sql: string, ...params: BindValue[]) {
    return this.database.prepare(sql).all(...params) as T[];
  }

  async withExclusiveTransactionAsync(
    task: (
      transaction: Pick<TestDatabase, 'execAsync'>,
    ) => Promise<void>,
  ) {
    this.exclusiveTransactions += 1;
    this.database.exec('BEGIN IMMEDIATE');
    try {
      await task(this);
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}
