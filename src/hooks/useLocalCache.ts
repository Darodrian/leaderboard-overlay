"use client";

import { useCallback, useSyncExternalStore } from "react";

export function readCache<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeCache<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable; keep running from memory.
  }
}

const listeners = new Set<() => void>();
const snapshots = new Map<string, { raw: string | null; value: unknown }>();

function readRaw(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function getSnapshot<T>(key: string, fallback: T): T {
  const raw = readRaw(key);
  const cached = snapshots.get(key);
  if (cached && cached.raw === raw) return cached.value as T;

  let value: T = fallback;
  if (raw) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      value = fallback;
    }
  }

  snapshots.set(key, { raw, value });
  return value;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useLocalCache<T>(
  key: string,
  fallback: T,
): [T, (value: T) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => getSnapshot(key, fallback),
    () => fallback,
  );

  const update = useCallback(
    (next: T) => {
      writeCache(key, next);
      emit();
    },
    [key],
  );

  return [value, update];
}
