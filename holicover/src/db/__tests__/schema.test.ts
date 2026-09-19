import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, createTestExecutor } from '../testExecutor';
import { migrate } from '../migrate';
import { SCHEMA_VERSION } from '../schema';
import type { DbExecutor } from '../executor';

let db: DbExecutor & { close: () => void };

beforeEach(async () => {
  db = await createTestDb();
});
afterEach(() => db.close());

describe('migrations', () => {
  it('creates every table the app needs', async () => {
    const tables = await db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    const names = tables.map((t) => t.name);
    for (const table of ['app_settings', 'assignments', 'carers', 'children', 'holidays']) {
      expect(names).toContain(table);
    }
  });

  it('records the schema version', async () => {
    const rows = await db.query<{ user_version: number }>('PRAGMA user_version');
    expect(rows[0].user_version).toBe(SCHEMA_VERSION);
  });

  it('is idempotent — a second launch re-runs nothing and does not throw', async () => {
    await expect(migrate(db)).resolves.toBe(SCHEMA_VERSION);
  });

  it('runs every migration on a fresh database', async () => {
    const fresh = createTestExecutor();
    const before = await fresh.query<{ user_version: number }>('PRAGMA user_version');
    expect(before[0].user_version).toBe(0);
    await migrate(fresh);
    const after = await fresh.query<{ user_version: number }>('PRAGMA user_version');
    expect(after[0].user_version).toBe(SCHEMA_VERSION);
    fresh.close();
  });
});

describe('constraints', () => {
  it('allows only one carer per simple-mode slot', async () => {
    await db.run("INSERT INTO holidays (id, name, start_date, end_date) VALUES (1, 'H', '2026-10-19', '2026-10-23')");
    await db.run("INSERT INTO children (id, name, colour) VALUES (1, 'Ada', '#378ADD')");
    await db.run("INSERT INTO carers (id, name, short_name, type) VALUES (1, 'Gran', 'Gran', 'family'), (2, 'Mum', 'Mum', 'parent')");

    await db.run("INSERT INTO assignments (holiday_id, child_id, carer_id, date, period) VALUES (1, 1, 1, '2026-10-20', 'am')");
    await expect(
      db.run("INSERT INTO assignments (holiday_id, child_id, carer_id, date, period) VALUES (1, 1, 2, '2026-10-20', 'am')"),
    ).rejects.toThrow();
  });

  it('allows many detailed-mode time slots in one day', async () => {
    await db.run("INSERT INTO holidays (id, name, start_date, end_date, mode) VALUES (1, 'H', '2026-10-19', '2026-10-23', 'detailed')");
    await db.run("INSERT INTO children (id, name, colour) VALUES (1, 'Ada', '#378ADD')");
    await db.run("INSERT INTO carers (id, name, short_name, type) VALUES (1, 'Gran', 'Gran', 'family')");

    await db.run("INSERT INTO assignments (holiday_id, child_id, carer_id, date, start_time, end_time) VALUES (1, 1, 1, '2026-10-20', '09:00', '12:00')");
    await db.run("INSERT INTO assignments (holiday_id, child_id, carer_id, date, start_time, end_time) VALUES (1, 1, 1, '2026-10-20', '13:00', '17:00')");

    const rows = await db.query('SELECT * FROM assignments');
    expect(rows).toHaveLength(2);
  });

  it('cascades assignments away when a holiday is deleted', async () => {
    await db.run("INSERT INTO holidays (id, name, start_date, end_date) VALUES (1, 'H', '2026-10-19', '2026-10-23')");
    await db.run("INSERT INTO children (id, name, colour) VALUES (1, 'Ada', '#378ADD')");
    await db.run("INSERT INTO carers (id, name, short_name, type) VALUES (1, 'Gran', 'Gran', 'family')");
    await db.run("INSERT INTO assignments (holiday_id, child_id, carer_id, date, period) VALUES (1, 1, 1, '2026-10-20', 'am')");

    await db.run('DELETE FROM holidays WHERE id = 1');
    expect(await db.query('SELECT * FROM assignments')).toHaveLength(0);
  });

  it('cascades assignments away when a carer is deleted', async () => {
    await db.run("INSERT INTO holidays (id, name, start_date, end_date) VALUES (1, 'H', '2026-10-19', '2026-10-23')");
    await db.run("INSERT INTO children (id, name, colour) VALUES (1, 'Ada', '#378ADD')");
    await db.run("INSERT INTO carers (id, name, short_name, type) VALUES (1, 'Gran', 'Gran', 'family')");
    await db.run("INSERT INTO assignments (holiday_id, child_id, carer_id, date, period) VALUES (1, 1, 1, '2026-10-20', 'am')");

    await db.run('DELETE FROM carers WHERE id = 1');
    expect(await db.query('SELECT * FROM assignments')).toHaveLength(0);
  });
});
