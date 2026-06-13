import { useState, useEffect, useCallback } from "react";
import type { WatchlistItem } from "../types";
import { WATCHLIST_KEY } from "../utils/constants";

export function useWatchlist() {
  const [items, setItems] = useState<WatchlistItem[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WATCHLIST_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      setItems([]);
    }
  }, []);

  const persist = useCallback((next: WatchlistItem[]) => {
    setItems(next);
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
  }, []);

  const add = useCallback(
    (symbol: string, name: string, source: WatchlistItem["source"] = "manual") => {
      if (items.some((i) => i.symbol === symbol)) return;
      persist([
        ...items,
        { symbol, name, addedAt: new Date().toISOString(), source },
      ]);
    },
    [items, persist]
  );

  const remove = useCallback(
    (symbol: string) => {
      persist(items.filter((i) => i.symbol !== symbol));
    },
    [items, persist]
  );

  const has = useCallback(
    (symbol: string) => items.some((i) => i.symbol === symbol),
    [items]
  );

  return { items, add, remove, has };
}
