import ChildAvatar from './ChildAvatar';
import DayColumn from './DayColumn';
import type { Assignment, Carer, Child } from '../db/types';
import type { HolidayMode } from '../utils/constants';
import { dayKey } from '../hooks/useAssignments';
import { formatColumnHeader } from '../utils/dates';

interface WeekGridProps {
  dates: string[];
  /** Named childList: `children` is reserved by React for JSX content. */
  childList: Child[];
  mode: HolidayMode;
  byDayAndChild: Map<string, Assignment[]>;
  carersById: Map<number, Carer>;
  onSelect: (date: string) => void;
}

/**
 * The week at a glance: one column per day, one block per child.
 *
 * The column count varies — five weekdays, seven if weekends are included,
 * fewer in a part week — so the track is scrollable with a minimum column
 * width rather than squeezing seven columns into a phone's width.
 */
export default function WeekGrid({
  dates,
  childList,
  mode,
  byDayAndChild,
  carersById,
  onSelect,
}: WeekGridProps) {
  const columns = { gridTemplateColumns: `repeat(${dates.length}, minmax(62px, 1fr))` };

  return (
    <div className="week-grid">
      <div className="week-grid__scroll">
        <div className="week-grid__head" style={columns}>
          {dates.map((date) => (
            <span className="week-grid__day" key={date}>
              {formatColumnHeader(date)}
            </span>
          ))}
        </div>

        {childList.map((child) => (
          <section className="week-grid__child" key={child.id}>
            <header className="week-grid__child-head">
              <ChildAvatar name={child.name} colour={child.colour} size={24} />
              <span className="week-grid__child-name">{child.name}</span>
            </header>
            <div className="week-grid__row" style={columns}>
              {dates.map((date) => (
                <DayColumn
                  key={date}
                  date={date}
                  child={child}
                  mode={mode}
                  assignments={byDayAndChild.get(dayKey(date, child.id))}
                  carersById={carersById}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
