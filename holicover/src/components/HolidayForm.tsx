import { useState } from 'react';
import type { Holiday, NewHoliday } from '../db/types';
import type { HolidayMode } from '../utils/constants';
import { getHolidayDates } from '../utils/dates';

interface HolidayFormProps {
  /** Omitted when adding. */
  holiday?: Holiday;
  onSave: (values: NewHoliday) => Promise<void>;
  onDelete?: () => void;
  onCancel: () => void;
}

const MAX_NAME_LENGTH = 40;

export default function HolidayForm({ holiday, onSave, onDelete, onCancel }: HolidayFormProps) {
  const [name, setName] = useState(holiday?.name ?? '');
  const [startDate, setStartDate] = useState(holiday?.start_date ?? '');
  const [endDate, setEndDate] = useState(holiday?.end_date ?? '');
  const [mode, setMode] = useState<HolidayMode>(holiday?.mode ?? 'simple');
  const [excludeWeekends, setExcludeWeekends] = useState(holiday?.exclude_weekends !== 0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const trimmedName = name.trim();
  const complete = trimmedName !== '' && startDate !== '' && endDate !== '';

  // Show what the holiday will actually cover, so "excludes weekends" and a
  // back-to-front date range are obvious before saving rather than after.
  const plannedDays =
    complete && endDate >= startDate
      ? getHolidayDates({
          start_date: startDate,
          end_date: endDate,
          exclude_weekends: excludeWeekends ? 1 : 0,
        }).length
      : 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!complete) return;

    if (endDate < startDate) {
      setError('The end date is before the start date.');
      return;
    }
    if (plannedDays === 0) {
      setError('That range is all weekend. Turn off “Weekdays only” to include it.');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await onSave({
        name: trimmedName,
        start_date: startDate,
        end_date: endDate,
        mode,
        exclude_weekends: excludeWeekends ? 1 : 0,
      });
    } catch {
      setError('Could not save. Please try again.');
      setSaving(false);
    }
  }

  return (
    // noValidate: `min` on the end date is kept as a hint that constrains the
    // native picker, but without this the browser silently refuses to submit
    // when start is moved past an already-chosen end — the user taps Save,
    // nothing happens, and the explanation below never renders.
    <form className="holiday-form" noValidate onSubmit={handleSubmit}>
      <label className="field">
        <span className="field__label">Name</span>
        <input
          className="field__input"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          placeholder="e.g. October half term"
          autoFocus
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span className="field__label">Starts</span>
          <input
            type="date"
            className="field__input"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">Ends</span>
          <input
            type="date"
            className="field__input"
            value={endDate}
            min={startDate || undefined}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>
      </div>

      <fieldset className="field">
        <legend className="field__label">Planning detail</legend>
        <div className="segmented">
          <button
            type="button"
            className={mode === 'simple' ? 'segmented__option segmented__option--active' : 'segmented__option'}
            aria-pressed={mode === 'simple'}
            onClick={() => setMode('simple')}
          >
            Morning / afternoon
          </button>
          <button
            type="button"
            className={mode === 'detailed' ? 'segmented__option segmented__option--active' : 'segmented__option'}
            aria-pressed={mode === 'detailed'}
            onClick={() => setMode('detailed')}
          >
            Set times
          </button>
        </div>
      </fieldset>

      <label className="toggle-row">
        <span className="toggle-row__label">Weekdays only</span>
        <input
          type="checkbox"
          className="toggle-row__input"
          checked={excludeWeekends}
          onChange={(event) => setExcludeWeekends(event.target.checked)}
        />
      </label>

      {plannedDays > 0 && (
        <p className="form-hint">
          {plannedDays === 1 ? '1 day to plan' : `${plannedDays} days to plan`}
        </p>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="holiday-form__actions">
        <button type="button" className="button button--secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="button button--primary" disabled={!complete || saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {onDelete && (
        <button type="button" className="link-button link-button--danger" onClick={onDelete}>
          Delete holiday
        </button>
      )}
    </form>
  );
}
