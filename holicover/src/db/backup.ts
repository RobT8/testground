import { getDb } from './database';
import { SCHEMA_VERSION } from './schema';
import type { Assignment, Carer, Child, Holiday } from './types';

/** Tables wiped and restored together, children last so cascades behave. */
const DATA_TABLES = ['assignments', 'day_notes', 'holidays', 'children', 'carers', 'app_settings'];

export interface DayNoteRow {
  holiday_id: number;
  date: string;
  note: string;
}

export interface BackupFile {
  /** Guards against importing some unrelated JSON file. */
  app: 'holicover';
  /** The schema the export came from; a newer one cannot be read. */
  schemaVersion: number;
  exportedAt: string;
  children: Child[];
  carers: Carer[];
  holidays: Holiday[];
  assignments: Assignment[];
  dayNotes: DayNoteRow[];
  settings: Record<string, string | null>;
}

/** Serialise everything on the device into one portable object. */
export async function exportData(): Promise<BackupFile> {
  const db = await getDb();
  const [children, carers, holidays, assignments, dayNotes, settings] = await Promise.all([
    db.query<Child>('SELECT * FROM children ORDER BY sort_order, id'),
    db.query<Carer>('SELECT * FROM carers ORDER BY sort_order, id'),
    db.query<Holiday>('SELECT * FROM holidays ORDER BY start_date'),
    db.query<Assignment>('SELECT * FROM assignments ORDER BY id'),
    db.query<DayNoteRow>('SELECT * FROM day_notes ORDER BY holiday_id, date'),
    db.query<{ key: string; value: string | null }>('SELECT * FROM app_settings'),
  ]);

  return {
    app: 'holicover',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    children,
    carers,
    holidays,
    assignments,
    dayNotes,
    settings: Object.fromEntries(settings.map((row) => [row.key, row.value])),
  };
}

export class BackupError extends Error {}

/**
 * Check a parsed file really is a HoliCover backup this build can read.
 *
 * Import replaces everything, so a malformed file must be rejected before a
 * single row is deleted rather than half-applied.
 */
export function validateBackup(data: unknown): BackupFile {
  if (typeof data !== 'object' || data === null) {
    throw new BackupError('That file is not a HoliCover backup.');
  }

  const file = data as Partial<BackupFile>;
  if (file.app !== 'holicover') {
    throw new BackupError('That file is not a HoliCover backup.');
  }
  if (typeof file.schemaVersion !== 'number') {
    throw new BackupError('That backup is missing its version and cannot be read.');
  }
  if (file.schemaVersion > SCHEMA_VERSION) {
    throw new BackupError(
      'That backup came from a newer version of HoliCover. Update the app and try again.',
    );
  }

  for (const key of ['children', 'carers', 'holidays', 'assignments'] as const) {
    if (!Array.isArray(file[key])) {
      throw new BackupError('That backup is incomplete and cannot be read.');
    }
  }

  return {
    ...(file as BackupFile),
    // Added in a later schema version, so an older backup may not carry them.
    dayNotes: Array.isArray(file.dayNotes) ? file.dayNotes : [],
    settings: typeof file.settings === 'object' && file.settings !== null ? file.settings : {},
  };
}

/** Remove every row, leaving the schema in place. */
export async function wipeAllData(): Promise<void> {
  const db = await getDb();
  for (const table of DATA_TABLES) {
    await db.run(`DELETE FROM ${table}`);
  }
  // Let ids start from 1 again, so a restored backup is byte-comparable.
  await db.run("DELETE FROM sqlite_sequence WHERE name IN ('assignments','holidays','children','carers')");
  await db.persist();
}

/**
 * Replace everything on the device with the contents of a backup.
 *
 * Validated first, then applied wholesale: a partially restored plan would be
 * worse than no restore at all.
 */
export async function importData(data: unknown): Promise<BackupFile> {
  const file = validateBackup(data);
  const db = await getDb();

  await wipeAllData();

  for (const child of file.children) {
    await db.run('INSERT INTO children (id, name, colour, sort_order) VALUES (?, ?, ?, ?)', [
      child.id,
      child.name,
      child.colour,
      child.sort_order,
    ]);
  }

  for (const carer of file.carers) {
    await db.run(
      `INSERT INTO carers (id, name, short_name, type, cost_per_day, colour, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        carer.id,
        carer.name,
        carer.short_name,
        carer.type,
        carer.cost_per_day ?? null,
        carer.colour ?? null,
        carer.sort_order,
      ],
    );
  }

  for (const holiday of file.holidays) {
    await db.run(
      `INSERT INTO holidays (id, name, start_date, end_date, mode, exclude_weekends, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        holiday.id,
        holiday.name,
        holiday.start_date,
        holiday.end_date,
        holiday.mode,
        holiday.exclude_weekends,
        holiday.created_at,
        holiday.updated_at,
      ],
    );
  }

  for (const assignment of file.assignments) {
    await db.run(
      `INSERT INTO assignments
         (id, holiday_id, child_id, carer_id, date, period, start_time, end_time, notes, cost)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        assignment.id,
        assignment.holiday_id,
        assignment.child_id,
        assignment.carer_id,
        assignment.date,
        assignment.period ?? null,
        assignment.start_time ?? null,
        assignment.end_time ?? null,
        assignment.notes ?? null,
        assignment.cost ?? null,
      ],
    );
  }

  for (const note of file.dayNotes) {
    await db.run('INSERT INTO day_notes (holiday_id, date, note) VALUES (?, ?, ?)', [
      note.holiday_id,
      note.date,
      note.note,
    ]);
  }

  for (const [key, value] of Object.entries(file.settings)) {
    await db.run('INSERT INTO app_settings (key, value) VALUES (?, ?)', [key, value]);
  }

  await db.persist();
  return file;
}
