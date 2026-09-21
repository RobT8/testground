import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setDbExecutor } from '../database';
import { createTestDb } from '../testExecutor';
import type { DbExecutor } from '../executor';
import { createHoliday, deleteHoliday } from '../holidays';
import { getDayNote, listDayNotes, setDayNote } from '../dayNotes';

let db: DbExecutor & { close: () => void };
let holidayId: number;

beforeEach(async () => {
  db = await createTestDb();
  setDbExecutor(db);
  holidayId = await createHoliday({
    name: 'October half term', start_date: '2026-10-19', end_date: '2026-10-23',
    mode: 'simple', exclude_weekends: 1,
  });
});
afterEach(() => {
  setDbExecutor(null);
  db.close();
});

describe('day notes', () => {
  it('returns an empty string when there is no note', async () => {
    expect(await getDayNote(holidayId, '2026-10-19')).toBe('');
  });

  it('saves and reads back a note', async () => {
    await setDayNote(holidayId, '2026-10-19', 'pack swimming kit');
    expect(await getDayNote(holidayId, '2026-10-19')).toBe('pack swimming kit');
  });

  it('keeps one note per day rather than appending', async () => {
    await setDayNote(holidayId, '2026-10-19', 'pack swimming kit');
    await setDayNote(holidayId, '2026-10-19', 'pack wellies');
    expect(await getDayNote(holidayId, '2026-10-19')).toBe('pack wellies');
    expect(await db.query('SELECT * FROM day_notes')).toHaveLength(1);
  });

  it('trims surrounding whitespace', async () => {
    await setDayNote(holidayId, '2026-10-19', '  pack wellies  ');
    expect(await getDayNote(holidayId, '2026-10-19')).toBe('pack wellies');
  });

  it('clearing the text removes the note rather than storing a blank', async () => {
    await setDayNote(holidayId, '2026-10-19', 'pack swimming kit');
    await setDayNote(holidayId, '2026-10-19', '   ');
    expect(await getDayNote(holidayId, '2026-10-19')).toBe('');
    expect(await db.query('SELECT * FROM day_notes')).toHaveLength(0);
  });

  it('keeps days independent', async () => {
    await setDayNote(holidayId, '2026-10-19', 'swimming');
    await setDayNote(holidayId, '2026-10-20', 'cinema');
    const notes = await listDayNotes(holidayId);
    expect(notes.get('2026-10-19')).toBe('swimming');
    expect(notes.get('2026-10-20')).toBe('cinema');
    expect(notes.size).toBe(2);
  });

  it('survives with no assignments on the day', async () => {
    // The whole reason this lives in its own table: a note on an empty day.
    await setDayNote(holidayId, '2026-10-22', 'INSET day — no club');
    expect(await getDayNote(holidayId, '2026-10-22')).toBe('INSET day — no club');
  });

  it('is deleted with its holiday', async () => {
    await setDayNote(holidayId, '2026-10-19', 'swimming');
    await deleteHoliday(holidayId);
    expect(await db.query('SELECT * FROM day_notes')).toHaveLength(0);
  });
});
