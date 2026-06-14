import type { TradePlan } from "../types";
import { formatPrice, formatPct } from "../utils/format";

interface Props {
  plan: TradePlan;
  variant: "compact" | "detail";
}

export function TradePlanPanel({ plan, variant }: Props) {
  if (variant === "compact") {
    return (
      <div className="trade-plan compact">
        <div className="tp-row">
          <span className="tp-label">{plan.entryType === "pullback" ? "진입(대기)" : "진입"}</span>
          <span className="tp-value entry">{formatPrice(plan.entry)}</span>
        </div>
        <div className="tp-row">
          <span className="tp-label">목표</span>
          <span className="tp-value target">
            {formatPrice(plan.target1)}
            <span className="pct"> ({formatPct(plan.target1Pct)})</span>
          </span>
        </div>
        <div className="tp-row">
          <span className="tp-label">손절</span>
          <span className="tp-value stop">
            {formatPrice(plan.stopLoss)}
            <span className="pct"> ({formatPct(plan.stopLossPct)})</span>
          </span>
        </div>
        <div className="tp-row">
          <span className="tp-label">확률</span>
          <span className={`tp-value prob ${probClass(plan.winProbability)}`}>{plan.winProbability}%</span>
        </div>
      </div>
    );
  }

  return (
    <div className="trade-plan detail">
      <div className="panel-header">
        <h3>매매 플랜</h3>
        <p>
          {plan.entryType === "pullback"
            ? "현재 단기 과열 — 되돌림 진입 권장"
            : "현재가 기준 진입 가능"}
          {" · "}손익비 1:{plan.riskRewardRatio.toFixed(2)}
        </p>
      </div>
      <div className="tp-grid">
        <div className="tp-box entry">
          <div className="tp-box-label">{plan.entryType === "pullback" ? "진입가 (대기)" : "진입가 (현재가)"}</div>
          <div className="tp-box-value">{formatPrice(plan.entry)}</div>
        </div>
        <div className="tp-box prob">
          <div className="tp-box-label">예상 성공 확률</div>
          <div className={`tp-box-value ${probClass(plan.winProbability)}`}>{plan.winProbability}%</div>
        </div>
        <div className="tp-box target">
          <div className="tp-box-label">1차 목표가</div>
          <div className="tp-box-value">{formatPrice(plan.target1)}</div>
          <div className="tp-box-sub up">{formatPct(plan.target1Pct)}</div>
        </div>
        <div className="tp-box target2">
          <div className="tp-box-label">2차 목표가</div>
          <div className="tp-box-value">{formatPrice(plan.target2)}</div>
          <div className="tp-box-sub up">{formatPct(plan.target2Pct)}</div>
        </div>
        <div className="tp-box stop">
          <div className="tp-box-label">손절가</div>
          <div className="tp-box-value">{formatPrice(plan.stopLoss)}</div>
          <div className="tp-box-sub down">{formatPct(plan.stopLossPct)}</div>
        </div>
        <div className="tp-box rr">
          <div className="tp-box-label">손익비 (R:R)</div>
          <div className="tp-box-value">1 : {plan.riskRewardRatio.toFixed(2)}</div>
        </div>
      </div>
      <p className="tp-disclaimer muted">
        ※ 확률은 스코어·상태머신·손익비 기반 추정치이며 실제 결과와 다를 수 있습니다.
      </p>
    </div>
  );
}

function probClass(prob: number): string {
  if (prob >= 65) return "high";
  if (prob >= 45) return "mid";
  return "low";
}
