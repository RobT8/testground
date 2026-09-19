import { useEffect, useState } from 'react';
import { createCarer, deleteCarer, listCarers } from '../../db/carers';
import type { Carer } from '../../db/types';
import {
  CARER_TYPE_LABELS,
  CARER_TYPE_VARS,
  DEFAULT_CARERS,
  type CarerType,
} from '../../utils/constants';

const MAX_NAME_LENGTH = 24;
const CARER_TYPES = Object.keys(CARER_TYPE_LABELS) as CarerType[];

interface CarersStepProps {
  onDone: () => void;
  busy: boolean;
}

/**
 * Pick who helps with childcare.
 *
 * Presets are toggles backed directly by the database: tapping one adds that
 * carer, tapping it again removes them. Reopening the step therefore shows the
 * right ticks without any separate draft state to keep in sync.
 */
export default function CarersStep({ onDone, busy }: CarersStepProps) {
  const [carers, setCarers] = useState<Carer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customType, setCustomType] = useState<CarerType>('other');

  useEffect(() => {
    listCarers().then((existing) => {
      setCarers(existing);
      setLoading(false);
    });
  }, []);

  async function refresh() {
    setCarers(await listCarers());
  }

  async function togglePreset(preset: (typeof DEFAULT_CARERS)[number]) {
    const existing = carers.find(
      (carer) => carer.name === preset.name && carer.type === preset.type,
    );
    if (existing) {
      await deleteCarer(existing.id);
    } else {
      await createCarer(preset);
    }
    await refresh();
  }

  /** Save a typed custom carer. Shared by the add button and the final button. */
  async function commitCustom() {
    const trimmed = customName.trim();
    if (!trimmed) return;

    await createCarer({
      name: trimmed,
      // Short names drive the tight weekly grid cells; trim long custom ones.
      short_name: trimmed.length > 8 ? `${trimmed.slice(0, 7)}…` : trimmed,
      type: customType,
    });
    await refresh();
    setCustomName('');
    setCustomType('other');
    setShowCustom(false);
  }

  async function addCustom(event: React.FormEvent) {
    event.preventDefault();
    await commitCustom();
  }

  /**
   * Same trap as the children step: a half-typed custom carer would otherwise
   * be discarded in silence when the user taps the button that finishes setup.
   */
  async function handleDone() {
    await commitCustom();
    onDone();
  }

  /** Carers the user typed in, as opposed to the presets shown as chips. */
  const custom = carers.filter(
    (carer) =>
      !DEFAULT_CARERS.some((preset) => preset.name === carer.name && preset.type === carer.type),
  );

  if (loading) return <p className="placeholder-note">Loading…</p>;

  return (
    <div className="step">
      <header className="step__header">
        <h1 className="step__title">Who helps with childcare?</h1>
        <p className="step__subtitle">Tap to add, or create your own</p>
      </header>

      <div className="chips">
        {DEFAULT_CARERS.map((preset) => {
          const selected = carers.some(
            (carer) => carer.name === preset.name && carer.type === preset.type,
          );
          return (
            <button
              key={preset.name}
              type="button"
              className={selected ? 'chip chip--selected' : 'chip'}
              aria-pressed={selected}
              style={{
                background: selected ? CARER_TYPE_VARS[preset.type].bg : undefined,
                color: selected ? CARER_TYPE_VARS[preset.type].text : undefined,
              }}
              onClick={() => togglePreset(preset)}
            >
              <span className="chip__tick" aria-hidden="true">
                {selected ? '✓' : '+'}
              </span>
              {preset.name}
            </button>
          );
        })}
      </div>

      {custom.length > 0 && (
        <ul className="entity-list">
          {custom.map((carer) => (
            <li className="entity-row" key={carer.id}>
              <span
                className="type-dot"
                style={{ background: CARER_TYPE_VARS[carer.type].bg }}
                aria-hidden="true"
              />
              <span className="entity-row__name">{carer.name}</span>
              <span className="entity-row__meta">{CARER_TYPE_LABELS[carer.type]}</span>
              <button
                type="button"
                className="icon-button icon-button--danger"
                aria-label={`Remove ${carer.name}`}
                onClick={async () => {
                  await deleteCarer(carer.id);
                  await refresh();
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {showCustom ? (
        <form className="card add-form" onSubmit={addCustom}>
          <label className="field">
            <span className="field__label">Name</span>
            <input
              className="field__input"
              value={customName}
              maxLength={MAX_NAME_LENGTH}
              placeholder="e.g. Auntie Jo"
              autoFocus
              onChange={(event) => setCustomName(event.target.value)}
            />
          </label>

          <label className="field">
            <span className="field__label">Type</span>
            <select
              className="field__input"
              value={customType}
              onChange={(event) => setCustomType(event.target.value as CarerType)}
            >
              {CARER_TYPES.map((type) => (
                <option key={type} value={type}>
                  {CARER_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </label>

          <div className="add-form__actions">
            <button type="submit" className="button button--secondary" disabled={!customName.trim()}>
              Add carer
            </button>
            <button type="button" className="link-button" onClick={() => setShowCustom(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="dashed-button" onClick={() => setShowCustom(true)}>
          + Add custom carer
        </button>
      )}

      <button
        type="button"
        className="button button--primary"
        disabled={(carers.length === 0 && !customName.trim()) || busy}
        onClick={handleDone}
      >
        {busy ? 'Setting up…' : 'Start planning'}
      </button>
    </div>
  );
}
