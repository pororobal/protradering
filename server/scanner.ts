// server/scanner.ts
// 핵심 스캔 로직 — yahoo-finance2 안정화 버전
// 모든 Yahoo Finance 호출은 server/yahoo.ts 래퍼를 통해 처리

import { safeScreener, safeHistorical, safeQuote, safeQuoteSummary, getSpyReturns } from "./yahoo.js";
import { computeIndicators, type Indicators } from "./indicators.js";

// ─── 타입 ────────────────────────────────────────────────────────────────────

export interface StockResult {
  ticker: string;
  name: string;
  price: number;
  dayChange: number;
  change3m?: number;
  change6m?: number;
  change5d?: number;
  marketCap: number;
  volume: number;
  avgVolume: number;
  rvol: number;
  rsi: number | null;
  macd: number | null;
  macdHist: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  atr: number | null;
  high52w: number;
  low52w: number;
  score: number;
  breakdown: Record<string, number>;
  type: "daytrade" | "swing";
  vcpScore?: number;
}

export interface CommonResult {
  ticker: string;
  name: string;
  price: number;
  dayChange: number;
  marketCap: number;
  dayScore: number;
  swingScore: number;
  combinedScore: number;
  dayBreakdown: Record<string, number>;
  swingBreakdown: Record<string, number>;
  rsi: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  atr: number | null;
  high52w: number;
  low52w: number;
  rvol: number;
  volume: number;
  type: "common";
}

export interface ScanResult {
  daytrade: StockResult[];
  swing: StockResult[];
  common: CommonResult[];
  scannedCount: number;
  spyChange3m: number;
  spyChange6m: number;
  timestamp: string;
}

// ─── 단타 점수 ───────────────────────────────────────────────────────────────

function calcDayScore(
  ind: Indicators,
  marketCap: number
): { score: number; breakdown: Record<string, number> } | null {
  // 유동성 필터
  if (ind.currentPrice < 2) return null;
  if (marketCap < 100_000_000 || marketCap > 20_000_000_000) return null;
  if (ind.avgDollarVolume < 5_000_000) return null;

  let score = 0;
  const bd: Record<string, number> = {};

  // 2차: 거래량 25점
  let vs = 0;
  if (ind.rvol >= 3) vs = 25;
  else if (ind.rvol >= 2) vs = 20;
  else if (ind.rvol >= 1.5) vs = 12;
  const vr = ind.avgVolume20 > 0 ? ind.currentVolume / ind.avgVolume20 : 0;
  if (vr >= 3) vs = Math.min(25, vs + 5);
  else if (vr >= 2) vs = Math.min(25, vs + 3);
  bd.volume = vs;
  score += vs;

  // 3차: 모멘텀 20점
  let ms = 0;
  if (ind.dayChange >= 5) ms = 20;
  else if (ind.dayChange >= 3) ms = 15;
  else if (ind.dayChange >= 1) ms = 8;
  if (ind.change5d >= 15) ms = Math.min(20, ms + 5);
  else if (ind.change5d >= 10) ms = Math.min(20, ms + 3);
  bd.momentum = ms;
  score += ms;

  // 4차: 돌파 25점
  let bs = 0;
  if (ind.isNearYearHigh) bs = 25;
  else if (ind.breakHigh60) bs = 22;
  else if (ind.breakHigh20) bs = 18;
  else if (ind.gapUpSupport) bs = 20;
  else if (ind.gapUp) bs = 12;
  bd.breakout = bs;
  score += bs;

  // 5차: 기술강도 15점
  let ts = 0;
  if (ind.rsi !== null) {
    if (ind.rsi >= 55 && ind.rsi <= 85) ts += 8;
    else if (ind.rsi > 85) ts += 2;
    else if (ind.rsi >= 45) ts += 4;
  }
  if (ind.macdHist !== null && ind.macdHist > 0) ts += 4;
  if (ind.ema20 !== null && ind.currentPrice > ind.ema20) ts += 3;
  ts = Math.min(15, ts);
  bd.technical = ts;
  score += ts;

  // 6차: 변동성 15점
  let vs2 = 0;
  if (ind.atrIncreasing) vs2 += 10;
  if (ind.atr !== null && ind.currentPrice > 0) {
    const atrPct = (ind.atr / ind.currentPrice) * 100;
    if (atrPct >= 3) vs2 += 5;
    else if (atrPct >= 2) vs2 += 3;
    else if (atrPct >= 1) vs2 += 1;
  }
  vs2 = Math.min(15, vs2);
  bd.volatility = vs2;
  score += vs2;

  return { score: Math.round(score), breakdown: bd };
}

// ─── 배치 처리 ───────────────────────────────────────────────────────────────

async function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function processSymbol(
  symbol: string,
  quoteData: any,
  spyChange3m: number,
  spyChange6m: number
): Promise<{ day: StockResult | null; swing: StockResult | null }> {
  // 유효 티커만 처리
  if (!/^[A-Z]{1,5}$/.test(symbol)) return { day: null, swing: null };

  try {
    // 히스토리 데이터
    const hist = await safeHistorical(symbol);
    if (hist.length < 20) return { day: null, swing: null };

    const ind = computeIndicators(hist as any);
    if (!ind) return { day: null, swing: null };

    // 시가총액: quote 데이터 → quoteSummary 순으로 시도
    let marketCap = quoteData?.marketCap ?? 0;
    let companyName =
      quoteData?.longName || quoteData?.shortName || quoteData?.displayName || symbol;

    if (!marketCap) {
      const qs = await safeQuoteSummary(symbol);
      marketCap =
        qs?.price?.marketCap?.raw ??
        qs?.price?.marketCap ??
        qs?.summaryDetail?.marketCap?.raw ??
        0;
      if (!companyName || companyName === symbol) {
        companyName = qs?.price?.longName || qs?.price?.shortName || symbol;
      }
    }

    const base = {
      ticker: symbol,
      name: companyName,
      price: ind.currentPrice,
      marketCap,
      volume: ind.currentVolume,
      avgVolume: ind.avgVolume20,
      rvol: ind.rvol,
      rsi: ind.rsi,
      macd: ind.macd,
      macdHist: ind.macdHist,
      ema20: ind.ema20,
      ema50: ind.ema50,
      ema200: ind.ema200,
      atr: ind.atr,
      high52w: ind.high52w,
      low52w: ind.low52w,
    };

    // 단타 점수
    const dayRes = calcDayScore(ind, marketCap);
    const day: StockResult | null =
      dayRes && dayRes.score >= 60
        ? {
            ...base,
            dayChange: ind.dayChange,
            change5d: ind.change5d,
            score: dayRes.score,
            breakdown: dayRes.breakdown,
            type: "daytrade",
          }
        : null;

    return { day, swing: null };
  } catch (e: any) {
    console.warn(`[scanner] ${symbol} 처리 오류: ${e.message?.slice(0, 60)}`);
    return { day: null, swing: null };
  }
}

// ─── 메인 스캔 ───────────────────────────────────────────────────────────────

export async function runScan(): Promise<ScanResult> {
  console.log("[scanner] 스캔 시작...");

  // 1. 후보 종목 수집
  const [actives, gainers, spy] = await Promise.all([
    safeScreener("most_actives", 80).catch(() => []),
    safeScreener("day_gainers", 50).catch(() => []),
    getSpyReturns().catch(() => ({ change3m: 0, change6m: 0 })),
  ]);

  const { change3m: spyChange3m, change6m: spyChange6m } = spy;

  // 중복 제거
  const tickerMap = new Map<string, any>();
  for (const q of [...actives, ...gainers]) {
    const sym = q.symbol ?? q.ticker;
    if (sym && !tickerMap.has(sym)) tickerMap.set(sym, q);
  }

  const tickers = Array.from(tickerMap.keys()).slice(0, 40); // 40개로 줄여서 속도 향상
  console.log(`[scanner] 후보 종목: ${tickers.length}개`);

  // 2. 종목 처리 (배치 5개씩)
  const dayTrades: StockResult[] = [];
  const BATCH = 5;

  for (let i = 0; i < tickers.length; i += BATCH) {
    const batch = tickers.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map((sym) =>
        processSymbol(sym, tickerMap.get(sym), spyChange3m, spyChange6m)
      )
    );
    for (const { day } of results) {
      if (day) dayTrades.push(day);
    }
    // 배치 사이 딜레이 (Rate Limit 방지) - 100ms로 줄여서 속도 향상
    if (i + BATCH < tickers.length) await sleep(100);
  }

  // 3. 정렬 및 TOP10
  dayTrades.sort((a, b) => b.score - a.score);
  const top10Day = dayTrades.slice(0, 10);

  console.log(`[scanner] 완료 — 단타: ${top10Day.length}`);

  return {
    daytrade: top10Day,
    swing: [],
    common: [],
    scannedCount: tickers.length,
    spyChange3m,
    spyChange6m,
    timestamp: new Date().toISOString(),
  };
}
