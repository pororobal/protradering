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
  // SwingPicker-web 추가 지표
  lowTrendPct: number;     // Low Trend %
  rsiRising: boolean;     // RSI 상승 중
  volQuality: number;      // Volume Quality (Red candle avg vol / Blue candle avg vol)
  bbBwVal: number;         // Bollinger Band Bandwidth
  bbExpanding: boolean;    // BB 확장 중
  rangePos: number;        // Range Position
  bwSqueeze: boolean;      // BB Squeeze
  ttmSqueeze: boolean;     // TTM Squeeze
  sqzCnt: number;          // Squeeze count
  mfi: number;             // Money Flow Index
  disp: number;            // 이격도 (Disparity)
  triggerStr: string;      // Trigger string
  vwapVal: number;         // VWAP
  vwapGap: number;         // VWAP Gap
  stVal: number;           // SuperTrend value
  stTrend: number;         // SuperTrend trend (1 or -1)
  vPower: number;          // V-Power
  volZ: number;            // Volume Z-score
  swingLow10: number;      // 10일 스윙 로우
  distToSwing: number;     // 스윙 로우까지 거리 %
  isSwingSupport: boolean; // 스윙 서포트 여부
  currHma: number;         // HMA20
  hmaTrendUp: boolean;     // HMA 상승 중
  isAboveW20: boolean;     // 주봉 20선 상회
  isW20Up: boolean;        // 주봉 20선 상승
  slopePct: number;        // MACD Slope %
  pocP: number | null;     // Point of Control
  resAll: number;          // 전체 저항 비율
  resNear: number;         // 근처 저항 비율
  nearPct: number;         // 근처 임계값 %
  isAbovePoc: number;      // POC 상회 여부
  pocGap: number;          // POC Gap
  ma20: number;            // MA20
  bbUpper: number;         // BB Upper
  bbLower: number;         // BB Lower
  gapPctVal: number;       // Gap %
  dataLength: number;      // 데이터 길이
  consecutiveLimitUp: number; // 연속 상한가 횟수
  mtfWeeklyTrend: number;  // 주봉 트렌드 (1, -1, 0)
  mtfMonthlyTrend: number; // 월봉 트렌드 (1, -1, 0)
  mtfDataSufficient: number; // MTF 데이터 충분 여부
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

// ─── SwingPicker-web 추가 지표 계산 ─────────────────────────────────────────────

function calcSMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calcBollingerBands(prices: number[], period = 20, stdDev = 2): {
  upper: number;
  lower: number;
  middle: number;
  bandwidth: number;
} | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  const middle = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, val) => sum + Math.pow(val - middle, 2), 0) / period;
  const std = Math.sqrt(variance);
  return {
    upper: middle + stdDev * std,
    lower: middle - stdDev * std,
    middle,
    bandwidth: (2 * stdDev * std) / middle * 100,
  };
}

function calcKeltnerChannel(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 20,
  multiplier = 1.5
): {
  upper: number;
  lower: number;
  middle: number;
} | null {
  if (closes.length < period) return null;
  const ema = calcEMA(closes, period);
  const atr = calcATR(highs.slice(-period), lows.slice(-period), closes.slice(-period), period);
  if (ema === null || atr === null) return null;
  return {
    middle: ema,
    upper: ema + multiplier * atr,
    lower: ema - multiplier * atr,
  };
}

function calcMFI(highs: number[], lows: number[], closes: number[], volumes: number[], period = 14): number | null {
  if (highs.length < period + 1) return null;
  let positiveFlow = 0;
  let negativeFlow = 0;

  for (let i = highs.length - period; i < highs.length; i++) {
    const typicalPrice = (highs[i] + lows[i] + closes[i]) / 3;
    const rawMoneyFlow = typicalPrice * volumes[i];
    const prevTypicalPrice = (highs[i - 1] + lows[i - 1] + closes[i - 1]) / 3;

    if (typicalPrice > prevTypicalPrice) {
      positiveFlow += rawMoneyFlow;
    } else if (typicalPrice < prevTypicalPrice) {
      negativeFlow += rawMoneyFlow;
    }
  }

  if (negativeFlow === 0) return 100;
  const mfi = 100 - (100 / (1 + positiveFlow / negativeFlow));
  return mfi;
}

function calcVWAP(highs: number[], lows: number[], closes: number[], volumes: number[], period = 20): number | null {
  if (highs.length < period) return null;
  const slice = highs.slice(-period);
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;

  for (let i = 0; i < slice.length; i++) {
    const typicalPrice = (slice[i] + lows[lows.length - period + i] + closes[closes.length - period + i]) / 3;
    const volume = volumes[volumes.length - period + i];
    cumulativeTPV += typicalPrice * volume;
    cumulativeVolume += volume;
  }

  return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : null;
}

function calcSuperTrend(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 10,
  multiplier = 3.0
): { value: number; trend: number } | null {
  if (highs.length < period + 1) return null;
  const atr = calcATR(highs, lows, closes, period);
  if (atr === null) return null;

  const upperBands: number[] = [];
  const lowerBands: number[] = [];
  const superTrend: number[] = [];
  const trend: number[] = [];

  for (let i = period; i < highs.length; i++) {
    const hl2 = (highs[i] + lows[i]) / 2;
    upperBands[i] = hl2 + multiplier * atr;
    lowerBands[i] = hl2 - multiplier * atr;

    if (i === period) {
      superTrend[i] = lowerBands[i];
      trend[i] = 1;
    } else {
      const prevSuperTrend = superTrend[i - 1];
      const prevTrend = trend[i - 1];

      if (prevTrend === 1 && closes[i] <= prevSuperTrend) {
        trend[i] = -1;
        superTrend[i] = upperBands[i];
      } else if (prevTrend === -1 && closes[i] >= prevSuperTrend) {
        trend[i] = 1;
        superTrend[i] = lowerBands[i];
      } else if (prevTrend === 1) {
        trend[i] = 1;
        superTrend[i] = Math.max(lowerBands[i], prevSuperTrend);
      } else {
        trend[i] = -1;
        superTrend[i] = Math.min(upperBands[i], prevSuperTrend);
      }
    }
  }

  const lastIdx = superTrend.length - 1;
  return { value: superTrend[lastIdx], trend: trend[lastIdx] };
}

function calcHMA(prices: number[], period = 20): number | null {
  if (prices.length < period) return null;
  const halfPeriod = Math.floor(period / 2);
  const wmaHalf = calcWMA(prices, halfPeriod);
  const wmaFull = calcWMA(prices, period);
  if (wmaHalf === null || wmaFull === null) return null;
  
  const rawHMA = 2 * wmaHalf - wmaFull;
  const sqrtPeriod = Math.floor(Math.sqrt(period));
  return calcWMA([...prices.slice(-sqrtPeriod), rawHMA], sqrtPeriod);
}

function calcWMA(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  let sum = 0;
  let weightSum = 0;
  for (let i = 0; i < slice.length; i++) {
    sum += slice[i] * (i + 1);
    weightSum += i + 1;
  }
  return weightSum > 0 ? sum / weightSum : null;
}

function calcVolumeProfile(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  bars = 120
): {
  poc: number | null;
  resAll: number;
  resNear: number;
  nearPct: number;
} {
  if (highs.length < bars) {
    return { poc: null, resAll: 0, resNear: 0, nearPct: 0 };
  }

  const sliceH = highs.slice(-bars);
  const sliceL = lows.slice(-bars);
  const sliceC = closes.slice(-bars);
  const sliceV = volumes.slice(-bars);

  const priceVolumeMap = new Map<number, number>();
  const currentPrice = sliceC[sliceC.length - 1];

  for (let i = 0; i < sliceH.length; i++) {
    const high = sliceH[i];
    const low = sliceL[i];
    const vol = sliceV[i];
    const range = high - low;
    
    if (range > 0) {
      const step = range / 10;
      for (let p = low; p <= high; p += step) {
        const priceLevel = Math.round(p * 100) / 100;
        const existing = priceVolumeMap.get(priceLevel) || 0;
        priceVolumeMap.set(priceLevel, existing + vol / 10);
      }
    }
  }

  let maxVol = 0;
  let poc: number | null = null;
  for (const [price, vol] of priceVolumeMap) {
    if (vol > maxVol) {
      maxVol = vol;
      poc = price;
    }
  }

  let totalVol = 0;
  let aboveVol = 0;
  let nearVol = 0;
  const nearThreshold = currentPrice * 0.02;

  for (const [price, vol] of priceVolumeMap) {
    totalVol += vol;
    if (price > currentPrice) {
      aboveVol += vol;
      if (price - currentPrice < nearThreshold) {
        nearVol += vol;
      }
    }
  }

  return {
    poc,
    resAll: totalVol > 0 ? aboveVol / totalVol : 0,
    resNear: totalVol > 0 ? nearVol / totalVol : 0,
    nearPct: totalVol > 0 ? (nearVol / totalVol) * 100 : 0,
  };
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

  // ─── SwingPicker-web 추가 지표 계산 ─────────────────────────────────────────────

  // Low Trend %
  const minLPrev = Math.min(...lows.slice(n - 20, n - 10));
  const minLCurr = Math.min(...lows.slice(n - 10));
  const lowTrendPct = minLPrev > 0 ? ((minLCurr - minLPrev) / minLPrev) * 100 : 0;

  // RSI Rising
  const rsiMinPrev = Math.min(...(rsi !== null ? [] : []));
  const rsiMinCurr = rsi !== null ? rsi : 0;
  const rsiRising = rsi !== null && rsi > 50;

  // Volume Quality (Red candle avg vol / Blue candle avg vol)
  const redVolSum = volumes.slice(-20).reduce((sum, vol, i) => {
    return sum + (closes[n - 20 + i] < opens[n - 20 + i] ? vol : 0);
  }, 0);
  const blueVolSum = volumes.slice(-20).reduce((sum, vol, i) => {
    return sum + (closes[n - 20 + i] >= opens[n - 20 + i] ? vol : 0);
  }, 0);
  const redCount = volumes.slice(-20).filter((_, i) => closes[n - 20 + i] < opens[n - 20 + i]).length;
  const blueCount = volumes.slice(-20).filter((_, i) => closes[n - 20 + i] >= opens[n - 20 + i]).length;
  const volQuality = (redCount > 0 && blueCount > 0) ? (redVolSum / redCount) / (blueVolSum / blueCount) : 1.0;

  // Bollinger Bands
  const bb = calcBollingerBands(closes, 20, 2);
  const bbUpper = bb?.upper ?? 0;
  const bbLower = bb?.lower ?? 0;
  const ma20 = bb?.middle ?? 0;
  const bbBwVal = bb?.bandwidth ?? 0;
  const bbExpanding = bb !== null && bbBwVal > 0 && n >= 25 && bbBwVal > (calcBollingerBands(closes.slice(-25), 20, 2)?.bandwidth ?? 0) * 1.05;

  // Range Position
  const high20 = Math.max(...highs.slice(-20));
  const low20 = Math.min(...lows.slice(-20));
  const rangePos = high20 > low20 ? (currentPrice - low20) / (high20 - low20) : 0.5;

  // TTM Squeeze
  const kc = calcKeltnerChannel(highs, lows, closes, 20, 1.5);
  const bwSqueeze = bb !== null && kc !== null && bbLower >= kc.lower && bbUpper <= kc.upper;
  const ttmSqueeze = bwSqueeze;

  // Squeeze Count
  let sqzCnt = 0;
  for (let i = Math.max(0, n - 5); i < n; i++) {
    const bb_i = calcBollingerBands(closes.slice(0, i + 1), 20, 2);
    const kc_i = calcKeltnerChannel(highs.slice(0, i + 1), lows.slice(0, i + 1), closes.slice(0, i + 1), 20, 1.5);
    if (bb_i && kc_i && bb_i.lower >= kc_i.lower && bb_i.upper <= kc_i.upper) {
      sqzCnt++;
    }
  }

  // MFI
  const mfi = calcMFI(highs, lows, closes, volumes, 14) ?? 50;

  // 이격도 (Disparity)
  const disp = ma20 > 0 ? ((currentPrice - ma20) / ma20) * 100 : 0;

  // Trigger string (simplified for now)
  const triggerStr = rsi !== null && rsi >= 55 && rsi <= 85 ? "RSI_OK" : "";

  // VWAP
  const vwapVal = calcVWAP(highs, lows, closes, volumes, 20) ?? currentPrice;
  const vwapGap = vwapVal > 0 ? ((currentPrice - vwapVal) / vwapVal) * 100 : 0;

  // SuperTrend
  const st = calcSuperTrend(highs, lows, closes, 10, 3.0);
  const stVal = st?.value ?? currentPrice;
  const stTrend = st?.trend ?? 1;

  // V-Power (simplified)
  const body = Math.abs(currentPrice - opens[n - 1]);
  const range = highs[n - 1] - lows[n - 1];
  const vPower = range > 0 ? (body / range) * (currentVol / avgVolume20) : 0;

  // Volume Z-score
  const volMean = avgVolume20;
  const volStd = Math.sqrt(volumes.slice(-20).reduce((sum, vol) => sum + Math.pow(vol - volMean, 2), 0) / 20);
  const volZ = volStd > 0 ? (currentVol - volMean) / volStd : 0;

  // Swing Low 10
  const swingLow10 = Math.min(...lows.slice(-10));
  const distToSwing = swingLow10 > 0 ? ((currentPrice - swingLow10) / currentPrice) * 100 : 0;
  const isSwingSupport = distToSwing < 5 && currentPrice > swingLow10;

  // HMA
  const currHma = calcHMA(closes, 20) ?? currentPrice;
  const hmaTrendUp = currHma > (calcHMA(closes.slice(-2), 20) ?? currHma);

  // Multi-timeframe (simplified - using daily data as proxy)
  const mtfWeeklyTrend = ema20 !== null && ema50 !== null && ema20 > ema50 ? 1 : -1;
  const mtfMonthlyTrend = ema50 !== null && ema200 !== null && ema50 > ema200 ? 1 : -1;
  const mtfDataSufficient = n >= 127 ? 1 : 0;

  // MACD Slope %
  const histValues = macdHist !== null ? [macdHist] : [];
  const slope = histValues.length >= 2 ? (histValues[histValues.length - 1] - histValues[histValues.length - 2]) : 0;
  const slopePct = currentPrice > 0 ? (slope / currentPrice) * 100 : 0;

  // Volume Profile
  const vp = calcVolumeProfile(highs, lows, closes, volumes, 120);
  const pocP = vp.poc;
  const resAll = vp.resAll;
  const resNear = vp.resNear;
  const nearPct = vp.nearPct;
  const isAbovePoc = pocP !== null && currentPrice > pocP ? 1 : 0;
  const pocGap = pocP !== null ? ((currentPrice - pocP) / pocP) * 100 : 0;

  // Gap %
  const gapPctVal = opens[n - 1] > 0 ? ((opens[n - 1] - prevClose) / prevClose) * 100 : 0;

  // Data Length
  const dataLength = n;

  // Consecutive Limit Up (simplified - 10%+ gains)
  let consecutiveLimitUp = 0;
  for (let i = n - 1; i >= Math.max(0, n - 5); i--) {
    const ret = closes[i] > 0 && closes[i - 1] > 0 ? ((closes[i] - closes[i - 1]) / closes[i - 1]) * 100 : 0;
    if (ret >= 10) consecutiveLimitUp++;
    else break;
  }

  // Weekly trend (simplified)
  const isAboveW20 = currentPrice >= (ema20 ?? currentPrice);
  const isW20Up = ema20 !== null && ema50 !== null && ema20 > ema50;

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
    // SwingPicker-web 추가 지표
    lowTrendPct,
    rsiRising,
    volQuality,
    bbBwVal,
    bbExpanding,
    rangePos,
    bwSqueeze,
    ttmSqueeze,
    sqzCnt,
    mfi,
    disp,
    triggerStr,
    vwapVal,
    vwapGap,
    stVal,
    stTrend,
    vPower,
    volZ,
    swingLow10,
    distToSwing,
    isSwingSupport,
    currHma,
    hmaTrendUp,
    isAboveW20,
    isW20Up,
    slopePct,
    pocP,
    resAll,
    resNear,
    nearPct,
    isAbovePoc,
    pocGap,
    ma20,
    bbUpper,
    bbLower,
    gapPctVal,
    dataLength,
    consecutiveLimitUp,
    mtfWeeklyTrend,
    mtfMonthlyTrend,
    mtfDataSufficient,
  };
}
