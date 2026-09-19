import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setDbExecutor } from '../database';
import { createTestDb } from '../testExecutor';
import type { DbExecutor } from '../executor';
import { createChild } from '../children';
import { createCarer } from '../carers';
import { createHoliday } from '../holidays';
import { addTimeSlot, repeatAssignments, setSlotAssignment } from '../assignments';
import { countAllGaps, getAllHolidayCoverage, getHolidayCoverage } from '../coverage';

let db: DbExecutor & { close: () => void };
let holidayId: number;
let ada: number;
let bo: number;
let gran: number;

// Mon 19 – Fri 23 Oct 2026: one week, weekdays only.
const ONE_WEEK = {
  name: 'October half term',
  start_date: '2026-10-19',
  end_date: '2026-10-23',
  mode: 'simple' as const,
  exclude_weekends: 1,
};

async function coverAllDay(holiday: number, child: number, date: string) {
  await setSlotAssignment({ holiday_id: holiday, child_id: child, carer_id: gran, date, period: 'am' });
  await setSlotAssignment({ holiday_id: holiday, child_id: child, carer_id: gran, date, period: 'pm' });
}

beforeEach(async () => {
  db = await createTestDb();
  setDbExecutor(db);
  holidayId = await createHoliday(ONE_WEEK);
  ada = await createChild({ name: 'Ada', colour: '#378ADD' });
  bo = await createChild({ name: 'Bo', colour: '#E2725B' });
  gran = await createCarer({ name: 'Grandma', short_name: 'Gran', type: 'family' });
});
afterEach(() => {
  setDbExecutor(null);
  db.close();
});

describe('simple mode', () => {
  it('reports a fresh holiday as not started', async () => {
    const coverage = (await getHolidayCoverage(holidayId))!;
    expect(coverage.empty).toBe(true);
    expect(coverage.coveredDays).toBe(0);
    expect(coverage.gapDays).toBe(5);
  });

  it('counts only weekdays when weekends are excluded', async () => {
    const coverage = (await getHolidayCoverage(holidayId))!;
    expect(coverage.days).toHaveLength(5);
    expect(coverage.days.map((d) => d.date)).not.toContain('2026-10-24');
  });

  it('needs both halves of the day for every child', async () => {
    // Only Ada's morning.
    await setSlotAssignment({ holiday_id: holidayId, child_id: ada, carer_id: gran, date: '2026-10-19', period: 'am' });
    let day = (await getHolidayCoverage(holidayId))!.days[0];
    expect(day.filledSlots).toBe(1);
    expect(day.totalSlots).toBe(4); // 2 children x 2 slots
    expect(day.covered).toBe(false);

    // Ada fully covered, Bo still has nothing — the day is still a gap.
    await coverAllDay(holidayId, ada, '2026-10-19');
    day = (await getHolidayCoverage(holidayId))!.days[0];
    expect(day.filledSlots).toBe(2);
    expect(day.covered).toBe(false);

    // Both children covered all day.
    await coverAllDay(holidayId, bo, '2026-10-19');
    day = (await getHolidayCoverage(holidayId))!.days[0];
    expect(day.filledSlots).toBe(4);
    expect(day.covered).toBe(true);
  });

  it('one child missing an afternoon makes the day a gap', async () => {
    await coverAllDay(holidayId, ada, '2026-10-19');
    await setSlotAssignment({ holiday_id: holidayId, child_id: bo, carer_id: gran, date: '2026-10-19', period: 'am' });
    expect((await getHolidayCoverage(holidayId))!.days[0].covered).toBe(false);
  });

  it('reports a fully planned holiday as all covered', async () => {
    await coverAllDay(holidayId, ada, '2026-10-19');
    await coverAllDay(holidayId, bo, '2026-10-19');
    await repeatAssignments(holidayId, '2026-10-19', 'daily');

    const coverage = (await getHolidayCoverage(holidayId))!;
    expect(coverage.coveredDays).toBe(5);
    expect(coverage.gapDays).toBe(0);
    expect(coverage.empty).toBe(false);
  });

  it('stops being empty once anything is planned', async () => {
    await setSlotAssignment({ holiday_id: holidayId, child_id: ada, carer_id: gran, date: '2026-10-19', period: 'am' });
    expect((await getHolidayCoverage(holidayId))!.empty).toBe(false);
  });
});

describe('detailed mode', () => {
  it('treats at least one time slot as covering the day', async () => {
    const detailed = await createHoliday({ ...ONE_WEEK, name: 'Detailed', mode: 'detailed' });
    for (const child of [ada, bo]) {
      await addTimeSlot({
        holiday_id: detailed, child_id: child, carer_id: gran, date: '2026-10-19',
        start_time: '09:00', end_time: '17:00',
      });
    }
    const day = (await getHolidayCoverage(detailed))!.days[0];
    expect(day.totalSlots).toBe(2); // 2 children x 1 slot needed
    expect(day.covered).toBe(true);
  });

  it('does not let one child’s extra slots cover for another child', async () => {
    const detailed = await createHoliday({ ...ONE_WEEK, name: 'Detailed', mode: 'detailed' });
    // Ada has three slots; Bo has none.
    for (const [start, end] of [['09:00', '11:00'], ['11:00', '14:00'], ['14:00', '17:00']]) {
      await addTimeSlot({
        holiday_id: detailed, child_id: ada, carer_id: gran, date: '2026-10-19',
        start_time: start, end_time: end,
      });
    }
    const day = (await getHolidayCoverage(detailed))!.days[0];
    expect(day.filledSlots).toBe(1); // capped at what Ada needs
    expect(day.covered).toBe(false);
  });
});

describe('edge cases', () => {
  it('returns null for a holiday that does not exist', async () => {
    expect(await getHolidayCoverage(9999)).toBeNull();
  });

  it('never reports covered when there are no children', async () => {
    const empty = await createTestDb();
    setDbExecutor(empty);
    const holiday = await createHoliday(ONE_WEEK);
    const coverage = (await getHolidayCoverage(holiday))!;
    expect(coverage.days.every((d) => d.totalSlots === 0)).toBe(true);
    expect(coverage.coveredDays).toBe(0);
    empty.close();
  });

  it('includes weekends when the holiday does', async () => {
    const summer = await createHoliday({ ...ONE_WEEK, name: 'Summer', exclude_weekends: 0 });
    expect((await getHolidayCoverage(summer))!.days).toHaveLength(5);

    const fortnight = await createHoliday({
      ...ONE_WEEK, name: 'Summer 2', end_date: '2026-10-30', exclude_weekends: 0,
    });
    expect((await getHolidayCoverage(fortnight))!.days).toHaveLength(12);
  });
});

describe('across all holidays', () => {
  it('totals the gaps for the home screen stat', async () => {
    // One week, 2 children, 2 slots each = 20 slots, none filled.
    expect(await countAllGaps()).toBe(20);

    await coverAllDay(holidayId, ada, '2026-10-19');
    await coverAllDay(holidayId, bo, '2026-10-19');
    expect(await countAllGaps()).toBe(16);
  });

  it('sums gaps across several holidays', async () => {
    await createHoliday({ ...ONE_WEEK, name: 'Christmas', start_date: '2026-12-21', end_date: '2026-12-25' });
    const all = await getAllHolidayCoverage();
    expect(all).toHaveLength(2);
    expect(await countAllGaps()).toBe(40);
  });

  it('reports no gaps when nothing is planned at all', async () => {
    const empty = await createTestDb();
    setDbExecutor(empty);
    expect(await countAllGaps()).toBe(0);
    empty.close();
  });
});
