import { useState, useEffect, useCallback } from "react";
import type { JournalEntry } from "../types";
import { JOURNAL_KEY } from "../utils/constants";

export function useJournal() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(JOURNAL_KEY);
      if (raw) setEntries(JSON.parse(raw));
    } catch {
      setEntries([]);
    }
  }, []);

  const persist = useCallback((next: JournalEntry[]) => {
    setEntries(next);
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(next));
  }, []);

  const save = useCallback(
    (symbol: string, note: string, tags: string[] = []) => {
      const existing = entries.find((e) => e.symbol === symbol);
      const now = new Date().toISOString();
      if (existing) {
        persist(
          entries.map((e) =>
            e.symbol === symbol ? { ...e, note, tags, updatedAt: now } : e
          )
        );
      } else {
        persist([
          ...entries,
          {
            id: crypto.randomUUID(),
            symbol,
            note,
            tags,
            createdAt: now,
            updatedAt: now,
          },
        ]);
      }
    },
    [entries, persist]
  );

  const remove = useCallback(
    (symbol: string) => {
      persist(entries.filter((e) => e.symbol !== symbol));
    },
    [entries, persist]
  );

  const get = useCallback(
    (symbol: string) => entries.find((e) => e.symbol === symbol),
    [entries]
  );

  return { entries, save, remove, get };
}
