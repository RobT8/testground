import { useCallback, useEffect, useMemo, useState } from 'react';
import { listAssignments } from '../db/assignments';
import { listCarers } from '../db/carers';
import { listChildren } from '../db/children';
import { getHoliday } from '../db/holidays';
import type { Assignment, Carer, Child, Holiday } from '../db/types';
import type { Period } from '../utils/constants';
import { getHolidayDates, groupIntoWeeks } from '../utils/dates';

export interface PlannerData {
  holiday: Holiday | null;
  children: Child[];
  carers: Carer[];
  carersById: Map<number, Carer>;
  /** Dates the holiday covers, honouring its weekend setting. */
  dates: string[];
  /** Those dates split into Monday-started weeks. */
  weeks: string[][];
  /** Assignments keyed by `${date}:${childId}`. */
  byDayAndChild: Map<string, Assignment[]>;
  loading: boolean;
  error: Error | null;
  reload: () => Promise<void>;
}

export function dayKey(date: string, childId: number): string {
  return `${date}:${childId}`;
}

/** The one assignment in a simple-mode slot, if any. */
export function slotIn(assignments: Assignment[] | undefined, period: Period): Assignment | null {
  return assignments?.find((item) => item.period === period) ?? null;
}

/** Detailed-mode time slots, earliest first. */
export function timeSlotsIn(assignments: Assignment[] | undefined): Assignment[] {
  return (assignments ?? [])
    .filter((item) => item.period === null)
    .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''));
}

/** Everything the weekly planner and day assignment screens read. */
export function useAssignments(holidayId: number): PlannerData {
  const [holiday, setHoliday] = useState<Holiday | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [carers, setCarers] = useState<Carer[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    try {
      const [holidayRow, childRows, carerRows, assignmentRows] = await Promise.all([
        getHoliday(holidayId),
        listChildren(),
        listCarers(),
        listAssignments(holidayId),
      ]);
      setHoliday(holidayRow);
      setChildren(childRows);
      setCarers(carerRows);
      setAssignments(assignmentRows);
      setError(null);
    } catch (caught) {
      setError(caught as Error);
    } finally {
      setLoading(false);
    }
  }, [holidayId]);

  useEffect(() => {
    // Reading from SQLite is external-system synchronisation, and reload() is
    // async, so its state updates land in a later microtask.
    // eslint-disable-next-line react/set-state-in-effect
    reload();
  }, [reload]);

  const dates = useMemo(() => (holiday ? getHolidayDates(holiday) : []), [holiday]);
  const weeks = useMemo(() => groupIntoWeeks(dates), [dates]);
  const carersById = useMemo(
    () => new Map(carers.map((carer) => [carer.id, carer])),
    [carers],
  );

  // Indexed once per load so the grid never scans the whole list per cell.
  const byDayAndChild = useMemo(() => {
    const index = new Map<string, Assignment[]>();
    for (const assignment of assignments) {
      const key = dayKey(assignment.date, assignment.child_id);
      const existing = index.get(key);
      if (existing) existing.push(assignment);
      else index.set(key, [assignment]);
    }
    return index;
  }, [assignments]);

  return {
    holiday,
    children,
    carers,
    carersById,
    dates,
    weeks,
    byDayAndChild,
    loading,
    error,
    reload,
  };
}
