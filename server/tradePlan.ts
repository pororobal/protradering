// server/tradePlan.ts
// 매수가 / 손절가 / 목표가(TP1, TP2) / 성공 확률 추정
// ── 기존 핵심 스코어링(swingpicker_scoring.ts, indicators.ts) 로직은 건드리지 않고,
//    그 결과(Indicators, SwingPickerScores)를 입력으로 받아 매매 레벨만 계산하는
//    독립적인 부가 모듈입니다.

import type { Indicators } from "./indicators.js";
import type { SwingPickerScores } from "./swingpicker_scoring.js";

export interface TradePlan {
  entry: number;          // 매수 추천가
  entryType: "market" | "pullback"; // 시장가 진입 or VWAP/MA20 되돌림 대기
  stopLoss: number;        // 손절가
  stopLossPct: number;     // 진입가 대비 손절 % (음수)
  target1: number;         // 1차 목표가
  target1Pct: number;      // 진입가 대비 1차 목표 %
  target2: number;         // 2차 목표가
  target2Pct: number;      // 진입가 대비 2차 목표 %
  riskRewardRatio: number; // (target1 - entry) / (entry - stopLoss)
  winProbability: number;  // 0-100, 추정 성공 확률
}

/**
 * ATR + SuperTrend + 구조적 지지/저항(POC, 스윙로우, 볼린저밴드)을 조합해
 * 매수/매도/손절 레벨을 계산한다.
 *
 * - 손절: ATR 기반 + 스윙로우/SuperTrend 중 더 타이트한 쪽과 비교해 보정
 * - 목표가: ATR 멀티플 기반 TP1/TP2, POC 저항이 가까우면 TP1을 저항선 쪽으로 당김
 * - 확률: finalScore, EBS, 상태(state), R:R 비율을 조합한 휴리스틱 추정치
 */
export function calcTradePlan(
  ind: Indicators,
  scores: SwingPickerScores,
  mode: "day" | "swing"
): TradePlan {
  const price = ind.currentPrice;
  const atr = ind.atr ?? price * 0.02; // ATR 없으면 가격의 2%로 대체

  // ── 진입가 ──────────────────────────────────────────────────────────────
  // 갭업/급등(과열) 상태면 풀백 진입을 권장, 그 외엔 현재가 시장가 진입
  const overheated = scores.state === "OVERHEAT" || ind.gapPctVal > 5 || ind.dayChange >= 7;
  const entryType: TradePlan["entryType"] = overheated ? "pullback" : "market";

  let entry: number;
  if (entryType === "pullback") {
    // VWAP과 MA20 중 현재가에 더 가까운(더 높은) 쪽을 풀백 매수 기준가로 사용
    const candidates = [ind.vwapVal, ind.ma20].filter((v) => v > 0 && v < price);
    entry = candidates.length ? Math.max(...candidates) : price * 0.98;
  } else {
    entry = price;
  }

  // ── 손절가 ──────────────────────────────────────────────────────────────
  const atrStopMult = mode === "day" ? 1.5 : 2.0;
  let stopLoss = entry - atr * atrStopMult;

  // 스윙로우 지지선이 ATR 손절선보다 위에 있고, entry보다 충분히 아래면 그쪽을 우선 사용
  if (ind.swingLow10 > 0 && ind.swingLow10 < entry) {
    const swingStop = ind.swingLow10 * 0.997; // 약간의 버퍼
    if (swingStop > stopLoss) stopLoss = swingStop;
  }

  // SuperTrend가 상승 추세(stTrend=1)이고 entry보다 아래면 추가 지지선으로 고려
  if (ind.stTrend === 1 && ind.stVal > 0 && ind.stVal < entry) {
    const stStop = ind.stVal * 0.998;
    if (stStop > stopLoss) stopLoss = stStop;
  }

  // 손절선이 entry의 0.5% 이내로 너무 타이트하면 최소 거리 보장
  const minStopDist = entry * (mode === "day" ? 0.012 : 0.02);
  if (entry - stopLoss < minStopDist) stopLoss = entry - minStopDist;

  stopLoss = Math.max(0, stopLoss);

  // ── 목표가 ──────────────────────────────────────────────────────────────
  const tp1Mult = mode === "day" ? 2.0 : 2.5;
  const tp2Mult = mode === "day" ? 3.5 : 4.5;

  let target1 = entry + atr * tp1Mult;
  let target2 = entry + atr * tp2Mult;

  // POC 위 저항(매물대)이 target1보다 가깝게 있으면 target1을 저항선 바로 아래로 보정
  if (ind.pocP !== null && ind.pocP > entry && ind.pocP < target1) {
    target1 = Math.max(entry + atr * 0.8, ind.pocP * 0.995);
  }

  // 52주 신고가가 target1/target2 사이에 있으면 1차 저항으로 활용
  if (ind.high52w > entry && ind.high52w < target2 && ind.high52w > target1) {
    target2 = ind.high52w * 0.999;
  }

  if (target1 <= entry) target1 = entry + atr * 1.0;
  if (target2 <= target1) target2 = target1 + atr * 1.0;

  // ── 손익비 ──────────────────────────────────────────────────────────────
  const risk = entry - stopLoss;
  const reward = target1 - entry;
  const riskRewardRatio = risk > 0 ? reward / risk : 0;

  // ── 성공 확률 추정 (휴리스틱) ──────────────────────────────────────────────
  const winProbability = estimateWinProbability(ind, scores, riskRewardRatio, mode);

  return {
    entry: round2(entry),
    entryType,
    stopLoss: round2(stopLoss),
    stopLossPct: pct(stopLoss, entry),
    target1: round2(target1),
    target1Pct: pct(target1, entry),
    target2: round2(target2),
    target2Pct: pct(target2, entry),
    riskRewardRatio: Math.round(riskRewardRatio * 100) / 100,
    winProbability,
  };
}

/**
 * finalScore, EBS, 상태머신, R:R을 조합한 0-100 성공 확률 추정치.
 * 통계적 백테스트 기반이 아닌 "스코어 기반 신뢰도" 추정이므로
 * 절대적 확률이 아닌 상대적 비교 지표로 사용.
 */
function estimateWinProbability(
  ind: Indicators,
  scores: SwingPickerScores,
  rr: number,
  mode: "day" | "swing"
): number {
  // 기준값: finalScore를 0-100 → 35-75% 범위로 매핑 (베이스레이트 보정)
  let prob = 35 + (scores.finalScore / 100) * 40;

  // EBS 가산점 (0-10 → 최대 +8)
  prob += (scores.ebs / 10) * 8;

  // 상태머신 보정
  switch (scores.state) {
    case "ATTACK":
      prob += 6;
      break;
    case "ARMED":
      prob += 3;
      break;
    case "WAIT":
      prob += 0;
      break;
    case "OVERHEAT":
      prob -= 10;
      break;
    case "EXIT_WARNING":
      prob -= 15;
      break;
    case "NEUTRAL":
    default:
      prob -= 2;
  }

  // 손익비가 좋을수록(>=2) 약간의 가산점, 너무 낮으면(<1) 감점
  if (rr >= 2.5) prob += 4;
  else if (rr >= 1.5) prob += 2;
  else if (rr < 1) prob -= 5;

  // RSI 과매수 구간 페널티
  if (ind.rsi !== null && ind.rsi > 75) prob -= 8;

  // 단타는 변동성 큰 만큼 보수적으로, 스윙은 구조 점수에 더 의존
  if (mode === "day" && ind.rvol < 2) prob -= 3;
  if (mode === "swing" && ind.mtfWeeklyTrend < 0) prob -= 4;

  return Math.max(5, Math.min(95, Math.round(prob)));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pct(target: number, base: number): number {
  if (base <= 0) return 0;
  return Math.round(((target - base) / base) * 10000) / 100;
}
