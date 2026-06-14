import { useEffect, useRef } from "react";
import type { DayTradeResult, SwingTradeResult } from "../types";
import { formatPrice, formatPct } from "../utils/format";
import { TradingViewChart } from "./TradingViewChart";
import { ScoreBreakdownBar } from "./ScoreBreakdownBar";
import { TradePlanPanel } from "./TradePlanPanel";

interface Props {
  symbol: string;
  stock: DayTradeResult | SwingTradeResult;
  onClose: () => void;
  watchlist: { add: (s: string, n: string, src: "day" | "swing") => void; has: (s: string) => boolean };
  journal: { save: (s: string, note: string) => void; get: (s: string) => { note: string } | undefined };
}

export function StockDetailModal({ symbol, stock, onClose, watchlist, journal }: Props) {
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const source = "rvol" in stock && "gapUp" in stock ? "day" : "swing";
  const maxScore = "maxScore" in stock ? stock.maxScore : 300;

  useEffect(() => {
    const existing = journal.get(symbol);
    if (noteRef.current && existing) noteRef.current.value = existing.note;
  }, [symbol, journal]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{symbol}</h2>
            <p className="muted">{stock.name}</p>
          </div>
          <button className="btn ghost" onClick={onClose}>닫기</button>
        </div>
        <div className="modal-body">
          <div className="modal-stats">
            <span>{formatPrice(stock.price)}</span>
            <span className="score-badge">{stock.score}/{maxScore}</span>
            {"dayChange" in stock && (
              <span className={stock.dayChange >= 0 ? "up" : "down"}>{formatPct(stock.dayChange)}</span>
            )}
            {"return3m" in stock && <span className="up">{formatPct(stock.return3m)} 3M</span>}
            {stock.state && <span className="tag accent">{stock.state}</span>}
          </div>
          {stock.tradePlan && <TradePlanPanel plan={stock.tradePlan} variant="detail" />}
          <ScoreBreakdownBar breakdown={stock.breakdown} maxScore={maxScore} />
          <TradingViewChart symbol={symbol} />
          <div className="journal-inline">
            <textarea ref={noteRef} placeholder="트레이딩 메모..." rows={3} />
            <div className="modal-actions">
              <button
                className="btn tiny"
                onClick={() => watchlist.add(symbol, stock.name, source)}
              >
                {watchlist.has(symbol) ? "★ Watchlist" : "☆ Watchlist"}
              </button>
              <button
                className="btn primary"
                onClick={() => journal.save(symbol, noteRef.current?.value ?? "")}
              >
                메모 저장
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
