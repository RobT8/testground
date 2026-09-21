import type { DbExecutor } from './executor';
import { MIGRATIONS } from './schema';

/**
 * Bring the database up to the current schema version.
 *
 * Uses SQLite's built-in `user_version` counter rather than a migrations
 * table: it costs nothing, survives backup/restore, and starts at 0 on a
 * fresh database, so a first launch simply runs every migration.
 */
export async function migrate(db: DbExecutor): Promise<number> {
  const rows = await db.query<{ user_version: number }>('PRAGMA user_version');
  const current = rows[0]?.user_version ?? 0;

  for (let version = current; version < MIGRATIONS.length; version++) {
    await db.executeScript(MIGRATIONS[version]);
    // Not parameterisable in a PRAGMA; the value is a loop index, not input.
    await db.executeScript(`PRAGMA user_version = ${version + 1}`);
  }

  if (current < MIGRATIONS.length) await db.persist();
  return MIGRATIONS.length;
}
