import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setDbExecutor } from '../database';
import { createTestDb } from '../testExecutor';
import type { DbExecutor } from '../executor';
import { BackupError, exportData, importData, validateBackup, wipeAllData } from '../backup';
import { SCHEMA_VERSION } from '../schema';
import { createChild, listChildren } from '../children';
import { createCarer, listCarers } from '../carers';
import { createHoliday, listHolidays } from '../holidays';
import { addTimeSlot, listAssignments, setSlotAssignment } from '../assignments';
import { getDayNote, setDayNote } from '../dayNotes';
import { getSetting, setOnboardingComplete, setSetting } from '../settings';

let db: DbExecutor & { close: () => void };

/** A device with a realistic amount of everything on it. */
async function seed() {
  const ada = await createChild({ name: 'Ada', colour: '#378ADD' });
  const bo = await createChild({ name: 'Bo', colour: '#E2725B' });
  const gran = await createCarer({ name: 'Grandma', short_name: 'Gran', type: 'family' });
  const club = await createCarer({
    name: 'Holiday club', short_name: 'Club', type: 'club', cost_per_day: 32.5,
  });

  const simple = await createHoliday({
    name: 'October half term', start_date: '2026-10-19', end_date: '2026-10-23',
    mode: 'simple', exclude_weekends: 1,
  });
  const detailed = await createHoliday({
    name: 'Summer', start_date: '2027-07-26', end_date: '2027-07-30',
    mode: 'detailed', exclude_weekends: 0,
  });

  await setSlotAssignment({
    holiday_id: simple, child_id: ada, carer_id: gran, date: '2026-10-19', period: 'am',
    notes: 'swimming', cost: 12.5,
  });
  await setSlotAssignment({
    holiday_id: simple, child_id: bo, carer_id: club, date: '2026-10-19', period: 'pm',
  });
  await addTimeSlot({
    holiday_id: detailed, child_id: ada, carer_id: gran, date: '2027-07-26',
    start_time: '09:00', end_time: '12:00',
  });
  await setDayNote(simple, '2026-10-19', 'pack swimming kit');
  await setOnboardingComplete();
  return { simple, detailed, ada, bo, gran, club };
}

beforeEach(async () => {
  db = await createTestDb();
  setDbExecutor(db);
});
afterEach(() => {
  setDbExecutor(null);
  db.close();
});

describe('exportData', () => {
  it('captures every table', async () => {
    await seed();
    const file = await exportData();

    expect(file.app).toBe('holicover');
    expect(file.schemaVersion).toBe(SCHEMA_VERSION);
    expect(file.children).toHaveLength(2);
    expect(file.carers).toHaveLength(2);
    expect(file.holidays).toHaveLength(2);
    expect(file.assignments).toHaveLength(3);
    expect(file.dayNotes).toHaveLength(1);
    expect(file.settings.onboarding_complete).toBe('true');
  });

  it('exports an empty device without failing', async () => {
    const file = await exportData();
    expect(file.children).toEqual([]);
    expect(file.assignments).toEqual([]);
  });

  it('survives a JSON round trip', async () => {
    await seed();
    const file = await exportData();
    expect(JSON.parse(JSON.stringify(file))).toEqual(file);
  });
});

describe('validateBackup', () => {
  const valid = {
    app: 'holicover', schemaVersion: 1, exportedAt: '', children: [], carers: [],
    holidays: [], assignments: [], dayNotes: [], settings: {},
  };

  it('accepts a well-formed backup', () => {
    expect(() => validateBackup(valid)).not.toThrow();
  });

  it('rejects an unrelated JSON file', () => {
    expect(() => validateBackup({ hello: 'world' })).toThrow(BackupError);
    expect(() => validateBackup([1, 2, 3])).toThrow(BackupError);
    expect(() => validateBackup(null)).toThrow(BackupError);
    expect(() => validateBackup('a string')).toThrow(BackupError);
  });

  it('rejects a backup from a newer app version', () => {
    expect(() => validateBackup({ ...valid, schemaVersion: SCHEMA_VERSION + 1 })).toThrow(
      /newer version/,
    );
  });

  it('rejects a backup missing a table', () => {
    expect(() => validateBackup({ ...valid, holidays: undefined })).toThrow(/incomplete/);
  });

  it('accepts an older backup without the tables added since', () => {
    // dayNotes arrived in schema v2; a v1 export will not have it.
    const older = { ...valid, dayNotes: undefined, settings: undefined };
    const result = validateBackup(older);
    expect(result.dayNotes).toEqual([]);
    expect(result.settings).toEqual({});
  });
});

describe('wipeAllData', () => {
  it('empties every table but keeps the schema', async () => {
    await seed();
    await wipeAllData();

    expect(await listChildren()).toEqual([]);
    expect(await listCarers()).toEqual([]);
    expect(await listHolidays()).toEqual([]);
    expect(await db.query('SELECT * FROM assignments')).toEqual([]);
    expect(await db.query('SELECT * FROM day_notes')).toEqual([]);
    expect(await getSetting('onboarding_complete')).toBeNull();

    // Still usable straight afterwards.
    await expect(createChild({ name: 'Fresh', colour: '#378ADD' })).resolves.toBeGreaterThan(0);
  });
});

describe('importData', () => {
  it('restores an exported device exactly', async () => {
    const seeded = await seed();
    const file = await exportData();

    await wipeAllData();
    await importData(JSON.parse(JSON.stringify(file)));

    expect((await listChildren()).map((c) => c.name)).toEqual(['Ada', 'Bo']);
    expect((await listCarers()).map((c) => c.name)).toEqual(['Grandma', 'Holiday club']);
    expect((await listHolidays()).map((h) => h.name)).toEqual(['October half term', 'Summer']);
    expect(await listAssignments(seeded.simple)).toHaveLength(2);
    expect(await getDayNote(seeded.simple, '2026-10-19')).toBe('pack swimming kit');
    expect(await getSetting('onboarding_complete')).toBe('true');
  });

  it('keeps ids, so assignments still point at the right child and carer', async () => {
    const seeded = await seed();
    const file = await exportData();
    await importData(JSON.parse(JSON.stringify(file)));

    const assignments = await listAssignments(seeded.simple);
    const morning = assignments.find((a) => a.period === 'am')!;
    expect(morning.child_id).toBe(seeded.ada);
    expect(morning.carer_id).toBe(seeded.gran);
    expect(morning.notes).toBe('swimming');
    expect(morning.cost).toBe(12.5);
  });

  it('preserves detailed-mode time slots', async () => {
    const seeded = await seed();
    const file = await exportData();
    await importData(JSON.parse(JSON.stringify(file)));

    const slots = await listAssignments(seeded.detailed);
    expect(slots).toHaveLength(1);
    expect(slots[0].start_time).toBe('09:00');
    expect(slots[0].end_time).toBe('12:00');
    expect(slots[0].period).toBeNull();
  });

  it('replaces rather than merges', async () => {
    await seed();
    const file = await exportData();

    await createChild({ name: 'Extra', colour: '#5FA85F' });
    expect(await listChildren()).toHaveLength(3);

    await importData(JSON.parse(JSON.stringify(file)));
    expect((await listChildren()).map((c) => c.name)).toEqual(['Ada', 'Bo']);
  });

  it('leaves the device untouched when the file is rejected', async () => {
    await seed();
    await expect(importData({ nonsense: true })).rejects.toThrow(BackupError);

    // Nothing was deleted on the way to failing.
    expect(await listChildren()).toHaveLength(2);
    expect(await listHolidays()).toHaveLength(2);
  });

  it('restores onto an empty device', async () => {
    await seed();
    const file = await exportData();
    const fresh = await createTestDb();
    setDbExecutor(fresh);

    await importData(JSON.parse(JSON.stringify(file)));
    expect(await listChildren()).toHaveLength(2);
    fresh.close();
  });

  it('leaves the database writable afterwards', async () => {
    await seed();
    const file = await exportData();
    await importData(JSON.parse(JSON.stringify(file)));

    // Auto-increment must not collide with the restored ids.
    const id = await createChild({ name: 'Cy', colour: '#5FA85F' });
    expect((await listChildren()).find((c) => c.id === id)?.name).toBe('Cy');
  });

  it('round-trips a setting written after the export', async () => {
    await seed();
    const file = await exportData();
    await setSetting('theme', 'dark');
    await importData(JSON.parse(JSON.stringify(file)));
    // The export predates it, so restoring removes it — replace, not merge.
    expect(await getSetting('theme')).toBeNull();
  });
});
