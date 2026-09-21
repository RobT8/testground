import type { CarerType } from '../utils/constants';
import { getDb } from './database';
import { buildSetClause } from './sql';
import type { Carer, NewCarer } from './types';

export async function listCarers(): Promise<Carer[]> {
  const db = await getDb();
  return db.query<Carer>('SELECT * FROM carers ORDER BY sort_order, id');
}

export async function getCarer(id: number): Promise<Carer | null> {
  const db = await getDb();
  const rows = await db.query<Carer>('SELECT * FROM carers WHERE id = ?', [id]);
  return rows[0] ?? null;
}

/** Carers grouped by type, for the grouped list on the Carers screen. */
export async function listCarersByType(): Promise<Record<CarerType, Carer[]>> {
  const carers = await listCarers();
  const grouped: Record<CarerType, Carer[]> = {
    family: [],
    club: [],
    parent: [],
    playdate: [],
    other: [],
  };
  for (const carer of carers) grouped[carer.type].push(carer);
  return grouped;
}

export async function createCarer(
  carer: Omit<NewCarer, 'sort_order' | 'cost_per_day' | 'colour'> &
    Partial<Pick<NewCarer, 'sort_order' | 'cost_per_day' | 'colour'>>,
): Promise<number> {
  const db = await getDb();
  const sortOrder = carer.sort_order ?? (await nextSortOrder());
  const result = await db.run(
    'INSERT INTO carers (name, short_name, type, cost_per_day, colour, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
    [
      carer.name,
      carer.short_name,
      carer.type,
      carer.cost_per_day ?? null,
      carer.colour ?? null,
      sortOrder,
    ],
  );
  return result.lastId;
}

/** Insert several carers in order — used by the onboarding preset picker. */
export async function createCarers(
  carers: (Omit<NewCarer, 'sort_order' | 'cost_per_day' | 'colour'> &
    Partial<Pick<NewCarer, 'cost_per_day' | 'colour'>>)[],
): Promise<number[]> {
  const ids: number[] = [];
  for (const carer of carers) ids.push(await createCarer(carer));
  return ids;
}

export async function updateCarer(id: number, changes: Partial<NewCarer>): Promise<void> {
  const update = buildSetClause(changes, [
    'name', 'short_name', 'type', 'cost_per_day', 'colour', 'sort_order',
  ]);
  if (!update) return;

  const db = await getDb();
  await db.run(`UPDATE carers SET ${update.clause} WHERE id = ?`, [...update.values, id]);
}

/** Delete a carer. Their assignments cascade away, reopening those slots as gaps. */
export async function deleteCarer(id: number): Promise<void> {
  const db = await getDb();
  await db.run('DELETE FROM carers WHERE id = ?', [id]);
}

/**
 * How many assignments reference this carer. The Carers screen warns before
 * deleting a carer who is already booked in somewhere.
 */
export async function countCarerAssignments(id: number): Promise<number> {
  const db = await getDb();
  const rows = await db.query<{ n: number }>(
    'SELECT COUNT(*) AS n FROM assignments WHERE carer_id = ?',
    [id],
  );
  return rows[0]?.n ?? 0;
}

async function nextSortOrder(): Promise<number> {
  const db = await getDb();
  const rows = await db.query<{ next: number }>(
    'SELECT COALESCE(MAX(sort_order) + 1, 0) AS next FROM carers',
  );
  return rows[0]?.next ?? 0;
}
