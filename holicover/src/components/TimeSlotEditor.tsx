import { useState } from 'react';
import { addTimeSlot, deleteAssignment, updateAssignment } from '../db/assignments';
import type { Assignment, Carer, Child } from '../db/types';
import { CARER_TYPE_VARS } from '../utils/constants';
import CarerIcon from './CarerIcon';

interface TimeSlotEditorProps {
  holidayId: number;
  child: Child;
  date: string;
  slots: Assignment[];
  carers: Carer[];
  carersById: Map<number, Carer>;
  onChanged: () => Promise<void>;
}

const DEFAULT_START = '09:00';
const DEFAULT_END = '17:00';

/** Detailed-mode cover: a stack of time ranges, each with a carer. */
export default function TimeSlotEditor({
  holidayId,
  child,
  date,
  slots,
  carers,
  carersById,
  onChanged,
}: TimeSlotEditorProps) {
  const [adding, setAdding] = useState(false);
  const [start, setStart] = useState(DEFAULT_START);
  const [end, setEnd] = useState(DEFAULT_END);
  const [carerId, setCarerId] = useState<number | null>(carers[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (carerId === null) return;
    if (end <= start) {
      setError('The end time must be after the start time.');
      return;
    }
    setError(null);
    await addTimeSlot({
      holiday_id: holidayId,
      child_id: child.id,
      carer_id: carerId,
      date,
      start_time: start,
      end_time: end,
    });
    await onChanged();
    setAdding(false);
    setStart(DEFAULT_START);
    setEnd(DEFAULT_END);
  }

  async function editTime(slot: Assignment, field: 'start_time' | 'end_time', value: string) {
    await updateAssignment(slot.id, { [field]: value });
    await onChanged();
  }

  return (
    <div className="slot-section">
      {slots.map((slot) => {
        const carer = carersById.get(slot.carer_id);
        return (
          <div className="time-slot" key={slot.id}>
            <span
              className="time-slot__dot"
              style={{
                background: carer?.colour ?? CARER_TYPE_VARS[carer?.type ?? 'other'].bg,
                color: CARER_TYPE_VARS[carer?.type ?? 'other'].text,
              }}
            >
              <CarerIcon type={carer?.type ?? 'other'} size={14} />
            </span>
            <span className="time-slot__carer">{carer?.name ?? 'Unknown'}</span>
            <input
              type="time"
              className="time-slot__time"
              value={slot.start_time ?? ''}
              aria-label={`Start time for ${carer?.name ?? 'this slot'}`}
              onChange={(event) => editTime(slot, 'start_time', event.target.value)}
            />
            <span className="time-slot__dash">–</span>
            <input
              type="time"
              className="time-slot__time"
              value={slot.end_time ?? ''}
              aria-label={`End time for ${carer?.name ?? 'this slot'}`}
              onChange={(event) => editTime(slot, 'end_time', event.target.value)}
            />
            <button
              type="button"
              className="icon-button icon-button--danger"
              aria-label={`Remove ${carer?.name ?? 'slot'} from ${child.name}`}
              onClick={async () => {
                await deleteAssignment(slot.id);
                await onChanged();
              }}
            >
              ✕
            </button>
          </div>
        );
      })}

      {adding ? (
        <div className="quick-add">
          <select
            className="field__input"
            value={carerId ?? ''}
            aria-label="Carer"
            onChange={(event) => setCarerId(Number(event.target.value))}
          >
            {carers.map((carer) => (
              <option key={carer.id} value={carer.id}>
                {carer.name}
              </option>
            ))}
          </select>
          <div className="quick-add__times">
            <input
              type="time"
              className="field__input"
              value={start}
              aria-label="Start time"
              onChange={(event) => setStart(event.target.value)}
            />
            <input
              type="time"
              className="field__input"
              value={end}
              aria-label="End time"
              onChange={(event) => setEnd(event.target.value)}
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="add-form__actions">
            <button type="button" className="button button--secondary" onClick={add}>
              Add slot
            </button>
            <button type="button" className="link-button" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="dashed-button"
          disabled={carers.length === 0}
          onClick={() => setAdding(true)}
        >
          + Add time slot
        </button>
      )}
    </div>
  );
}
