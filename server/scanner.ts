// server/scanner.ts
// 핵심 스캔 로직 — SwingPicker-web 스코어링 적용
// 모든 Yahoo Finance 호출은 server/yahoo.ts 래퍼를 통해 처리
//
// ── 이번 변경 사항 (핵심 스코어링 공식은 변경하지 않음) ──────────────────────────
//   1. 후보 종목 풀 확대: 스크리너 소스 추가 + 40 → 100개로 확대
//   2. 통과 기준 완화: score >= 60 → 45 (너무 낮은 점수는 별도 하드 필터로 차단)
//   3. 매수/매도/손절/확률(TradePlan) 계산 추가
//   4. 배치 처리 동시성 약간 상향으로 더 많은 종목을 빠르게 처리

import { safeScreener, safeHistorical, safeQuote, safeQuoteSummary, getSpyReturns } from "./yahoo.js";
import { computeIndicators, type Indicators } from "./indicators.js";
import { calcSwingPickerScores, type SwingPickerScores } from "./swingpicker_scoring.js";
import { calcTradePlan, type TradePlan } from "./tradePlan.js";

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
  // 매수/매도/손절/확률
  tradePlan?: TradePlan;
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

// ─── 통과 기준 ───────────────────────────────────────────────────────────────
// 기존 60점 단일 컷오프는 너무 빡빡해서 0~1개만 통과하는 문제가 있었음.
// finalScore(종합) 기준을 45로 낮추고, 대신 EBS(펀더멘털 체크리스트)가
// 너무 낮은(0~1) 종목은 별도로 걸러내어 "묻지마 통과"를 방지한다.
const PASS_SCORE_THRESHOLD = 45;
const MIN_EBS_TO_PASS = 1;

// ─── SwingPicker-web 스코어링 (변경 없음) ─────────────────────────────────────────

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
      dayRes &&
      dayRes.score >= PASS_SCORE_THRESHOLD &&
      dayRes.swingPicker.ebs >= MIN_EBS_TO_PASS
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
            tradePlan: calcTradePlan(ind, dayRes.swingPicker, "day"),
          }
        : null;

    // 스윙 점수
    const swingRes = calcSwingPickerSwingScore(ind, marketCap, spyChange3m, spyChange6m);
    const swing: StockResult | null =
      swingRes &&
      swingRes.score >= PASS_SCORE_THRESHOLD &&
      swingRes.swingPicker.ebs >= MIN_EBS_TO_PASS
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
            tradePlan: calcTradePlan(ind, swingRes.swingPicker, "swing"),
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

  // 1. 후보 종목 수집 — 소스를 늘려 후보 풀을 확대
  const [actives, gainers, losers, undervalued, spy] = await Promise.all([
    safeScreener("most_actives", 100).catch(() => []),
    safeScreener("day_gainers", 80).catch(() => []),
    safeScreener("day_losers", 50).catch(() => []),
    safeScreener("undervalued_growth_stocks", 50).catch(() => []),
    getSpyReturns().catch(() => ({ change3m: 0, change6m: 0 })),
  ]);

  const { change3m: spyChange3m, change6m: spyChange6m } = spy;

  // 중복 제거
  const tickerMap = new Map<string, any>();
  for (const q of [...actives, ...gainers, ...losers, ...undervalued]) {
    const sym = q.symbol ?? q.ticker;
    if (sym && !tickerMap.has(sym)) tickerMap.set(sym, q);
  }

  // 40 → 100개로 후보 풀 확대 (배치 동시성도 상향해 속도 보완)
  const tickers = Array.from(tickerMap.keys()).slice(0, 100);
  console.log(`[scanner] 후보 종목: ${tickers.length}개`);

  // 2. 종목 처리 (배치 8개씩)
  const dayTrades: StockResult[] = [];
  const swingTrades: StockResult[] = [];
  const BATCH = 8;

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
