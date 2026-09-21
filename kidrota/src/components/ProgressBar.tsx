import type { DayCoverage } from '../db/coverage';

interface ProgressBarProps {
  days: DayCoverage[];
  /** An untouched holiday shows grey throughout rather than all-red. */
  empty: boolean;
}

/**
 * One segment per day of the holiday: green covered, red gap.
 *
 * Deliberately two-tone. Carer-type colours live in the weekly grid; on the
 * home screen the only question is "is this day sorted or not".
 */
export default function ProgressBar({ days, empty }: ProgressBarProps) {
  return (
    <div className="progress" aria-hidden="true">
      {days.map((day) => (
        <span
          key={day.date}
          className={
            empty
              ? 'progress__seg'
              : day.covered
                ? 'progress__seg progress__seg--covered'
                : 'progress__seg progress__seg--gap'
          }
        />
      ))}
    </div>
  );
}
