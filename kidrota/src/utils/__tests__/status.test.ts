import { describe, expect, it } from 'vitest';
import {
  MAX_SHORT_NAME,
  coverageSummary,
  formatCost,
  formatGapCount,
  formatNextBreak,
  nextBreak,
  plural,
  suggestShortName,
} from '../status';
import type { Holiday } from '../../db/types';
import type { HolidayCoverage } from '../../db/coverage';

const holiday = (start: string, end: string): Holiday => ({
  id: 1, name: 'October half term', start_date: start, end_date: end,
  mode: 'simple', exclude_weekends: 1, created_at: '', updated_at: '',
});

const coverage = (over: Partial<HolidayCoverage>): HolidayCoverage => ({
  holidayId: 1, days: [], coveredDays: 0, gapDays: 0, empty: false, ...over,
});

describe('nextBreak', () => {
  it('counts the days until a future break', () => {
    expect(nextBreak('2026-10-01', holiday('2026-10-19', '2026-10-23'))).toEqual({
      kind: 'days', days: 18,
    });
  });

  it('says "now" during a break', () => {
    expect(nextBreak('2026-10-21', holiday('2026-10-19', '2026-10-23')).kind).toBe('now');
  });

  it('says "now" on the first and last day', () => {
    expect(nextBreak('2026-10-19', holiday('2026-10-19', '2026-10-23')).kind).toBe('now');
    expect(nextBreak('2026-10-23', holiday('2026-10-19', '2026-10-23')).kind).toBe('now');
  });

  it('counts one day when the break starts tomorrow', () => {
    expect(nextBreak('2026-10-18', holiday('2026-10-19', '2026-10-23'))).toEqual({
      kind: 'days', days: 1,
    });
  });

  it('reports none when there is no holiday', () => {
    expect(nextBreak('2026-10-01', null).kind).toBe('none');
  });
});

describe('formatNextBreak', () => {
  it('formats each case', () => {
    expect(formatNextBreak({ kind: 'none' })).toBe('—');
    expect(formatNextBreak({ kind: 'now' })).toBe('Now');
    expect(formatNextBreak({ kind: 'days', days: 18 })).toBe('18 days');
  });

  it('uses the singular for one day', () => {
    expect(formatNextBreak({ kind: 'days', days: 1 })).toBe('1 day');
  });
});

describe('coverageSummary', () => {
  it('reports an untouched holiday as not started', () => {
    expect(coverageSummary(coverage({ empty: true, gapDays: 5 }))).toBe('Not started yet');
  });

  it('reports a fully planned holiday', () => {
    expect(coverageSummary(coverage({ coveredDays: 5, gapDays: 0 }))).toBe('All covered');
  });

  it('reports a partly planned holiday', () => {
    expect(coverageSummary(coverage({ coveredDays: 7, gapDays: 3 }))).toBe('7 covered · 3 gaps');
  });

  it('uses the singular for one gap', () => {
    expect(coverageSummary(coverage({ coveredDays: 9, gapDays: 1 }))).toBe('9 covered · 1 gap');
  });
});

describe('formatGapCount', () => {
  it('pluralises', () => {
    expect(formatGapCount(0)).toBe('0 slots');
    expect(formatGapCount(1)).toBe('1 slot');
    expect(formatGapCount(12)).toBe('12 slots');
  });
});

describe('suggestShortName', () => {
  it('keeps a name that already fits', () => {
    expect(suggestShortName('Mum')).toBe('Mum');
    expect(suggestShortName('Grandma')).toBe('Grandma');
  });

  it('prefers the first word over a hard truncation', () => {
    expect(suggestShortName('Holiday club')).toBe('Holiday');
    expect(suggestShortName('Auntie Jo from next door')).toBe('Auntie');
  });

  it('truncates when even the first word is too long', () => {
    expect(suggestShortName('Grandmother')).toBe('Grandmot');
  });

  it('trims surrounding whitespace', () => {
    expect(suggestShortName('  Gran  ')).toBe('Gran');
  });

  it('handles an empty name', () => {
    expect(suggestShortName('')).toBe('');
  });

  it('never exceeds the grid cell length', () => {
    for (const name of ['Mum', 'Holiday club', 'Grandmother', 'Extraordinarily Long Name']) {
      expect(suggestShortName(name).length).toBeLessThanOrEqual(MAX_SHORT_NAME);
    }
  });
});

describe('formatCost', () => {
  it('drops a trailing .00', () => {
    expect(formatCost(32)).toBe('£32/day');
  });

  it('keeps pence', () => {
    expect(formatCost(32.5)).toBe('£32.50/day');
    expect(formatCost(7.25)).toBe('£7.25/day');
  });

  it('handles zero', () => {
    expect(formatCost(0)).toBe('£0/day');
  });
});

describe('plural', () => {
  it('uses the singular for one', () => {
    expect(plural(1, 'child', 'children')).toBe('1 child');
    expect(plural(1, 'carer', 'carers')).toBe('1 carer');
  });

  it('uses the plural otherwise', () => {
    expect(plural(0, 'slot', 'slots')).toBe('0 slots');
    expect(plural(4, 'child', 'children')).toBe('4 children');
  });
});
