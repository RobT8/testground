import type { Assignment, Carer, Child, Holiday } from '../db/types';
import type { CarerType, HolidayMode, Period } from './constants';
import { addDays, daysBetween } from './dates';

/**
 * A whole holiday plan as a single shareable string.
 *
 * The other parent has their own copy of the app and no server between you, so
 * the plan travels as text they can paste out of a message.
 *
 * Kept compact deliberately: children and carers become indices, and dates
 * become day offsets from the holiday's start, which takes a fortnight's plan
 * for two children from roughly 6KB of plain JSON to under 1KB. That is the
 * difference between a code that pastes into a message and one that does not.
 */
export const SHARE_PREFIX = 'KIDROTA1:';

const CURRENT_VERSION = 1;

/**
 * Drop trailing nulls from a tuple.
 *
 * Most assignments use only the first four fields, so the unused times, notes
 * and cost would otherwise cost `,null,null,null,null` each — about half the
 * whole code on a fully planned fortnight.
 */
function trimTrailingNulls(tuple: unknown[]): unknown[] {
  const out = [...tuple];
  while (out.length > 0 && out[out.length - 1] === null) out.pop();
  return out;
}

/** Tuple layouts, kept as named constants so the format is readable. */
interface CompactPlan {
  v: number;
  /** [name, startDate, endDate, mode, excludeWeekends] */
  h: [string, string, string, HolidayMode, number];
  /** [name, colour][] — position is the child's reference */
  c: [string, string][];
  /** [name, shortName, type, costPerDay | null][] — position is the carer's reference */
  k: [string, string, CarerType, number | null][];
  /** [childIndex, carerIndex, dayOffset, period, startTime, endTime, notes, cost][] */
  a: [number, number, number, Period | null, string | null, string | null, string | null, number | null][];
  /** [dayOffset, note][] */
  n: [number, string][];
}

export interface SharedPlan {
  holiday: Omit<Holiday, 'id' | 'created_at' | 'updated_at'>;
  children: { name: string; colour: string }[];
  carers: { name: string; short_name: string; type: CarerType; cost_per_day: number | null }[];
  assignments: {
    childIndex: number;
    carerIndex: number;
    date: string;
    period: Period | null;
    start_time: string | null;
    end_time: string | null;
    notes: string | null;
    cost: number | null;
  }[];
  dayNotes: { date: string; note: string }[];
}

export class ShareCodeError extends Error {}

/** UTF-8 safe base64, since names can contain anything a keyboard produces. */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(encoded: string): string {
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodePlan(input: {
  holiday: Holiday;
  children: Child[];
  carers: Carer[];
  assignments: Assignment[];
  dayNotes: { date: string; note: string }[];
}): string {
  const childIndex = new Map(input.children.map((child, i) => [child.id, i]));
  const carerIndex = new Map(input.carers.map((carer, i) => [carer.id, i]));
  const start = input.holiday.start_date;

  const compact: CompactPlan = {
    v: CURRENT_VERSION,
    h: [
      input.holiday.name,
      input.holiday.start_date,
      input.holiday.end_date,
      input.holiday.mode,
      input.holiday.exclude_weekends,
    ],
    c: input.children.map((child) => [child.name, child.colour]),
    k: input.carers.map((carer) => [
      carer.name,
      carer.short_name,
      carer.type,
      carer.cost_per_day ?? null,
    ]),
    // An assignment naming a child or carer that was not included would decode
    // to a dangling reference, so it is left out rather than shared broken.
    a: input.assignments
      .filter((item) => childIndex.has(item.child_id) && carerIndex.has(item.carer_id))
      .map(
        (item) =>
          trimTrailingNulls([
            childIndex.get(item.child_id)!,
            carerIndex.get(item.carer_id)!,
            daysBetween(start, item.date),
            item.period,
            item.start_time,
            item.end_time,
            item.notes,
            item.cost,
          ]) as CompactPlan['a'][number],
      ),
    n: input.dayNotes.map((note) => [daysBetween(start, note.date), note.note]),
  };

  return SHARE_PREFIX + toBase64(JSON.stringify(compact));
}

export function decodePlan(code: string): SharedPlan {
  const trimmed = code.trim();
  if (!trimmed.startsWith(SHARE_PREFIX)) {
    throw new ShareCodeError('That does not look like a KidRota plan code.');
  }

  let compact: CompactPlan;
  try {
    compact = JSON.parse(fromBase64(trimmed.slice(SHARE_PREFIX.length)));
  } catch {
    throw new ShareCodeError('That code is incomplete or damaged. Ask for it again.');
  }

  if (compact?.v !== CURRENT_VERSION) {
    throw new ShareCodeError('That code came from a different version of KidRota.');
  }
  if (!Array.isArray(compact.h) || compact.h.length < 5) {
    throw new ShareCodeError('That code is incomplete or damaged. Ask for it again.');
  }
  for (const key of ['c', 'k', 'a'] as const) {
    if (!Array.isArray(compact[key])) {
      throw new ShareCodeError('That code is incomplete or damaged. Ask for it again.');
    }
  }

  const [name, startDate, endDate, mode, excludeWeekends] = compact.h;
  const childCount = compact.c.length;
  const carerCount = compact.k.length;

  return {
    holiday: {
      name,
      start_date: startDate,
      end_date: endDate,
      mode,
      exclude_weekends: excludeWeekends,
    },
    children: compact.c.map(([childName, colour]) => ({ name: childName, colour })),
    carers: compact.k.map(([carerName, shortName, type, cost]) => ({
      name: carerName,
      short_name: shortName,
      type,
      cost_per_day: cost,
    })),
    assignments: compact.a
      // Guard against a damaged code pointing at someone who is not there.
      .filter(([child, carer]) => child >= 0 && child < childCount && carer >= 0 && carer < carerCount)
      .map(([child, carer, offset, period, startTime, endTime, notes, cost]) => ({
        childIndex: child,
        carerIndex: carer,
        date: addDays(startDate, offset),
        // Trailing nulls are trimmed when encoding, so these arrive undefined.
        period: period ?? null,
        start_time: startTime ?? null,
        end_time: endTime ?? null,
        notes: notes ?? null,
        cost: cost ?? null,
      })),
    dayNotes: (compact.n ?? []).map(([offset, note]) => ({
      date: addDays(startDate, offset),
      note,
    })),
  };
}
