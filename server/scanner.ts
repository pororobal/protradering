// server/scanner.ts
// 핵심 스캔 로직 — SwingPicker-web 스코어링 적용
// 모든 Yahoo Finance 호출은 server/yahoo.ts 래퍼를 통해 처리

import { safeScreener, safeHistorical, safeQuote, safeQuoteSummary, getSpyReturns } from "./yahoo.js";
import { computeIndicators, type Indicators } from "./indicators.js";
import { calcSwingPickerScores, type SwingPickerScores } from "./swingpicker_scoring.js";

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
  // SwingPicker-web 추가 필드
  ebs?: number;
  structScore?: number;
  timingScore?: number;
  aiScore?: number;
  finalScore?: number;
  state?: string;
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

// ─── SwingPicker-web 스코어링 ─────────────────────────────────────────────────────

function calcSwingPickerDayScore(
  ind: Indicators,
  marketCap: number
): { score: number; breakdown: Record<string, number>; swingPicker: SwingPickerScores } | null {
  // 유동성 필터
  if (ind.currentPrice < 2) return null;
  if (marketCap < 100_000_000 || marketCap > 20_000_000_000) return null;
  if (ind.avgDollarVolume < 5_000_000) return null;

  // SwingPicker-web 스코어링
  const swingPicker = calcSwingPickerScores(ind, "NORMAL");

  // 단타용 점수 계산 (TIMING_SCORE 기반)
  const score = swingPicker.timingScore;

  return { score, breakdown: swingPicker.timingBreakdown, swingPicker };
}

function calcSwingPickerSwingScore(
  ind: Indicators,
  marketCap: number,
  spyChange3m: number,
  spyChange6m: number
): { score: number; breakdown: Record<string, number>; swingPicker: SwingPickerScores } | null {
  if (ind.currentPrice < 5) return null;
  if (marketCap < 200_000_000) return null;

  // SwingPicker-web 스코어링
  const swingPicker = calcSwingPickerScores(ind, "NORMAL");

  // 스윙용 점수 계산 (STRUCT_SCORE + TIMING_SCORE 조합)
  const score = Math.round((swingPicker.structScore + swingPicker.timingScore) / 2);

  return { score, breakdown: { ...swingPicker.structBreakdown, ...swingPicker.timingBreakdown }, swingPicker };
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
    const dayRes = calcSwingPickerDayScore(ind, marketCap);
    const day: StockResult | null =
      dayRes && dayRes.score >= 60
        ? {
            ...base,
            dayChange: ind.dayChange,
            change5d: ind.change5d,
            score: dayRes.score,
            breakdown: dayRes.breakdown,
            type: "daytrade",
            ebs: dayRes.swingPicker.ebs,
            structScore: dayRes.swingPicker.structScore,
            timingScore: dayRes.swingPicker.timingScore,
            aiScore: dayRes.swingPicker.aiScore,
            finalScore: dayRes.swingPicker.finalScore,
            state: dayRes.swingPicker.state,
          }
        : null;

    // 스윙 점수
    const swingRes = calcSwingPickerSwingScore(ind, marketCap, spyChange3m, spyChange6m);
    const swing: StockResult | null =
      swingRes && swingRes.score >= 60
        ? {
            ...base,
            dayChange: ind.dayChange,
            change3m: ind.change3m,
            change6m: ind.change6m,
            score: swingRes.score,
            breakdown: swingRes.breakdown,
            vcpScore: swingRes.breakdown.vcp || 0,
            type: "swing",
            ebs: swingRes.swingPicker.ebs,
            structScore: swingRes.swingPicker.structScore,
            timingScore: swingRes.swingPicker.timingScore,
            aiScore: swingRes.swingPicker.aiScore,
            finalScore: swingRes.swingPicker.finalScore,
            state: swingRes.swingPicker.state,
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

  const tickers = Array.from(tickerMap.keys()).slice(0, 40); // 40개로 줄여서 속도 향상
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
    // 배치 사이 딜레이 (Rate Limit 방지) - 100ms로 줄여서 속도 향상
    if (i + BATCH < tickers.length) await sleep(100);
  }

  // 3. 정렬 및 TOP10
  dayTrades.sort((a, b) => b.score - a.score);
  swingTrades.sort((a, b) => b.score - a.score);
  const top10Day = dayTrades.slice(0, 10);
  const top10Swing = swingTrades.slice(0, 10);

  // 4. 공통 종목
  const daySet = new Set(top10Day.map((s) => s.ticker));
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
