import type { Assignment, Carer, Child } from '../db/types';
import type { HolidayMode } from '../utils/constants';
import { formatColumnHeader } from '../utils/dates';
import { slotIn, timeSlotsIn } from '../hooks/useAssignments';
import SlotCell from './SlotCell';

interface DayColumnProps {
  date: string;
  child: Child;
  mode: HolidayMode;
  assignments: Assignment[] | undefined;
  carersById: Map<number, Carer>;
  onSelect: (date: string) => void;
}

/** One child's cover on one day: AM/PM in simple mode, time slots in detailed. */
export default function DayColumn({
  date,
  child,
  mode,
  assignments,
  carersById,
  onSelect,
}: DayColumnProps) {
  const heading = formatColumnHeader(date);

  if (mode === 'simple') {
    return (
      <div className="day-col">
        {(['am', 'pm'] as const).map((period) => {
          const assignment = slotIn(assignments, period);
          const carer = assignment ? (carersById.get(assignment.carer_id) ?? null) : null;
          const label = period.toUpperCase();
          return (
            <SlotCell
              key={period}
              label={label}
              carer={carer}
              onClick={() => onSelect(date)}
              accessibleLabel={
                carer
                  ? `${child.name}, ${heading} ${label}: ${carer.name}`
                  : `${child.name}, ${heading} ${label}: no cover`
              }
            />
          );
        })}
      </div>
    );
  }

  const slots = timeSlotsIn(assignments);

  return (
    <div className="day-col">
      {slots.length === 0 ? (
        <SlotCell
          // No period label: a detailed-mode day with no slots has no time to
          // show, and a placeholder dash just competes with the "?".
          label=""
          carer={null}
          onClick={() => onSelect(date)}
          accessibleLabel={`${child.name}, ${heading}: no cover`}
        />
      ) : (
        slots.map((slot) => {
          const carer = carersById.get(slot.carer_id) ?? null;
          return (
            <SlotCell
              key={slot.id}
              label={slot.start_time ?? '—'}
              carer={carer}
              onClick={() => onSelect(date)}
              accessibleLabel={
                carer
                  ? `${child.name}, ${heading} ${slot.start_time}–${slot.end_time}: ${carer.name}`
                  : `${child.name}, ${heading}: no cover`
              }
            />
          );
        })
      )}
      <button
        type="button"
        className="day-col__add"
        aria-label={`Add a time slot for ${child.name} on ${heading}`}
        onClick={() => onSelect(date)}
      >
        +
      </button>
    </div>
  );
}
