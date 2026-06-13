import { calcATR } from "./atr.js";

export function detectVCP(
  highs: number[],
  lows: number[],
  closes: number[],
  volumes: number[]
): number {
  if (closes.length < 50) return 0;
  let score = 0;
  const price = closes[closes.length - 1];

  const rangeRecent =
    (Math.max(...highs.slice(-10)) - Math.min(...lows.slice(-10))) / price;
  const rangePrev =
    (Math.max(...highs.slice(-20, -10)) - Math.min(...lows.slice(-20, -10))) /
    (closes[closes.length - 11] || price);
  if (rangeRecent < rangePrev * 0.85) score += 30;

  const volRecent = average(volumes.slice(-10));
  const volPrev = average(volumes.slice(-20, -10));
  if (volRecent < volPrev * 0.85) score += 25;

  const atrRecent = calcATR(highs.slice(-25), lows.slice(-25), closes.slice(-25), 10);
  const atrPrev = calcATR(
    highs.slice(-40, -15),
    lows.slice(-40, -15),
    closes.slice(-40, -15),
    10
  );
  if (atrRecent && atrPrev && atrRecent < atrPrev * 0.85) score += 25;

  const swingLow1 = Math.min(...lows.slice(-30, -15));
  const swingLow2 = Math.min(...lows.slice(-15));
  if (swingLow2 > swingLow1) score += 20;

  return Math.min(100, score);
}

function average(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
