import { useEffect, useState } from "react";

type StoredStateValidator<T> = (value: unknown) => T;

function readStored<T>(key: string, fallback: T, validate?: StoredStateValidator<T>): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;

    const parsed = JSON.parse(raw) as unknown;
    return validate ? validate(parsed) : (parsed as T);
  } catch {
    return fallback;
  }
}

export function useStoredState<T>(key: string, fallback: T, validate?: StoredStateValidator<T>) {
  const [value, setValue] = useState<T>(() => readStored(key, fallback, validate));

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Keep the app usable if localStorage is unavailable.
    }
  }, [key, value]);

  return [value, setValue] as const;
}
