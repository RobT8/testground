import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setDbExecutor } from '../database';
import { createTestDb } from '../testExecutor';
import type { DbExecutor } from '../executor';
import { importSharedPlan } from '../importPlan';
import { decodePlan, encodePlan } from '../../utils/shareCode';
import { createChild, listChildren } from '../children';
import { createCarer, listCarers } from '../carers';
import { createHoliday, listHolidays } from '../holidays';
import { addTimeSlot, listAssignments, setSlotAssignment } from '../assignments';
import { getDayNote, setDayNote } from '../dayNotes';

let db: DbExecutor & { close: () => void };

beforeEach(async () => {
  db = await createTestDb();
  setDbExecutor(db);
});
afterEach(() => {
  setDbExecutor(null);
  db.close();
});

/** Build a plan on this device, then hand back its share code. */
async function makeCode() {
  const ada = await createChild({ name: 'Ada', colour: '#378ADD' });
  const bo = await createChild({ name: 'Bo', colour: '#E2725B' });
  const gran = await createCarer({ name: 'Grandma', short_name: 'Gran', type: 'family' });
  const holidayId = await createHoliday({
    name: 'October half term', start_date: '2026-10-19', end_date: '2026-10-23',
    mode: 'simple', exclude_weekends: 1,
  });
  await setSlotAssignment({ holiday_id: holidayId, child_id: ada, carer_id: gran, date: '2026-10-19', period: 'am' });
  await setSlotAssignment({ holiday_id: holidayId, child_id: bo, carer_id: gran, date: '2026-10-19', period: 'pm' });
  await setDayNote(holidayId, '2026-10-19', 'pack swimming kit');

  const code = encodePlan({
    holiday: (await listHolidays())[0],
    children: await listChildren(),
    carers: await listCarers(),
    assignments: await listAssignments(holidayId),
    dayNotes: [{ date: '2026-10-19', note: 'pack swimming kit' }],
  });
  return code;
}

describe('importing onto an empty device', () => {
  it('creates everything the plan needs', async () => {
    const code = await makeCode();
    const fresh = await createTestDb();
    setDbExecutor(fresh);

    const result = await importSharedPlan(decodePlan(code));

    expect(result.childrenAdded).toBe(2);
    expect(result.carersAdded).toBe(1);
    expect(result.assignments).toBe(2);
    expect((await listChildren()).map((c) => c.name)).toEqual(['Ada', 'Bo']);
    expect((await listHolidays()).map((h) => h.name)).toEqual(['October half term']);
    expect(await getDayNote(result.holidayId, '2026-10-19')).toBe('pack swimming kit');
    fresh.close();
  });

  it('points assignments at the right child and carer', async () => {
    const code = await makeCode();
    const fresh = await createTestDb();
    setDbExecutor(fresh);

    const result = await importSharedPlan(decodePlan(code));
    const children = await listChildren();
    const assignments = await listAssignments(result.holidayId);

    const morning = assignments.find((a) => a.period === 'am')!;
    const afternoon = assignments.find((a) => a.period === 'pm')!;
    expect(morning.child_id).toBe(children.find((c) => c.name === 'Ada')!.id);
    expect(afternoon.child_id).toBe(children.find((c) => c.name === 'Bo')!.id);
    fresh.close();
  });
});

describe('importing onto a device that is already set up', () => {
  it('reuses people it already has rather than duplicating them', async () => {
    const code = await makeCode();
    const fresh = await createTestDb();
    setDbExecutor(fresh);

    // The other parent already has Ada and Grandma of their own.
    await createChild({ name: 'Ada', colour: '#5FA85F' });
    await createCarer({ name: 'Grandma', short_name: 'Nan', type: 'family' });

    const result = await importSharedPlan(decodePlan(code));

    expect(result.childrenMatched).toBe(1);
    expect(result.childrenAdded).toBe(1);
    expect(result.carersMatched).toBe(1);
    expect(result.carersAdded).toBe(0);
    expect((await listChildren()).map((c) => c.name)).toEqual(['Ada', 'Bo']);
    expect(await listCarers()).toHaveLength(1);
    fresh.close();
  });

  it('matches names regardless of case and spacing', async () => {
    const code = await makeCode();
    const fresh = await createTestDb();
    setDbExecutor(fresh);
    await createChild({ name: '  ada ', colour: '#5FA85F' });

    const result = await importSharedPlan(decodePlan(code));
    expect(result.childrenMatched).toBe(1);
    fresh.close();
  });

  it('keeps the existing plans untouched', async () => {
    const code = await makeCode();
    const fresh = await createTestDb();
    setDbExecutor(fresh);
    await createHoliday({
      name: 'My own holiday', start_date: '2027-05-31', end_date: '2027-06-04',
      mode: 'simple', exclude_weekends: 1,
    });

    await importSharedPlan(decodePlan(code));
    // Added alongside, not instead of — this is not a backup restore.
    expect((await listHolidays()).map((h) => h.name)).toEqual([
      'October half term', 'My own holiday',
    ]);
    fresh.close();
  });
});

describe('detailed mode', () => {
  it('recreates time slots', async () => {
    const ada = await createChild({ name: 'Ada', colour: '#378ADD' });
    const gran = await createCarer({ name: 'Grandma', short_name: 'Gran', type: 'family' });
    const holidayId = await createHoliday({
      name: 'Summer', start_date: '2027-07-26', end_date: '2027-07-30',
      mode: 'detailed', exclude_weekends: 1,
    });
    await addTimeSlot({
      holiday_id: holidayId, child_id: ada, carer_id: gran, date: '2027-07-26',
      start_time: '09:00', end_time: '12:30',
    });
    const code = encodePlan({
      holiday: (await listHolidays())[0],
      children: await listChildren(),
      carers: await listCarers(),
      assignments: await listAssignments(holidayId),
      dayNotes: [],
    });

    const fresh = await createTestDb();
    setDbExecutor(fresh);
    const result = await importSharedPlan(decodePlan(code));

    const slots = await listAssignments(result.holidayId);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ start_time: '09:00', end_time: '12:30', period: null });
    fresh.close();
  });
});
