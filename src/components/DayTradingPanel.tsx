import type { DayTradeResult } from "../types";
import { formatPrice, formatPct, formatCompact, formatVolume } from "../utils/format";
import { ScoreBreakdownBar } from "./ScoreBreakdownBar";
import { TradePlanPanel } from "./TradePlanPanel";

interface Props {
  stocks: DayTradeResult[];
  loading: boolean;
  hasScanned: boolean;
  onSelect: (symbol: string) => void;
  watchlist: { add: (s: string, n: string, src: "day") => void; has: (s: string) => boolean };
}

export function DayTradingPanel({ stocks, loading, hasScanned, onSelect, watchlist }: Props) {
  if (loading && !stocks.length) {
    return <Empty msg="Day Trading 스크리너 실행 중..." />;
  }
  if (!stocks.length) {
    if (hasScanned) {
      return <Empty msg="스캔 완료 - 기준에 부합하는 종목이 없습니다." />;
    }
    return <Empty msg="스캔 버튼을 눌러 1~3일 알파 후보를 탐색하세요." />;
  }

  return (
    <section>
      <div className="panel-header">
        <h2>Day Trading</h2>
        <p>1~3일 기대수익률 기반 · 300점 만점</p>
      </div>
      <div className="stock-grid">
        {stocks.map((s, i) => (
          <article key={s.symbol} className="stock-card" onClick={() => onSelect(s.symbol)}>
            <div className="card-top">
              <span className="rank">#{i + 1}</span>
              <div>
                <h3>{s.symbol}</h3>
                <p className="muted">{s.name}</p>
              </div>
              <div className="score-badge">{s.score}</div>
            </div>
            <div className="metrics">
              <span>{formatPrice(s.price)}</span>
              <span className={s.dayChange >= 0 ? "up" : "down"}>{formatPct(s.dayChange)}</span>
              <span>RVOL {s.rvol.toFixed(1)}x</span>
              <span>RS {formatPct(s.rs20d)}</span>
            </div>
            <div className="tags">
              {s.gapUp && <span className="tag">Gap</span>}
              {s.state && <span className="tag accent">{s.state}</span>}
              <span className="tag">{s.sector}</span>
            </div>
            {s.tradePlan && <TradePlanPanel plan={s.tradePlan} variant="compact" />}
            <ScoreBreakdownBar breakdown={s.breakdown} maxScore={300} />
            <div className="card-footer">
              <span className="muted">{formatCompact(s.marketCap)} · Vol {formatVolume(s.volume)}</span>
              <button
                className="btn tiny"
                onClick={(e) => {
                  e.stopPropagation();
                  watchlist.add(s.symbol, s.name, "day");
                }}
              >
                {watchlist.has(s.symbol) ? "★" : "☆"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="empty">{msg}</div>;
}
