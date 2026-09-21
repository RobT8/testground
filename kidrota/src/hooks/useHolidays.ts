import { useCallback, useEffect, useState } from 'react';
import { getAllHolidayCoverage, type HolidayCoverage } from '../db/coverage';
import {
  createHoliday,
  deleteHoliday as deleteHolidayRow,
  getNextHoliday,
  listHolidays,
  updateHoliday,
} from '../db/holidays';
import type { Holiday, NewHoliday } from '../db/types';
import { todayISO } from '../utils/dates';
import { syncReminders } from '../utils/notifications';

export interface HolidaysState {
  holidays: Holiday[];
  /** Coverage per holiday id, for the progress bars. */
  coverage: Map<number, HolidayCoverage>;
  next: Holiday | null;
  /** Unfilled slots across every holiday. */
  gapSlots: number;
  loading: boolean;
  error: Error | null;
  reload: () => Promise<void>;
  add: (values: NewHoliday) => Promise<void>;
  edit: (id: number, values: NewHoliday) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

/** Everything the home screen needs: the list, its coverage, and the stats. */
export function useHolidays(): HolidaysState {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [coverage, setCoverage] = useState<Map<number, HolidayCoverage>>(new Map());
  const [next, setNext] = useState<Holiday | null>(null);
  const [gapSlots, setGapSlots] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    try {
      const [rows, allCoverage, upcoming] = await Promise.all([
        listHolidays(),
        getAllHolidayCoverage(),
        getNextHoliday(todayISO()),
      ]);

      setHolidays(rows);
      setCoverage(new Map(allCoverage.map((item) => [item.holidayId, item])));
      setNext(upcoming);
      // Summing here avoids a second pass over the same coverage data.
      setGapSlots(
        allCoverage.reduce(
          (total, holiday) =>
            total +
            holiday.days.reduce((sum, day) => sum + (day.totalSlots - day.filledSlots), 0),
          0,
        ),
      );
      setError(null);
    } catch (caught) {
      setError(caught as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Loading from SQLite is exactly the external-system synchronisation an
    // effect is for, and reload() is async, so the state updates land in a
    // later microtask rather than synchronously during this render.
    // eslint-disable-next-line react/set-state-in-effect
    reload();
  }, [reload]);

  const add = useCallback(
    async (values: NewHoliday) => {
      await createHoliday(values);
      await reload();
      // Keep notifications in step with the holidays they point at.
      await syncReminders();
    },
    [reload],
  );

  const edit = useCallback(
    async (id: number, values: NewHoliday) => {
      await updateHoliday(id, values);
      await reload();
      // Keep notifications in step with the holidays they point at.
      await syncReminders();
    },
    [reload],
  );

  const remove = useCallback(
    async (id: number) => {
      await deleteHolidayRow(id);
      await reload();
      // Keep notifications in step with the holidays they point at.
      await syncReminders();
    },
    [reload],
  );

  return { holidays, coverage, next, gapSlots, loading, error, reload, add, edit, remove };
}
