import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DayList from '../components/DayList';
import WeekGrid from '../components/WeekGrid';
import { useAssignments } from '../hooks/useAssignments';
import { todayISO } from '../utils/dates';

type View = 'week' | 'list';

export default function WeeklyPlannerScreen() {
  const { holidayId } = useParams();
  const navigate = useNavigate();
  const id = Number(holidayId);

  const { holiday, children, carersById, dates, weeks, byDayAndChild, loading, error } =
    useAssignments(id);

  // Null until the user pages somewhere, so the default below can follow the
  // data as it loads without an effect writing state back during render.
  const [chosenWeek, setChosenWeek] = useState<number | null>(null);
  const [view, setView] = useState<View>('week');

  // Open on the week containing today, so a holiday already under way does not
  // start the parent on a week that has been and gone.
  const defaultWeek = useMemo(() => {
    const today = todayISO();
    const current = weeks.findIndex((week) => week.some((date) => date >= today));
    return current === -1 ? 0 : current;
  }, [weeks]);

  const weekIndex = Math.min(chosenWeek ?? defaultWeek, Math.max(0, weeks.length - 1));

  if (loading) {
    return (
      <div className="screen">
        <p className="placeholder-note">Loading…</p>
      </div>
    );
  }

  if (error || !holiday) {
    return (
      <div className="screen">
        <button type="button" className="link-button" onClick={() => navigate('/')}>
          ← Back
        </button>
        <p className="form-error" role="alert">
          That holiday could not be found.
        </p>
      </div>
    );
  }

  const week = weeks[weekIndex] ?? [];
  const openDay = (date: string) => navigate(`/holiday/${id}/day/${date}`);

  return (
    <div className="screen">
      <header className="planner-header">
        <button
          type="button"
          className="icon-button"
          aria-label="Back to holidays"
          onClick={() => navigate('/')}
        >
          ←
        </button>
        <div className="planner-header__titles">
          <h1 className="planner-header__name">{holiday.name}</h1>
          {view === 'week' && weeks.length > 0 && (
            <p className="planner-header__week">
              Week {weekIndex + 1} of {weeks.length}
            </p>
          )}
        </div>
      </header>

      <div className="segmented segmented--compact">
        <button
          type="button"
          className={view === 'week' ? 'segmented__option segmented__option--active' : 'segmented__option'}
          aria-pressed={view === 'week'}
          onClick={() => setView('week')}
        >
          Week
        </button>
        <button
          type="button"
          className={view === 'list' ? 'segmented__option segmented__option--active' : 'segmented__option'}
          aria-pressed={view === 'list'}
          onClick={() => setView('list')}
        >
          List
        </button>
      </div>

      {children.length === 0 ? (
        <div className="empty-state card">
          <p className="empty-state__title">No children yet</p>
          <p className="empty-state__body">Add a child before planning cover.</p>
          <button type="button" className="button button--primary" onClick={() => navigate('/children')}>
            Add a child
          </button>
        </div>
      ) : view === 'week' ? (
        <>
          <WeekGrid
            dates={week}
            childList={children}
            mode={holiday.mode}
            byDayAndChild={byDayAndChild}
            carersById={carersById}
            onSelect={openDay}
          />

          {weeks.length > 1 && (
            <nav className="week-nav">
              <button
                type="button"
                className="link-button"
                disabled={weekIndex === 0}
                onClick={() => setChosenWeek(Math.max(0, weekIndex - 1))}
              >
                ← Prev
              </button>
              <span className="week-nav__dots">
                {weeks.map((weekDates, i) => (
                  <button
                    key={weekDates[0]}
                    type="button"
                    className={i === weekIndex ? 'dot dot--active' : 'dot'}
                    aria-label={`Week ${i + 1}`}
                    aria-current={i === weekIndex}
                    onClick={() => setChosenWeek(i)}
                  />
                ))}
              </span>
              <button
                type="button"
                className="link-button"
                disabled={weekIndex >= weeks.length - 1}
                onClick={() => setChosenWeek(Math.min(weeks.length - 1, weekIndex + 1))}
              >
                Next →
              </button>
            </nav>
          )}
        </>
      ) : (
        <DayList
          dates={dates}
          childList={children}
          mode={holiday.mode}
          byDayAndChild={byDayAndChild}
          carersById={carersById}
          onSelect={openDay}
        />
      )}
    </div>
  );
}
