import type { SharedPlan } from '../utils/shareCode';
import { addTimeSlot, setSlotAssignment } from './assignments';
import { createCarer, listCarers } from './carers';
import { createChild, listChildren } from './children';
import { setDayNote } from './dayNotes';
import { createHoliday } from './holidays';

export interface ImportResult {
  holidayId: number;
  holidayName: string;
  childrenAdded: number;
  childrenMatched: number;
  carersAdded: number;
  carersMatched: number;
  assignments: number;
}

/** Names match loosely, so "Grandma" and "grandma " are the same person. */
function key(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Add a shared plan to this device.
 *
 * Adds rather than replaces: the code arrives from the other parent while you
 * already have your own children and carers set up, so wiping them the way a
 * backup restore does would be wrong. Existing people are matched by name and
 * reused, which is what stops an import leaving you with two of everyone.
 */
export async function importSharedPlan(plan: SharedPlan): Promise<ImportResult> {
  const existingChildren = await listChildren();
  const existingCarers = await listCarers();

  const childByName = new Map(existingChildren.map((child) => [key(child.name), child.id]));
  const carerByName = new Map(existingCarers.map((carer) => [key(carer.name), carer.id]));

  let childrenAdded = 0;
  let childrenMatched = 0;
  const childIds: number[] = [];
  for (const child of plan.children) {
    const existing = childByName.get(key(child.name));
    if (existing !== undefined) {
      childIds.push(existing);
      childrenMatched++;
    } else {
      const id = await createChild({ name: child.name.trim(), colour: child.colour });
      childByName.set(key(child.name), id);
      childIds.push(id);
      childrenAdded++;
    }
  }

  let carersAdded = 0;
  let carersMatched = 0;
  const carerIds: number[] = [];
  for (const carer of plan.carers) {
    const existing = carerByName.get(key(carer.name));
    if (existing !== undefined) {
      carerIds.push(existing);
      carersMatched++;
    } else {
      const id = await createCarer({
        name: carer.name.trim(),
        short_name: carer.short_name,
        type: carer.type,
        cost_per_day: carer.cost_per_day,
      });
      carerByName.set(key(carer.name), id);
      carerIds.push(id);
      carersAdded++;
    }
  }

  const holidayId = await createHoliday({
    name: plan.holiday.name,
    start_date: plan.holiday.start_date,
    end_date: plan.holiday.end_date,
    mode: plan.holiday.mode,
    exclude_weekends: plan.holiday.exclude_weekends,
  });

  let assignments = 0;
  for (const item of plan.assignments) {
    const childId = childIds[item.childIndex];
    const carerId = carerIds[item.carerIndex];
    if (childId === undefined || carerId === undefined) continue;

    if (item.period) {
      await setSlotAssignment({
        holiday_id: holidayId,
        child_id: childId,
        carer_id: carerId,
        date: item.date,
        period: item.period,
        notes: item.notes,
        cost: item.cost,
      });
    } else if (item.start_time && item.end_time) {
      await addTimeSlot({
        holiday_id: holidayId,
        child_id: childId,
        carer_id: carerId,
        date: item.date,
        start_time: item.start_time,
        end_time: item.end_time,
        notes: item.notes,
        cost: item.cost,
      });
    } else {
      // Neither a slot nor a time range: nothing meaningful to create.
      continue;
    }
    assignments++;
  }

  for (const note of plan.dayNotes) {
    await setDayNote(holidayId, note.date, note.note);
  }

  return {
    holidayId,
    holidayName: plan.holiday.name,
    childrenAdded,
    childrenMatched,
    carersAdded,
    carersMatched,
    assignments,
  };
}
