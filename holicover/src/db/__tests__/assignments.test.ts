import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setDbExecutor } from '../database';
import { createTestDb } from '../testExecutor';
import type { DbExecutor } from '../executor';
import { createChild } from '../children';
import { createCarer } from '../carers';
import { createHoliday } from '../holidays';
import {
  addTimeSlot,
  clearDay,
  clearSlotAssignment,
  copyDay,
  deleteAssignment,
  getSlotAssignment,
  listAssignments,
  listAssignmentsForDate,
  listDayAssignments,
  repeatAssignments,
  setDayNotes,
  setSlotAssignment,
  updateAssignment,
} from '../assignments';

let db: DbExecutor & { close: () => void };
let holidayId: number;
let ada: number;
let bo: number;
let gran: number;
let mum: number;

// Mon 19 Oct – Fri 30 Oct 2026: a two-week half term, weekdays only.
const HOLIDAY = {
  name: 'October half term',
  start_date: '2026-10-19',
  end_date: '2026-10-30',
  mode: 'simple' as const,
  exclude_weekends: 1,
};

beforeEach(async () => {
  db = await createTestDb();
  setDbExecutor(db);
  holidayId = await createHoliday(HOLIDAY);
  ada = await createChild({ name: 'Ada', colour: '#378ADD' });
  bo = await createChild({ name: 'Bo', colour: '#E2725B' });
  gran = await createCarer({ name: 'Grandma', short_name: 'Gran', type: 'family' });
  mum = await createCarer({ name: 'Mum', short_name: 'Mum', type: 'parent' });
});
afterEach(() => {
  setDbExecutor(null);
  db.close();
});

describe('simple-mode slots', () => {
  it('books a carer into a morning', async () => {
    await setSlotAssignment({
      holiday_id: holidayId, child_id: ada, carer_id: gran, date: '2026-10-20', period: 'am',
    });
    const slot = await getSlotAssignment(holidayId, ada, '2026-10-20', 'am');
    expect(slot?.carer_id).toBe(gran);
    expect(slot?.start_time).toBeNull();
  });

  it('returns null for an unbooked slot', async () => {
    expect(await getSlotAssignment(holidayId, ada, '2026-10-20', 'pm')).toBeNull();
  });

  it('swaps the carer instead of double-booking the same slot', async () => {
    const slot = {
      holiday_id: holidayId, child_id: ada, date: '2026-10-20', period: 'am' as const,
    };
    await setSlotAssignment({ ...slot, carer_id: gran });
    await setSlotAssignment({ ...slot, carer_id: mum });

    expect(await listDayAssignments(holidayId, ada, '2026-10-20')).toHaveLength(1);
    expect((await getSlotAssignment(holidayId, ada, '2026-10-20', 'am'))?.carer_id).toBe(mum);
  });

  it('keeps AM and PM independent', async () => {
    await setSlotAssignment({ holiday_id: holidayId, child_id: ada, carer_id: gran, date: '2026-10-20', period: 'am' });
    await setSlotAssignment({ holiday_id: holidayId, child_id: ada, carer_id: mum, date: '2026-10-20', period: 'pm' });
    expect(await listDayAssignments(holidayId, ada, '2026-10-20')).toHaveLength(2);
  });

  it('keeps children independent on the same day', async () => {
    await setSlotAssignment({ holiday_id: holidayId, child_id: ada, carer_id: gran, date: '2026-10-20', period: 'am' });
    await setSlotAssignment({ holiday_id: holidayId, child_id: bo, carer_id: mum, date: '2026-10-20', period: 'am' });
    expect(await listAssignmentsForDate(holidayId, '2026-10-20')).toHaveLength(2);
  });

  it('clears a slot back into a gap', async () => {
    await setSlotAssignment({ holiday_id: holidayId, child_id: ada, carer_id: gran, date: '2026-10-20', period: 'am' });
    await clearSlotAssignment(holidayId, ada, '2026-10-20', 'am');
    expect(await getSlotAssignment(holidayId, ada, '2026-10-20', 'am')).toBeNull();
  });

  it('carries notes and cost', async () => {
    await setSlotAssignment({
      holiday_id: holidayId, child_id: ada, carer_id: gran, date: '2026-10-20', period: 'am',
      notes: 'pack swimming kit', cost: 12.5,
    });
    const slot = await getSlotAssignment(holidayId, ada, '2026-10-20', 'am');
    expect(slot?.notes).toBe('pack swimming kit');
    expect(slot?.cost).toBe(12.5);
  });
});

describe('detailed-mode time slots', () => {
  it('stacks several slots in one day', async () => {
    await addTimeSlot({ holiday_id: holidayId, child_id: ada, carer_id: gran, date: '2026-10-20', start_time: '09:00', end_time: '12:00' });
    await addTimeSlot({ holiday_id: holidayId, child_id: ada, carer_id: mum, date: '2026-10-20', start_time: '12:00', end_time: '17:00' });

    const slots = await listDayAssignments(holidayId, ada, '2026-10-20');
    expect(slots).toHaveLength(2);
    expect(slots.every((s) => s.period === null)).toBe(true);
  });

  it('edits a slot', async () => {
    const id = await addTimeSlot({ holiday_id: holidayId, child_id: ada, carer_id: gran, date: '2026-10-20', start_time: '09:00', end_time: '12:00' });
    await updateAssignment(id, { end_time: '13:00', carer_id: mum });
    const slot = (await listDayAssignments(holidayId, ada, '2026-10-20'))[0];
    expect(slot.end_time).toBe('13:00');
    expect(slot.carer_id).toBe(mum);
  });

  it('deletes a slot', async () => {
    const id = await addTimeSlot({ holiday_id: holidayId, child_id: ada, carer_id: gran, date: '2026-10-20', start_time: '09:00', end_time: '12:00' });
    await deleteAssignment(id);
    expect(await listDayAssignments(holidayId, ada, '2026-10-20')).toHaveLength(0);
  });
});

describe('repeat', () => {
  // Tue 20 Oct, both children covered morning and afternoon.
  async function planTuesday() {
    for (const child of [ada, bo]) {
      await setSlotAssignment({ holiday_id: holidayId, child_id: child, carer_id: gran, date: '2026-10-20', period: 'am' });
      await setSlotAssignment({ holiday_id: holidayId, child_id: child, carer_id: mum, date: '2026-10-20', period: 'pm' });
    }
  }

  it('"every day" fills the rest of the holiday', async () => {
    await planTuesday();
    const targets = await repeatAssignments(holidayId, '2026-10-20', 'daily');

    // 10 weekdays in the holiday, minus the source day.
    expect(targets).toHaveLength(9);
    expect(targets).not.toContain('2026-10-20');
    // Weekends are excluded for this holiday, so they are never written to.
    expect(targets).not.toContain('2026-10-24');
    // 10 days x 2 children x 2 slots.
    expect(await listAssignments(holidayId)).toHaveLength(40);
  });

  it('"every Tuesday" fills only the matching weekday', async () => {
    await planTuesday();
    const targets = await repeatAssignments(holidayId, '2026-10-20', 'weekly');
    expect(targets).toEqual(['2026-10-27']);
  });

  it('"pick days" fills only the chosen weekdays', async () => {
    await planTuesday();
    // Mondays and Wednesdays.
    const targets = await repeatAssignments(holidayId, '2026-10-20', 'custom', [1, 3]);
    expect(targets).toEqual(['2026-10-19', '2026-10-21', '2026-10-26', '2026-10-28']);
  });

  it('"pick days" with no days chosen changes nothing', async () => {
    await planTuesday();
    expect(await repeatAssignments(holidayId, '2026-10-20', 'custom', [])).toEqual([]);
  });

  it('"Mon–Fri" skips weekends even when the holiday includes them', async () => {
    const weekendHoliday = await createHoliday({ ...HOLIDAY, name: 'Summer', exclude_weekends: 0 });
    await setSlotAssignment({ holiday_id: weekendHoliday, child_id: ada, carer_id: gran, date: '2026-10-20', period: 'am' });

    const targets = await repeatAssignments(weekendHoliday, '2026-10-20', 'weekdays');
    expect(targets).not.toContain('2026-10-24');
    expect(targets).not.toContain('2026-10-25');
    expect(targets).toContain('2026-10-26');
  });

  it('replaces the target day rather than merging into it', async () => {
    await planTuesday();
    // Wednesday already has a different plan for Ada.
    await setSlotAssignment({ holiday_id: holidayId, child_id: ada, carer_id: mum, date: '2026-10-21', period: 'am' });

    await repeatAssignments(holidayId, '2026-10-20', 'daily');

    // Wednesday now matches Tuesday exactly.
    expect((await getSlotAssignment(holidayId, ada, '2026-10-21', 'am'))?.carer_id).toBe(gran);
    expect(await listAssignmentsForDate(holidayId, '2026-10-21')).toHaveLength(4);
  });

  it('copies notes along with the carers', async () => {
    await setSlotAssignment({
      holiday_id: holidayId, child_id: ada, carer_id: gran, date: '2026-10-20', period: 'am',
      notes: 'pack swimming kit',
    });
    await repeatAssignments(holidayId, '2026-10-20', 'weekly');
    expect((await getSlotAssignment(holidayId, ada, '2026-10-27', 'am'))?.notes).toBe('pack swimming kit');
  });

  it('repeats detailed-mode time slots too', async () => {
    const detailed = await createHoliday({ ...HOLIDAY, name: 'Detailed', mode: 'detailed' });
    await addTimeSlot({ holiday_id: detailed, child_id: ada, carer_id: gran, date: '2026-10-20', start_time: '09:00', end_time: '12:00' });
    await addTimeSlot({ holiday_id: detailed, child_id: ada, carer_id: mum, date: '2026-10-20', start_time: '12:00', end_time: '17:00' });

    await repeatAssignments(detailed, '2026-10-20', 'weekly');
    const copied = await listDayAssignments(detailed, ada, '2026-10-27');
    expect(copied).toHaveLength(2);
    expect(copied.map((s) => s.start_time)).toEqual(['09:00', '12:00']);
  });

  it('leaves other holidays untouched', async () => {
    const other = await createHoliday({ ...HOLIDAY, name: 'Christmas' });
    await planTuesday();
    await repeatAssignments(holidayId, '2026-10-20', 'daily');
    expect(await listAssignments(other)).toHaveLength(0);
  });

  it('does nothing for a holiday that does not exist', async () => {
    expect(await repeatAssignments(9999, '2026-10-20', 'daily')).toEqual([]);
  });
});

describe('day helpers', () => {
  it('copies one day onto another', async () => {
    await setSlotAssignment({ holiday_id: holidayId, child_id: ada, carer_id: gran, date: '2026-10-20', period: 'am' });
    await copyDay(holidayId, '2026-10-20', '2026-10-22');
    expect((await getSlotAssignment(holidayId, ada, '2026-10-22', 'am'))?.carer_id).toBe(gran);
  });

  it('copying a day onto itself is a no-op, not a wipe', async () => {
    await setSlotAssignment({ holiday_id: holidayId, child_id: ada, carer_id: gran, date: '2026-10-20', period: 'am' });
    await copyDay(holidayId, '2026-10-20', '2026-10-20');
    expect(await listDayAssignments(holidayId, ada, '2026-10-20')).toHaveLength(1);
  });

  it('sets a note across a day', async () => {
    await setSlotAssignment({ holiday_id: holidayId, child_id: ada, carer_id: gran, date: '2026-10-20', period: 'am' });
    await setSlotAssignment({ holiday_id: holidayId, child_id: bo, carer_id: mum, date: '2026-10-20', period: 'am' });
    await setDayNotes(holidayId, '2026-10-20', 'INSET day');

    const all = await listAssignmentsForDate(holidayId, '2026-10-20');
    expect(all.every((a) => a.notes === 'INSET day')).toBe(true);
  });

  it('clears one child without touching the other', async () => {
    await setSlotAssignment({ holiday_id: holidayId, child_id: ada, carer_id: gran, date: '2026-10-20', period: 'am' });
    await setSlotAssignment({ holiday_id: holidayId, child_id: bo, carer_id: mum, date: '2026-10-20', period: 'am' });

    await clearDay(holidayId, ada, '2026-10-20');
    expect(await listDayAssignments(holidayId, ada, '2026-10-20')).toHaveLength(0);
    expect(await listDayAssignments(holidayId, bo, '2026-10-20')).toHaveLength(1);
  });
});
