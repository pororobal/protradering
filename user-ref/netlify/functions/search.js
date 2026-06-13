// netlify/functions/search.js
// Yahoo Finance 데이터를 직접 크롤링하여 단타/스윙 종목 스크리닝
// yfinance 대신 Yahoo Finance v8 API를 직접 호출 (Node.js 환경)

const fetch = require("node-fetch");

// ─── 유틸리티 ───────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Yahoo Finance v8 quote 엔드포인트로 개별 종목 데이터 조회
async function fetchQuote(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1y&includePrePost=false`;
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    Origin: "https://finance.yahoo.com",
    Referer: "https://finance.yahoo.com",
  };

  const res = await fetch(url, { headers, timeout: 15000 });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${ticker}`);
  const json = await res.json();
  return json;
}

// Yahoo Finance v7 summary 엔드포인트로 기본 정보 조회
async function fetchSummary(ticker) {
  const modules =
    "summaryDetail,defaultKeyStatistics,financialData,price,quoteType";
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=${modules}`;
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    Origin: "https://finance.yahoo.com",
    Referer: "https://finance.yahoo.com",
  };

  const res = await fetch(url, { headers, timeout: 15000 });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${ticker} summary`);
  const json = await res.json();
  return json;
}

// Yahoo Finance 스크리너 API - NASDAQ/NYSE/AMEX 고거래량 종목 가져오기
async function fetchScreenerStocks(count = 100) {
  const url = `https://query1.finance.yahoo.com/v1/finance/screener?formatted=false&lang=en-US&region=US&crumb=`;
  
  // Yahoo Finance 스크리너 대신 predefined screener 사용
  const screenerUrl = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&lang=en-US&region=US&scrIds=most_actives&start=0&count=${count}`;
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    Origin: "https://finance.yahoo.com",
    Referer: "https://finance.yahoo.com",
  };

  const res = await fetch(screenerUrl, { headers, timeout: 20000 });
  if (!res.ok) throw new Error(`Screener HTTP ${res.status}`);
  const json = await res.json();

  const quotes =
    json?.finance?.result?.[0]?.quotes || [];
  return quotes;
}

// 추가 스크리너: 상승 모멘텀 종목
async function fetchGainersStocks(count = 50) {
  const url = `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=false&lang=en-US&region=US&scrIds=day_gainers&start=0&count=${count}`;
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "application/json",
  };
  const res = await fetch(url, { headers, timeout: 20000 });
  if (!res.ok) throw new Error(`Gainers HTTP ${res.status}`);
  const json = await res.json();
  return json?.finance?.result?.[0]?.quotes || [];
}

// ─── 기술 지표 계산 ──────────────────────────────────────────────────────────

// EMA 계산
function calcEMA(prices, period) {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

// RSI 계산
function calcRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;
  const deltas = [];
  for (let i = 1; i < prices.length; i++) {
    deltas.push(prices[i] - prices[i - 1]);
  }
  const recentDeltas = deltas.slice(-period * 2);
  let gains = 0,
    losses = 0;
  for (let i = 0; i < period; i++) {
    if (recentDeltas[i] > 0) gains += recentDeltas[i];
    else losses += Math.abs(recentDeltas[i]);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  for (let i = period; i < recentDeltas.length; i++) {
    const delta = recentDeltas[i];
    avgGain = (avgGain * (period - 1) + Math.max(delta, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-delta, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// MACD 계산
function calcMACD(prices) {
  if (prices.length < 26) return { macd: null, signal: null, hist: null };
  const ema12 = calcEMA(prices, 12);
  const ema26 = calcEMA(prices, 26);
  if (!ema12 || !ema26) return { macd: null, signal: null, hist: null };
  const macdLine = ema12 - ema26;

  // Signal: 9일 EMA of MACD
  const macdHistory = [];
  const slicedPrices = prices.slice(-50);
  for (let i = 26; i <= slicedPrices.length; i++) {
    const sub = slicedPrices.slice(0, i);
    const e12 = calcEMA(sub, 12);
    const e26 = calcEMA(sub, 26);
    if (e12 && e26) macdHistory.push(e12 - e26);
  }
  const signal = calcEMA(macdHistory, 9);
  return {
    macd: macdLine,
    signal: signal,
    hist: signal !== null ? macdLine - signal : null,
  };
}

// ATR 계산 (14일)
function calcATR(highs, lows, closes, period = 14) {
  if (highs.length < period + 1) return null;
  const trueRanges = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
  }
  if (trueRanges.length < period) return null;
  const recent = trueRanges.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / period;
}

// ATR 이전 기간과 비교하여 증가 여부
function isATRIncreasing(highs, lows, closes) {
  const atrRecent = calcATR(highs, lows, closes, 14);
  if (highs.length < 28) return false;
  const atrPrev = calcATR(
    highs.slice(0, -14),
    lows.slice(0, -14),
    closes.slice(0, -14),
    14
  );
  if (!atrRecent || !atrPrev) return false;
  return atrRecent > atrPrev;
}

// 최근 N일 최고가 돌파 여부
function isBreakingHigh(closes, highs, days) {
  if (closes.length < days + 1) return false;
  const pastHigh = Math.max(...highs.slice(-days - 1, -1));
  return closes[closes.length - 1] >= pastHigh;
}

// ─── 종목 분석 ───────────────────────────────────────────────────────────────

// Yahoo Finance 차트 데이터에서 기술 지표 추출
function processChartData(chartData, summaryData, quoteData) {
  try {
    const result = chartData?.chart?.result?.[0];
    if (!result) return null;

    const timestamps = result.timestamp || [];
    const ohlcv = result.indicators?.quote?.[0];
    if (!ohlcv || !timestamps.length) return null;

    const closes = (ohlcv.close || []).filter((v) => v !== null && v !== undefined);
    const opens = (ohlcv.open || []).filter((v) => v !== null && v !== undefined);
    const highs = (ohlcv.high || []).filter((v) => v !== null && v !== undefined);
    const lows = (ohlcv.low || []).filter((v) => v !== null && v !== undefined);
    const volumes = (ohlcv.volume || []).filter((v) => v !== null && v !== undefined);

    if (closes.length < 20) return null;

    const currentPrice = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];
    const currentVolume = volumes[volumes.length - 1] || 0;

    // 평균 거래량 (20일)
    const avgVolume20 =
      volumes.slice(-21, -1).reduce((a, b) => a + b, 0) /
      Math.min(20, volumes.length - 1);

    // RVOL
    const rvol = avgVolume20 > 0 ? currentVolume / avgVolume20 : 0;

    // 당일 등락률
    const dayChange = prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

    // 5일 수익률
    const price5DaysAgo = closes.length >= 6 ? closes[closes.length - 6] : closes[0];
    const change5d = price5DaysAgo > 0 ? ((currentPrice - price5DaysAgo) / price5DaysAgo) * 100 : 0;

    // 3개월 수익률 (약 63거래일)
    const price3MAgo = closes.length >= 64 ? closes[closes.length - 64] : closes[0];
    const change3m = price3MAgo > 0 ? ((currentPrice - price3MAgo) / price3MAgo) * 100 : 0;

    // 6개월 수익률 (약 126거래일)
    const price6MAgo = closes.length >= 127 ? closes[closes.length - 127] : closes[0];
    const change6m = price6MAgo > 0 ? ((currentPrice - price6MAgo) / price6MAgo) * 100 : 0;

    // EMA
    const ema20 = calcEMA(closes, 20);
    const ema50 = calcEMA(closes, 50);
    const ema200 = calcEMA(closes, Math.min(200, closes.length));

    // RSI
    const rsi = calcRSI(closes);

    // MACD
    const { macd, signal: macdSignal, hist: macdHist } = calcMACD(closes);

    // ATR
    const atr = calcATR(highs, lows, closes);
    const atrIncreasing = isATRIncreasing(highs, lows, closes);

    // 52주 최고/최저
    const high52w = Math.max(...highs.slice(-252));
    const low52w = Math.min(...lows.slice(-252));

    // 20일, 60일 고가 돌파
    const breakHigh20 = isBreakingHigh(closes, highs, 20);
    const breakHigh60 = isBreakingHigh(closes, highs, 60);

    // 장중 신고가 여부 (현재가가 1년 최고가 근처)
    const isNearYearHigh = currentPrice >= high52w * 0.98;

    // 갭상승 여부
    const prevHigh = highs[highs.length - 2] || prevClose;
    const gapUp = opens[opens.length - 1] > prevHigh * 1.01;
    const gapUpSupport = gapUp && currentPrice >= opens[opens.length - 1] * 0.98;

    // 거래대금
    const avgDollarVolume = avgVolume20 * currentPrice;

    // VCP: ATR 감소 체크 (최근 10일 vs 이전 10일)
    let vcpAtrDecreasing = false;
    let vcpRangeDecreasing = false;
    let vcpVolDecreasing = false;
    if (highs.length >= 20) {
      const recentRange =
        (Math.max(...highs.slice(-10)) - Math.min(...lows.slice(-10))) /
        currentPrice;
      const prevRange =
        (Math.max(...highs.slice(-20, -10)) -
          Math.min(...lows.slice(-20, -10))) /
        (closes[closes.length - 11] || currentPrice);
      vcpRangeDecreasing = recentRange < prevRange * 0.85;

      const recentVol = volumes.slice(-10).reduce((a, b) => a + b, 0) / 10;
      const prevVol =
        volumes.slice(-20, -10).reduce((a, b) => a + b, 0) / 10;
      vcpVolDecreasing = recentVol < prevVol * 0.85;

      const recentATR = calcATR(highs.slice(-15), lows.slice(-15), closes.slice(-15), 10);
      const prevATR = calcATR(highs.slice(-25, -10), lows.slice(-25, -10), closes.slice(-25, -10), 10);
      vcpAtrDecreasing = recentATR && prevATR && recentATR < prevATR * 0.85;
    }

    // 거래량 축적: 상승일 vs 하락일 거래량 비교 (최근 20일)
    let upVol = 0, downVol = 0;
    for (let i = Math.max(1, closes.length - 20); i < closes.length; i++) {
      if (closes[i] > closes[i - 1]) upVol += volumes[i] || 0;
      else downVol += volumes[i] || 0;
    }
    const volAccumulation = upVol > 0 && downVol > 0 ? upVol / (upVol + downVol) : 0.5;

    // Summary 데이터
    const summary = summaryData?.quoteSummary?.result?.[0];
    const marketCap = summary?.price?.marketCap?.raw || quoteData?.marketCap || 0;
    const companyName = summary?.price?.longName || summary?.quoteType?.longName || quoteData?.longName || "N/A";

    return {
      currentPrice,
      prevClose,
      dayChange,
      change5d,
      change3m,
      change6m,
      currentVolume,
      avgVolume20,
      rvol,
      avgDollarVolume,
      marketCap,
      companyName,
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
      closes: closes.slice(-5), // 최근 5일 종가
    };
  } catch (err) {
    console.error("processChartData error:", err.message);
    return null;
  }
}

// ─── 단타 점수 계산 ──────────────────────────────────────────────────────────

function calcDayTradeScore(data, ticker) {
  let score = 0;
  const breakdown = {};

  // 1차: 유동성 필터 (필수 조건)
  if (data.currentPrice < 2) return null;
  if (data.marketCap < 100_000_000 || data.marketCap > 20_000_000_000) return null;
  if (data.avgDollarVolume < 5_000_000) return null;

  // 2차: 거래량 (25점)
  let volScore = 0;
  if (data.rvol >= 3) volScore = 25;
  else if (data.rvol >= 2) volScore = 20;
  else if (data.rvol >= 1.5) volScore = 10;

  const volRatio = data.avgVolume20 > 0 ? data.currentVolume / data.avgVolume20 : 0;
  if (volRatio >= 3) volScore = Math.min(25, volScore + 5);
  else if (volRatio >= 2) volScore = Math.min(25, volScore + 3);

  score += volScore;
  breakdown.volume = volScore;

  // 3차: 모멘텀 (20점)
  let momScore = 0;
  if (data.dayChange >= 5) momScore = 20;
  else if (data.dayChange >= 3) momScore = 15;
  else if (data.dayChange >= 1) momScore = 8;

  if (data.change5d >= 15) momScore = Math.min(20, momScore + 5);
  else if (data.change5d >= 10) momScore = Math.min(20, momScore + 3);

  score += momScore;
  breakdown.momentum = momScore;

  // 4차: 돌파 (25점)
  let breakScore = 0;
  if (data.isNearYearHigh) breakScore = 25;
  else if (data.breakHigh60) breakScore = 22;
  else if (data.breakHigh20) breakScore = 18;
  else if (data.gapUpSupport) breakScore = 20;
  else if (data.gapUp) breakScore = 12;

  score += breakScore;
  breakdown.breakout = breakScore;

  // 5차: 기술적 강도 (15점)
  let techScore = 0;
  if (data.rsi !== null) {
    if (data.rsi >= 55 && data.rsi <= 85) techScore += 8;
    else if (data.rsi > 85) techScore += 3; // 과매수 감점
    else if (data.rsi >= 45) techScore += 4;
  }
  if (data.macdHist !== null && data.macdHist > 0) techScore += 4;
  if (data.ema20 !== null && data.currentPrice > data.ema20) techScore += 3;
  techScore = Math.min(15, techScore);

  score += techScore;
  breakdown.technical = techScore;

  // 6차: 변동성 (15점)
  let voltyScore = 0;
  if (data.atrIncreasing) voltyScore += 10;
  if (data.atr !== null && data.currentPrice > 0) {
    const atrPct = (data.atr / data.currentPrice) * 100;
    if (atrPct >= 3) voltyScore += 5;
    else if (atrPct >= 2) voltyScore += 3;
    else if (atrPct >= 1) voltyScore += 1;
  }
  voltyScore = Math.min(15, voltyScore);

  score += voltyScore;
  breakdown.volatility = voltyScore;

  return { score: Math.round(score), breakdown };
}

// ─── 스윙 점수 계산 ──────────────────────────────────────────────────────────

function calcSwingScore(data, ticker, spyChange3m, spyChange6m) {
  let score = 0;
  const breakdown = {};

  // 기본 필터
  if (data.currentPrice < 5) return null;
  if (data.marketCap < 200_000_000) return null;

  // 1차: 추세 (25점)
  let trendScore = 0;
  if (data.ema20 && data.ema50 && data.ema200) {
    if (data.ema20 > data.ema50 && data.ema50 > data.ema200) trendScore += 10;
    else if (data.ema20 > data.ema50) trendScore += 5;
    if (data.currentPrice > data.ema20) trendScore += 5;
    if (data.currentPrice > data.ema50) trendScore += 5;
    if (data.currentPrice > data.ema200) trendScore += 5;
  } else if (data.ema20 && data.ema50) {
    if (data.ema20 > data.ema50) trendScore += 10;
    if (data.currentPrice > data.ema20) trendScore += 8;
    if (data.currentPrice > data.ema50) trendScore += 7;
  }
  trendScore = Math.min(25, trendScore);
  score += trendScore;
  breakdown.trend = trendScore;

  // 2차: 상대강도 (20점)
  let rsScore = 0;
  const diff3m = data.change3m - (spyChange3m || 0);
  const diff6m = data.change6m - (spyChange6m || 0);
  if (diff3m > 15) rsScore += 12;
  else if (diff3m > 10) rsScore += 9;
  else if (diff3m > 5) rsScore += 6;
  else if (diff3m > 0) rsScore += 3;

  if (diff6m > 20) rsScore += 8;
  else if (diff6m > 10) rsScore += 5;
  else if (diff6m > 0) rsScore += 2;

  rsScore = Math.min(20, rsScore);
  score += rsScore;
  breakdown.relStrength = rsScore;

  // 3차: 신고가 (20점)
  let highScore = 0;
  if (data.high52w > 0) {
    const pctFrom52wHigh = ((data.high52w - data.currentPrice) / data.high52w) * 100;
    if (pctFrom52wHigh <= 2) highScore = 20;
    else if (pctFrom52wHigh <= 5) highScore = 17;
    else if (pctFrom52wHigh <= 10) highScore = 13;
    else if (pctFrom52wHigh <= 15) highScore = 10;
    else if (data.breakHigh20) highScore = 12;
  }
  score += highScore;
  breakdown.nearHigh = highScore;

  // 4차: VCP (15점)
  let vcpScore = 0;
  if (data.vcpAtrDecreasing) vcpScore += 6;
  if (data.vcpRangeDecreasing) vcpScore += 5;
  if (data.vcpVolDecreasing) vcpScore += 4;
  vcpScore = Math.min(15, vcpScore);
  score += vcpScore;
  breakdown.vcp = vcpScore;

  // 5차: 거래량 축적 (10점)
  let accumScore = 0;
  if (data.volAccumulation >= 0.65) accumScore = 10;
  else if (data.volAccumulation >= 0.55) accumScore = 7;
  else if (data.volAccumulation >= 0.5) accumScore = 4;
  score += accumScore;
  breakdown.accumulation = accumScore;

  // 6차: AI 평가는 나중에 채워짐 (10점)
  breakdown.ai = 0;

  return { score: Math.min(90, Math.round(score)), breakdown };
}

// ─── 메인 핸들러 ─────────────────────────────────────────────────────────────

exports.handler = async function (event, context) {
  // CORS 헤더
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    console.log("Starting stock scan...");

    // 1. 후보 종목 수집 (가장 활발한 종목 + 상승 종목)
    let screenerStocks = [];
    let gainerStocks = [];

    try {
      screenerStocks = await fetchScreenerStocks(80);
      console.log(`Screener: ${screenerStocks.length} stocks`);
    } catch (e) {
      console.error("Screener fetch error:", e.message);
    }

    await sleep(500);

    try {
      gainerStocks = await fetchGainersStocks(50);
      console.log(`Gainers: ${gainerStocks.length} stocks`);
    } catch (e) {
      console.error("Gainers fetch error:", e.message);
    }

    // 중복 제거 및 합치기
    const allTickerMap = new Map();
    [...screenerStocks, ...gainerStocks].forEach((q) => {
      if (q.symbol && !allTickerMap.has(q.symbol)) {
        allTickerMap.set(q.symbol, q);
      }
    });

    // SPY ETF 데이터 (상대강도 비교용)
    let spyChange3m = 0;
    let spyChange6m = 0;
    try {
      const spyChart = await fetchQuote("SPY");
      const spyResult = spyChart?.chart?.result?.[0];
      if (spyResult) {
        const spyCloses = (spyResult.indicators?.quote?.[0]?.close || []).filter(v => v);
        if (spyCloses.length >= 127) {
          spyChange3m = ((spyCloses[spyCloses.length - 1] - spyCloses[spyCloses.length - 64]) / spyCloses[spyCloses.length - 64]) * 100;
          spyChange6m = ((spyCloses[spyCloses.length - 1] - spyCloses[spyCloses.length - 127]) / spyCloses[spyCloses.length - 127]) * 100;
        }
      }
    } catch (e) {
      console.error("SPY fetch error:", e.message);
    }

    await sleep(300);

    // 2. 각 종목 상세 데이터 수집 및 점수 계산
    const tickers = Array.from(allTickerMap.keys()).slice(0, 80);
    const dayTrades = [];
    const swingTrades = [];

    // 배치 처리 (한번에 5개씩)
    const batchSize = 5;
    for (let i = 0; i < tickers.length; i += batchSize) {
      const batch = tickers.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (ticker) => {
          try {
            // 특수문자 제외
            if (!/^[A-Z]{1,5}$/.test(ticker)) return;

            const [chartData, summaryData] = await Promise.all([
              fetchQuote(ticker),
              fetchSummary(ticker).catch(() => null),
            ]);

            const quoteData = allTickerMap.get(ticker) || {};
            const processed = processChartData(chartData, summaryData, quoteData);
            if (!processed) return;

            // 단타 점수
            const dayScore = calcDayTradeScore(processed, ticker);
            if (dayScore && dayScore.score >= 60) {
              dayTrades.push({
                ticker,
                name: processed.companyName,
                price: processed.currentPrice,
                dayChange: processed.dayChange,
                change5d: processed.change5d,
                marketCap: processed.marketCap,
                volume: processed.currentVolume,
                avgVolume: processed.avgVolume20,
                rvol: processed.rvol,
                rsi: processed.rsi,
                macd: processed.macd,
                macdHist: processed.macdHist,
                ema20: processed.ema20,
                ema50: processed.ema50,
                ema200: processed.ema200,
                atr: processed.atr,
                high52w: processed.high52w,
                low52w: processed.low52w,
                score: dayScore.score,
                breakdown: dayScore.breakdown,
                type: "daytrade",
              });
            }

            // 스윙 점수
            const swingScore = calcSwingScore(processed, ticker, spyChange3m, spyChange6m);
            if (swingScore && swingScore.score >= 60) {
              swingTrades.push({
                ticker,
                name: processed.companyName,
                price: processed.currentPrice,
                dayChange: processed.dayChange,
                change3m: processed.change3m,
                change6m: processed.change6m,
                marketCap: processed.marketCap,
                volume: processed.currentVolume,
                rvol: processed.rvol,
                rsi: processed.rsi,
                macd: processed.macd,
                macdHist: processed.macdHist,
                ema20: processed.ema20,
                ema50: processed.ema50,
                ema200: processed.ema200,
                atr: processed.atr,
                high52w: processed.high52w,
                low52w: processed.low52w,
                vcpScore: swingScore.breakdown.vcp,
                score: swingScore.score,
                breakdown: swingScore.breakdown,
                type: "swing",
              });
            }
          } catch (e) {
            console.error(`Error processing ${ticker}:`, e.message);
          }
        })
      );

      // 속도 제한
      if (i + batchSize < tickers.length) {
        await sleep(200);
      }
    }

    // 3. 정렬 및 TOP10 선정
    dayTrades.sort((a, b) => b.score - a.score);
    swingTrades.sort((a, b) => b.score - a.score);

    const top10Day = dayTrades.slice(0, 10);
    const top10Swing = swingTrades.slice(0, 10);

    // 4. 공통 종목 탐지
    const dayTickers = new Set(top10Day.map((s) => s.ticker));
    const swingTickers = new Set(top10Swing.map((s) => s.ticker));
    const commonTickers = [...dayTickers].filter((t) => swingTickers.has(t));

    const commonStocks = commonTickers
      .map((ticker) => {
        const day = top10Day.find((s) => s.ticker === ticker);
        const swing = top10Swing.find((s) => s.ticker === ticker);
        if (!day || !swing) return null;
        return {
          ticker,
          name: day.name,
          price: day.price,
          dayChange: day.dayChange,
          marketCap: day.marketCap,
          dayScore: day.score,
          swingScore: swing.score,
          combinedScore: Math.round((day.score + swing.score) / 2),
          dayBreakdown: day.breakdown,
          swingBreakdown: swing.breakdown,
          rsi: day.rsi,
          ema20: day.ema20,
          ema50: day.ema50,
          ema200: day.ema200,
          atr: day.atr,
          high52w: day.high52w,
          low52w: day.low52w,
          rvol: day.rvol,
          volume: day.volume,
          type: "common",
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.combinedScore - a.combinedScore)
      .slice(0, 5);

    console.log(
      `Scan complete: ${top10Day.length} daytrade, ${top10Swing.length} swing, ${commonStocks.length} common`
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        daytrade: top10Day,
        swing: top10Swing,
        common: commonStocks,
        spyChange3m,
        spyChange6m,
        scannedCount: tickers.length,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (err) {
    console.error("Search handler error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: err.message,
        timestamp: new Date().toISOString(),
      }),
    };
  }
};
