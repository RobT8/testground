import { DatabaseSync } from 'node:sqlite';
import type { DbExecutor, RunResult, SqlValue } from './executor';
import { migrate } from './migrate';

/**
 * An in-memory executor backed by Node's built-in SQLite, for tests.
 *
 * Tests run the real migrations and the real SQL — only the driver differs
 * from the device — so schema mistakes and broken queries surface here rather
 * than on a phone.
 */
export function createTestExecutor(): DbExecutor & { close: () => void } {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');

  return {
    async query<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
      return db.prepare(sql).all(...params) as T[];
    },
    async run(sql: string, params: SqlValue[] = []): Promise<RunResult> {
      const result = db.prepare(sql).run(...params);
      return { changes: Number(result.changes), lastId: Number(result.lastInsertRowid) };
    },
    async executeScript(sql: string): Promise<void> {
      db.exec(sql);
    },
    async persist(): Promise<void> {},
    close: () => db.close(),
  };
}

/** A migrated, empty database ready for a test to populate. */
export async function createTestDb(): Promise<DbExecutor & { close: () => void }> {
  const db = createTestExecutor();
  await migrate(db);
  return db;
}
