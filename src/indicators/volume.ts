const calcTrend = (series: number[]): "up" | "down" | "flat" => {
  const slope = series[series.length - 1] - series[0];
  return slope > 0 ? "up" : slope < 0 ? "down" : "flat";
};

export const calcOBVTrend = (closes: number[], volumes: number[], lookback = 10): "up" | "down" | "flat" => {
  if (closes.length < lookback + 1) return "flat";
  let obv = 0;
  const obvSeries = closes.slice(1).map((c, i) => {
    obv += c > closes[i] ? volumes[i + 1] ?? 0 : c < closes[i] ? -(volumes[i + 1] ?? 0) : 0;
    return obv;
  });
  return obvSeries.length < lookback ? "flat" : calcTrend(obvSeries.slice(-lookback));
};

export const calcAccumulationDistributionTrend = (
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  lookback = 10
): "up" | "down" | "flat" => {
  if (closes.length < lookback + 1) return "flat";
  let ad = 0;
  const adSeries = highs.map((h, i) => {
    const range = h - lows[i];
    ad += (range === 0 ? 0 : (closes[i] - lows[i] - (h - closes[i])) / range) * (volumes[i] ?? 0);
    return ad;
  });
  return calcTrend(adSeries.slice(-lookback));
};

const findMaxVolIdx = (volumes: number[], start: number): number => {
  let maxIdx = start;
  for (let i = start + 1; i < volumes.length; i++) if ((volumes[i] ?? 0) > (volumes[maxIdx] ?? 0)) maxIdx = i;
  return maxIdx;
};

export const isInstitutionalAccumulation = (
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[],
  lookback = 20
): boolean => {
  if (closes.length < lookback) return false;
  const maxVolIdx = findMaxVolIdx(volumes, closes.length - lookback);
  const range = highs[maxVolIdx] - lows[maxVolIdx];
  return range > 0 && (closes[maxVolIdx] - lows[maxVolIdx]) / range >= 0.7;
};

export const findOrderBlockHigh = (highs: number[], volumes: number[], lookback = 15): number => {
  if (highs.length < lookback) return highs[highs.length - 1] ?? 0;
  return highs[findMaxVolIdx(volumes, highs.length - lookback)] ?? 0;
};
