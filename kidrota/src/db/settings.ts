import { getDb } from './database';
import { ONBOARDING_COMPLETE_KEY } from '../utils/constants';

/** Read a single app setting. */
export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.query<{ value: string | null }>(
    'SELECT value FROM app_settings WHERE key = ?',
    [key],
  );
  return rows[0]?.value ?? null;
}

/** Write an app setting, replacing any existing value. */
export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.run(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

export async function getAllSettings(): Promise<Record<string, string | null>> {
  const db = await getDb();
  const rows = await db.query<{ key: string; value: string | null }>(
    'SELECT key, value FROM app_settings',
  );
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

/** Has the user been through the setup wizard? Decides the launch route. */
export async function isOnboardingComplete(): Promise<boolean> {
  return (await getSetting(ONBOARDING_COMPLETE_KEY)) === 'true';
}

export async function setOnboardingComplete(): Promise<void> {
  await setSetting(ONBOARDING_COMPLETE_KEY, 'true');
}
