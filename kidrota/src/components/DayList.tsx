import ChildAvatar from './ChildAvatar';
import type { Assignment, Carer, Child } from '../db/types';
import { CARER_TYPE_VARS, type HolidayMode } from '../utils/constants';
import { dayKey, slotIn, timeSlotsIn } from '../hooks/useAssignments';
import { formatLongDate } from '../utils/dates';

interface DayListProps {
  dates: string[];
  /** Named childList: `children` is reserved by React for JSX content. */
  childList: Child[];
  mode: HolidayMode;
  byDayAndChild: Map<string, Assignment[]>;
  carersById: Map<number, Carer>;
  onSelect: (date: string) => void;
}

/**
 * The whole holiday as a scrollable list of days.
 *
 * The week grid is the denser view; this one reads straight through without
 * paging, which suits a long summer holiday and makes gaps easy to scan for.
 */
export default function DayList({
  dates,
  childList,
  mode,
  byDayAndChild,
  carersById,
  onSelect,
}: DayListProps) {
  return (
    <div className="day-list">
      {dates.map((date) => (
        <button type="button" className="day-list__day" key={date} onClick={() => onSelect(date)}>
          <span className="day-list__date">{formatLongDate(date)}</span>

          {childList.map((child) => {
            const assignments = byDayAndChild.get(dayKey(date, child.id));
            const entries =
              mode === 'simple'
                ? (['am', 'pm'] as const).map((period) => {
                    const assignment = slotIn(assignments, period);
                    return {
                      key: period,
                      label: period.toUpperCase(),
                      carer: assignment ? (carersById.get(assignment.carer_id) ?? null) : null,
                    };
                  })
                : timeSlotsIn(assignments).map((slot) => ({
                    key: String(slot.id),
                    label: `${slot.start_time}–${slot.end_time}`,
                    carer: carersById.get(slot.carer_id) ?? null,
                  }));

            return (
              <span className="day-list__child" key={child.id}>
                <ChildAvatar name={child.name} colour={child.colour} size={20} />
                <span className="day-list__name">{child.name}</span>
                <span className="day-list__slots">
                  {entries.length === 0 ? (
                    <span className="day-list__slot day-list__slot--gap">Needs cover</span>
                  ) : (
                    entries.map((entry) => (
                      <span
                        key={entry.key}
                        className={
                          entry.carer ? 'day-list__slot' : 'day-list__slot day-list__slot--gap'
                        }
                        style={{
                          background: entry.carer?.colour ?? CARER_TYPE_VARS[entry.carer ? entry.carer.type : 'gap'].bg,
                          color: entry.carer?.colour
                            ? undefined
                            : CARER_TYPE_VARS[entry.carer ? entry.carer.type : 'gap'].text,
                        }}
                      >
                        {entry.label} {entry.carer ? entry.carer.short_name : '?'}
                      </span>
                    ))
                  )}
                </span>
              </span>
            );
          })}
        </button>
      ))}
    </div>
  );
}
