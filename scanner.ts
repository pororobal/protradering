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

// ─── 스윙 점수 ───────────────────────────────────────────────────────────────

function calcSwingScore(
  ind: Indicators,
  marketCap: number,
  spyChange3m: number,
  spyChange6m: number
): { score: number; breakdown: Record<string, number> } | null {
  if (ind.currentPrice < 5) return null;
  if (marketCap < 200_000_000) return null;

  let score = 0;
  const bd: Record<string, number> = {};

  // 1차: 추세 25점
  let tr = 0;
  if (ind.ema20 && ind.ema50 && ind.ema200) {
    if (ind.ema20 > ind.ema50 && ind.ema50 > ind.ema200) tr += 10;
    else if (ind.ema20 > ind.ema50) tr += 5;
    if (ind.currentPrice > ind.ema20) tr += 5;
    if (ind.currentPrice > ind.ema50) tr += 5;
    if (ind.currentPrice > ind.ema200) tr += 5;
  } else if (ind.ema20 && ind.ema50) {
    if (ind.ema20 > ind.ema50) tr += 12;
    if (ind.currentPrice > ind.ema20) tr += 7;
    if (ind.currentPrice > ind.ema50) tr += 6;
  }
  tr = Math.min(25, tr);
  bd.trend = tr;
  score += tr;

  // 2차: 상대강도 20점
  let rs = 0;
  const d3 = ind.change3m - spyChange3m;
  const d6 = ind.change6m - spyChange6m;
  if (d3 > 15) rs += 12;
  else if (d3 > 10) rs += 9;
  else if (d3 > 5) rs += 6;
  else if (d3 > 0) rs += 3;
  if (d6 > 20) rs += 8;
  else if (d6 > 10) rs += 5;
  else if (d6 > 0) rs += 2;
  rs = Math.min(20, rs);
  bd.relStrength = rs;
  score += rs;

  // 3차: 신고가 20점
  let hs = 0;
  if (ind.high52w > 0) {
    const pct = ((ind.high52w - ind.currentPrice) / ind.high52w) * 100;
    if (pct <= 2) hs = 20;
    else if (pct <= 5) hs = 17;
    else if (pct <= 10) hs = 13;
    else if (pct <= 15) hs = 10;
    else if (ind.breakHigh20) hs = 12;
  }
  bd.nearHigh = hs;
  score += hs;

  // 4차: VCP 15점
  let vcp = 0;
  if (ind.vcpAtrDecreasing) vcp += 6;
  if (ind.vcpRangeDecreasing) vcp += 5;
  if (ind.vcpVolDecreasing) vcp += 4;
  vcp = Math.min(15, vcp);
  bd.vcp = vcp;
  score += vcp;

  // 5차: 거래량 축적 10점
  let ac = 0;
  if (ind.volAccumulation >= 0.65) ac = 10;
  else if (ind.volAccumulation >= 0.55) ac = 7;
  else if (ind.volAccumulation >= 0.5) ac = 4;
  bd.accumulation = ac;
  score += ac;

  bd.ai = 0; // AI 점수는 analyze 단계에서 채움

  return { score: Math.min(90, Math.round(score)), breakdown: bd };
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

    // 스윙 점수
    const swingRes = calcSwingScore(ind, marketCap, spyChange3m, spyChange6m);
    const swing: StockResult | null =
      swingRes && swingRes.score >= 60
        ? {
            ...base,
            dayChange: ind.dayChange,
            change3m: ind.change3m,
            change6m: ind.change6m,
            score: swingRes.score,
            breakdown: swingRes.breakdown,
            vcpScore: swingRes.breakdown.vcp,
            type: "swing",
          }
        : null;

    return { day, swing };
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

  const tickers = Array.from(tickerMap.keys()).slice(0, 80);
  console.log(`[scanner] 후보 종목: ${tickers.length}개`);

  // 2. 종목 처리 (배치 5개씩)
  const dayTrades: StockResult[] = [];
  const swingTrades: StockResult[] = [];
  const BATCH = 5;

  for (let i = 0; i < tickers.length; i += BATCH) {
    const batch = tickers.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map((sym) =>
        processSymbol(sym, tickerMap.get(sym), spyChange3m, spyChange6m)
      )
    );
    for (const { day, swing } of results) {
      if (day) dayTrades.push(day);
      if (swing) swingTrades.push(swing);
    }
    // 배치 사이 딜레이 (Rate Limit 방지)
    if (i + BATCH < tickers.length) await sleep(300);
  }

  // 3. 정렬 및 TOP10
  dayTrades.sort((a, b) => b.score - a.score);
  swingTrades.sort((a, b) => b.score - a.score);
  const top10Day   = dayTrades.slice(0, 10);
  const top10Swing = swingTrades.slice(0, 10);

  // 4. 공통 종목
  const daySet   = new Set(top10Day.map((s) => s.ticker));
  const swingSet = new Set(top10Swing.map((s) => s.ticker));
  const common: CommonResult[] = [];

  for (const ticker of daySet) {
    if (!swingSet.has(ticker)) continue;
    const d = top10Day.find((s) => s.ticker === ticker)!;
    const sw = top10Swing.find((s) => s.ticker === ticker)!;
    common.push({
      ticker,
      name: d.name,
      price: d.price,
      dayChange: d.dayChange,
      marketCap: d.marketCap,
      dayScore: d.score,
      swingScore: sw.score,
      combinedScore: Math.round((d.score + sw.score) / 2),
      dayBreakdown: d.breakdown,
      swingBreakdown: sw.breakdown,
      rsi: d.rsi,
      ema20: d.ema20,
      ema50: d.ema50,
      ema200: d.ema200,
      atr: d.atr,
      high52w: d.high52w,
      low52w: d.low52w,
      rvol: d.rvol,
      volume: d.volume,
      type: "common",
    });
  }
  common.sort((a, b) => b.combinedScore - a.combinedScore);

  console.log(
    `[scanner] 완료 — 단타: ${top10Day.length}, 스윙: ${top10Swing.length}, 공통: ${common.length}`
  );

  return {
    daytrade: top10Day,
    swing: top10Swing,
    common: common.slice(0, 5),
    scannedCount: tickers.length,
    spyChange3m,
    spyChange6m,
    timestamp: new Date().toISOString(),
  };
}
