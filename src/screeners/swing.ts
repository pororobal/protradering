// src/screeners/swing.ts

import type { ProcessedStock, SwingTradeResult, ScoreBreakdown } from "../types/index.js";
import { clamp } from "../utils/format.js";
import type { SwingIndicatorData } from "../indicators/swingIndicators.js";

// ===============================
// 1. 기존 함수들 (미너비니/VCP 필터 및 점수)
// ===============================

export function passesSwingFilters(s: ProcessedStock): boolean {
  // 가격 필터 제거 - 급등주 포함
  if (!s.minerviniPass) return false;
  if (!s.near52wHigh) return false;
  if (s.return3m <= s.spyReturn3m) return false;
  if (!s.volContractionExpansion) return false;
  if (!s.breakout30d && !s.nearBreakout30d) return false;
  if (s.obvTrend !== "up") return false;
  if (s.adTrend !== "up") return false;
  return true;
}

export function scoreSwing(s: ProcessedStock): SwingTradeResult | null {
  if (!passesSwingFilters(s)) return null;

  const breakdown: ScoreBreakdown = {};

  breakdown.trendTemplate = scoreTrendTemplate(s);
  breakdown.relativeStrength = scoreRS3m(s.return3m, s.spyReturn3m);
  breakdown.near52wHigh = score52wHigh(s.price, s.high52w);
  breakdown.vcp = Math.round((s.vcpScore / 100) * 80);
  breakdown.breakout = scoreBreakout30(s);
  breakdown.institutional = scoreInstitutional(s);

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return {
    symbol: s.symbol,
    name: s.name,
    price: s.price,
    score: Math.round(score),
    maxScore: 500,
    breakdown,
    sector: s.sector,
    industry: s.industry,
    return3m: s.return3m,
    rs3m: s.return3m - s.spyReturn3m,
    near52wHigh: s.near52wHigh,
    minerviniPass: s.minerviniPass,
    vcpScore: s.vcpScore,
    marketCap: s.marketCap,
    volume: s.volume,
  };
}

function scoreTrendTemplate(s: ProcessedStock): number {
  let score = 0;
  const { price, ema20, ema50, ema150, ema200, ema200Rising } = s;
  if (ema20 && price > ema20) score += 15;
  if (ema20 && ema50 && ema20 > ema50) score += 20;
  if (ema50 && ema150 && ema50 > ema150) score += 20;
  if (ema150 && ema200 && ema150 > ema200) score += 25;
  if (ema200Rising) score += 20;
  return clamp(score, 0, 100);
}

function scoreRS3m(ret: number, spyRet: number): number {
  const diff = ret - spyRet;
  if (diff >= 40) return 80;
  if (diff >= 25) return 68;
  if (diff >= 15) return 55;
  if (diff >= 8) return 40;
  if (diff > 0) return 25;
  return 0;
}

function score52wHigh(price: number, high52w: number): number {
  if (high52w <= 0) return 0;
  const pctFromHigh = ((high52w - price) / high52w) * 100;
  if (pctFromHigh <= 2) return 80;
  if (pctFromHigh <= 5) return 68;
  if (pctFromHigh <= 8) return 55;
  if (pctFromHigh <= 10) return 40;
  return 0;
}

function scoreBreakout30(s: ProcessedStock): number {
  if (s.breakout30d) return 80;
  if (s.nearBreakout30d) return 55;
  return 0;
}

function scoreInstitutional(s: ProcessedStock): number {
  let score = 0;
  if (s.institutionalAccumulation) score += 40;
  if (s.adTrend === "up") score += 25;
  if (s.obvTrend === "up") score += 15;
  return clamp(score, 0, 80);
}

export function checkMinervini(
  price: number,
  ema20: number | null,
  ema50: number | null,
  ema150: number | null,
  ema200: number | null,
  ema200Rising: boolean
): boolean {
  if (!ema20 || !ema50 || !ema150 || !ema200) return false;
  return (
    price > ema20 &&
    ema20 > ema50 &&
    ema50 > ema150 &&
    ema150 > ema200 &&
    ema200Rising
  );
}

// ===============================
// 2. SWINGPICKER_WEB 멀티팩터 계산 함수들
// ===============================

/**
 * EBS 점수 (0~10) - 5가지 펀더멘털 체크리스트
 */
export function calculateEBSScore(ind: SwingIndicatorData): number {
  let score = 0;
  if (ind.lowTrendPct > 0) score += 2;
  if (ind.volQuality >= 1.1) score += 2;
  if (ind.macdSlopePct > 0) score += 2;
  if (ind.rsi14 >= 45 && ind.rsi14 <= 65) score += 2;
  if (ind.ttmSqueeze || ind.bbExpanding) score += 2;
  return score;
}

/**
 * STRUCT_SCORE (0~100) - 종목의 구조적 건전성
 */
export function calculateStructuralScore(ind: SwingIndicatorData): number {
  // 베이스 점수 (최대 85)
  const trendScore = Math.min(ind.lowTrendPct / 3.0, 1.0) * 40;
  const mfiScore = Math.min(Math.max(ind.mfi14 - 30, 0) / 40, 1.0) * 15;
  const vqScore = Math.min(Math.max(ind.volQuality - 0.8, 0) / 1.2, 1.0) * 15;
  const rangeScore = Math.min(ind.rangePos, 1.0) * 15;

  let dispScore = 0;
  if (ind.disparity >= 0 && ind.disparity <= 5) dispScore = 15;
  else if (ind.disparity < 0) dispScore = 5;
  else dispScore = Math.max(15 - (ind.disparity - 5), 0);

  let base = trendScore + mfiScore + vqScore + rangeScore + dispScore;

  // 게이트 멀티플라이어 (과락)
  let gateMult = 1.0;
  if (ind.volQuality < 0.5) gateMult *= 0.3;
  else if (ind.volQuality < 0.8) gateMult *= 0.6;
  if (ind.mfi14 < 20) gateMult *= 0.3;
  else if (ind.mfi14 < 30) gateMult *= 0.6;
  if (ind.turnoverEok < 10) gateMult *= 0.2;
  else if (ind.turnoverEok < 30) gateMult *= 0.5;

  base *= gateMult;

  // 패널티: MA20 아래
  const penalty = ind.aboveMa20 ? 0 : 20;

  // 멀티타임프레임 조정
  let mtfAdj = 0;
  if (ind.mtfDataSufficient) {
    const weekly = ind.mtfWeeklyTrend;
    const monthly = ind.mtfMonthlyTrend;
    if (weekly >= 1 && monthly >= 1) mtfAdj = 10;
    else if (weekly <= -1 && monthly <= -1) mtfAdj = -15;
    else if (weekly >= 1 || monthly >= 1) mtfAdj = 5;
    else if (weekly <= -1 || monthly <= -1) mtfAdj = -7.5;
  }

  let structScore = base - penalty + mtfAdj;
  return clamp(structScore, 0, 100);
}

/**
 * TIMING_SCORE (0~100) - 진입 타이밍 점수
 */
export function calculateTimingScore(ind: SwingIndicatorData): number {
  // 표준화된 트리거 점수 (0~100)
  let stdTrigger = (ind.rawTriggerScore / 90) * 100;
  stdTrigger = clamp(stdTrigger, 0, 100);

  let bonus = 0;
  let penalty = 0;

  // 볼륨 프로파일 보정
  if (ind.isAbovePoc) {
    let aboveBonus = Math.max(0, 12 * (1 - Math.min(ind.resRatio, 0.3) / 0.3));
    if (ind.resRatioNear < 0.05) aboveBonus += 3;
    if (ind.pocGap > 12) aboveBonus = Math.max(0, aboveBonus - 4);
    bonus += aboveBonus;
  } else {
    let belowPen = Math.min(15, 15 * Math.min(ind.resRatio, 0.45) / 0.45);
    if (ind.resRatioNear > 0.2) belowPen += 5;
    penalty += belowPen;
  }

  // 기술적 보너스/패널티
  if (ind.ttmSqueeze) bonus += 10;
  if (ind.supertrendDir === 1) bonus += 5;
  if (ind.rsi14 > 75) penalty += 20;
  if (ind.gapPct > 5) penalty += 10;

  // 섹터 모멘텀 보너스
  if (ind.sectorRank <= 3) bonus += 8;
  else if (ind.sectorRank <= 6) bonus += 4;

  let timingScore = stdTrigger + bonus - penalty;
  return clamp(timingScore, 0, 100);
}

/**
 * 최종 FINAL_SCORE (STRUCT + TIMING + AI)
 * @param structScore STRUCT_SCORE
 * @param timingScore TIMING_SCORE
 * @param macroRisk 매크로 리스크 레벨 ('NORMAL', 'CAUTION', 'CRITICAL')
 * @param aiScore AI/ML 점수 (0~100, 없으면 0)
 */
export function calculateFinalScore(
  structScore: number,
  timingScore: number,
  macroRisk: "NORMAL" | "CAUTION" | "CRITICAL" = "NORMAL",
  aiScore: number = 0
): number {
  let wStruct = 0.4, wTiming = 0.4, wAi = 0.2;
  if (macroRisk === "CRITICAL") {
    wStruct = 0.55; wTiming = 0.25; wAi = 0.20;
  } else if (macroRisk === "CAUTION") {
    wStruct = 0.50; wTiming = 0.30; wAi = 0.20;
  }

  const hasAi = aiScore > 0;
  if (!hasAi && wAi > 0) {
    const total = wStruct + wTiming;
    wStruct = wStruct / total;
    wTiming = wTiming / total;
    wAi = 0;
  }

  const final = structScore * wStruct + timingScore * wTiming + aiScore * wAi;
  return clamp(final, 0, 100);
}

/**
 * 상태 머신 (ATTACK, ARMED, WAIT, NEUTRAL, OVERHEAT, EXIT_WARNING)
 * SWINGPICKER_WEB의 동적 상태 판별
 */
export function determineState(ind: SwingIndicatorData): string {
  // WAIT
  if (ind.lowTrendPct > 0 || ind.ret1d > 0) return "WAIT";
  // ARMED
  if ((ind.ttmSqueeze || ind.volQuality >= 2.0) && ind.aboveMa20 && ind.lowTrendPct >= -3.0) return "ARMED";
  // ATTACK
  if (ind.macdSlopePct > 0 && ind.rangePos >= 0.6 && ind.volQuality >= 1.2 && ind.rawTriggerScore >= 60 && ind.aboveMa20) return "ATTACK";
  // OVERHEAT
  if (ind.rsi14 >= 75 || ind.ret5d >= 25) return "OVERHEAT";
  // EXIT_WARNING (간소화: 거래량 급증 + 1일 수익률 10% 이상)
  const volumeSpike = ind.rawTriggerScore >= 70; // 대략적
  if (volumeSpike && ind.ret1d >= 10) return "EXIT_WARNING";
  return "NEUTRAL";
}

/**
 * 하드 블록 필터 (즉시 탈락 조건)
 */
export function passesHardBlocks(s: ProcessedStock, ind: SwingIndicatorData): boolean {
  // 거래대금 최소 30억원
  if (ind.turnoverEok < 30) return false;
  // 5일 수익률 범위 (-25% ~ +40%)
  if (ind.ret5d > 40 || ind.ret5d < -25) return false;
  // 갭 > 15% 차단
  if (ind.gapPct > 15) return false;
  // RSI > 85 차단
  if (ind.rsi14 > 85) return false;
  // 연속 상한가 >= 2회 차단
  if (ind.consecutiveLimitUp >= 2) return false;
  return true;
}

// ===============================
// 3. 확장된 스윙 트레이드 결과 타입 및 함수
// ===============================

export interface EnhancedSwingTradeResult extends SwingTradeResult {
  ebs: number;
  structScore: number;
  timingScore: number;
  finalScore: number;
  state: string;
  macroRisk?: string;
}

/**
 * 멀티팩터 점수를 사용한 스윙 검색 결과 (확장 버전)
 * @param s ProcessedStock (기본 종목 데이터)
 * @param ind SwingIndicatorData (swingIndicators.ts에서 계산된 지표)
 * @param macroRisk 매크로 리스크 레벨
 * @returns 확장된 결과 또는 필터 실패 시 null
 */
export function scoreSwingEnhanced(
  s: ProcessedStock,
  ind: SwingIndicatorData,
  macroRisk: "NORMAL" | "CAUTION" | "CRITICAL" = "NORMAL"
): EnhancedSwingTradeResult | null {
  // 1. 하드 블록 필터
  if (!passesHardBlocks(s, ind)) return null;

  // 2. EBS 최소 통과 (≥3)
  const ebs = calculateEBSScore(ind);
  if (ebs < 3) return null;

  // 3. 기존 미너비니 필터 (선택) - 원한다면 제거 가능
  if (!passesSwingFilters(s)) return null;

  // 4. 점수 계산
  const structScore = calculateStructuralScore(ind);
  const timingScore = calculateTimingScore(ind);
  const finalScore = calculateFinalScore(structScore, timingScore, macroRisk);
  const state = determineState(ind);

  // 5. 기존 breakdown (호환성)
  const breakdown: ScoreBreakdown = {
    trendTemplate: scoreTrendTemplate(s),
    relativeStrength: scoreRS3m(s.return3m, s.spyReturn3m),
    near52wHigh: score52wHigh(s.price, s.high52w),
    vcp: Math.round((s.vcpScore / 100) * 80),
    breakout: scoreBreakout30(s),
    institutional: scoreInstitutional(s),
  };

  const baseResult = scoreSwing(s);
  if (!baseResult) return null;

  return {
    ...baseResult,
    ebs,
    structScore,
    timingScore,
    finalScore: Math.round(finalScore),
    state,
    macroRisk,
  };
}
