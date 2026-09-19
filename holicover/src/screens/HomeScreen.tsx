import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfirmDialog from '../components/ConfirmDialog';
import HolidayCard from '../components/HolidayCard';
import HolidayForm from '../components/HolidayForm';
import Modal from '../components/Modal';
import type { Holiday, NewHoliday } from '../db/types';
import { useHolidays } from '../hooks/useHolidays';
import { todayISO } from '../utils/dates';
import { formatGapCount, formatNextBreak, nextBreak } from '../utils/status';

export default function HomeScreen() {
  const { holidays, coverage, next, gapSlots, loading, error, add, edit, remove } = useHolidays();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [deleting, setDeleting] = useState<Holiday | null>(null);
  const navigate = useNavigate();

  async function handleSave(values: NewHoliday) {
    if (editing) {
      await edit(editing.id, values);
      setEditing(null);
    } else {
      await add(values);
      setAdding(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    await remove(deleting.id);
    setDeleting(null);
    setEditing(null);
  }

  return (
    <div className="screen">
      <header className="home-header">
        <div>
          <p className="page-eyebrow">HoliCover</p>
          <h1 className="page-title">Your holidays</h1>
        </div>
        <button
          type="button"
          className="fab"
          aria-label="Add holiday"
          onClick={() => setAdding(true)}
        >
          +
        </button>
      </header>

      <div className="stats">
        <div className="stat card">
          <span className="stat__label">Next break</span>
          <span className="stat__value">{formatNextBreak(nextBreak(todayISO(), next))}</span>
        </div>
        <div className="stat card">
          <span className="stat__label">Gaps to fill</span>
          <span className={gapSlots > 0 ? 'stat__value stat__value--gaps' : 'stat__value'}>
            {formatGapCount(gapSlots)}
          </span>
        </div>
      </div>

      {error && (
        <p className="form-error" role="alert">
          Could not load your holidays.
        </p>
      )}

      {loading ? (
        <p className="placeholder-note">Loading…</p>
      ) : holidays.length === 0 ? (
        <div className="empty-state card">
          <p className="empty-state__title">No holidays yet</p>
          <p className="empty-state__body">
            Add a school break and start filling in who’s covering each day.
          </p>
          <button type="button" className="button button--primary" onClick={() => setAdding(true)}>
            Add your first holiday
          </button>
        </div>
      ) : (
        <div className="holiday-list">
          {holidays.map((holiday) => (
            <HolidayCard
              key={holiday.id}
              holiday={holiday}
              coverage={coverage.get(holiday.id)}
              onOpen={() => navigate(`/holiday/${holiday.id}`)}
              onEdit={() => setEditing(holiday)}
            />
          ))}
        </div>
      )}

      {adding && (
        <Modal title="Add holiday" onClose={() => setAdding(false)}>
          <HolidayForm onSave={handleSave} onCancel={() => setAdding(false)} />
        </Modal>
      )}

      {editing && !deleting && (
        <Modal title="Edit holiday" onClose={() => setEditing(null)}>
          <HolidayForm
            holiday={editing}
            onSave={handleSave}
            onDelete={() => setDeleting(editing)}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete holiday"
          message={`Delete “${deleting.name}” and everything planned for it? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
