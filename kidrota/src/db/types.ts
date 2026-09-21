import type { CarerType, HolidayMode, Period } from '../utils/constants';

/** A school holiday the user is planning cover for. */
export interface Holiday {
  id: number;
  name: string;
  /** ISO date, YYYY-MM-DD. */
  start_date: string;
  /** ISO date, YYYY-MM-DD, inclusive. */
  end_date: string;
  mode: HolidayMode;
  /** SQLite has no boolean; 0 or 1. */
  exclude_weekends: number;
  created_at: string;
  updated_at: string;
}

export interface Child {
  id: number;
  name: string;
  /** Hex colour used for the child's avatar. */
  colour: string;
  sort_order: number;
}

export interface Carer {
  id: number;
  name: string;
  /** Abbreviated form shown in the tight weekly grid cells, e.g. "Gran". */
  short_name: string;
  type: CarerType;
  cost_per_day: number | null;
  /** Pro custom colour. NULL means "derive from type", which is the default. */
  colour: string | null;
  sort_order: number;
}

/**
 * One planned block of cover.
 *
 * Two shapes share this table, distinguished by `period`:
 * - Simple mode: `period` is 'am' | 'pm' | 'all_day', times are NULL.
 * - Detailed mode: `period` is NULL, `start_time`/`end_time` carry HH:MM.
 */
export interface Assignment {
  id: number;
  holiday_id: number;
  child_id: number;
  carer_id: number;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  period: Period | null;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
  cost: number | null;
}

/** Input for creating a holiday; the DB fills id and timestamps. */
export type NewHoliday = Omit<Holiday, 'id' | 'created_at' | 'updated_at'>;
export type NewChild = Omit<Child, 'id'>;
export type NewCarer = Omit<Carer, 'id'>;
export type NewAssignment = Omit<Assignment, 'id'>;
