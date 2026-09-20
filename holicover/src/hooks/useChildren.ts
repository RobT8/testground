import { useCallback, useEffect, useState } from 'react';
import {
  createChild,
  deleteChild,
  listChildren,
  reorderChildren,
  updateChild,
} from '../db/children';
import type { Child, NewChild } from '../db/types';

export interface ChildrenState {
  children: Child[];
  loading: boolean;
  error: Error | null;
  reload: () => Promise<void>;
  add: (values: Omit<NewChild, 'sort_order'>) => Promise<void>;
  edit: (id: number, values: Partial<NewChild>) => Promise<void>;
  remove: (id: number) => Promise<void>;
  /** Move one child up or down the list, persisting the new order. */
  move: (id: number, direction: -1 | 1) => Promise<void>;
}

export function useChildren(): ChildrenState {
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    try {
      setChildren(await listChildren());
      setError(null);
    } catch (caught) {
      setError(caught as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // External-system synchronisation; reload() is async, so its state updates
    // land in a later microtask.
    // eslint-disable-next-line react/set-state-in-effect
    reload();
  }, [reload]);

  const add = useCallback(
    async (values: Omit<NewChild, 'sort_order'>) => {
      await createChild(values);
      await reload();
    },
    [reload],
  );

  const edit = useCallback(
    async (id: number, values: Partial<NewChild>) => {
      await updateChild(id, values);
      await reload();
    },
    [reload],
  );

  const remove = useCallback(
    async (id: number) => {
      await deleteChild(id);
      await reload();
    },
    [reload],
  );

  const move = useCallback(
    async (id: number, direction: -1 | 1) => {
      const index = children.findIndex((child) => child.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= children.length) return;

      const order = children.map((child) => child.id);
      [order[index], order[target]] = [order[target], order[index]];
      await reorderChildren(order);
      await reload();
    },
    [children, reload],
  );

  return { children, loading, error, reload, add, edit, remove, move };
}
