/**
 * Schema migrations, applied in order and tracked with SQLite's `user_version`.
 *
 * Never edit a migration that has shipped — a user's device has already run it.
 * Add a new entry to the end of the array instead.
 */
export const MIGRATIONS: string[] = [
  // v1 — initial schema
  `
  CREATE TABLE IF NOT EXISTS holidays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'simple',
    exclude_weekends INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS children (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    colour TEXT NOT NULL DEFAULT '#378ADD',
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS carers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'other',
    cost_per_day REAL,
    colour TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    holiday_id INTEGER NOT NULL,
    child_id INTEGER NOT NULL,
    carer_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    period TEXT,
    start_time TEXT,
    end_time TEXT,
    notes TEXT,
    cost REAL,
    FOREIGN KEY (holiday_id) REFERENCES holidays(id) ON DELETE CASCADE,
    FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
    FOREIGN KEY (carer_id) REFERENCES carers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_assignments_date
    ON assignments(holiday_id, child_id, date);

  -- Simple mode allows exactly one carer per child per slot, which is what the
  -- gap detection assumes. Detailed-mode rows have period IS NULL and are
  -- excluded, so a child can have many time slots in one day.
  CREATE UNIQUE INDEX IF NOT EXISTS idx_assignments_slot
    ON assignments(holiday_id, child_id, date, period)
    WHERE period IS NOT NULL;
  `,
];

/** Schema version this build of the app expects. */
export const SCHEMA_VERSION = MIGRATIONS.length;
