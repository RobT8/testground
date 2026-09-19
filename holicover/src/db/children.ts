import { getDb } from './database';
import { buildSetClause } from './sql';
import type { Child, NewChild } from './types';

export async function listChildren(): Promise<Child[]> {
  const db = await getDb();
  return db.query<Child>('SELECT * FROM children ORDER BY sort_order, id');
}

export async function getChild(id: number): Promise<Child | null> {
  const db = await getDb();
  const rows = await db.query<Child>('SELECT * FROM children WHERE id = ?', [id]);
  return rows[0] ?? null;
}

export async function countChildren(): Promise<number> {
  const db = await getDb();
  const rows = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM children');
  return rows[0]?.n ?? 0;
}

/** Add a child. Omitting `sort_order` appends to the end of the list. */
export async function createChild(child: Omit<NewChild, 'sort_order'> & { sort_order?: number }): Promise<number> {
  const db = await getDb();
  const sortOrder = child.sort_order ?? (await nextSortOrder());
  const result = await db.run(
    'INSERT INTO children (name, colour, sort_order) VALUES (?, ?, ?)',
    [child.name, child.colour, sortOrder],
  );
  return result.lastId;
}

export async function updateChild(id: number, changes: Partial<NewChild>): Promise<void> {
  const update = buildSetClause(changes, ['name', 'colour', 'sort_order']);
  if (!update) return;

  const db = await getDb();
  await db.run(`UPDATE children SET ${update.clause} WHERE id = ?`, [...update.values, id]);
}

/** Delete a child. Their assignments cascade away with them. */
export async function deleteChild(id: number): Promise<void> {
  const db = await getDb();
  await db.run('DELETE FROM children WHERE id = ?', [id]);
}

/** Persist a drag-to-reorder, given the child ids in their new order. */
export async function reorderChildren(orderedIds: number[]): Promise<void> {
  const db = await getDb();
  for (let i = 0; i < orderedIds.length; i++) {
    await db.run('UPDATE children SET sort_order = ? WHERE id = ?', [i, orderedIds[i]]);
  }
}

async function nextSortOrder(): Promise<number> {
  const db = await getDb();
  const rows = await db.query<{ next: number }>(
    'SELECT COALESCE(MAX(sort_order) + 1, 0) AS next FROM children',
  );
  return rows[0]?.next ?? 0;
}
