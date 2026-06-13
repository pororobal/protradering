import type { OHLCVBar, SectorStrength } from "../types/index.js";
import { calcPeriodReturn } from "./marketRegime.js";

export function computeSectorStrength(
  sectors: { name: string; etf: string; bars: OHLCVBar[] }[],
  spyBars: OHLCVBar[]
): SectorStrength[] {
  const spy1w = calcPeriodReturn(spyBars, 5);
  const spy1m = calcPeriodReturn(spyBars, 21);
  const spy3m = calcPeriodReturn(spyBars, 63);

  return sectors
    .map(({ name, etf, bars }) => {
      const return1w = calcPeriodReturn(bars, 5);
      const return1m = calcPeriodReturn(bars, 21);
      const return3m = calcPeriodReturn(bars, 63);
      const vsSpy1w = return1w - spy1w;
      const vsSpy1m = return1m - spy1m;
      const vsSpy3m = return3m - spy3m;

      const strengthScore = Math.round(
        vsSpy1w * 0.2 + vsSpy1m * 0.3 + vsSpy3m * 0.5 + (return3m > 0 ? 10 : 0)
      );

      return {
        name,
        etf,
        return1w,
        return1m,
        return3m,
        vsSpy1w,
        vsSpy1m,
        vsSpy3m,
        strengthScore,
      };
    })
    .sort((a, b) => b.strengthScore - a.strengthScore);
}
