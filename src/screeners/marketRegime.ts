import type { OHLCVBar, IndexAnalysis, MarketRegime, MarketRegimeResult } from "../types/index.js";
import { calcEMA, isEMARising } from "../indicators/ema.js";
import { calcATR } from "../indicators/atr.js";

export function analyzeIndex(symbol: string, bars: OHLCVBar[]): IndexAnalysis {
  const closes = bars.map((b) => b.close);
  const price = closes[closes.length - 1] ?? 0;
  const ema50 = calcEMA(closes, 50);
  const ema200 = calcEMA(closes, 200);
  const ema50Series = closes.length >= 70 ? calcEMA(closes.slice(0, -20), 50) : null;
  const ema50Slope = ema50 && ema50Series ? ((ema50 - ema50Series) / ema50Series) * 100 : 0;
  const idx20 = closes.length >= 21 ? closes[closes.length - 21] : closes[0];
  const change20d = idx20 > 0 ? ((price - idx20) / idx20) * 100 : 0;

  return {
    symbol,
    price,
    aboveEma50: ema50 != null && price > ema50,
    aboveEma200: ema200 != null && price > ema200,
    ema50Slope,
    change20d,
  };
}

export function computeMarketRegime(
  spy: IndexAnalysis,
  qqq: IndexAnalysis,
  iwm: IndexAnalysis,
  spyBars: OHLCVBar[],
  advancingRatio: number
): MarketRegimeResult {
  const closes = spyBars.map((b) => b.close);
  const highs = spyBars.map((b) => b.high);
  const lows = spyBars.map((b) => b.low);
  const volumes = spyBars.map((b) => b.volume);

  const volRecent = avg(volumes.slice(-10));
  const volPrev = avg(volumes.slice(-30, -10));
  let volumeTrend: MarketRegimeResult["volumeTrend"] = "neutral";
  if (volRecent > volPrev * 1.1) volumeTrend = "expanding";
  else if (volRecent < volPrev * 0.9) volumeTrend = "contracting";

  const atr = calcATR(highs, lows, closes, 14);
  const atrPct = atr && closes[closes.length - 1] ? (atr / closes[closes.length - 1]) * 100 : 0;
  let volatility: MarketRegimeResult["volatility"] = "moderate";
  if (atrPct >= 2.5) volatility = "high";
  else if (atrPct <= 1.2) volatility = "low";

  let riskScore = 0;
  if (spy.aboveEma50) riskScore += 2;
  if (spy.aboveEma200) riskScore += 2;
  if (qqq.aboveEma50) riskScore += 1;
  if (iwm.aboveEma50) riskScore += 1;
  if (advancingRatio >= 0.55) riskScore += 2;
  else if (advancingRatio <= 0.45) riskScore -= 2;
  if (volumeTrend === "expanding" && spy.change20d > 0) riskScore += 1;
  if (volatility === "high" && spy.change20d < 0) riskScore -= 2;

  let regime: MarketRegime = "NEUTRAL";
  if (riskScore >= 5) regime = "RISK_ON";
  else if (riskScore <= 1) regime = "RISK_OFF";

  const summary =
    regime === "RISK_ON"
      ? "추세·브레드스 양호 — 공격적 알파 탐색 구간"
      : regime === "RISK_OFF"
        ? "방어적 환경 — 포지션 축소·선별적 진입"
        : "혼조세 — 선별적 브레이크아웃만 추적";

  return {
    regime,
    spy,
    qqq,
    iwm,
    breadth: advancingRatio,
    volumeTrend,
    volatility,
    summary,
  };
}

function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function calcPeriodReturn(bars: OHLCVBar[], days: number): number {
  const closes = bars.map((b) => b.close);
  if (closes.length < days + 1) return 0;
  const from = closes[closes.length - 1 - days];
  const to = closes[closes.length - 1];
  return from > 0 ? ((to - from) / from) * 100 : 0;
}
