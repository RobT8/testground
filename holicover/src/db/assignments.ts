import type { Period } from '../utils/constants';
import { dayOfWeek, getHolidayDates } from '../utils/dates';
import { getDb } from './database';
import { getHoliday } from './holidays';
import { buildSetClause } from './sql';
import type { Assignment } from './types';

/** Every assignment in a holiday. */
export async function listAssignments(holidayId: number): Promise<Assignment[]> {
  const db = await getDb();
  return db.query<Assignment>(
    'SELECT * FROM assignments WHERE holiday_id = ? ORDER BY date, child_id, period, start_time',
    [holidayId],
  );
}

/** Assignments for one child on one day. */
export async function listDayAssignments(
  holidayId: number,
  childId: number,
  date: string,
): Promise<Assignment[]> {
  const db = await getDb();
  return db.query<Assignment>(
    `SELECT * FROM assignments
     WHERE holiday_id = ? AND child_id = ? AND date = ?
     ORDER BY period, start_time`,
    [holidayId, childId, date],
  );
}

/** Assignments for every child on one day — the day assignment screen. */
export async function listAssignmentsForDate(
  holidayId: number,
  date: string,
): Promise<Assignment[]> {
  const db = await getDb();
  return db.query<Assignment>(
    `SELECT * FROM assignments
     WHERE holiday_id = ? AND date = ?
     ORDER BY child_id, period, start_time`,
    [holidayId, date],
  );
}

/** The carer booked into one simple-mode slot, if any. */
export async function getSlotAssignment(
  holidayId: number,
  childId: number,
  date: string,
  period: Period,
): Promise<Assignment | null> {
  const db = await getDb();
  const rows = await db.query<Assignment>(
    `SELECT * FROM assignments
     WHERE holiday_id = ? AND child_id = ? AND date = ? AND period = ?`,
    [holidayId, childId, date, period],
  );
  return rows[0] ?? null;
}

/**
 * Book a carer into a simple-mode slot, replacing whoever was there.
 *
 * The unique index on (holiday, child, date, period) makes this an upsert, so
 * tapping a second carer for the same morning swaps them rather than
 * double-booking the child.
 */
export async function setSlotAssignment(input: {
  holiday_id: number;
  child_id: number;
  carer_id: number;
  date: string;
  period: Period;
  notes?: string | null;
  cost?: number | null;
}): Promise<void> {
  const db = await getDb();
  await db.run(
    `INSERT INTO assignments (holiday_id, child_id, carer_id, date, period, notes, cost)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(holiday_id, child_id, date, period) WHERE period IS NOT NULL
       DO UPDATE SET carer_id = excluded.carer_id,
                     notes = excluded.notes,
                     cost = excluded.cost`,
    [
      input.holiday_id,
      input.child_id,
      input.carer_id,
      input.date,
      input.period,
      input.notes ?? null,
      input.cost ?? null,
    ],
  );
}

/** Clear a simple-mode slot, turning it back into a gap. */
export async function clearSlotAssignment(
  holidayId: number,
  childId: number,
  date: string,
  period: Period,
): Promise<void> {
  const db = await getDb();
  await db.run(
    'DELETE FROM assignments WHERE holiday_id = ? AND child_id = ? AND date = ? AND period = ?',
    [holidayId, childId, date, period],
  );
}

/**
 * Add a detailed-mode time slot. These carry `period = NULL`, which keeps them
 * out of the simple-mode unique index so a child can have several in a day.
 */
export async function addTimeSlot(input: {
  holiday_id: number;
  child_id: number;
  carer_id: number;
  date: string;
  start_time: string;
  end_time: string;
  notes?: string | null;
  cost?: number | null;
}): Promise<number> {
  const db = await getDb();
  const result = await db.run(
    `INSERT INTO assignments
       (holiday_id, child_id, carer_id, date, period, start_time, end_time, notes, cost)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
    [
      input.holiday_id,
      input.child_id,
      input.carer_id,
      input.date,
      input.start_time,
      input.end_time,
      input.notes ?? null,
      input.cost ?? null,
    ],
  );
  return result.lastId;
}

export async function updateAssignment(
  id: number,
  changes: Partial<Pick<Assignment, 'carer_id' | 'start_time' | 'end_time' | 'notes' | 'cost'>>,
): Promise<void> {
  const update = buildSetClause(changes, [
    'carer_id', 'start_time', 'end_time', 'notes', 'cost',
  ]);
  if (!update) return;

  const db = await getDb();
  await db.run(`UPDATE assignments SET ${update.clause} WHERE id = ?`, [...update.values, id]);
}

export async function deleteAssignment(id: number): Promise<void> {
  const db = await getDb();
  await db.run('DELETE FROM assignments WHERE id = ?', [id]);
}

export type RepeatRule = 'daily' | 'weekdays' | 'weekly' | 'custom';

/**
 * Copy one day's plan onto other days in the same holiday — the biggest
 * time-saver in the app.
 *
 * Repeats are materialised as real rows rather than stored as a rule, so a
 * later edit to one day never silently rewrites the others.
 *
 * @param customDays Day numbers for the 'custom' rule. 0 = Sunday … 6 = Saturday.
 * @returns The dates that were written to.
 */
export async function repeatAssignments(
  holidayId: number,
  sourceDate: string,
  rule: RepeatRule,
  customDays?: number[],
): Promise<string[]> {
  const holiday = await getHoliday(holidayId);
  if (!holiday) return [];

  const sourceDayOfWeek = dayOfWeek(sourceDate);
  const targets = getHolidayDates(holiday).filter((date) => {
    if (date === sourceDate) return false;
    const dow = dayOfWeek(date);
    switch (rule) {
      case 'daily':
        return true;
      case 'weekdays':
        return dow >= 1 && dow <= 5;
      case 'weekly':
        return dow === sourceDayOfWeek;
      case 'custom':
        return customDays?.includes(dow) ?? false;
    }
  });

  for (const date of targets) await copyDay(holidayId, sourceDate, date);
  return targets;
}

/**
 * Replace a day's plan with a copy of another day's, for every child.
 * Replacing rather than merging keeps the result predictable: after a repeat,
 * the target day matches the source day exactly.
 */
export async function copyDay(
  holidayId: number,
  sourceDate: string,
  targetDate: string,
): Promise<void> {
  if (sourceDate === targetDate) return;
  const db = await getDb();

  await db.run('DELETE FROM assignments WHERE holiday_id = ? AND date = ?', [
    holidayId,
    targetDate,
  ]);
  await db.run(
    `INSERT INTO assignments
       (holiday_id, child_id, carer_id, date, period, start_time, end_time, notes, cost)
     SELECT holiday_id, child_id, carer_id, ?, period, start_time, end_time, notes, cost
     FROM assignments
     WHERE holiday_id = ? AND date = ?`,
    [targetDate, holidayId, sourceDate],
  );
}

/** Set the shared note for a day (e.g. "pack swimming kit"). */
export async function setDayNotes(
  holidayId: number,
  date: string,
  notes: string | null,
): Promise<void> {
  const db = await getDb();
  await db.run('UPDATE assignments SET notes = ? WHERE holiday_id = ? AND date = ?', [
    notes,
    holidayId,
    date,
  ]);
}

/** Remove every assignment for a child on a day. */
export async function clearDay(
  holidayId: number,
  childId: number,
  date: string,
): Promise<void> {
  const db = await getDb();
  await db.run(
    'DELETE FROM assignments WHERE holiday_id = ? AND child_id = ? AND date = ?',
    [holidayId, childId, date],
  );
}
