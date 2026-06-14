import type { SwingTradeResult } from "../types";
import { formatPrice, formatPct, formatCompact, formatVolume } from "../utils/format";
import { ScoreBreakdownBar } from "./ScoreBreakdownBar";

interface Props {
  stocks: SwingTradeResult[];
  loading: boolean;
  hasScanned: boolean;
  onSelect: (symbol: string) => void;
  watchlist: { add: (s: string, n: string, src: "swing") => void; has: (s: string) => boolean };
}

export function SwingPanel({ stocks, loading, hasScanned, onSelect, watchlist }: Props) {
  if (loading && !stocks.length) {
    return <div className="empty">Swing 스크리너 실행 중...</div>;
  }
  if (!stocks.length) {
    if (hasScanned) {
      return <div className="empty">스캔 완료 - 기준에 부합하는 종목이 없습니다.</div>;
    }
    return <div className="empty">스캔 버튼을 눌러 2주~3개월 추세 후보를 탐색하세요.</div>;
  }

  return (
    <section>
      <div className="panel-header">
        <h2>Swing Trading</h2>
        <p>Minervini · VCP · 기관매집 · 500점 만점</p>
      </div>
      <div className="stock-grid">
        {stocks.map((s, i) => (
          <article key={s.symbol} className="stock-card swing" onClick={() => onSelect(s.symbol)}>
            <div className="card-top">
              <span className="rank">#{i + 1}</span>
              <div>
                <h3>{s.symbol}</h3>
                <p className="muted">{s.name}</p>
              </div>
              <div className="score-badge swing">{s.score}</div>
            </div>
            <div className="metrics">
              <span>{formatPrice(s.price)}</span>
              <span className="up">{formatPct(s.return3m)} 3M</span>
              <span>RS {formatPct(s.rs3m)}</span>
              <span>VCP {s.vcpScore}</span>
            </div>
            <div className="tags">
              {s.minerviniPass && <span className="tag accent">Minervini</span>}
              {s.near52wHigh && <span className="tag">52W High</span>}
              <span className="tag">{s.sector}</span>
            </div>
            <ScoreBreakdownBar breakdown={s.breakdown} maxScore={500} />
            <div className="card-footer">
              <span className="muted">{formatCompact(s.marketCap)} · Vol {formatVolume(s.volume)}</span>
              <button
                className="btn tiny"
                onClick={(e) => {
                  e.stopPropagation();
                  watchlist.add(s.symbol, s.name, "swing");
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
