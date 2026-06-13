export const CACHE_TTL_MS = 5 * 60 * 1000;

export const SECTOR_ETFS = [
  { name: "Semiconductor", etf: "SMH" },
  { name: "AI", etf: "BOTZ" },
  { name: "Cybersecurity", etf: "HACK" },
  { name: "Fintech", etf: "FINX" },
  { name: "Crypto", etf: "BITO" },
  { name: "Energy", etf: "XLE" },
  { name: "Nuclear", etf: "URA" },
  { name: "Defense", etf: "ITA" },
  { name: "Biotech", etf: "XBI" },
  { name: "Cloud", etf: "SKYY" },
] as const;

export const BENCHMARKS = ["SPY", "QQQ", "IWM"] as const;

export const WATCHLIST_KEY = "alpha_screener_watchlist";
export const JOURNAL_KEY = "alpha_screener_journal";
