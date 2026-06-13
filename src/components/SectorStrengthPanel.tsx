import type { SectorStrength } from "../types";
import { formatPct } from "../utils/format";

interface Props {
  sectors: SectorStrength[];
  loading: boolean;
}

export function SectorStrengthPanel({ sectors, loading }: Props) {
  if (loading && !sectors.length) return <div className="empty">섹터 강도 계산 중...</div>;
  if (!sectors.length) return <div className="empty">스캔 후 섹터 ETF 대 SPY 상대강도가 표시됩니다.</div>;

  return (
    <section>
      <div className="panel-header">
        <h2>Sector Strength</h2>
        <p>SPY 대비 1주·1개월·3개월 상대수익률</p>
      </div>
      <div className="sector-table-wrap">
        <table className="sector-table">
          <thead>
            <tr>
              <th>섹터</th>
              <th>ETF</th>
              <th>1W</th>
              <th>1M</th>
              <th>3M</th>
              <th>vs SPY 3M</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {sectors.map((s) => (
              <tr key={s.etf}>
                <td>{s.name}</td>
                <td>{s.etf}</td>
                <td className={s.return1w >= 0 ? "up" : "down"}>{formatPct(s.return1w)}</td>
                <td className={s.return1m >= 0 ? "up" : "down"}>{formatPct(s.return1m)}</td>
                <td className={s.return3m >= 0 ? "up" : "down"}>{formatPct(s.return3m)}</td>
                <td className={s.vsSpy3m >= 0 ? "up" : "down"}>{formatPct(s.vsSpy3m)}</td>
                <td><strong>{s.strengthScore}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
