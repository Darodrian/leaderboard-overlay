"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

export function useLocalCache<T>(
  key: string,
  fallback: T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(fallback);
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;

  useEffect(() => {
    setValue(readCache(key, fallbackRef.current));
  }, [key]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      writeCache(key, next);
    },
    [key],
  );

  return [value, update];
}
