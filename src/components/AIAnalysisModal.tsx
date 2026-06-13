import { useState } from "react";
import type { DayTradeResult, SwingTradeResult } from "../types";

interface Props {
  symbol: string;
  stock: DayTradeResult | SwingTradeResult;
  analysisType: "day" | "swing";
  onClose: () => void;
}

export function AIAnalysisModal({ symbol, stock, analysisType, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<string>("");
  const [error, setError] = useState<string>("");

  const analyze = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("http://localhost:3001/api/ai/analyze-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, stock, analysisType }),
      });
      const data = await response.json();
      if (data.error) {
        setError(data.error);
      } else {
        setAnalysis(data.analysis);
      }
    } catch (err) {
      setError("AI 분석 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal ai-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>🤖 AI 분석</h2>
            <p className="muted">{symbol} - {analysisType === "day" ? "데이 트레이딩" : "스윙 트레이딩"}</p>
          </div>
          <button className="btn ghost" onClick={onClose}>닫기</button>
        </div>
        <div className="modal-body">
          {!analysis && !error && (
            <div className="ai-placeholder">
              <p>Google AI 기반 종목 분석</p>
              <button
                className="btn primary"
                onClick={analyze}
                disabled={loading}
              >
                {loading ? "분석 중..." : "AI 분석 시작"}
              </button>
            </div>
          )}
          {loading && (
            <div className="ai-loading">
              <div className="spinner"></div>
              <p>AI가 종목을 분석하고 있습니다...</p>
            </div>
          )}
          {error && (
            <div className="ai-error">
              <p>❌ {error}</p>
              <button className="btn tiny" onClick={analyze}>재시도</button>
            </div>
          )}
          {analysis && (
            <div className="ai-result">
              <pre className="ai-text">{analysis}</pre>
              <button className="btn tiny" onClick={analyze}>재분석</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
