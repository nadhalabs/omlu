"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

type CacheEntry<T> = {
  data?: T;
  error?: Error;
  updatedAt: number;
  promise?: Promise<T>;
  listeners: Set<() => void>;
};

type QueryOptions = {
  staleTime?: number;
  enabled?: boolean;
};

const cache = new Map<string, CacheEntry<unknown>>();

function entryFor<T>(key: string): CacheEntry<T> {
  let entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) {
    entry = { updatedAt: 0, listeners: new Set() };
    cache.set(key, entry as CacheEntry<unknown>);
  }
  return entry;
}

function notify(entry: CacheEntry<unknown>) {
  entry.listeners.forEach((listener) => listener());
}

async function runQuery<T>(
  key: string,
  queryFn: () => Promise<T>,
  force = false,
): Promise<T> {
  const entry = entryFor<T>(key);
  if (entry.promise) return entry.promise;
  if (!force && entry.data !== undefined) return entry.data;

  entry.promise = queryFn()
    .then((data) => {
      entry.data = data;
      entry.error = undefined;
      entry.updatedAt = Date.now();
      return data;
    })
    .catch((reason: unknown) => {
      entry.error = reason instanceof Error ? reason : new Error("Request failed.");
      throw reason;
    })
    .finally(() => {
      entry.promise = undefined;
      notify(entry as CacheEntry<unknown>);
    });
  notify(entry as CacheEntry<unknown>);
  return entry.promise;
}

export function useCachedQuery<T>(
  key: string,
  queryFn: () => Promise<T>,
  options: QueryOptions = {},
) {
  const { staleTime = 30_000, enabled = true } = options;

  const subscribe = useCallback(
    (listener: () => void) => {
      const current = entryFor<T>(key);
      current.listeners.add(listener);
      return () => current.listeners.delete(listener);
    },
    [key],
  );
  const getSnapshot = useCallback(() => {
    const current = entryFor<T>(key);
    return `${current.updatedAt}:${Boolean(current.promise)}:${current.error?.message ?? ""}`;
  }, [key]);
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const refetch = useCallback(
    () => runQuery(key, queryFn, true),
    [key, queryFn],
  );

  useEffect(() => {
    if (!enabled) return;
    const current = entryFor<T>(key);
    const stale = Date.now() - current.updatedAt >= staleTime;
    if (current.data === undefined || stale) {
      void runQuery(key, queryFn, true).catch(() => undefined);
    }
  }, [enabled, key, queryFn, staleTime]);

  const current = entryFor<T>(key);
  return {
    data: current.data,
    error: current.error,
    isLoading: enabled && current.data === undefined,
    isRefreshing: enabled && current.data !== undefined && Boolean(current.promise),
    refetch,
  };
}

export function setCachedQueryData<T>(
  key: string,
  updater: T | ((current: T | undefined) => T),
) {
  const entry = entryFor<T>(key);
  entry.data =
    typeof updater === "function"
      ? (updater as (current: T | undefined) => T)(entry.data)
      : updater;
  entry.updatedAt = Date.now();
  entry.error = undefined;
  notify(entry as CacheEntry<unknown>);
}

export function invalidateQueries(prefix: string) {
  for (const [key, entry] of cache) {
    if (key === prefix || key.startsWith(`${prefix}:`)) {
      entry.updatedAt = 0;
      notify(entry);
    }
  }
}

export const queryKeys = {
  dashboard: "dashboard",
  staffMe: "staff-me",
  staff: "staff",
  tables: "tables",
  menu: "menu",
  categories: "categories",
  kitchenOrders: (restaurantSlug: string) => `orders:kitchen:${restaurantSlug}`,
};
