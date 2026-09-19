import { Capacitor } from '@capacitor/core';
import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import type { DbExecutor, RunResult, SqlValue } from './executor';
import { migrate } from './migrate';

const DB_NAME = 'holicover';

let executor: DbExecutor | null = null;
let openPromise: Promise<DbExecutor> | null = null;

/** Wrap a Capacitor connection in the app's executor interface. */
function capacitorExecutor(conn: SQLiteDBConnection, isWeb: boolean): DbExecutor {
  // On the web the database lives in memory and must be flushed to IndexedDB;
  // on Android writes already hit the filesystem.
  const persist = isWeb
    ? () => CapacitorSQLite.saveToStore({ database: DB_NAME })
    : async () => {};

  return {
    async query<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
      const result = await conn.query(sql, params);
      return (result.values ?? []) as T[];
    },
    async run(sql: string, params: SqlValue[] = []): Promise<RunResult> {
      const result = await conn.run(sql, params, false);
      await persist();
      return {
        changes: result.changes?.changes ?? 0,
        lastId: result.changes?.lastId ?? 0,
      };
    },
    async executeScript(sql: string): Promise<void> {
      await conn.execute(sql);
    },
    persist,
  };
}

/** How long to wait for the browser store before calling it a failure. */
const WEB_STORE_TIMEOUT_MS = 15_000;

/**
 * Load the browser SQLite store. Only used during web development — on Android
 * the native plugin handles storage, and this code never runs.
 *
 * The wasm load is raced against a timeout because it fails by hanging: when
 * the sql.js wasm does not match the glue jeep-sqlite bundles, it aborts with
 * an uncaught LinkError and this promise simply never settles, leaving the app
 * on its loading screen with no clue why.
 */
async function initWebStore(): Promise<void> {
  const { defineCustomElements } = await import('jeep-sqlite/loader');
  defineCustomElements(window);
  if (!document.querySelector('jeep-sqlite')) {
    document.body.appendChild(document.createElement('jeep-sqlite'));
  }
  await customElements.whenDefined('jeep-sqlite');

  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('The browser SQLite store did not start. Check that the sql.js wasm version matches jeep-sqlite.')),
      WEB_STORE_TIMEOUT_MS,
    );
  });

  try {
    await Promise.race([CapacitorSQLite.initWebStore(), timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

async function open(): Promise<DbExecutor> {
  const isWeb = Capacitor.getPlatform() === 'web';
  if (isWeb) await initWebStore();

  const sqlite = new SQLiteConnection(CapacitorSQLite);

  // A hot reload can leave a stale connection behind; reuse it rather than
  // failing on "connection already exists".
  const existing = await sqlite.isConnection(DB_NAME, false);
  const conn = existing.result
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);

  await conn.open();

  const db = capacitorExecutor(conn, isWeb);
  // ON DELETE CASCADE is a no-op unless foreign keys are enabled, and SQLite
  // defaults them off for backwards compatibility.
  await db.executeScript('PRAGMA foreign_keys = ON');
  await migrate(db);
  return db;
}

/**
 * Open the database (once) and return the executor. Safe to call concurrently:
 * overlapping callers share a single open.
 */
export function getDb(): Promise<DbExecutor> {
  if (executor) return Promise.resolve(executor);
  if (!openPromise) {
    openPromise = open()
      .then((db) => {
        executor = db;
        return db;
      })
      .catch((error) => {
        openPromise = null; // let a later call retry
        throw error;
      });
  }
  return openPromise;
}

/**
 * Swap in a different executor. Used by tests to run the real SQL against an
 * in-process SQLite instead of the Capacitor plugin.
 */
export function setDbExecutor(db: DbExecutor | null): void {
  executor = db;
  openPromise = db ? Promise.resolve(db) : null;
}

export { DB_NAME };
