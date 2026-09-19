import type { HolidayCoverage } from '../db/coverage';
import type { Holiday } from '../db/types';
import { daysBetween } from './dates';

/**
 * How far off the next break is.
 *
 * `now` covers a holiday already under way — the parent does not want a
 * countdown to something they are currently living through.
 */
export type NextBreak = { kind: 'none' } | { kind: 'now' } | { kind: 'days'; days: number };

export function nextBreak(today: string, holiday: Holiday | null): NextBreak {
  if (!holiday) return { kind: 'none' };
  if (holiday.start_date <= today) return { kind: 'now' };
  return { kind: 'days', days: daysBetween(today, holiday.start_date) };
}

/** Stat-card text for the next break. */
export function formatNextBreak(next: NextBreak): string {
  switch (next.kind) {
    case 'none':
      return '—';
    case 'now':
      return 'Now';
    case 'days':
      return next.days === 1 ? '1 day' : `${next.days} days`;
  }
}

/** Holiday card summary: "Not started yet", "All covered", or "7 covered · 3 gaps". */
export function coverageSummary(coverage: HolidayCoverage): string {
  if (coverage.empty) return 'Not started yet';
  if (coverage.gapDays === 0) return 'All covered';
  const gaps = coverage.gapDays === 1 ? '1 gap' : `${coverage.gapDays} gaps`;
  return `${coverage.coveredDays} covered · ${gaps}`;
}

/** "3 days" / "1 day", for the gaps stat card. */
export function formatGapCount(slots: number): string {
  return slots === 1 ? '1 slot' : `${slots} slots`;
}
