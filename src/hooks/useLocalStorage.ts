import { useState, useEffect, useCallback } from "react";

export function useLocalStorage<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(initial);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setState(JSON.parse(raw));
    } catch {
      setState(initial);
    }
  }, [key, initial]);

  const persist = useCallback((next: T) => {
    setState(next);
    localStorage.setItem(key, JSON.stringify(next));
  }, [key]);

  return [state, persist] as const;
}
