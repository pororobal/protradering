import type { ProcessedStock, DayTradeResult, ScoreBreakdown } from "../types/index.js";
import { clamp } from "../utils/format.js";

export function passesDayTradeFilters(s: ProcessedStock): boolean {
  // 가격 필터 제거 - 급등주 포함
  if (s.volume < 1_200_000) return false;
  if (s.dollarVolume < 20_000_000) return false;
  if (s.rvol < 1.8) return false;
  if (!s.ema9 || !s.ema20 || s.price <= s.ema9 || s.ema9 <= s.ema20) return false;

  const breakout20 = s.price >= s.high20;
  const nearBreakout20 = s.price >= s.high20 * 0.98;
  if (!breakout20 && !nearBreakout20) return false;

  if (s.price < s.orderBlockHigh * 0.992) return false;
  if (s.rangePosition < 0.75) return false;
  if (s.rsi == null || s.rsi < 50 || s.rsi > 75) return false;
  if (s.atrPct == null || s.atrPct < 3) return false;
  if (s.return20d <= s.spyReturn20d) return false;
  if (s.floatShares > 500_000_000) return false;

  return true;
}

export function scoreDayTrade(s: ProcessedStock): DayTradeResult | null {
  if (!passesDayTradeFilters(s)) return null;

  const breakdown: ScoreBreakdown = {};

  breakdown.rvol = scoreRvol(s.rvol);
  breakdown.relativeStrength = scoreRS20(s.return20d, s.spyReturn20d);
  breakdown.breakout = scoreBreakout(s.price, s.high20);
  breakdown.institutional = s.institutionalAccumulation ? 40 : s.adTrend === "up" ? 25 : 10;
  breakdown.atr = scoreATR(s.atrPct);
  breakdown.float = scoreFloat(s.floatShares);
  breakdown.trend = scoreTrend(s.price, s.ema9, s.ema20);
  breakdown.gap = s.gapUp ? 30 : s.open >= s.previousClose * 1.01 ? 15 : 0;

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const dayChange =
    s.previousClose > 0 ? ((s.price - s.previousClose) / s.previousClose) * 100 : 0;

  return {
    symbol: s.symbol,
    name: s.name,
    price: s.price,
    score: Math.round(score),
    maxScore: 300,
    breakdown,
    sector: s.sector,
    industry: s.industry,
    rvol: s.rvol,
    rsi: s.rsi,
    atrPct: s.atrPct,
    floatShares: s.floatShares,
    dayChange,
    return20d: s.return20d,
    rs20d: s.return20d - s.spyReturn20d,
    gapUp: s.gapUp,
    marketCap: s.marketCap,
    volume: s.volume,
  };
}

function scoreRvol(rvol: number): number {
  if (rvol >= 4) return 50;
  if (rvol >= 3) return 42;
  if (rvol >= 2.5) return 35;
  if (rvol >= 2) return 28;
  if (rvol >= 1.8) return 20;
  return 0;
}

function scoreRS20(ret: number, spyRet: number): number {
  const diff = ret - spyRet;
  if (diff >= 25) return 50;
  if (diff >= 15) return 42;
  if (diff >= 10) return 35;
  if (diff >= 5) return 25;
  if (diff > 0) return 15;
  return 0;
}

function scoreBreakout(price: number, high20: number): number {
  if (price >= high20) return 40;
  const pctFromHigh = ((high20 - price) / high20) * 100;
  if (pctFromHigh <= 0.5) return 35;
  if (pctFromHigh <= 1) return 28;
  if (pctFromHigh <= 2) return 20;
  return 0;
}

function scoreATR(atrPct: number | null): number {
  if (atrPct == null) return 0;
  if (atrPct >= 6) return 30;
  if (atrPct >= 5) return 26;
  if (atrPct >= 4) return 22;
  if (atrPct >= 3) return 18;
  return 0;
}

function scoreFloat(floatShares: number): number {
  if (floatShares <= 50_000_000) return 30;
  if (floatShares <= 100_000_000) return 25;
  if (floatShares <= 200_000_000) return 18;
  if (floatShares <= 500_000_000) return 10;
  return 0;
}

function scoreTrend(price: number, ema9: number | null, ema20: number | null): number {
  if (!ema9 || !ema20) return 0;
  let score = 0;
  if (price > ema9) score += 15;
  if (ema9 > ema20) score += 10;
  const spread = ((ema9 - ema20) / ema20) * 100;
  if (spread >= 2) score += 5;
  return clamp(score, 0, 30);
}
