import { useEffect, useState } from 'react';
import ChildAvatar from '../../components/ChildAvatar';
import { createChild, deleteChild, listChildren, updateChild } from '../../db/children';
import type { Child } from '../../db/types';
import { CHILD_COLOURS } from '../../utils/constants';

const MAX_NAME_LENGTH = 24;

interface ChildrenStepProps {
  onNext: () => void;
}

/**
 * Add the children being planned for.
 *
 * Children are written to the database as they are added rather than held in
 * memory until the end, so closing the app mid-setup loses nothing — the step
 * reloads what is already there.
 */
export default function ChildrenStep({ onNext }: ChildrenStepProps) {
  const [children, setChildren] = useState<Child[]>([]);
  const [name, setName] = useState('');
  const [colour, setColour] = useState(CHILD_COLOURS[0]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listChildren().then((existing) => {
      setChildren(existing);
      // Offer a colour not already taken, so siblings look distinct by default.
      setColour(nextFreeColour(existing));
      setLoading(false);
    });
  }, []);

  async function refresh() {
    const updated = await listChildren();
    setChildren(updated);
    return updated;
  }

  /** Save whatever is typed in the form. Shared by the add button and Next. */
  async function commitPending() {
    const trimmed = name.trim();
    if (!trimmed) return;

    if (editingId === null) {
      await createChild({ name: trimmed, colour });
    } else {
      await updateChild(editingId, { name: trimmed, colour });
      setEditingId(null);
    }

    const updated = await refresh();
    setName('');
    setColour(nextFreeColour(updated));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await commitPending();
  }

  /**
   * A name typed but not yet added is intent to include that child. Next sits
   * outside the add form, so without this it would be discarded in silence and
   * the child would simply never appear.
   */
  async function handleNext() {
    await commitPending();
    onNext();
  }

  function startEditing(child: Child) {
    setEditingId(child.id);
    setName(child.name);
    setColour(child.colour);
  }

  function cancelEditing() {
    setEditingId(null);
    setName('');
    setColour(nextFreeColour(children));
  }

  async function handleDelete(child: Child) {
    await deleteChild(child.id);
    if (editingId === child.id) cancelEditing();
    await refresh();
  }

  if (loading) return <p className="placeholder-note">Loading…</p>;

  return (
    <div className="step">
      <header className="step__header">
        <h1 className="step__title">Who are your children?</h1>
        <p className="step__subtitle">You can always add more later</p>
      </header>

      {children.length > 0 && (
        <ul className="entity-list">
          {children.map((child) => (
            <li className="entity-row" key={child.id}>
              <ChildAvatar name={child.name} colour={child.colour} />
              <span className="entity-row__name">{child.name}</span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Edit ${child.name}`}
                onClick={() => startEditing(child)}
              >
                Edit
              </button>
              <button
                type="button"
                className="icon-button icon-button--danger"
                aria-label={`Remove ${child.name}`}
                onClick={() => handleDelete(child)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="card add-form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field__label">Name</span>
          <input
            className="field__input"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            placeholder="e.g. Ada"
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
          </div>
        </fieldset>

        <div className="add-form__actions">
          <button type="submit" className="button button--secondary" disabled={!name.trim()}>
            {editingId === null ? 'Add child' : 'Save changes'}
          </button>
          {editingId !== null && (
            <button type="button" className="link-button" onClick={cancelEditing}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <button
        type="button"
        className="button button--primary"
        disabled={children.length === 0 && !name.trim()}
        onClick={handleNext}
      >
        Next
      </button>
    </div>
  );
}

/** First preset colour not already used, falling back to the first. */
function nextFreeColour(existing: Child[]): string {
  const used = new Set(existing.map((child) => child.colour));
  return CHILD_COLOURS.find((colour) => !used.has(colour)) ?? CHILD_COLOURS[0];
}
