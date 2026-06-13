export const calcEMA = (values: number[], period: number): number | null => {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) ema = values[i] * k + ema * (1 - k);
  return ema;
};

export const calcEMASeries = (values: number[], period: number): (number | null)[] => {
  const out = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = ema;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
};

export const isEMARising = (values: number[], period: number, lookback = 20): boolean => {
  const series = calcEMASeries(values, period).filter((v): v is number => v != null);
  return series.length >= lookback + 1 && series[series.length - 1] > series[series.length - 1 - lookback];
};
