import { useState } from 'react';
import ChildAvatar from '../components/ChildAvatar';
import ChildForm from '../components/ChildForm';
import ConfirmDialog from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import { countChildAssignments } from '../db/children';
import type { Child, NewChild } from '../db/types';
import { useChildren } from '../hooks/useChildren';

export default function ChildrenScreen() {
  const { children, loading, error, add, edit, remove, move } = useChildren();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Child | null>(null);
  const [deleting, setDeleting] = useState<{ child: Child; assignments: number } | null>(null);

  async function handleSave(values: Omit<NewChild, 'sort_order'>) {
    if (editing) {
      await edit(editing.id, values);
      setEditing(null);
    } else {
      await add(values);
      setAdding(false);
    }
  }

  /** Count their booked cover first, so the warning can be specific. */
  async function askToDelete(child: Child) {
    setDeleting({ child, assignments: await countChildAssignments(child.id) });
  }

  async function handleDelete() {
    if (!deleting) return;
    await remove(deleting.child.id);
    setDeleting(null);
    setEditing(null);
  }

  return (
    <div className="screen">
      <header className="home-header">
        <div>
          <p className="page-eyebrow">HoliCover</p>
          <h1 className="page-title">Children</h1>
        </div>
        <button type="button" className="fab" aria-label="Add child" onClick={() => setAdding(true)}>
          +
        </button>
      </header>

      {error && (
        <p className="form-error" role="alert">
          Could not load your children.
        </p>
      )}

      {loading ? (
        <p className="placeholder-note">Loading…</p>
      ) : children.length === 0 ? (
        <div className="empty-state card">
          <p className="empty-state__title">No children yet</p>
          <p className="empty-state__body">Add a child to start planning their holiday cover.</p>
          <button type="button" className="button button--primary" onClick={() => setAdding(true)}>
            Add a child
          </button>
        </div>
      ) : (
        <ul className="entity-list">
          {children.map((child, index) => (
            <li className="entity-row" key={child.id}>
              <ChildAvatar name={child.name} colour={child.colour} />
              <button
                type="button"
                className="entity-row__main"
                onClick={() => setEditing(child)}
              >
                {child.name}
              </button>

              {/* Explicit controls rather than drag: reliable under a thumb,
                  and reachable by assistive technology. */}
              <span className="reorder">
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Move ${child.name} up`}
                  disabled={index === 0}
                  onClick={() => move(child.id, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Move ${child.name} down`}
                  disabled={index === children.length - 1}
                  onClick={() => move(child.id, 1)}
                >
                  ↓
                </button>
              </span>

              <button
                type="button"
                className="icon-button"
                aria-label={`Edit ${child.name}`}
                onClick={() => setEditing(child)}
              >
                Edit
              </button>
            </li>
          ))}
        </ul>
      )}

      {children.length > 0 && (
        <button type="button" className="dashed-button add-below" onClick={() => setAdding(true)}>
          + Add child
        </button>
      )}

      {adding && (
        <Modal title="Add child" onClose={() => setAdding(false)}>
          <ChildForm onSave={handleSave} onCancel={() => setAdding(false)} />
        </Modal>
      )}

      {editing && !deleting && (
        <Modal title="Edit child" onClose={() => setEditing(null)}>
          <ChildForm
            child={editing}
            onSave={handleSave}
            onDelete={() => askToDelete(editing)}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete child"
          message={
            deleting.assignments > 0
              ? `Delete ${deleting.child.name}? This also removes their ${deleting.assignments} booked ${deleting.assignments === 1 ? 'slot' : 'slots'} across all holidays. This cannot be undone.`
              : `Delete ${deleting.child.name}? This cannot be undone.`
          }
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
