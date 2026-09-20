import { useCallback, useEffect, useMemo, useState } from 'react';
import { createCarer, deleteCarer, listCarers, updateCarer } from '../db/carers';
import type { Carer, NewCarer } from '../db/types';
import { CARER_TYPE_LABELS, type CarerType } from '../utils/constants';

/** The order the carers screen shows its groups in. */
const GROUP_ORDER: CarerType[] = ['family', 'club', 'parent', 'playdate', 'other'];

export interface CarerGroup {
  type: CarerType;
  label: string;
  carers: Carer[];
}

export interface CarersState {
  carers: Carer[];
  /** Non-empty groups, in display order. */
  groups: CarerGroup[];
  loading: boolean;
  error: Error | null;
  reload: () => Promise<void>;
  add: (values: Omit<NewCarer, 'sort_order'>) => Promise<void>;
  edit: (id: number, values: Partial<NewCarer>) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

export function useCarers(): CarersState {
  const [carers, setCarers] = useState<Carer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    try {
      setCarers(await listCarers());
      setError(null);
    } catch (caught) {
      setError(caught as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect
    reload();
  }, [reload]);

  // Empty groups are dropped rather than shown as bare headings.
  const groups = useMemo(
    () =>
      GROUP_ORDER.map((type) => ({
        type,
        label: CARER_TYPE_LABELS[type],
        carers: carers.filter((carer) => carer.type === type),
      })).filter((group) => group.carers.length > 0),
    [carers],
  );

  const add = useCallback(
    async (values: Omit<NewCarer, 'sort_order'>) => {
      await createCarer(values);
      await reload();
    },
    [reload],
  );

  const edit = useCallback(
    async (id: number, values: Partial<NewCarer>) => {
      await updateCarer(id, values);
      await reload();
    },
    [reload],
  );

  const remove = useCallback(
    async (id: number) => {
      await deleteCarer(id);
      await reload();
    },
    [reload],
  );

  return { carers, groups, loading, error, reload, add, edit, remove };
}
