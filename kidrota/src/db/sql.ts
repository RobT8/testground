import type { SqlValue } from './executor';

/**
 * Build the SET clause of an UPDATE from only the fields actually being
 * changed, so a partial edit never overwrites untouched columns with null.
 *
 * Column names come from the caller's fixed allowlist, never from user input,
 * so interpolating them into the SQL is safe; the values stay parameterised.
 *
 * Returns null when there is nothing to update.
 */
export function buildSetClause<T extends object>(
  changes: T,
  columns: readonly (keyof T & string)[],
): { clause: string; values: SqlValue[] } | null {
  const fields: string[] = [];
  const values: SqlValue[] = [];

  for (const column of columns) {
    const value = changes[column];
    if (value !== undefined) {
      fields.push(`${column} = ?`);
      values.push(value as SqlValue);
    }
  }

  return fields.length > 0 ? { clause: fields.join(', '), values } : null;
}
