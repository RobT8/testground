import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import CarerPicker from '../components/CarerPicker';
import ChildAvatar from '../components/ChildAvatar';
import Loading from '../components/Loading';
import RepeatChips from '../components/RepeatChips';
import TimeSlotEditor from '../components/TimeSlotEditor';
import {
  clearSlotAssignment,
  repeatAssignments,
  setSlotAssignment,
  type RepeatRule,
} from '../db/assignments';
import { createCarer } from '../db/carers';
import { getDayNote, setDayNote } from '../db/dayNotes';
import type { Assignment, Child } from '../db/types';
import { dayKey, slotIn, timeSlotsIn, useAssignments } from '../hooks/useAssignments';
import {
  CARER_TYPE_LABELS,
  type CarerType,
  type HolidayMode,
  type Period,
} from '../utils/constants';
import { formatLongDate } from '../utils/dates';

/** Which slot's picker is open, e.g. "3:am". Only one is expanded at a time. */
type OpenSlot = string | null;

export default function DayAssignScreen() {
  const { holidayId, date = '' } = useParams();
  const navigate = useNavigate();
  const id = Number(holidayId);

  const { holiday, children, carers, carersById, byDayAndChild, loading, error, reload } =
    useAssignments(id);

  const [openSlot, setOpenSlot] = useState<OpenSlot>(null);
  const [note, setNote] = useState('');
  const [noteLoaded, setNoteLoaded] = useState(false);
  const [addingCarer, setAddingCarer] = useState<OpenSlot>(null);
  const [newCarerName, setNewCarerName] = useState('');
  const [newCarerType, setNewCarerType] = useState<CarerType>('other');

  useEffect(() => {
    let cancelled = false;
    getDayNote(id, date).then((saved) => {
      if (cancelled) return;
      setNote(saved);
      setNoteLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id, date]);

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
          That day could not be loaded.
        </p>
      </div>
    );
  }

  const back = () => navigate(`/holiday/${id}`);

  /** Book a carer into a simple-mode slot, or clear it by tapping them again. */
  async function assign(child: Child, period: Period, carerId: number) {
    const existing = slotIn(byDayAndChild.get(dayKey(date, child.id)), period);
    if (existing?.carer_id === carerId) {
      await clearSlotAssignment(id, child.id, date, period);
    } else {
      await setSlotAssignment({
        holiday_id: id,
        child_id: child.id,
        carer_id: carerId,
        date,
        period,
      });
    }
    await reload();
    setOpenSlot(null);
  }

  /** Quick-add a carer from inside the picker and book them straight in. */
  async function addCarerAndAssign(child: Child, period: Period) {
    const trimmed = newCarerName.trim();
    if (!trimmed) return;
    const carerId = await createCarer({
      name: trimmed,
      short_name: trimmed.length > 8 ? `${trimmed.slice(0, 7)}…` : trimmed,
      type: newCarerType,
    });
    await setSlotAssignment({
      holiday_id: id,
      child_id: child.id,
      carer_id: carerId,
      date,
      period,
    });
    await reload();
    setNewCarerName('');
    setNewCarerType('other');
    setAddingCarer(null);
    setOpenSlot(null);
  }

  async function handleRepeat(rule: RepeatRule, customDays?: number[]) {
    await repeatAssignments(id, date, rule, customDays);
    await reload();
  }

  async function saveNote(value: string) {
    setNote(value);
    await setDayNote(id, date, value);
  }

  const dayHasCover = children.some(
    (child) => (byDayAndChild.get(dayKey(date, child.id)) ?? []).length > 0,
  );

  return (
    <div className="screen">
      <header className="planner-header">
        <button type="button" className="icon-button" aria-label="Back to the week" onClick={back}>
          ←
        </button>
        <div className="planner-header__titles">
          <h1 className="planner-header__name">{formatLongDate(date)}</h1>
          <p className="planner-header__week">{holiday.name}</p>
        </div>
      </header>

      {carers.length === 0 && (
        <div className="empty-state card">
          <p className="empty-state__title">No carers yet</p>
          <p className="empty-state__body">
            Add the people and clubs who help, then you can assign them to a morning or
            afternoon.
          </p>
          <button type="button" className="button button--primary" onClick={() => navigate('/carers')}>
            Add a carer
          </button>
        </div>
      )}

      {children.map((child) => {
        const assignments = byDayAndChild.get(dayKey(date, child.id));
        return (
          <section className="child-card card" key={child.id}>
            <header className="child-card__head">
              <ChildAvatar name={child.name} colour={child.colour} size={28} />
              <span className="child-card__name">{child.name}</span>
              <StatusBadge mode={holiday.mode} assignments={assignments} />
            </header>

            {holiday.mode === 'simple' ? (
              (['am', 'pm'] as const).map((period) => {
                const key = `${child.id}:${period}`;
                const assignment = slotIn(assignments, period);
                const carer = assignment ? (carersById.get(assignment.carer_id) ?? null) : null;
                const expanded = openSlot === key || carer === null;

                return (
                  <div className="slot-section" key={period}>
                    <div className="slot-section__head">
                      <h3 className="slot-section__label">
                        {period === 'am' ? 'Morning' : 'Afternoon'}
                      </h3>
                      {carer && (
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => setOpenSlot(expanded ? null : key)}
                        >
                          {expanded ? 'Done' : 'Change'}
                        </button>
                      )}
                    </div>

                    {carer && !expanded ? (
                      <p className="slot-section__assigned">{carer.name}</p>
                    ) : (
                      <>
                        <CarerPicker
                          carers={carers}
                          selectedId={carer?.id ?? null}
                          onSelect={(carerId) => assign(child, period, carerId)}
                          onAddOther={() => setAddingCarer(key)}
                        />
                        {addingCarer === key && (
                          <QuickAddCarer
                            name={newCarerName}
                            type={newCarerType}
                            onName={setNewCarerName}
                            onType={setNewCarerType}
                            onCancel={() => setAddingCarer(null)}
                            onAdd={() => addCarerAndAssign(child, period)}
                          />
                        )}
                      </>
                    )}
                  </div>
                );
              })
            ) : (
              <TimeSlotEditor
                holidayId={id}
                child={child}
                date={date}
                slots={timeSlotsIn(assignments)}
                carers={carers}
                carersById={carersById}
                onChanged={reload}
              />
            )}
          </section>
        );
      })}

      <RepeatChips date={date} disabled={!dayHasCover} onRepeat={handleRepeat} />

      <label className="field note-field">
        <span className="field__label">Notes for this day</span>
        <input
          className="field__input"
          value={note}
          placeholder="e.g. pack swimming kit"
          maxLength={200}
          disabled={!noteLoaded}
          onChange={(event) => saveNote(event.target.value)}
        />
      </label>
    </div>
  );
}

/** "Needs cover" / "AM gap" / "Covered", so the state reads without counting cells. */
function StatusBadge({
  mode,
  assignments,
}: {
  mode: HolidayMode;
  assignments: Assignment[] | undefined;
}) {
  if (mode === 'simple') {
    const am = slotIn(assignments, 'am');
    const pm = slotIn(assignments, 'pm');
    if (am && pm) return <span className="badge badge--ok">Covered</span>;
    if (!am && !pm) return <span className="badge badge--gap">Needs cover</span>;
    return <span className="badge badge--gap">{am ? 'PM gap' : 'AM gap'}</span>;
  }

  return timeSlotsIn(assignments).length > 0 ? (
    <span className="badge badge--ok">Covered</span>
  ) : (
    <span className="badge badge--gap">Needs cover</span>
  );
}

function QuickAddCarer({
  name,
  type,
  onName,
  onType,
  onCancel,
  onAdd,
}: {
  name: string;
  type: CarerType;
  onName: (value: string) => void;
  onType: (value: CarerType) => void;
  onCancel: () => void;
  onAdd: () => void;
}) {
  return (
    <div className="quick-add">
      <input
        className="field__input"
        value={name}
        placeholder="Name"
        maxLength={24}
        autoFocus
        onChange={(event) => onName(event.target.value)}
      />
      <select
        className="field__input"
        value={type}
        onChange={(event) => onType(event.target.value as CarerType)}
      >
        {(Object.keys(CARER_TYPE_LABELS) as CarerType[]).map((option) => (
          <option key={option} value={option}>
            {CARER_TYPE_LABELS[option]}
          </option>
        ))}
      </select>
      <div className="add-form__actions">
        <button type="button" className="button button--secondary" disabled={!name.trim()} onClick={onAdd}>
          Add & assign
        </button>
        <button type="button" className="link-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
