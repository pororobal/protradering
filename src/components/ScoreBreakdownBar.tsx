import type { ScoreBreakdown } from "../types";

interface Props {
  breakdown: ScoreBreakdown;
  maxScore: number;
}

export function ScoreBreakdownBar({ breakdown, maxScore }: Props) {
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const pct = maxScore > 0 ? (total / maxScore) * 100 : 0;

  return (
    <div className="breakdown">
      <div className="breakdown-bar">
        <div className="breakdown-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="breakdown-labels">
        {Object.entries(breakdown).map(([k, v]) => (
          <span key={k} title={k}>
            {k.replace(/([A-Z])/g, " $1").trim()} {v}
          </span>
        ))}
      </div>
    </div>
  );
}
