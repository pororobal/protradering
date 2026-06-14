import { useState } from "react";
import type { AppTab } from "./types";
import { useScreener } from "./hooks/useScreener";
import { useWatchlist } from "./hooks/useWatchlist";
import { useJournal } from "./hooks/useJournal";
import { Navigation } from "./components/Navigation";
import { ScanBar } from "./components/ScanBar";
import { DayTradingPanel } from "./components/DayTradingPanel";
import { MarketRegimePanel } from "./components/MarketRegimePanel";
import { SectorStrengthPanel } from "./components/SectorStrengthPanel";
import { WatchlistPanel } from "./components/WatchlistPanel";
import { JournalPanel } from "./components/JournalPanel";
import { StockDetailModal } from "./components/StockDetailModal";

export default function App() {
  const [tab, setTab] = useState<AppTab>("day");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const { data, loading, error, progress, scan } = useScreener();
  const watchlist = useWatchlist();
  const journal = useJournal();

  const selectedStock =
    data?.dayTrading.find((s) => s.symbol === selectedSymbol) ?? null;

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">Personal Alpha Engine</p>
          <h1>Ultimate Alpha Screener</h1>
        </div>
        <ScanBar
          loading={loading}
          error={error}
          progress={progress}
          timestamp={data?.timestamp}
          scannedCount={data?.scannedCount}
          cached={data?.cached}
          onScan={() => scan(false)}
          onRefresh={() => scan(true)}
        />
      </header>

      <Navigation tab={tab} onChange={setTab} />

      <main className="main">
        {tab === "day" && (
          <DayTradingPanel
            stocks={data?.dayTrading ?? []}
            loading={loading}
            onSelect={setSelectedSymbol}
            watchlist={watchlist}
          />
        )}
        {tab === "regime" && (
          <MarketRegimePanel regime={data?.marketRegime ?? null} loading={loading} />
        )}
        {tab === "sector" && (
          <SectorStrengthPanel sectors={data?.sectorStrength ?? []} loading={loading} />
        )}
        {tab === "watchlist" && <WatchlistPanel watchlist={watchlist} />}
        {tab === "journal" && <JournalPanel journal={journal} />}
      </main>

      {selectedSymbol && selectedStock && (
        <StockDetailModal
          symbol={selectedSymbol}
          stock={selectedStock}
          onClose={() => setSelectedSymbol(null)}
          watchlist={watchlist}
          journal={journal}
        />
      )}
    </div>
  );
}
