import type { Carer } from '../db/types';
import { CARER_TYPE_VARS } from '../utils/constants';

interface SlotCellProps {
  /** "AM", "PM", or a time like "09:00". */
  label: string;
  carer: Carer | null;
  onClick: () => void;
  /** Describes the cell for screen readers, which cannot see the colour. */
  accessibleLabel: string;
}

/**
 * One slot in the weekly grid.
 *
 * A filled cell takes its colour from the carer's type; an empty one is red
 * with a dashed border and a "?", so gaps read as unfinished business rather
 * than blank space.
 */
export default function SlotCell({ label, carer, onClick, accessibleLabel }: SlotCellProps) {
  const palette = CARER_TYPE_VARS[carer ? carer.type : 'gap'];

  return (
    <button
      type="button"
      className={carer ? 'slot' : 'slot slot--gap'}
      style={{
        // A Pro custom colour overrides the type default when set.
        background: carer?.colour ?? palette.bg,
        color: carer?.colour ? undefined : palette.text,
      }}
      onClick={onClick}
      aria-label={accessibleLabel}
    >
      <span className="slot__period">{label}</span>
      <span className="slot__carer">{carer ? carer.short_name : '?'}</span>
    </button>
  );
}
