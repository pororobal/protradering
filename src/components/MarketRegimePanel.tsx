import type { MarketRegimeResult } from "../types";
import { formatPrice, formatPct } from "../utils/format";

interface Props {
  regime: MarketRegimeResult | null;
  loading: boolean;
}

const REGIME_LABEL: Record<string, string> = {
  RISK_ON: "Risk ON",
  NEUTRAL: "Neutral",
  RISK_OFF: "Risk OFF",
};

export function MarketRegimePanel({ regime, loading }: Props) {
  if (loading && !regime) return <div className="empty">시장 레짐 분석 중...</div>;
  if (!regime) return <div className="empty">스캔 후 SPY·QQQ·IWM 레짐이 표시됩니다.</div>;

  return (
    <section>
      <div className="panel-header">
        <h2>Market Regime</h2>
        <p>{regime.summary}</p>
      </div>
      <div className={`regime-banner ${regime.regime.toLowerCase()}`}>
        {REGIME_LABEL[regime.regime]}
      </div>
      <div className="regime-grid">
        {[regime.spy, regime.qqq, regime.iwm].map((idx) => (
          <div key={idx.symbol} className="regime-card">
            <h3>{idx.symbol}</h3>
            <p className="big">{formatPrice(idx.price)}</p>
            <p>{formatPct(idx.change20d)} · 20D</p>
            <ul>
              <li className={idx.aboveEma50 ? "ok" : "no"}>EMA50 {idx.aboveEma50 ? "↑" : "↓"}</li>
              <li className={idx.aboveEma200 ? "ok" : "no"}>EMA200 {idx.aboveEma200 ? "↑" : "↓"}</li>
            </ul>
          </div>
        ))}
      </div>
      <div className="regime-meta">
        <span>Breadth {(regime.breadth * 100).toFixed(0)}%</span>
        <span>Volume {regime.volumeTrend}</span>
        <span>Volatility {regime.volatility}</span>
      </div>
    </section>
  );
}
