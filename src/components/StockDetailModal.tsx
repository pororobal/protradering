// src/components/StockDetailModal.tsx

import { useEffect, useRef, useState } from "react";
import type { DayTradeResult, SwingTradeResult } from "../types";
import { formatPrice, formatPct } from "../utils/format";
import { TradingViewChart } from "./TradingViewChart";
import { ScoreBreakdownBar } from "./ScoreBreakdownBar";
import { TradePlanPanel } from "./TradePlanPanel";
import { fetchAIAnalysis } from "../services/api";

interface Props {
  symbol: string;
  stock: DayTradeResult | SwingTradeResult;
  onClose: () => void;
  watchlist: { add: (s: string, n: string, src: "day" | "swing") => void; has: (s: string) => boolean };
  journal: { save: (s: string, note: string) => void; get: (s: string) => { note: string } | undefined };
}

// 차트 데이터 수집 함수
const collectChartData = (stock: any) => {
  const currentPrice = stock.price;
  
  return {
    currentPrice,
    ma20: stock.ma20 || null,
    ma50: stock.ma50 || null,
    ma200: stock.ma200 || null,
    rsi: stock.rsi14 || stock.rsi || null,
    macdSignal: stock.macdSignal || null,
    volume: stock.volume || null,
    avgVolume: stock.avgVolume20 || stock.avgVolume || null,
    high52w: stock.high52w || null,
    low52w: stock.low52w || null,
    bbUpper: stock.bbUpper || null,
    bbLower: stock.bbLower || null,
    bbPosition: stock.bbPosition || null,
    // 지지/저항 레벨 계산 (간단한 로직)
    support1: stock.support1 || (currentPrice * 0.95),
    support2: stock.support2 || (currentPrice * 0.92),
    resistance1: stock.resistance1 || (currentPrice * 1.05),
    resistance2: stock.resistance2 || (currentPrice * 1.08),
  };
};

export function StockDetailModal({ symbol, stock, onClose, watchlist, journal }: Props) {
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const source = "rvol" in stock && "gapUp" in stock ? "day" : "swing";
  const maxScore = "maxScore" in stock ? stock.maxScore : 300;

  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [lastRequestTime, setLastRequestTime] = useState(0);

  useEffect(() => {
    const existing = journal.get(symbol);
    if (noteRef.current && existing) noteRef.current.value = existing.note;
  }, [symbol, journal]);

  const handleAIAnalysis = async () => {
    // 30초 간격 제한 (무료 모델 429 방지)
    const now = Date.now();
    if (now - lastRequestTime < 30000) {
      setAiError(`⏱️ 너무 자주 요청했습니다. ${Math.ceil((30000 - (now - lastRequestTime)) / 1000)}초 후 다시 시도해주세요.`);
      return;
    }
    setLastRequestTime(now);
    
    setAiLoading(true);
    setAiError(null);
    
    try {
      // 차트 데이터 수집
      const chartData = collectChartData(stock);
      
      const result = await fetchAIAnalysis(symbol, {
        name: stock.name,
        price: stock.price,
        score: stock.score,
        sector: stock.sector,
        industry: stock.industry,
        tradePlan: stock.tradePlan,
      }, source, chartData);
      
      setAiAnalysis(result.analysis);
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

          {stock.tradePlan && <TradePlanPanel plan={stock.tradePlan} variant="detail" />}
          <ScoreBreakdownBar breakdown={stock.breakdown} maxScore={maxScore} />
          <TradingViewChart symbol={symbol} />

          {/* AI 분석 결과 영역 */}
          {aiLoading && (
            <div className="ai-loading" style={{ padding: "1rem", marginTop: "1rem" }}>
              <div className="spinner"></div>
              <p>🤖 AI가 차트를 분석하고 있습니다...</p>
              <small className="muted">무료 모델 특성상 10-20초 소요될 수 있습니다</small>
            </div>
          )}

          {aiError && (
            <div className="ai-error" style={{ padding: "1rem", marginTop: "1rem", textAlign: "center" }}>
              ⚠️ {aiError}
            </div>
          )}

          {aiAnalysis && !aiLoading && (
            <div className="ai-result" style={{ marginTop: "1rem" }}>
              <div className="ai-text" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                {aiAnalysis}
              </div>
            </div>
          )}

          {/* 메모 입력창 + AI 버튼 나란히 배치 */}
          <div className="journal-ai-row" style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", alignItems: "flex-start" }}>
            <div className="journal-inline" style={{ flex: 7 }}>
              <textarea ref={noteRef} placeholder="트레이딩 메모..." rows={3} style={{ width: "100%" }} />
              <div className="modal-actions" style={{ marginTop: "0.5rem" }}>
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

            <div style={{ flex: 3 }}>
              <button
                className="btn primary ai-btn"
                onClick={handleAIAnalysis}
                disabled={aiLoading}
                style={{ width: "100%", height: "80px", whiteSpace: "normal", wordBreak: "keep-all" }}
              >
                {aiLoading ? "🤖 분석 중..." : "🤖 AI 차트 분석\n매매 아이디어 보기"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
