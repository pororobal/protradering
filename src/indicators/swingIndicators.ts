// src/indicators/swingIndicators.ts

import { calcATR } from "./atr.js";
import { calcEMA, calcEMASeries, isEMARising } from "./ema.js";
import { calcRSI } from "./rsi.js";
import { calcOBVTrend, calcAccumulationDistributionTrend, isInstitutionalAccumulation } from "./volume.js";

// --- 1. 데이터 타입 정의 ---
export interface Candle {
  date: Date | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// SWINGPICKER_WANYSIS.md에 정의된 모든 지표를 포함하는 인터페이스
export interface SwingIndicatorData {
  // EBS 관련
  lowTrendPct: number;
  volQuality: number;
  macdSlopePct: number;
  rsi14: number;
  ttmSqueeze: boolean;
  bbExpanding: boolean;
  // STRUCT 관련
  mfi14: number;
  rangePos: number;
  disparity: number;
  aboveMa20: boolean;
  turnoverEok: number;
  mtfWeeklyTrend: number;
  mtfMonthlyTrend: number;
  mtfDataSufficient: boolean;
  // TIMING 관련
  rawTriggerScore: number;
  resRatio: number;
  resRatioNear: number;
  pocGap: number;
  isAbovePoc: boolean;
  supertrendDir: number;
  gapPct: number;
  sectorRank: number;
  // 추가 편의 필드
  ret5d: number;
  ret1d: number;
  consecutiveLimitUp: number;
}

// --- 2. 필요할 수 있는 간단한 보조 함수들 (이미 있는 것들은 재사용)---
function calcSMA(values: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
      continue;
    }
    let sum = 0;
    for (let j = 0; j < period; j++) sum += values[i - j];
    result.push(sum / period);
  }
  return result;
}

function calcStandardDeviation(values: number[], period: number): number[] {
  const sma = calcSMA(values, period);
  const result: number[] = [];
  for (let i = period - 1; i < values.length; i++) {
    let sumSq = 0;
    for (let j = 0; j < period; j++) sumSq += Math.pow(values[i - j] - sma[i], 2);
    result.push(Math.sqrt(sumSq / period));
  }
  // 앞부분을 NaN으로 채워 길이 맞춤
  const filled = new Array(values.length).fill(NaN);
  for (let i = period - 1; i < values.length; i++) filled[i] = result[i - (period - 1)];
  return filled;
}

function linearSlope(values: number[]): number {
  if (values.length < 2) return 0;
  const n = values.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return 0;
  const slope = (n * sumXY - sumX * sumY) / denominator;
  return slope;
}

// --- 3. 핵심 계산 함수들 ---

/**
 * 5일 최저점 추세 (Low_Trend_PCT)
 */
export const calcLowTrendPct = (lows: number[]): number => {
  if (lows.length < 20) return 0;
  const prevMinLow = Math.min(...lows.slice(-20, -10));
  const currMinLow = Math.min(...lows.slice(-10));
  if (prevMinLow === 0) return 0;
  return (currMinLow - prevMinLow) / prevMinLow * 100;
};

/**
 * 거래량 품질 (Vol_Quality): 빨간 양봉 평균 거래량 / 파란 음봉 평균 거래량
 */
export const calcVolQuality = (closes: number[], volumes: number[]): number => {
  if (closes.length < 20) return 1;
  let redVolSum = 0, blueVolSum = 0, redCount = 0, blueCount = 0;
  for (let i = closes.length - 20; i < closes.length; i++) {
    if (i === 0) continue;
    if (closes[i] > closes[i-1]) {
      redVolSum += volumes[i];
      redCount++;
    } else {
      blueVolSum += volumes[i];
      blueCount++;
    }
  }
  const avgRed = redCount > 0 ? redVolSum / redCount : 1;
  const avgBlue = blueCount > 0 ? blueVolSum / blueCount : 1;
  return avgRed / avgBlue;
};

/**
 * MACD 기울기(%)
 */
export const calcMACDSlopePct = (closes: number[]): number => {
  const ema12 = calcEMASeries(closes, 12);
  const ema26 = calcEMASeries(closes, 26);
  const macd: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    const e12 = ema12[i];
    const e26 = ema26[i];
    if (e12 !== null && e26 !== null) macd.push(e12 - e26);
    else macd.push(NaN);
  }
  const recentMacd = macd.filter(v => !isNaN(v)).slice(-5);
  if (recentMacd.length < 5) return 0;
  const slope = linearSlope(recentMacd);
  const lastClose = closes[closes.length - 1];
  if (lastClose === 0) return 0;
  return (slope / lastClose) * 100;
};

/**
 * 볼린저 밴드 계산
 */
export const calcBollingerBands = (closes: number[], period = 20, stdDev = 2) => {
  const sma = calcSMA(closes, period);
  const std = calcStandardDeviation(closes, period);
  const upper = sma.map((m, i) => m + stdDev * std[i]);
  const lower = sma.map((m, i) => m - stdDev * std[i]);
  return { sma, upper, lower, bandwidth: upper.map((u, i) => (u - lower[i]) / sma[i] * 100) };
};

/**
 * Keltner Channel 계산 (ATR 기반)
 */
export const calcKeltnerChannel = (highs: number[], lows: number[], closes: number[], period = 20, multiplier = 1.5) => {
  const ema = calcEMASeries(closes, period);
  const atrSeries: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    const atr = calcATR(highs.slice(0, i+1), lows.slice(0, i+1), closes.slice(0, i+1), period);
    atrSeries.push(atr !== null ? atr : NaN);
  }
  const upper = ema.map((e, i) => (e !== null ? e + multiplier * atrSeries[i] : NaN));
  const lower = ema.map((e, i) => (e !== null ? e - multiplier * atrSeries[i] : NaN));
  return { middle: ema, upper, lower };
};

/**
 * TTM Squeeze 감지 (BB가 KC 안에 있음)
 */
export const calcTTMSqueeze = (highs: number[], lows: number[], closes: number[]): boolean => {
  if (closes.length < 20) return false;
  const bb = calcBollingerBands(closes);
  const kc = calcKeltnerChannel(highs, lows, closes);
  const lastIdx = closes.length - 1;
  const bbLower = bb.lower[lastIdx];
  const bbUpper = bb.upper[lastIdx];
  const kcLower = kc.lower[lastIdx];
  const kcUpper = kc.upper[lastIdx];
  if (isNaN(bbLower) || isNaN(bbUpper) || isNaN(kcLower) || isNaN(kcUpper)) return false;
  return bbLower > kcLower && bbUpper < kcUpper;
};

/**
 * 볼린저 밴드 확장 감지
 */
export const calcBBExpanding = (closes: number[]): boolean => {
  const bb = calcBollingerBands(closes);
  const bandwidth = bb.bandwidth;
  const lastIdx = bandwidth.length - 1;
  if (lastIdx < 5) return false;
  const prevBandwidth = bandwidth[lastIdx - 5];
  return !isNaN(prevBandwidth) && bandwidth[lastIdx] > prevBandwidth * 1.05;
};

/**
 * MFI14 (Money Flow Index)
 */
export const calcMFI = (highs: number[], lows: number[], closes: number[], volumes: number[], period = 14): number | null => {
  if (closes.length < period + 1) return null;
  const typicalPrice = highs.map((h, i) => (h + lows[i] + closes[i]) / 3);
  const moneyFlow = typicalPrice.map((tp, i) => tp * volumes[i]);
  let positiveFlow = 0, negativeFlow = 0;
  for (let i = 1; i <= period; i++) {
    if (typicalPrice[i] > typicalPrice[i-1]) positiveFlow += moneyFlow[i];
    else negativeFlow += moneyFlow[i];
  }
  for (let i = period + 1; i < closes.length; i++) {
    if (typicalPrice[i] > typicalPrice[i-1]) positiveFlow = positiveFlow * (period-1)/period + moneyFlow[i]/period;
    else negativeFlow = negativeFlow * (period-1)/period + moneyFlow[i]/period;
  }
  if (negativeFlow === 0) return 100;
  const moneyRatio = positiveFlow / negativeFlow;
  return 100 - 100 / (1 + moneyRatio);
};

/**
 * Range Position (Range_Pos)
 */
export const calcRangePos = (highs: number[], lows: number[], closes: number[]): number => {
  const period = 20;
  if (closes.length < period) return 0;
  const recentHighs = highs.slice(-period);
  const recentLows = lows.slice(-period);
  const maxHigh = Math.max(...recentHighs);
  const minLow = Math.min(...recentLows);
  const lastClose = closes[closes.length - 1];
  if (maxHigh === minLow) return 0;
  return (lastClose - minLow) / (maxHigh - minLow);
};

/**
 * 이격도 (Disparity): (종가 - MA20)/MA20 * 100
 */
export const calcDisparity = (closes: number[]): number => {
  const ma20 = calcSMA(closes, 20);
  const lastClose = closes[closes.length - 1];
  const lastMa20 = ma20[ma20.length - 1];
  if (isNaN(lastMa20) || lastMa20 === 0) return 0;
  return (lastClose - lastMa20) / lastMa20 * 100;
};

/**
 * 종가가 MA20 위인지 확인
 */
export const isAboveMA20 = (closes: number[]): boolean => {
  const ma20 = calcSMA(closes, 20);
  const lastMa20 = ma20[ma20.length - 1];
  return !isNaN(lastMa20) && closes[closes.length - 1] > lastMa20;
};

/**
 * 트리거 점수 (간소화 버전)
 */
export const calcTriggerScore = (closes: number[], highs: number[], lows: number[], volumes: number[]): number => {
  if (closes.length < 20) return 0;
  let score = 0;
  const lastIdx = closes.length - 1;
  const avgVolume = volumes.slice(-20).reduce((a,b) => a+b, 0) / 20;
  const volRatio = volumes[lastIdx] / avgVolume;
  // Volume Score (최대 40)
  if (volRatio >= 1.2 && volRatio <= 3.0) score += 40;
  else if (volRatio >= 0.5 && volRatio < 1.2) score += 5 + (volRatio - 0.5) * 50;
  else if (volRatio > 3.0 && volRatio <= 4.0) score += 40 - (volRatio - 3.0) * 20;
  else if (volRatio > 4.0) score += 20;
  else if (volRatio < 0.5) score += 5;
  // Breakout Score (최대 40)
  const bb = calcBollingerBands(closes);
  if (closes[lastIdx] >= bb.upper[lastIdx]) score += 40;
  else if (closes[lastIdx] >= bb.sma[lastIdx]) score += 20;
  // Momentum Score (최대 10)
  const macd = calcMACDSlopePct(closes);
  if (macd > 0) score += 10;
  // Penalty 간소화
  let penalty = 0;
  if (volRatio >= 3.0 && closes[lastIdx] < closes[lastIdx-1]) penalty += 25;
  return Math.min(90, Math.max(0, score - penalty));
};

/**
 * 볼륨 프로파일 (간소화)
 */
export const calcVolumeProfile = (highs: number[], lows: number[], closes: number[], volumes: number[]) => {
  // 간소화: POC는 가장 높은 거래량의 가격대로 가정
  const lastClose = closes[closes.length - 1];
  const poc = lastClose; // 실제로는 히스토그램 필요
  const totalVolume = volumes.slice(-20).reduce((a,b) => a+b, 0);
  const volAbove = volumes.slice(-20).reduce((sum, vol, i) => {
    return sum + (highs[highs.length - 20 + i] > lastClose ? vol : 0);
  }, 0);
  const resRatio = totalVolume > 0 ? volAbove / totalVolume : 0;
  return { poc, resRatio, isAbovePoc: lastClose > poc, pocGap: Math.abs((lastClose - poc) / poc * 100) };
};

/**
 * SuperTrend
 */
export const calcSuperTrend = (highs: number[], lows: number[], closes: number[], period = 10, multiplier = 3) => {
  const atr = calcATR(highs, lows, closes, period);
  if (atr === null) return { direction: 0, upperBand: NaN, lowerBand: NaN };
  const hl2 = highs.map((h, i) => (h + lows[i]) / 2);
  let upperBand = hl2[hl2.length - 1] + multiplier * atr;
  let lowerBand = hl2[hl2.length - 1] - multiplier * atr;
  let direction = 1;
  const lastClose = closes[closes.length - 1];
  if (lastClose <= lowerBand) direction = -1;
  else if (lastClose >= upperBand) direction = 1;
  return { direction, upperBand, lowerBand };
};

/**
 * 멀티 타임프레임 추세
 */
export const calcMultiTimeframeTrend = (dailyCloses: number[]) => {
  // 주봉 데이터 생성 (간소화: 매 5일)
  const weeklyCloses: number[] = [];
  for (let i = 4; i < dailyCloses.length; i += 5) weeklyCloses.push(dailyCloses[i]);
  // 월봉 데이터 (매 20일)
  const monthlyCloses: number[] = [];
  for (let i = 19; i < dailyCloses.length; i += 20) monthlyCloses.push(dailyCloses[i]);
  const weeklyTrend = weeklyCloses.length >= 20 ? (weeklyCloses[weeklyCloses.length-1] > weeklyCloses[weeklyCloses.length-20] ? 1 : -1) : 0;
  const monthlyTrend = monthlyCloses.length >= 12 ? (monthlyCloses[monthlyCloses.length-1] > monthlyCloses[monthlyCloses.length-12] ? 1 : -1) : 0;
  const sufficient = weeklyCloses.length >= 26 && monthlyCloses.length >= 12;
  return { weeklyTrend, monthlyTrend, sufficient };
};

/**
 * 모든 지표를 한 번에 계산 (주요 함수)
 */
export const calculateAllSwingIndicators = (candles: Candle[], sectorRank = 99, turnoverEok = 0): SwingIndicatorData => {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);
  const lastClose = closes[closes.length - 1];
  const lastVolume = volumes[volumes.length - 1];
  
  // RSI
  const rsi = calcRSI(closes, 14) || 50;
  
  // 갭 %
  const gapPct = candles.length > 1 ? (candles[candles.length-1].open / candles[candles.length-2].close - 1) * 100 : 0;
  
  // 수익률
  const ret1d = candles.length > 1 ? (closes[closes.length-1] / closes[closes.length-2] - 1) * 100 : 0;
  const ret5d = candles.length > 5 ? (closes[closes.length-1] / closes[closes.length-6] - 1) * 100 : 0;
  
  // 연속 상한가 (간소화: 29% 이상 상승 연속)
  let consecutiveLimitUp = 0;
  for (let i = closes.length-1; i > 0; i--) {
    if ((closes[i] / closes[i-1] - 1) * 100 >= 29) consecutiveLimitUp++;
    else break;
  }
  
  // 나머지 지표 계산
  const lowTrendPct = calcLowTrendPct(lows);
  const volQuality = calcVolQuality(closes, volumes);
  const macdSlopePct = calcMACDSlopePct(closes);
  const ttmSqueeze = calcTTMSqueeze(highs, lows, closes);
  const bbExpanding = calcBBExpanding(closes);
  const mfi = calcMFI(highs, lows, closes, volumes, 14) || 50;
  const rangePos = calcRangePos(highs, lows, closes);
  const disparity = calcDisparity(closes);
  const aboveMa20 = isAboveMA20(closes);
  const rawTriggerScore = calcTriggerScore(closes, highs, lows, volumes);
  const vp = calcVolumeProfile(highs, lows, closes, volumes);
  const supertrend = calcSuperTrend(highs, lows, closes);
  const mtf = calcMultiTimeframeTrend(closes);
  
  return {
    lowTrendPct, volQuality, macdSlopePct, rsi14: rsi,
    ttmSqueeze, bbExpanding, mfi14: mfi, rangePos, disparity,
    aboveMa20, turnoverEok: turnoverEok || (lastClose * lastVolume / 1e8),
    mtfWeeklyTrend: mtf.weeklyTrend, mtfMonthlyTrend: mtf.monthlyTrend, mtfDataSufficient: mtf.sufficient,
    rawTriggerScore, resRatio: vp.resRatio, resRatioNear: 0, // 간소화
    pocGap: vp.pocGap, isAbovePoc: vp.isAbovePoc,
    supertrendDir: supertrend.direction, gapPct, sectorRank,
    ret5d, ret1d, consecutiveLimitUp
  };
};
