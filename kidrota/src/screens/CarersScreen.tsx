import { useState } from 'react';
import CarerForm from '../components/CarerForm';
import CarerIcon from '../components/CarerIcon';
import Loading from '../components/Loading';
import ConfirmDialog from '../components/ConfirmDialog';
import Modal from '../components/Modal';
import { countCarerAssignments } from '../db/carers';
import type { Carer, NewCarer } from '../db/types';
import { useCarers } from '../hooks/useCarers';
import { CARER_TYPE_LABELS, CARER_TYPE_VARS } from '../utils/constants';
import { formatCost } from '../utils/status';

export default function CarersScreen() {
  const { groups, carers, loading, error, add, edit, remove } = useCarers();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Carer | null>(null);
  const [deleting, setDeleting] = useState<{ carer: Carer; assignments: number } | null>(null);

  async function handleSave(values: Omit<NewCarer, 'sort_order'>) {
    if (editing) {
      await edit(editing.id, values);
      setEditing(null);
    } else {
      await add(values);
      setAdding(false);
    }
  }

  async function askToDelete(carer: Carer) {
    setDeleting({ carer, assignments: await countCarerAssignments(carer.id) });
  }

  async function handleDelete() {
    if (!deleting) return;
    await remove(deleting.carer.id);
    setDeleting(null);
    setEditing(null);
  }

  return (
    <div className="screen">
      <header className="home-header">
        <div>
          <p className="page-eyebrow">KidRota</p>
          <h1 className="page-title">Carers</h1>
        </div>
        <button type="button" className="fab" aria-label="Add carer" onClick={() => setAdding(true)}>
          +
        </button>
      </header>

      {error && (
        <p className="form-error" role="alert">
          Could not load your carers.
        </p>
      )}

      {loading ? (
        <Loading />
      ) : carers.length === 0 ? (
        <div className="empty-state card">
          <p className="empty-state__title">No carers yet</p>
          <p className="empty-state__body">
            Add the people and clubs who help with childcare, then assign them to days.
          </p>
          <button type="button" className="button button--primary" onClick={() => setAdding(true)}>
            Add a carer
          </button>
        </div>
      ) : (
        groups.map((group) => (
          <section className="carer-group" key={group.type}>
            <h2 className="carer-group__title">{group.label}</h2>
            <ul className="entity-list">
              {group.carers.map((carer) => (
                <li className="entity-row" key={carer.id}>
                  <span
                    className="carer-card__icon"
                    style={{
                      background: carer.colour ?? CARER_TYPE_VARS[carer.type].bg,
                      color: CARER_TYPE_VARS[carer.type].text,
                    }}
                  >
                    <CarerIcon type={carer.type} />
                  </span>

                  <button
                    type="button"
                    className="entity-row__main"
                    onClick={() => setEditing(carer)}
                  >
                    <span className="entity-row__title">{carer.name}</span>
                    <span className="entity-row__sub">
                      {carer.short_name}
                      {carer.cost_per_day != null ? ` · ${formatCost(carer.cost_per_day)}` : ''}
                    </span>
                  </button>

                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Edit ${carer.name}`}
                    onClick={() => setEditing(carer)}
                  >
                    Edit
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {carers.length > 0 && (
        <button type="button" className="dashed-button add-below" onClick={() => setAdding(true)}>
          + Add carer
        </button>
      )}

      {adding && (
        <Modal title="Add carer" onClose={() => setAdding(false)}>
          <CarerForm onSave={handleSave} onCancel={() => setAdding(false)} />
        </Modal>
      )}

      {editing && !deleting && (
        <Modal title={`Edit ${CARER_TYPE_LABELS[editing.type].toLowerCase()} carer`} onClose={() => setEditing(null)}>
          <CarerForm
            carer={editing}
            onSave={handleSave}
            onDelete={() => askToDelete(editing)}
            onCancel={() => setEditing(null)}
          />
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete carer"
          message={
            deleting.assignments > 0
              ? `Delete ${deleting.carer.name}? They are booked for ${deleting.assignments} ${deleting.assignments === 1 ? 'slot' : 'slots'}, which will become gaps. This cannot be undone.`
              : `Delete ${deleting.carer.name}? This cannot be undone.`
          }
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
