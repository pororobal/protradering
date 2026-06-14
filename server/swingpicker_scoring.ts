// server/swingpicker_scoring.ts
// SwingPicker-web 스코어링 엔진
// EBS, STRUCT_SCORE, TIMING_SCORE, 상태 머신 구현

import type { Indicators } from "./indicators.js";

// ─── 타입 정의 ───────────────────────────────────────────────────────────────

export interface SwingPickerScores {
  ebs: number;              // EBS 점수 (0-10)
  structScore: number;      // STRUCT_SCORE (0-100)
  timingScore: number;      // TIMING_SCORE (0-100)
  finalScore: number;       // FINAL_SCORE (0-100)
  state: string;            // 상태 (ATTACK, ARMED, WAIT, NEUTRAL, OVERHEAT, EXIT_WARNING)
  ebsBreakdown: Record<string, number>;
  structBreakdown: Record<string, number>;
  timingBreakdown: Record<string, number>;
}

// ─── EBS 점수 (0-10) ────────────────────────────────────────────────────────────

export function calcEBSScore(ind: Indicators): {
  score: number;
  breakdown: Record<string, number>;
} {
  let score = 0;
  const breakdown: Record<string, number> = {};

  // Condition 1: Low Trend Positive
  const lowTrendOk = ind.lowTrendPct > 0;
  breakdown.lowTrend = lowTrendOk ? 2 : 0;
  score += breakdown.lowTrend;

  // Condition 2: Volume Quality >= 1.1
  const volQualityOk = ind.volQuality >= 1.1;
  breakdown.volQuality = volQualityOk ? 2 : 0;
  score += breakdown.volQuality;

  // Condition 3: MACD Slope Positive
  const slopeOk = ind.slopePct > 0;
  breakdown.macdSlope = slopeOk ? 2 : 0;
  score += breakdown.macdSlope;

  // Condition 4: RSI in range (45-65)
  const rsiOk = ind.rsi !== null && ind.rsi >= 45 && ind.rsi <= 65;
  breakdown.rsi = rsiOk ? 2 : 0;
  score += breakdown.rsi;

  // Condition 5: Squeeze or BB Expanding
  const squeezeOk = ind.ttmSqueeze || ind.bbExpanding;
  breakdown.squeeze = squeezeOk ? 2 : 0;
  score += breakdown.squeeze;

  return { score, breakdown };
}

// ─── STRUCT_SCORE (0-100) ─────────────────────────────────────────────────────

export function calcStructScore(ind: Indicators): {
  score: number;
  breakdown: Record<string, number>;
} {
  let score = 0;
  const breakdown: Record<string, number> = {};

  // Base Components (max 85)
  // Trend Score (max 40)
  const trendScore = Math.min(40, (ind.lowTrendPct / 3.0) * 40);
  breakdown.trend = trendScore;
  score += trendScore;

  // MFI Score (max 15)
  const mfiScore = ind.mfi !== null ? Math.min(15, Math.max(0, ((ind.mfi - 30) / 40) * 15)) : 0;
  breakdown.mfi = mfiScore;
  score += mfiScore;

  // Volume Quality Score (max 15)
  const vqScore = Math.min(15, Math.max(0, ((ind.volQuality - 0.8) / 1.2) * 15));
  breakdown.volQuality = vqScore;
  score += vqScore;

  // Range Position Score (max 15)
  const rangeScore = Math.min(15, ind.rangePos * 15);
  breakdown.rangePos = rangeScore;
  score += rangeScore;

  // 이격도 Score (max 15)
  let dispScore = 0;
  if (ind.disp >= 0 && ind.disp <= 5) {
    dispScore = 15;
  } else if (ind.disp < 0) {
    dispScore = 5;
  } else {
    dispScore = Math.max(0, 15 - (ind.disp - 5));
  }
  breakdown.disp = dispScore;
  score += dispScore;

  // Gate Multipliers (과락 시스템)
  let gateMult = 1.0;

  // Vol_Quality Gate
  if (ind.volQuality < 0.5) {
    gateMult *= 0.3;
  } else if (ind.volQuality < 0.8) {
    gateMult *= 0.6;
  }

  // MFI14 Gate
  if (ind.mfi < 20) {
    gateMult *= 0.3;
  } else if (ind.mfi < 30) {
    gateMult *= 0.6;
  }

  // 거래대금 Gate (simplified - using avgDollarVolume)
  if (ind.avgDollarVolume < 10_000_000) {
    gateMult *= 0.2;
  } else if (ind.avgDollarVolume < 30_000_000) {
    gateMult *= 0.5;
  }

  breakdown.gateMultiplier = gateMult;
  score = score * gateMult;

  // Penalty: Below MA20
  const belowMa20 = ind.ma20 > 0 && ind.currentPrice < ind.ma20;
  const penalty = belowMa20 ? 20 : 0;
  breakdown.ma20Penalty = penalty;
  score -= penalty;

  // Multi-Timeframe Adjustment
  let mtfAdj = 0;
  if (ind.mtfDataSufficient === 1) {
    if (ind.mtfWeeklyTrend >= 1 && ind.mtfMonthlyTrend >= 1) {
      mtfAdj = 10;
    } else if (ind.mtfWeeklyTrend <= -1 && ind.mtfMonthlyTrend <= -1) {
      mtfAdj = -15;
    } else if (ind.mtfWeeklyTrend >= 1 || ind.mtfMonthlyTrend >= 1) {
      mtfAdj = 5;
    } else if (ind.mtfWeeklyTrend <= -1 || ind.mtfMonthlyTrend <= -1) {
      mtfAdj = -7.5;
    }
  }
  breakdown.mtfAdjustment = mtfAdj;
  score += mtfAdj;

  return { score: Math.max(0, Math.min(100, Math.round(score))), breakdown };
}

// ─── TIMING_SCORE (0-100) ──────────────────────────────────────────────────────

export function calcTimingScore(ind: Indicators): {
  score: number;
  breakdown: Record<string, number>;
} {
  let score = 0;
  const breakdown: Record<string, number> = {};

  // Base: Trigger Score (simplified - using existing metrics)
  // Volume Score (max 40)
  let volScore = 0;
  if (ind.rvol >= 3) {
    volScore = 25;
  } else if (ind.rvol >= 2) {
    volScore = 20;
  } else if (ind.rvol >= 1.5) {
    volScore = 12;
  }
  breakdown.volume = volScore;
  score += volScore;

  // Breakout Score (max 40)
  let breakoutScore = 0;
  if (ind.isNearYearHigh) {
    breakoutScore = 25;
  } else if (ind.breakHigh60) {
    breakoutScore = 22;
  } else if (ind.breakHigh20) {
    breakoutScore = 18;
  }
  breakdown.breakout = breakoutScore;
  score += breakoutScore;

  // Momentum Score (max 20)
  let momScore = 0;
  if (ind.dayChange >= 5) {
    momScore = 20;
  } else if (ind.dayChange >= 3) {
    momScore = 15;
  } else if (ind.dayChange >= 1) {
    momScore = 8;
  }
  breakdown.momentum = momScore;
  score += momScore;

  // Volume Profile Bonus/Penalty
  let vpAdj = 0;
  if (ind.isAbovePoc === 1) {
    // Bonus for being above POC
    vpAdj = Math.max(0, 12 * (1 - Math.min(0.30, ind.resAll) / 0.30));
    if (ind.resNear < 0.05) vpAdj += 3;
    if (ind.pocGap > 12) vpAdj = Math.max(0, vpAdj - 4);
  } else {
    // Penalty for being below POC
    vpAdj = -Math.min(15, 15 * Math.min(0.45, ind.resAll) / 0.45);
    if (ind.resNear > 0.20) vpAdj -= 5;
  }
  breakdown.volumeProfile = vpAdj;
  score += vpAdj;

  // Technical Bonus
  let techBonus = 0;
  if (ind.ttmSqueeze) techBonus += 10;
  if (ind.stTrend === 1) techBonus += 5;
  breakdown.technicalBonus = techBonus;
  score += techBonus;

  // Technical Penalty
  let techPenalty = 0;
  if (ind.rsi !== null && ind.rsi > 75) techPenalty += 20;
  if (ind.gapPctVal > 5) techPenalty += 10;
  breakdown.technicalPenalty = techPenalty;
  score -= techPenalty;

  return { score: Math.max(0, Math.min(100, Math.round(score))), breakdown };
}

// ─── 상태 머신 ─────────────────────────────────────────────────────────────────

export function determineState(ind: Indicators): string {
  // Priority-based state determination

  // OVERHEAT (highest priority)
  if (ind.rsi !== null && ind.rsi >= 75) {
    return "OVERHEAT";
  }
  if (ind.change5d >= 25) {
    return "OVERHEAT";
  }

  // EXIT_WARNING
  if (ind.volZ >= 10 && ind.dayChange >= 10) {
    return "EXIT_WARNING";
  }

  // WAIT (low trend positive or 1d return positive)
  if (ind.lowTrendPct > 0 || ind.dayChange > 0) {
    return "WAIT";
  }

  // ARMED (squeeze or high vol quality + above MA20)
  if ((ind.ttmSqueeze || ind.volQuality >= 2.0) && ind.ma20 > 0 && ind.currentPrice >= ind.ma20) {
    return "ARMED";
  }

  // ATTACK (slope > 0, range pos high, vol quality high, timing high)
  if (ind.slopePct > 0 && ind.rangePos >= 0.8 && ind.volQuality >= 1.2 && ind.ma20 > 0 && ind.currentPrice >= ind.ma20) {
    return "ATTACK";
  }

  // Default
  return "NEUTRAL";
}

// ─── FINAL_SCORE 계산 ───────────────────────────────────────────────────────────

export function calcFinalScore(
  structScore: number,
  timingScore: number,
  macroRisk: "NORMAL" | "CAUTION" | "CRITICAL" = "NORMAL"
): number {
  // Dynamic weights based on macro risk
  let wStruct: number;
  let wTiming: number;

  switch (macroRisk) {
    case "CRITICAL":
      wStruct = 0.55;
      wTiming = 0.25;
      break;
    case "CAUTION":
      wStruct = 0.50;
      wTiming = 0.30;
      break;
    default: // NORMAL
      wStruct = 0.40;
      wTiming = 0.40;
      break;
  }

  const finalScore = (structScore * wStruct) + (timingScore * wTiming);
  return Math.max(0, Math.min(100, Math.round(finalScore)));
}

// ─── 메인 스코어링 함수 ─────────────────────────────────────────────────────────

export function calcSwingPickerScores(
  ind: Indicators,
  macroRisk: "NORMAL" | "CAUTION" | "CRITICAL" = "NORMAL"
): SwingPickerScores {
  const ebsResult = calcEBSScore(ind);
  const structResult = calcStructScore(ind);
  const timingResult = calcTimingScore(ind);
  const state = determineState(ind);
  const finalScore = calcFinalScore(structResult.score, timingResult.score, macroRisk);

  return {
    ebs: ebsResult.score,
    structScore: structResult.score,
    timingScore: timingResult.score,
    finalScore,
    state,
    ebsBreakdown: ebsResult.breakdown,
    structBreakdown: structResult.breakdown,
    timingBreakdown: timingResult.breakdown,
  };
}
