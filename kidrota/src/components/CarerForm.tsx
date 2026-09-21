import { useState } from 'react';
import type { Carer, NewCarer } from '../db/types';
import { CARER_TYPE_LABELS, type CarerType } from '../utils/constants';
import { MAX_SHORT_NAME, suggestShortName } from '../utils/status';

interface CarerFormProps {
  carer?: Carer;
  onSave: (values: Omit<NewCarer, 'sort_order'>) => Promise<void>;
  onDelete?: () => void;
  onCancel: () => void;
}

const MAX_NAME_LENGTH = 24;
const TYPES = Object.keys(CARER_TYPE_LABELS) as CarerType[];

export default function CarerForm({ carer, onSave, onDelete, onCancel }: CarerFormProps) {
  const [name, setName] = useState(carer?.name ?? '');
  const [shortName, setShortName] = useState(carer?.short_name ?? '');
  // Once the user edits the short name themselves, stop overwriting it.
  const [shortTouched, setShortTouched] = useState(Boolean(carer));
  const [type, setType] = useState<CarerType>(carer?.type ?? 'other');
  const [cost, setCost] = useState(carer?.cost_per_day != null ? String(carer.cost_per_day) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();

  function handleName(value: string) {
    setName(value);
    if (!shortTouched) setShortName(suggestShortName(value));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!trimmed) return;

    const parsedCost = cost.trim() === '' ? null : Number(cost);
    if (parsedCost !== null && (!Number.isFinite(parsedCost) || parsedCost < 0)) {
      setError('Cost per day must be a positive number.');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await onSave({
        name: trimmed,
        short_name: (shortName.trim() || suggestShortName(trimmed)).slice(0, MAX_SHORT_NAME),
        type,
        cost_per_day: parsedCost,
        colour: carer?.colour ?? null,
      });
    } catch {
      setError('Could not save. Please try again.');
      setSaving(false);
    }
  }

  return (
    <form className="holiday-form" noValidate onSubmit={handleSubmit}>
      <label className="field">
        <span className="field__label">Name</span>
        <input
          className="field__input"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          placeholder="e.g. Grandma"
          autoFocus
          onChange={(event) => handleName(event.target.value)}
        />
      </label>

      <label className="field">
        <span className="field__label">Short name — shown in the weekly grid</span>
        <input
          className="field__input"
          value={shortName}
          maxLength={MAX_SHORT_NAME}
          placeholder="e.g. Gran"
          onChange={(event) => {
            setShortTouched(true);
            setShortName(event.target.value);
          }}
        />
      </label>

      <label className="field">
        <span className="field__label">Type — sets the colour in the grid</span>
        <select
          className="field__input"
          value={type}
          onChange={(event) => setType(event.target.value as CarerType)}
        >
          {TYPES.map((option) => (
            <option key={option} value={option}>
              {CARER_TYPE_LABELS[option]}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field__label">Cost per day (optional)</span>
        <input
          className="field__input"
          value={cost}
          inputMode="decimal"
          placeholder="e.g. 32.50"
          onChange={(event) => setCost(event.target.value)}
        />
      </label>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="holiday-form__actions">
        <button type="button" className="button button--secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button button--primary" disabled={!trimmed || saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {onDelete && (
        <button type="button" className="link-button link-button--danger" onClick={onDelete}>
          Delete carer
        </button>
      )}
    </form>
  );
}
