import { getDb } from './database';
import { buildSetClause } from './sql';
import type { Holiday, NewHoliday } from './types';

export async function listHolidays(): Promise<Holiday[]> {
  const db = await getDb();
  return db.query<Holiday>('SELECT * FROM holidays ORDER BY start_date');
}

export async function getHoliday(id: number): Promise<Holiday | null> {
  const db = await getDb();
  const rows = await db.query<Holiday>('SELECT * FROM holidays WHERE id = ?', [id]);
  return rows[0] ?? null;
}

export async function countHolidays(): Promise<number> {
  const db = await getDb();
  const rows = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM holidays');
  return rows[0]?.n ?? 0;
}

/**
 * The next holiday starting on or after `today`, for the "Next break" stat.
 * A holiday that is currently running counts as the next one.
 */
export async function getNextHoliday(today: string): Promise<Holiday | null> {
  const db = await getDb();
  const rows = await db.query<Holiday>(
    'SELECT * FROM holidays WHERE end_date >= ? ORDER BY start_date LIMIT 1',
    [today],
  );
  return rows[0] ?? null;
}

export async function createHoliday(holiday: NewHoliday): Promise<number> {
  const db = await getDb();
  const result = await db.run(
    `INSERT INTO holidays (name, start_date, end_date, mode, exclude_weekends)
     VALUES (?, ?, ?, ?, ?)`,
    [
      holiday.name,
      holiday.start_date,
      holiday.end_date,
      holiday.mode,
      holiday.exclude_weekends,
    ],
  );
  return result.lastId;
}

export async function updateHoliday(id: number, changes: Partial<NewHoliday>): Promise<void> {
  const update = buildSetClause(changes, [
    'name', 'start_date', 'end_date', 'mode', 'exclude_weekends',
  ]);
  if (!update) return;

  const db = await getDb();
  await db.run(
    `UPDATE holidays SET ${update.clause}, updated_at = datetime('now') WHERE id = ?`,
    [...update.values, id],
  );
}

/** Delete a holiday. Its assignments cascade away with it. */
export async function deleteHoliday(id: number): Promise<void> {
  const db = await getDb();
  await db.run('DELETE FROM holidays WHERE id = ?', [id]);
}
