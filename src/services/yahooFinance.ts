import yahooFinance from "yahoo-finance2";
import type { OHLCVBar, ProcessedStock, StockQuote } from "../types/index.js";
import { calcEMA, isEMARising } from "../indicators/ema.js";
import { calcRSI } from "../indicators/rsi.js";
import { calcATR } from "../indicators/atr.js";
import {
  calcOBVTrend,
  calcAccumulationDistributionTrend,
  isInstitutionalAccumulation,
  findOrderBlockHigh,
} from "../indicators/volume.js";
import { detectVCP } from "../indicators/vcp.js";
import { checkMinervini } from "../screeners/swing.js";

export async function fetchUniverse(limit = 120): Promise<string[]> {
  const [actives, gainers, dayGainers] = await Promise.all([
    (yahooFinance as any).screener({ scrIds: "most_actives", count: limit }).catch(() => null),
    (yahooFinance as any).screener({ scrIds: "day_gainers", count: 80 }).catch(() => null),
    (yahooFinance as any).screener({ scrIds: "undervalued_growth_stocks", count: 50 }).catch(() => null),
  ]);

  const symbols = new Set<string>();
  for (const result of [actives, gainers, dayGainers]) {
    const quotes = result?.quotes ?? [];
    for (const q of quotes) {
      if (q.symbol && /^[A-Z]{1,5}$/.test(q.symbol)) symbols.add(q.symbol);
    }
  }
  return Array.from(symbols).slice(0, limit);
}

export async function fetchHistorical(symbol: string): Promise<OHLCVBar[]> {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 1);

  const rows = await (yahooFinance as any).historical(symbol, {
    period1: start,
    period2: end,
    interval: "1d",
  });

  return rows
    .filter((r: any) => r.open != null && r.close != null)
    .map((r: any) => ({
      date: r.date,
      open: r.open!,
      high: r.high ?? r.close!,
      low: r.low ?? r.close!,
      close: r.close!,
      volume: r.volume ?? 0,
    }))
    .sort((a: any, b: any) => a.date.getTime() - b.date.getTime());
}

export async function fetchQuoteSummary(symbol: string): Promise<Partial<StockQuote>> {
  try {
    const q = await (yahooFinance as any).quoteSummary(symbol, {
      modules: ["price", "summaryDetail", "defaultKeyStatistics", "assetProfile"],
    });
    const price = q.price;
    const stats = q.defaultKeyStatistics;
    const profile = q.assetProfile;
    return {
      symbol,
      name: price?.longName ?? price?.shortName ?? symbol,
      price: price?.regularMarketPrice ?? 0,
      open: price?.regularMarketOpen ?? 0,
      high: price?.regularMarketDayHigh ?? 0,
      low: price?.regularMarketDayLow ?? 0,
      previousClose: price?.regularMarketPreviousClose ?? 0,
      volume: price?.regularMarketVolume ?? 0,
      marketCap: price?.marketCap ?? stats?.marketCap ?? 0,
      sharesOutstanding: stats?.sharesOutstanding ?? 0,
      floatShares: stats?.floatShares ?? stats?.sharesOutstanding ?? 0,
      sector: profile?.sector ?? "Unknown",
      industry: profile?.industry ?? "Unknown",
    };
  } catch {
    const q = await (yahooFinance as any).quote(symbol);
    return {
      symbol,
      name: q.longName ?? q.shortName ?? symbol,
      price: q.regularMarketPrice ?? 0,
      open: q.regularMarketOpen ?? 0,
      high: q.regularMarketDayHigh ?? 0,
      low: q.regularMarketDayLow ?? 0,
      previousClose: q.regularMarketPreviousClose ?? 0,
      volume: q.regularMarketVolume ?? 0,
      marketCap: q.marketCap ?? 0,
      sharesOutstanding: 0,
      floatShares: 0,
      sector: "Unknown",
      industry: "Unknown",
    };
  }
}

export function processStock(
  quote: Partial<StockQuote>,
  bars: OHLCVBar[],
  spyReturn20d: number,
  spyReturn3m: number
): ProcessedStock | null {
  if (bars.length < 50) return null;

  const closes = bars.map((b) => b.close);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const volumes = bars.map((b) => b.volume);
  const opens = bars.map((b) => b.open);

  const last = bars[bars.length - 1];
  const price = quote.price && quote.price > 0 ? quote.price : last.close;
  const open = quote.open && quote.open > 0 ? quote.open : last.open;
  const high = quote.high && quote.high > 0 ? quote.high : last.high;
  const low = quote.low && quote.low > 0 ? quote.low : last.low;
  const volume = quote.volume && quote.volume > 0 ? quote.volume : last.volume;
  const previousClose =
    quote.previousClose && quote.previousClose > 0
      ? quote.previousClose
      : closes[closes.length - 2] ?? price;

  const avgVolume20 = average(volumes.slice(-21, -1));
  const rvol = avgVolume20 > 0 ? volume / avgVolume20 : 0;
  const dollarVolume = volume * price;

  const ema9 = calcEMA(closes, 9);
  const ema20 = calcEMA(closes, 20);
  const ema50 = calcEMA(closes, 50);
  const ema150 = calcEMA(closes, 150);
  const ema200 = calcEMA(closes, 200);
  const ema200Rising = isEMARising(closes, 200, 20);

  const rsi = calcRSI(closes);
  const atr = calcATR(highs, lows, closes, 14);
  const atrPct = atr && price > 0 ? (atr / price) * 100 : null;

  const high20 = Math.max(...highs.slice(-21, -1));
  const high30 = Math.max(...highs.slice(-31, -1));
  const high52w = Math.max(...highs.slice(-252));

  const idx20 = closes.length >= 21 ? closes[closes.length - 21] : closes[0];
  const idx3m = closes.length >= 64 ? closes[closes.length - 64] : closes[0];
  const return20d = idx20 > 0 ? ((price - idx20) / idx20) * 100 : 0;
  const return3m = idx3m > 0 ? ((price - idx3m) / idx3m) * 100 : 0;

  const dayRange = high - low;
  const rangePosition = dayRange > 0 ? (price - low) / dayRange : 0;

  const orderBlockHigh = findOrderBlockHigh(highs, volumes, 15);
  const gapUp = open >= previousClose * 1.02;
  const institutionalAccumulation = isInstitutionalAccumulation(highs, lows, closes, volumes, 20);

  const vol10 = average(volumes.slice(-10));
  const vol50 = average(volumes.slice(-50));
  const volContractionExpansion = vol10 > vol50;

  const breakout30d = price >= high30;
  const nearBreakout30d = price >= high30 * 0.97;

  const near52wHigh = high52w > 0 && (high52w - price) / high52w <= 0.1;
  const minerviniPass = checkMinervini(price, ema20, ema50, ema150, ema200, ema200Rising);
  const vcpScore = detectVCP(highs, lows, closes, volumes);

  return {
    symbol: quote.symbol ?? "",
    name: quote.name ?? quote.symbol ?? "",
    price,
    open,
    high,
    low,
    previousClose,
    volume,
    marketCap: quote.marketCap ?? 0,
    sharesOutstanding: quote.sharesOutstanding ?? 0,
    floatShares: quote.floatShares ?? quote.sharesOutstanding ?? 0,
    sector: quote.sector ?? "Unknown",
    industry: quote.industry ?? "Unknown",
    bars,
    ema9,
    ema20,
    ema50,
    ema150,
    ema200,
    rsi,
    atr,
    atrPct,
    rvol,
    avgVolume20,
    dollarVolume,
    high20,
    high30,
    high52w,
    return20d,
    return3m,
    rangePosition,
    orderBlockHigh,
    gapUp,
    institutionalAccumulation,
    obvTrend: calcOBVTrend(closes, volumes),
    adTrend: calcAccumulationDistributionTrend(highs, lows, closes, volumes),
    vcpScore,
    minerviniPass,
    ema200Rising,
    volContractionExpansion,
    breakout30d,
    nearBreakout30d,
    near52wHigh,
    spyReturn20d,
    spyReturn3m,
  };
}

function average(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export async function fetchBenchmarkReturns(): Promise<{
  spyBars: OHLCVBar[];
  spyReturn20d: number;
  spyReturn3m: number;
  qqqBars: OHLCVBar[];
  iwmBars: OHLCVBar[];
}> {
  const [spyBars, qqqBars, iwmBars] = await Promise.all([
    fetchHistorical("SPY"),
    fetchHistorical("QQQ"),
    fetchHistorical("IWM"),
  ]);

  const spyCloses = spyBars.map((b) => b.close);
  const idx20 = spyCloses.length >= 21 ? spyCloses[spyCloses.length - 21] : spyCloses[0];
  const idx3m = spyCloses.length >= 64 ? spyCloses[spyCloses.length - 64] : spyCloses[0];
  const last = spyCloses[spyCloses.length - 1] ?? 0;

  return {
    spyBars,
    qqqBars,
    iwmBars,
    spyReturn20d: idx20 > 0 ? ((last - idx20) / idx20) * 100 : 0,
    spyReturn3m: idx3m > 0 ? ((last - idx3m) / idx3m) * 100 : 0,
  };
}
