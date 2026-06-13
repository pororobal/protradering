import type { ProcessedStock, SwingTradeResult, ScoreBreakdown } from "../types/index.js";
import { clamp } from "../utils/format.js";

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
