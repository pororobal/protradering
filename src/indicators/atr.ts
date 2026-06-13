export const calcATR = (highs: number[], lows: number[], closes: number[], period = 14): number | null => {
  if (highs.length < period + 1) return null;
  const trs = highs.slice(1).map((h, i) => Math.max(h - lows[i + 1], Math.abs(h - closes[i]), Math.abs(lows[i + 1] - closes[i])));
  return trs.length >= period ? trs.slice(-period).reduce((a, b) => a + b, 0) / period : null;
};
