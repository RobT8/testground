import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DayList from '../components/DayList';
import Loading from '../components/Loading';
import WeekGrid from '../components/WeekGrid';
import { useAssignments } from '../hooks/useAssignments';
import Modal from '../components/Modal';
import { listDayNotes } from '../db/dayNotes';
import { encodePlan } from '../utils/shareCode';
import { shareElementAsImage, sharePlanCode } from '../utils/share';
import { todayISO } from '../utils/dates';

type View = 'week' | 'list';

export default function WeeklyPlannerScreen() {
  const { holidayId } = useParams();
  const navigate = useNavigate();
  const id = Number(holidayId);

  const { holiday, children, carers, carersById, dates, weeks, byDayAndChild, loading, error } =
    useAssignments(id);

  // Null until the user pages somewhere, so the default below can follow the
  // data as it loads without an effect writing state back during render.
  const [chosenWeek, setChosenWeek] = useState<number | null>(null);
  const [view, setView] = useState<View>('week');
  const [sharing, setSharing] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The element captured for the image — the grid itself, not the whole screen.
  const shareable = useRef<HTMLDivElement>(null);

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
        <Loading />
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

  async function shareImage() {
    if (!shareable.current) return;
    setBusy(true);
    setShareStatus(null);
    try {
      const result = await shareElementAsImage(shareable.current, holiday!.name);
      setShareStatus(result.shared ? null : `Saved ${result.filename}`);
      if (result.shared) setSharing(false);
    } catch (error) {
      setShareStatus(`Could not create the image: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function shareCode() {
    setBusy(true);
    setShareStatus(null);
    try {
      const { listAssignments } = await import('../db/assignments');
      const code = encodePlan({
        holiday: holiday!,
        children,
        carers,
        assignments: await listAssignments(id),
        dayNotes: [...(await listDayNotes(id))].map(([date, note]) => ({ date, note })),
      });
      const how = await sharePlanCode(code, holiday!.name);
      setShareStatus(how === 'copied' ? 'Plan code copied to the clipboard.' : null);
      if (how === 'shared') setSharing(false);
    } catch (error) {
      setShareStatus(`Could not share the plan: ${(error as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen">
      <header className="planner-header">
        <button
          type="button"
          className="back-button"
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
        <button
          type="button"
          className="icon-button"
          aria-label="Share this plan"
          onClick={() => {
            setShareStatus(null);
            setSharing(true);
          }}
        >
          Share
        </button>
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
          <div ref={shareable} className="shareable">
            <p className="shareable__caption">
              {holiday.name} · Week {weekIndex + 1} of {weeks.length}
            </p>
            <WeekGrid
            dates={week}
            childList={children}
            mode={holiday.mode}
            byDayAndChild={byDayAndChild}
            carersById={carersById}
              onSelect={openDay}
            />
          </div>

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
      {sharing && (
        <Modal title="Share this plan" onClose={() => setSharing(false)}>
          <button
            type="button"
            className="setting-row setting-row--action"
            disabled={busy}
            onClick={shareImage}
          >
            <span className="setting-row__label">
              Share as a picture
              <span className="setting-row__sub">
                This week's grid, ready for WhatsApp or a message
              </span>
            </span>
            <span className="setting-row__chevron">›</span>
          </button>

          <button
            type="button"
            className="setting-row setting-row--action"
            disabled={busy}
            onClick={shareCode}
          >
            <span className="setting-row__label">
              Send the whole plan
              <span className="setting-row__sub">
                A code the other parent pastes into their own KidRota
              </span>
            </span>
            <span className="setting-row__chevron">›</span>
          </button>

          {shareStatus && (
            <p className="form-success share-status" role="status">
              {shareStatus}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
