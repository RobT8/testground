import { useEffect, useState } from 'react';
import { getDb } from '../db/database';
import { isOnboardingComplete } from '../db/settings';

export interface DatabaseState {
  ready: boolean;
  /** Null until the database is open; decides the launch route. */
  onboarded: boolean | null;
  error: Error | null;
}

/**
 * Open the database and run migrations once, on app start.
 *
 * Everything else in the app assumes the schema exists, so nothing renders
 * until this resolves.
 */
export function useDatabase(): DatabaseState {
  const [state, setState] = useState<DatabaseState>({
    ready: false,
    onboarded: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await getDb();
        const onboarded = await isOnboardingComplete();
        if (!cancelled) setState({ ready: true, onboarded, error: null });
      } catch (error) {
        if (!cancelled) {
          setState({ ready: false, onboarded: null, error: error as Error });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
