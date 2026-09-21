import { getHolidayDates } from '../utils/dates';
import { getDb } from './database';
import { listChildren } from './children';
import { getHoliday, listHolidays } from './holidays';
import type { Holiday } from './types';

/** Slots a child needs filled per day in simple mode: morning and afternoon. */
const SIMPLE_SLOTS_PER_DAY = 2;

export interface DayCoverage {
  date: string;
  /** Slots needed across all children on this day. */
  totalSlots: number;
  filledSlots: number;
  /** True only when every child is covered for the whole day. */
  covered: boolean;
}

export interface HolidayCoverage {
  holidayId: number;
  days: DayCoverage[];
  coveredDays: number;
  gapDays: number;
  /** True when nothing has been planned at all — the "Not started yet" state. */
  empty: boolean;
}

/**
 * Work out which days of a holiday are covered and which are gaps.
 *
 * A day is covered only if every child is covered for the whole day: in simple
 * mode that means both AM and PM are booked, in detailed mode at least one time
 * slot exists. One child's unbooked afternoon makes the whole day a gap, which
 * is the point — the parent still has a problem to solve that day.
 */
export async function getHolidayCoverage(holidayId: number): Promise<HolidayCoverage | null> {
  const holiday = await getHoliday(holidayId);
  if (!holiday) return null;
  const children = await listChildren();
  return computeCoverage(holiday, children.length, await countFilledSlots(holidayId));
}

/** Coverage for every holiday, for the home screen list and stat cards. */
export async function getAllHolidayCoverage(): Promise<HolidayCoverage[]> {
  const holidays = await listHolidays();
  const children = await listChildren();
  const coverage: HolidayCoverage[] = [];
  for (const holiday of holidays) {
    coverage.push(computeCoverage(holiday, children.length, await countFilledSlots(holiday.id)));
  }
  return coverage;
}

/** Total unfilled slots across every holiday — the "Gaps to fill" stat. */
export async function countAllGaps(): Promise<number> {
  const all = await getAllHolidayCoverage();
  return all.reduce(
    (total, holiday) =>
      total + holiday.days.reduce((sum, day) => sum + (day.totalSlots - day.filledSlots), 0),
    0,
  );
}

/**
 * How many slots each child has booked, grouped by date.
 *
 * Counted in SQL so a long holiday is one query rather than one per cell.
 * DISTINCT collapses detailed mode's several time slots into "this child has
 * cover that day", matching the gap rule for that mode.
 */
async function countFilledSlots(holidayId: number): Promise<Map<string, number[]>> {
  const db = await getDb();
  const rows = await db.query<{ date: string; child_id: number; n: number }>(
    `SELECT date, child_id, COUNT(DISTINCT COALESCE(period, 'slot')) AS n
     FROM assignments
     WHERE holiday_id = ?
     GROUP BY date, child_id`,
    [holidayId],
  );

  const byDate = new Map<string, number[]>();
  for (const row of rows) {
    const counts = byDate.get(row.date) ?? [];
    counts.push(row.n);
    byDate.set(row.date, counts);
  }
  return byDate;
}

function computeCoverage(
  holiday: Holiday,
  childCount: number,
  filled: Map<string, number[]>,
): HolidayCoverage {
  const slotsPerChild = holiday.mode === 'simple' ? SIMPLE_SLOTS_PER_DAY : 1;
  const days: DayCoverage[] = [];

  for (const date of getHolidayDates(holiday)) {
    // Cap each child's count at the slots they actually need: in detailed mode
    // three time slots still only satisfy one day's requirement.
    const filledSlots = (filled.get(date) ?? []).reduce(
      (sum, count) => sum + Math.min(count, slotsPerChild),
      0,
    );
    const totalSlots = childCount * slotsPerChild;
    days.push({
      date,
      totalSlots,
      filledSlots,
      covered: totalSlots > 0 && filledSlots >= totalSlots,
    });
  }

  const coveredDays = days.filter((day) => day.covered).length;
  return {
    holidayId: holiday.id,
    days,
    coveredDays,
    gapDays: days.length - coveredDays,
    empty: days.every((day) => day.filledSlots === 0),
  };
}
