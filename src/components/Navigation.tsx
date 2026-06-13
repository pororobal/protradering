import type { AppTab } from "../types";

const TABS: { id: AppTab; label: string }[] = [
  { id: "day", label: "Day Trading" },
  { id: "swing", label: "Swing Trading" },
  { id: "regime", label: "Market Regime" },
  { id: "sector", label: "Sector Strength" },
  { id: "watchlist", label: "Watchlist" },
  { id: "journal", label: "Journal" },
];

interface Props {
  tab: AppTab;
  onChange: (tab: AppTab) => void;
}

export function Navigation({ tab, onChange }: Props) {
  return (
    <nav className="nav">
      {TABS.map((t) => (
        <button
          key={t.id}
          className={`nav-btn ${tab === t.id ? "active" : ""}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
