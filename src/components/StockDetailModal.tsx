import { useEffect, useRef, useState } from "react";
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

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

export function StockDetailModal({ symbol, stock, onClose, watchlist, journal }: Props) {
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const source = "rvol" in stock && "gapUp" in stock ? "day" : "swing";
  const maxScore = "maxScore" in stock ? stock.maxScore : 300;

  // AI 분석 상태
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    const existing = journal.get(symbol);
    if (noteRef.current && existing) noteRef.current.value = existing.note;
  }, [symbol, journal]);

  const handleAIAnalysis = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const response = await fetch(`${API_BASE}/api/ai/analyze-stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          stock: {
            name: stock.name,
            price: stock.price,
            score: stock.score,
            sector: stock.sector,
            industry: stock.industry,
            tradePlan: stock.tradePlan,
          },
          analysisType: source, // "day" or "swing"
        }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "분석 요청 실패");
      }
      const data = await response.json();
      setAiAnalysis(data.analysis);
    } catch (err: any) {
      console.error("AI 분석 오류:", err);
      setAiError(err.message || "AI 분석 중 오류가 발생했습니다.");
    } finally {
      setAiLoading(false);
    }
  };

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

          {/* 매매 플랜 패널 */}
          {stock.tradePlan && <TradePlanPanel plan={stock.tradePlan} variant="detail" />}

          {/* 점수 세부 내역 */}
          <ScoreBreakdownBar breakdown={stock.breakdown} maxScore={maxScore} />

          {/* 차트 */}
          <TradingViewChart symbol={symbol} />

          {/* AI 분석 영역 */}
          <div className="ai-section">
            <button
              className="btn primary ai-btn"
              onClick={handleAIAnalysis}
              disabled={aiLoading}
            >
              {aiLoading ? "🤖 AI 분석 중..." : "🤖 AI 매매 아이디어 보기"}
            </button>

            {aiLoading && (
              <div className="ai-loading">
                <div className="spinner"></div>
                <p>Gemini 모델이 분석하고 있습니다...</p>
              </div>
            )}

            {aiError && (
              <div className="ai-error">
                ⚠️ {aiError}
              </div>
            )}

            {aiAnalysis && !aiLoading && (
              <div className="ai-result">
                <h4>📊 AI 종합 분석</h4>
                <div className="ai-text">{aiAnalysis}</div>
              </div>
            )}
          </div>

          {/* 메모 및 관심종목 */}
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
