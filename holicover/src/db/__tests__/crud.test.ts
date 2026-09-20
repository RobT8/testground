import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setDbExecutor } from '../database';
import { createTestDb } from '../testExecutor';
import type { DbExecutor } from '../executor';
import {
  countChildAssignments,
  createChild,
  deleteChild,
  listChildren,
  reorderChildren,
  updateChild,
} from '../children';
import {
  countCarerAssignments,
  createCarer,
  createCarers,
  deleteCarer,
  listCarers,
  listCarersByType,
  updateCarer,
} from '../carers';
import {
  countHolidays,
  createHoliday,
  deleteHoliday,
  getHoliday,
  getNextHoliday,
  listHolidays,
  updateHoliday,
} from '../holidays';
import { getSetting, isOnboardingComplete, setOnboardingComplete, setSetting } from '../settings';
import { DEFAULT_CARERS } from '../../utils/constants';

let db: DbExecutor & { close: () => void };

beforeEach(async () => {
  db = await createTestDb();
  setDbExecutor(db);
});
afterEach(() => {
  setDbExecutor(null);
  db.close();
});

describe('children', () => {
  it('creates, lists and updates', async () => {
    const id = await createChild({ name: 'Ada', colour: '#378ADD' });
    expect(await listChildren()).toHaveLength(1);

    await updateChild(id, { name: 'Ada B' });
    expect((await listChildren())[0].name).toBe('Ada B');
  });

  it('appends new children to the end of the list', async () => {
    await createChild({ name: 'Ada', colour: '#378ADD' });
    await createChild({ name: 'Bo', colour: '#E2725B' });
    await createChild({ name: 'Cy', colour: '#5FA85F' });
    expect((await listChildren()).map((c) => c.name)).toEqual(['Ada', 'Bo', 'Cy']);
  });

  it('reorders', async () => {
    const ada = await createChild({ name: 'Ada', colour: '#378ADD' });
    const bo = await createChild({ name: 'Bo', colour: '#E2725B' });
    await reorderChildren([bo, ada]);
    expect((await listChildren()).map((c) => c.name)).toEqual(['Bo', 'Ada']);
  });

  it('ignores an update with no changes', async () => {
    const id = await createChild({ name: 'Ada', colour: '#378ADD' });
    await expect(updateChild(id, {})).resolves.toBeUndefined();
    expect((await listChildren())[0].name).toBe('Ada');
  });

  it('deletes', async () => {
    const id = await createChild({ name: 'Ada', colour: '#378ADD' });
    await deleteChild(id);
    expect(await listChildren()).toHaveLength(0);
  });

  it('counts assignments so deletion can warn first', async () => {
    const holiday = await createHoliday({
      name: 'October half term',
      start_date: '2026-10-19',
      end_date: '2026-10-23',
      mode: 'simple',
      exclude_weekends: 1,
    });
    const child = await createChild({ name: 'Ada', colour: '#378ADD' });
    const carer = await createCarer({ name: 'Grandma', short_name: 'Gran', type: 'family' });

    expect(await countChildAssignments(child)).toBe(0);
    await db.run(
      'INSERT INTO assignments (holiday_id, child_id, carer_id, date, period) VALUES (?, ?, ?, ?, ?)',
      [holiday, child, carer, '2026-10-20', 'am'],
    );
    expect(await countChildAssignments(child)).toBe(1);
  });
});

describe('carers', () => {
  it('defaults cost and colour to null so colour derives from type', async () => {
    const id = await createCarer({ name: 'Grandma', short_name: 'Gran', type: 'family' });
    const carer = (await listCarers()).find((c) => c.id === id)!;
    expect(carer.colour).toBeNull();
    expect(carer.cost_per_day).toBeNull();
  });

  it('stores a cost per day', async () => {
    const id = await createCarer({
      name: 'Holiday club',
      short_name: 'Club',
      type: 'club',
      cost_per_day: 32.5,
    });
    const carer = (await listCarers()).find((c) => c.id === id)!;
    expect(carer.cost_per_day).toBe(32.5);
  });

  it('bulk-creates the onboarding presets in order', async () => {
    const ids = await createCarers(DEFAULT_CARERS);
    expect(ids).toHaveLength(DEFAULT_CARERS.length);
    expect((await listCarers()).map((c) => c.short_name)).toEqual(
      DEFAULT_CARERS.map((c) => c.short_name),
    );
  });

  it('groups by type for the carers screen', async () => {
    await createCarers(DEFAULT_CARERS);
    const grouped = await listCarersByType();
    expect(grouped.parent.map((c) => c.name)).toEqual(['Mum', 'Dad']);
    expect(grouped.family.map((c) => c.name)).toEqual(['Grandma', 'Grandad']);
    expect(grouped.club).toHaveLength(1);
    expect(grouped.other.map((c) => c.name)).toEqual(['Childminder', 'Au pair']);
  });

  it('counts assignments so deletion can warn first', async () => {
    const holiday = await createHoliday({
      name: 'October half term',
      start_date: '2026-10-19',
      end_date: '2026-10-23',
      mode: 'simple',
      exclude_weekends: 1,
    });
    const child = await createChild({ name: 'Ada', colour: '#378ADD' });
    const carer = await createCarer({ name: 'Grandma', short_name: 'Gran', type: 'family' });
    await db.run(
      'INSERT INTO assignments (holiday_id, child_id, carer_id, date, period) VALUES (?, ?, ?, ?, ?)',
      [holiday, child, carer, '2026-10-20', 'am'],
    );

    expect(await countCarerAssignments(carer)).toBe(1);
    await deleteCarer(carer);
    expect(await countCarerAssignments(carer)).toBe(0);
  });

  it('updates a custom colour', async () => {
    const id = await createCarer({ name: 'Grandma', short_name: 'Gran', type: 'family' });
    await updateCarer(id, { colour: '#123456' });
    expect((await listCarers())[0].colour).toBe('#123456');
  });
});

describe('holidays', () => {
  const october = {
    name: 'October half term',
    start_date: '2026-10-19',
    end_date: '2026-10-23',
    mode: 'simple' as const,
    exclude_weekends: 1,
  };

  it('creates and reads back', async () => {
    const id = await createHoliday(october);
    const holiday = await getHoliday(id);
    expect(holiday?.name).toBe('October half term');
    expect(holiday?.exclude_weekends).toBe(1);
    expect(holiday?.created_at).toBeTruthy();
  });

  it('lists in date order regardless of insertion order', async () => {
    await createHoliday({ ...october, name: 'Christmas', start_date: '2026-12-21', end_date: '2027-01-01' });
    await createHoliday(october);
    expect((await listHolidays()).map((h) => h.name)).toEqual(['October half term', 'Christmas']);
  });

  it('counts holidays for the free-tier cap', async () => {
    expect(await countHolidays()).toBe(0);
    await createHoliday(october);
    expect(await countHolidays()).toBe(1);
  });

  it('touches updated_at on edit', async () => {
    const id = await createHoliday(october);
    await updateHoliday(id, { name: 'Oct half term' });
    const holiday = await getHoliday(id);
    expect(holiday?.name).toBe('Oct half term');
    expect(holiday?.updated_at).toBeTruthy();
  });

  it('finds the next break, counting one already under way', async () => {
    await createHoliday(october);
    await createHoliday({ ...october, name: 'Christmas', start_date: '2026-12-21', end_date: '2027-01-01' });

    expect((await getNextHoliday('2026-09-01'))?.name).toBe('October half term');
    // Mid-holiday: the break under way is still "next".
    expect((await getNextHoliday('2026-10-21'))?.name).toBe('October half term');
    // After it ends, the following one takes over.
    expect((await getNextHoliday('2026-10-24'))?.name).toBe('Christmas');
    expect(await getNextHoliday('2027-06-01')).toBeNull();
  });

  it('deletes', async () => {
    const id = await createHoliday(october);
    await deleteHoliday(id);
    expect(await listHolidays()).toHaveLength(0);
  });
});

describe('settings', () => {
  it('reads back what it writes', async () => {
    await setSetting('theme', 'dark');
    expect(await getSetting('theme')).toBe('dark');
  });

  it('overwrites rather than duplicating a key', async () => {
    await setSetting('theme', 'dark');
    await setSetting('theme', 'light');
    expect(await getSetting('theme')).toBe('light');
    const rows = await db.query('SELECT * FROM app_settings');
    expect(rows).toHaveLength(1);
  });

  it('returns null for an unset key', async () => {
    expect(await getSetting('nope')).toBeNull();
  });

  it('gates onboarding', async () => {
    expect(await isOnboardingComplete()).toBe(false);
    await setOnboardingComplete();
    expect(await isOnboardingComplete()).toBe(true);
  });
});
