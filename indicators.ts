// server/indicators.ts
// 기술 지표 계산 (EMA, RSI, MACD, ATR, VCP 등)
// yahoo-finance2 historical() 데이터 기반

export interface OHLCV {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjClose?: number;
}

export interface Indicators {
  currentPrice: number;
  prevClose: number;
  dayChange: number;      // 당일 등락률 %
  change5d: number;       // 5일 수익률 %
  change3m: number;       // 3개월 수익률 %
  change6m: number;       // 6개월 수익률 %
  currentVolume: number;
  avgVolume20: number;
  rvol: number;           // 상대거래량
  avgDollarVolume: number;// 평균 거래대금
  high52w: number;
  low52w: number;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  atr: number | null;
  atrIncreasing: boolean;
  breakHigh20: boolean;
  breakHigh60: boolean;
  isNearYearHigh: boolean;
  gapUp: boolean;
  gapUpSupport: boolean;
  vcpAtrDecreasing: boolean;
  vcpRangeDecreasing: boolean;
  vcpVolDecreasing: boolean;
  volAccumulation: number;
}

// ─── 기본 지표 계산 ──────────────────────────────────────────────────────────

function calcEMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

function calcRSI(prices: number[], period = 14): number | null {
  if (prices.length < period + 1) return null;
  const deltas: number[] = [];
  for (let i = 1; i < prices.length; i++) deltas.push(prices[i] - prices[i - 1]);
  const recent = deltas.slice(-period * 2);
  let gains = 0, losses = 0;
  for (let i = 0; i < period; i++) {
    if (recent[i] > 0) gains += recent[i];
    else losses += Math.abs(recent[i]);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period; i < recent.length; i++) {
    const d = recent[i];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function calcMACDValues(prices: number[]): {
  macd: number | null;
  signal: number | null;
  hist: number | null;
} {
  if (prices.length < 26) return { macd: null, signal: null, hist: null };
  const macdHistory: number[] = [];
  const slice = prices.slice(-60);
  for (let i = 26; i <= slice.length; i++) {
    const sub = slice.slice(0, i);
    const e12 = calcEMA(sub, 12);
    const e26 = calcEMA(sub, 26);
    if (e12 !== null && e26 !== null) macdHistory.push(e12 - e26);
  }
  if (!macdHistory.length) return { macd: null, signal: null, hist: null };
  const macdLine = macdHistory[macdHistory.length - 1];
  const signalLine = calcEMA(macdHistory, 9);
  return {
    macd: macdLine,
    signal: signalLine,
    hist: signalLine !== null ? macdLine - signalLine : null,
  };
}

function calcATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14
): number | null {
  if (highs.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    trs.push(
      Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      )
    );
  }
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / period;
}

// ─── 메인 계산 함수 ───────────────────────────────────────────────────────────

export function computeIndicators(bars: OHLCV[]): Indicators | null {
  if (!bars || bars.length < 20) return null;

  // bars는 오래된 것 → 최신 순으로 정렬되어 있다고 가정 (historical() 기본 오름차순)
  const sorted = [...bars].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const closes  = sorted.map((b) => b.close  ?? b.adjClose ?? 0).filter(Boolean);
  const highs   = sorted.map((b) => b.high   ?? 0).filter(Boolean);
  const lows    = sorted.map((b) => b.low    ?? 0).filter(Boolean);
  const opens   = sorted.map((b) => b.open   ?? 0).filter(Boolean);
  const volumes = sorted.map((b) => b.volume ?? 0);

  if (closes.length < 20) return null;

  const n = closes.length;
  const currentPrice = closes[n - 1];
  const prevClose    = closes[n - 2] ?? currentPrice;
  const currentVol   = volumes[n - 1] ?? 0;

  // 20일 평균 거래량
  const vol20Slice = volumes.slice(Math.max(0, n - 21), n - 1);
  const avgVolume20 = vol20Slice.length
    ? vol20Slice.reduce((a, b) => a + b, 0) / vol20Slice.length
    : 0;

  const rvol = avgVolume20 > 0 ? currentVol / avgVolume20 : 0;
  const avgDollarVolume = avgVolume20 * currentPrice;

  // 수익률
  const dayChange = prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

  const idx5d = Math.max(0, n - 6);
  const change5d = closes[idx5d] > 0 ? ((currentPrice - closes[idx5d]) / closes[idx5d]) * 100 : 0;

  const idx3m = Math.max(0, n - 64);
  const change3m = closes[idx3m] > 0 ? ((currentPrice - closes[idx3m]) / closes[idx3m]) * 100 : 0;

  const idx6m = Math.max(0, n - 127);
  const change6m = closes[idx6m] > 0 ? ((currentPrice - closes[idx6m]) / closes[idx6m]) * 100 : 0;

  // 52주 고/저
  const year = Math.min(252, n);
  const high52w = Math.max(...highs.slice(n - year));
  const low52w  = Math.min(...lows.slice(n - year));

  // EMA
  const ema20  = calcEMA(closes, 20);
  const ema50  = calcEMA(closes, 50);
  const ema200 = calcEMA(closes, Math.min(200, n));

  // RSI
  const rsi = calcRSI(closes);

  // MACD
  const { macd, signal: macdSignal, hist: macdHist } = calcMACDValues(closes);

  // ATR
  const atr = calcATR(highs, lows, closes);

  // ATR 증가 여부 (최근 14일 vs 이전 14일)
  const atrIncreasing: boolean =
    n >= 30
      ? (() => {
          const r = calcATR(highs.slice(-14), lows.slice(-14), closes.slice(-14), 10);
          const p = calcATR(highs.slice(-28, -14), lows.slice(-28, -14), closes.slice(-28, -14), 10);
          return r !== null && p !== null && r > p;
        })()
      : false;

  // 고가 돌파
  const breakHigh20 =
    n >= 21 ? currentPrice >= Math.max(...highs.slice(-21, -1)) : false;
  const breakHigh60 =
    n >= 61 ? currentPrice >= Math.max(...highs.slice(-61, -1)) : false;

  // 52주 신고가 근처
  const isNearYearHigh = high52w > 0 && currentPrice >= high52w * 0.98;

  // 갭 상승
  const prevHigh = highs[n - 2] ?? prevClose;
  const openToday = opens[n - 1] ?? currentPrice;
  const gapUp = openToday > prevHigh * 1.01;
  const gapUpSupport = gapUp && currentPrice >= openToday * 0.98;

  // VCP 체크
  let vcpAtrDecreasing = false;
  let vcpRangeDecreasing = false;
  let vcpVolDecreasing = false;
  if (n >= 20) {
    const rATR = calcATR(highs.slice(-10), lows.slice(-10), closes.slice(-10), 8);
    const pATR = calcATR(highs.slice(-20, -10), lows.slice(-20, -10), closes.slice(-20, -10), 8);
    vcpAtrDecreasing = rATR !== null && pATR !== null && rATR < pATR * 0.85;

    const rHigh = Math.max(...highs.slice(-10));
    const rLow  = Math.min(...lows.slice(-10));
    const pHigh = Math.max(...highs.slice(-20, -10));
    const pLow  = Math.min(...lows.slice(-20, -10));
    const rRange = currentPrice > 0 ? (rHigh - rLow) / currentPrice : 1;
    const pRange = (closes[n - 11] ?? currentPrice) > 0
      ? (pHigh - pLow) / (closes[n - 11] ?? currentPrice)
      : 1;
    vcpRangeDecreasing = rRange < pRange * 0.85;

    const rVol = volumes.slice(-10).reduce((a, b) => a + b, 0) / 10;
    const pVol = volumes.slice(-20, -10).reduce((a, b) => a + b, 0) / 10;
    vcpVolDecreasing = pVol > 0 && rVol < pVol * 0.85;
  }

  // 거래량 축적 (상승일 vs 하락일 거래량 비교)
  let upVol = 0, downVol = 0;
  for (let i = Math.max(1, n - 20); i < n; i++) {
    if (closes[i] > closes[i - 1]) upVol += volumes[i] ?? 0;
    else downVol += volumes[i] ?? 0;
  }
  const volAccumulation = (upVol + downVol) > 0 ? upVol / (upVol + downVol) : 0.5;

  return {
    currentPrice,
    prevClose,
    dayChange,
    change5d,
    change3m,
    change6m,
    currentVolume: currentVol,
    avgVolume20,
    rvol,
    avgDollarVolume,
    high52w,
    low52w,
    ema20,
    ema50,
    ema200,
    rsi,
    macd,
    macdSignal,
    macdHist,
    atr,
    atrIncreasing,
    breakHigh20,
    breakHigh60,
    isNearYearHigh,
    gapUp,
    gapUpSupport,
    vcpAtrDecreasing,
    vcpRangeDecreasing,
    vcpVolDecreasing,
    volAccumulation,
  };
}
