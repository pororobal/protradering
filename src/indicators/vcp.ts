import { calcATR } from "./atr.js";

const avg = (arr: number[]): number => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

export const detectVCP = (highs: number[], lows: number[], closes: number[], volumes: number[]): number => {
  if (closes.length < 50) return 0;
  let score = 0;
  const price = closes[closes.length - 1];

  const rangeRecent = (Math.max(...highs.slice(-10)) - Math.min(...lows.slice(-10))) / price;
  const rangePrev = (Math.max(...highs.slice(-20, -10)) - Math.min(...lows.slice(-20, -10))) / (closes[closes.length - 11] || price);
  if (rangeRecent < rangePrev * 0.85) score += 30;

  if (avg(volumes.slice(-10)) < avg(volumes.slice(-20, -10)) * 0.85) score += 25;

  const atrRecent = calcATR(highs.slice(-25), lows.slice(-25), closes.slice(-25), 10);
  const atrPrev = calcATR(highs.slice(-40, -15), lows.slice(-40, -15), closes.slice(-40, -15), 10);
  if (atrRecent && atrPrev && atrRecent < atrPrev * 0.85) score += 25;

  if (Math.min(...lows.slice(-15)) > Math.min(...lows.slice(-30, -15))) score += 20;

  return Math.min(100, score);
};
