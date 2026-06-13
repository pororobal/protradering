export function calcOBVTrend(closes: number[], volumes: number[], lookback = 10): "up" | "down" | "flat" {
  if (closes.length < lookback + 1) return "flat";
  let obv = 0;
  const obvSeries: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) obv += volumes[i] ?? 0;
    else if (closes[i] < closes[i - 1]) obv -= volumes[i] ?? 0;
    obvSeries.push(obv);
  }
  if (obvSeries.length < lookback) return "flat";
  const recent = obvSeries.slice(-lookback);
  const slope = recent[recent.length - 1] - recent[0];
  if (slope > 0) return "up";
  if (slope < 0) return "down";
  return "flat";
}

export function calcAccumulationDistributionTrend(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  lookback = 10
): "up" | "down" | "flat" {
  if (closes.length < lookback + 1) return "flat";
  let ad = 0;
  const adSeries: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    const range = highs[i] - lows[i];
    const mfm = range === 0 ? 0 : (closes[i] - lows[i] - (highs[i] - closes[i])) / range;
    ad += mfm * (volumes[i] ?? 0);
    adSeries.push(ad);
  }
  const recent = adSeries.slice(-lookback);
  const slope = recent[recent.length - 1] - recent[0];
  if (slope > 0) return "up";
  if (slope < 0) return "down";
  return "flat";
}

export function isInstitutionalAccumulation(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  lookback = 20
): boolean {
  if (closes.length < lookback) return false;
  const start = closes.length - lookback;
  let maxVolIdx = start;
  for (let i = start + 1; i < closes.length; i++) {
    if ((volumes[i] ?? 0) > (volumes[maxVolIdx] ?? 0)) maxVolIdx = i;
  }
  const range = highs[maxVolIdx] - lows[maxVolIdx];
  if (range <= 0) return false;
  const closePosition = (closes[maxVolIdx] - lows[maxVolIdx]) / range;
  return closePosition >= 0.7;
}

export function findOrderBlockHigh(
  highs: number[],
  volumes: number[],
  lookback = 15
): number {
  if (highs.length < lookback) return highs[highs.length - 1] ?? 0;
  const start = highs.length - lookback;
  let maxVolIdx = start;
  for (let i = start + 1; i < highs.length; i++) {
    if ((volumes[i] ?? 0) > (volumes[maxVolIdx] ?? 0)) maxVolIdx = i;
  }
  return highs[maxVolIdx] ?? 0;
}
