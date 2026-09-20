import { useState } from 'react';
import type { Child, NewChild } from '../db/types';
import { CHILD_COLOURS } from '../utils/constants';

interface ChildFormProps {
  /** Omitted when adding. */
  child?: Child;
  onSave: (values: Omit<NewChild, 'sort_order'>) => Promise<void>;
  onDelete?: () => void;
  onCancel: () => void;
}

const MAX_NAME_LENGTH = 24;

export default function ChildForm({ child, onSave, onDelete, onCancel }: ChildFormProps) {
  const [name, setName] = useState(child?.name ?? '');
  const [colour, setColour] = useState(child?.colour ?? CHILD_COLOURS[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const isPreset = CHILD_COLOURS.includes(colour);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onSave({ name: trimmed, colour });
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
          placeholder="e.g. Ada"
          autoFocus
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <fieldset className="field">
        <legend className="field__label">Colour</legend>
        <div className="swatches">
          {CHILD_COLOURS.map((option) => (
            <button
              key={option}
              type="button"
              className={option === colour ? 'swatch swatch--selected' : 'swatch'}
              style={{ background: option }}
              aria-label={`Colour ${option}`}
              aria-pressed={option === colour}
              onClick={() => setColour(option)}
            />
          ))}

          {/* Any colour beyond the six presets, via the platform picker. */}
          <label
            className={isPreset ? 'swatch swatch--custom' : 'swatch swatch--custom swatch--selected'}
            style={isPreset ? undefined : { background: colour }}
          >
            <span className="swatch__plus" aria-hidden="true">
              {isPreset ? '+' : ''}
            </span>
            <input
              type="color"
              className="swatch__input"
              value={colour}
              aria-label="Custom colour"
              onChange={(event) => setColour(event.target.value)}
            />
          </label>
        </div>
      </fieldset>

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
          Delete child
        </button>
      )}
    </form>
  );
}
