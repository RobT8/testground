import { getDb } from './database';

/** The note for one day of a holiday, if there is one. */
export async function getDayNote(holidayId: number, date: string): Promise<string> {
  const db = await getDb();
  const rows = await db.query<{ note: string }>(
    'SELECT note FROM day_notes WHERE holiday_id = ? AND date = ?',
    [holidayId, date],
  );
  return rows[0]?.note ?? '';
}

/** Every note in a holiday, keyed by date — for the planner and exports. */
export async function listDayNotes(holidayId: number): Promise<Map<string, string>> {
  const db = await getDb();
  const rows = await db.query<{ date: string; note: string }>(
    'SELECT date, note FROM day_notes WHERE holiday_id = ?',
    [holidayId],
  );
  return new Map(rows.map((row) => [row.date, row.note]));
}

/** Save a day's note. Clearing the text removes the row rather than storing "". */
export async function setDayNote(
  holidayId: number,
  date: string,
  note: string,
): Promise<void> {
  const db = await getDb();
  const trimmed = note.trim();

  if (trimmed === '') {
    await db.run('DELETE FROM day_notes WHERE holiday_id = ? AND date = ?', [holidayId, date]);
    return;
  }

  await db.run(
    `INSERT INTO day_notes (holiday_id, date, note) VALUES (?, ?, ?)
     ON CONFLICT(holiday_id, date) DO UPDATE SET note = excluded.note`,
    [holidayId, date, trimmed],
  );
}
