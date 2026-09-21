import { describe, expect, it } from 'vitest';
import {
  addDays,
  datesInRange,
  dayOfWeek,
  daysBetween,
  formatColumnHeader,
  formatDateRange,
  formatLongDate,
  getHolidayDates,
  groupIntoWeeks,
  isWeekend,
  parseISODate,
  toISODate,
} from '../dates';

describe('parsing', () => {
  it('reads an ISO date as a local calendar date, not UTC', () => {
    // The bug this guards: new Date('2026-10-21') is UTC midnight, which is
    // the 20th in any timezone west of Greenwich.
    const date = parseISODate('2026-10-21');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(9);
    expect(date.getDate()).toBe(21);
  });

  it('round-trips through toISODate', () => {
    for (const iso of ['2026-01-01', '2026-10-21', '2026-12-31', '2027-02-28']) {
      expect(toISODate(parseISODate(iso))).toBe(iso);
    }
  });

  it('pads single-digit months and days', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('weekday helpers', () => {
  it('identifies the day of week', () => {
    expect(dayOfWeek('2026-10-19')).toBe(1); // Monday
    expect(dayOfWeek('2026-10-25')).toBe(0); // Sunday
  });

  it('identifies weekends', () => {
    expect(isWeekend('2026-10-23')).toBe(false); // Friday
    expect(isWeekend('2026-10-24')).toBe(true); // Saturday
    expect(isWeekend('2026-10-25')).toBe(true); // Sunday
    expect(isWeekend('2026-10-26')).toBe(false); // Monday
  });
});

describe('arithmetic', () => {
  it('adds days across a month boundary', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
  });

  it('adds days across a year boundary', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('subtracts days', () => {
    expect(addDays('2026-01-02', -3)).toBe('2025-12-30');
  });

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('counts days between dates', () => {
    expect(daysBetween('2026-10-19', '2026-10-23')).toBe(4);
    expect(daysBetween('2026-10-23', '2026-10-19')).toBe(-4);
    expect(daysBetween('2026-10-19', '2026-10-19')).toBe(0);
  });

  it('counts whole days across a DST change', () => {
    // UK clocks go back on 25 October 2026, making that day 25 hours long.
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });
});

describe('ranges', () => {
  it('includes both ends', () => {
    expect(datesInRange('2026-10-19', '2026-10-21')).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
    ]);
  });

  it('handles a single-day range', () => {
    expect(datesInRange('2026-10-19', '2026-10-19')).toEqual(['2026-10-19']);
  });
});

describe('getHolidayDates', () => {
  const twoWeeks = { start_date: '2026-10-19', end_date: '2026-10-30' };

  it('drops weekends when excluded', () => {
    const dates = getHolidayDates({ ...twoWeeks, exclude_weekends: 1 });
    expect(dates).toHaveLength(10);
    expect(dates).not.toContain('2026-10-24');
    expect(dates).not.toContain('2026-10-25');
  });

  it('keeps weekends when included', () => {
    const dates = getHolidayDates({ ...twoWeeks, exclude_weekends: 0 });
    expect(dates).toHaveLength(12);
    expect(dates).toContain('2026-10-24');
  });
});

describe('groupIntoWeeks', () => {
  it('splits a fortnight into two Monday-started weeks', () => {
    const weeks = groupIntoWeeks(
      getHolidayDates({ start_date: '2026-10-19', end_date: '2026-10-30', exclude_weekends: 1 }),
    );
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toEqual([
      '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23',
    ]);
    expect(weeks[1][0]).toBe('2026-10-26');
  });

  it('keeps a Sunday with the week that began the previous Monday', () => {
    const weeks = groupIntoWeeks(
      getHolidayDates({ start_date: '2026-10-23', end_date: '2026-10-26', exclude_weekends: 0 }),
    );
    // Fri 23 + Sat 24 + Sun 25 are one week; Mon 26 starts the next.
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toEqual(['2026-10-23', '2026-10-24', '2026-10-25']);
    expect(weeks[1]).toEqual(['2026-10-26']);
  });

  it('handles a holiday starting mid-week', () => {
    const weeks = groupIntoWeeks(
      getHolidayDates({ start_date: '2026-10-21', end_date: '2026-10-27', exclude_weekends: 1 }),
    );
    expect(weeks[0]).toEqual(['2026-10-21', '2026-10-22', '2026-10-23']);
    expect(weeks[1]).toEqual(['2026-10-26', '2026-10-27']);
  });

  it('returns nothing for no dates', () => {
    expect(groupIntoWeeks([])).toEqual([]);
  });
});

describe('formatting', () => {
  it('formats a grid column header', () => {
    expect(formatColumnHeader('2026-10-21')).toBe('Wed 21');
  });

  it('formats a long date', () => {
    expect(formatLongDate('2026-10-23')).toBe('Friday 23 Oct');
  });

  it('collapses a range within one month', () => {
    expect(formatDateRange('2026-10-19', '2026-10-23')).toBe('19–23 Oct 2026');
  });

  it('spells out a range spanning two months', () => {
    expect(formatDateRange('2026-10-26', '2026-11-06')).toBe('26 Oct – 6 Nov 2026');
  });

  it('includes both years when a range spans new year', () => {
    expect(formatDateRange('2026-12-21', '2027-01-01')).toBe('21 Dec 2026 – 1 Jan 2027');
  });
});
