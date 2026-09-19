import { describe, expect, it } from 'vitest';
import { dayKey, slotIn, timeSlotsIn } from '../useAssignments';
import type { Assignment } from '../../db/types';

const base: Omit<Assignment, 'id' | 'period' | 'start_time' | 'end_time'> = {
  holiday_id: 1, child_id: 1, carer_id: 1, date: '2026-10-19', notes: null, cost: null,
};

const simple = (id: number, period: 'am' | 'pm'): Assignment => ({
  ...base, id, period, start_time: null, end_time: null,
});

const timed = (id: number, start: string, end: string): Assignment => ({
  ...base, id, period: null, start_time: start, end_time: end,
});

describe('dayKey', () => {
  it('combines date and child', () => {
    expect(dayKey('2026-10-19', 7)).toBe('2026-10-19:7');
  });

  it('keeps different children on the same day distinct', () => {
    expect(dayKey('2026-10-19', 1)).not.toBe(dayKey('2026-10-19', 2));
  });
});

describe('slotIn', () => {
  const day = [simple(1, 'am'), simple(2, 'pm')];

  it('finds the assignment for a period', () => {
    expect(slotIn(day, 'am')?.id).toBe(1);
    expect(slotIn(day, 'pm')?.id).toBe(2);
  });

  it('returns null for an unfilled period', () => {
    expect(slotIn([simple(1, 'am')], 'pm')).toBeNull();
  });

  it('returns null for a day with nothing on it', () => {
    expect(slotIn(undefined, 'am')).toBeNull();
    expect(slotIn([], 'am')).toBeNull();
  });

  it('ignores detailed-mode rows, which carry no period', () => {
    expect(slotIn([timed(1, '09:00', '12:00')], 'am')).toBeNull();
  });
});

describe('timeSlotsIn', () => {
  it('returns slots earliest first, whatever order they arrive in', () => {
    const slots = timeSlotsIn([timed(1, '13:00', '17:00'), timed(2, '09:00', '12:00')]);
    expect(slots.map((slot) => slot.start_time)).toEqual(['09:00', '13:00']);
  });

  it('ignores simple-mode rows', () => {
    expect(timeSlotsIn([simple(1, 'am'), timed(2, '09:00', '12:00')])).toHaveLength(1);
  });

  it('handles an empty day', () => {
    expect(timeSlotsIn(undefined)).toEqual([]);
    expect(timeSlotsIn([])).toEqual([]);
  });

  it('does not mutate the array it is given', () => {
    const day = [timed(1, '13:00', '17:00'), timed(2, '09:00', '12:00')];
    timeSlotsIn(day);
    expect(day.map((slot) => slot.id)).toEqual([1, 2]);
  });
});
