import { useState } from 'react';
import type { RepeatRule } from '../db/assignments';
import { dayOfWeek } from '../utils/dates';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PICKABLE = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun' },
];

interface RepeatChipsProps {
  /** The day being copied from. */
  date: string;
  /** Nothing to repeat until something is booked. */
  disabled: boolean;
  onRepeat: (rule: RepeatRule, customDays?: number[]) => Promise<void>;
}

/**
 * Copy this day's plan onto other days.
 *
 * The brief's biggest time-saver: most holiday weeks are the same shape every
 * day, so this turns a fortnight of planning into one day plus a tap.
 */
export default function RepeatChips({ date, disabled, onRepeat }: RepeatChipsProps) {
  const [picking, setPicking] = useState(false);
  const [days, setDays] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const weekdayName = WEEKDAY_NAMES[dayOfWeek(date)];

  async function run(rule: RepeatRule, customDays?: number[]) {
    setBusy(true);
    setDone(null);
    try {
      await onRepeat(rule, customDays);
      setDone('Copied across');
      setPicking(false);
      setDays([]);
    } finally {
      setBusy(false);
    }
  }

  function toggleDay(day: number) {
    setDays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day],
    );
  }

  return (
    <section className="repeat card">
      <h2 className="repeat__title">Apply to more days</h2>
      <p className="repeat__hint">
        {disabled
          ? 'Assign someone above first, then copy this day across.'
          : 'Copies everyone’s cover on this day to the days you choose.'}
      </p>

      <div className="chips">
        <button type="button" className="chip" disabled={disabled || busy} onClick={() => run('daily')}>
          Every day
        </button>
        <button type="button" className="chip" disabled={disabled || busy} onClick={() => run('weekly')}>
          Every {weekdayName}
        </button>
        <button type="button" className="chip" disabled={disabled || busy} onClick={() => run('weekdays')}>
          Mon–Fri
        </button>
        <button
          type="button"
          className={picking ? 'chip chip--selected' : 'chip'}
          disabled={disabled || busy}
          aria-pressed={picking}
          onClick={() => setPicking((current) => !current)}
        >
          Pick days
        </button>
      </div>

      {picking && (
        <div className="repeat__picker">
          <div className="chips">
            {PICKABLE.map((option) => (
              <button
                key={option.day}
                type="button"
                className={days.includes(option.day) ? 'chip chip--selected' : 'chip'}
                aria-pressed={days.includes(option.day)}
                onClick={() => toggleDay(option.day)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="button button--secondary"
            disabled={days.length === 0 || busy}
            onClick={() => run('custom', days)}
          >
            Copy to {days.length === 0 ? 'selected days' : `${days.length} day${days.length === 1 ? '' : 's'}`}
          </button>
        </div>
      )}

      {done && <p className="repeat__done">{done}</p>}
    </section>
  );
}
