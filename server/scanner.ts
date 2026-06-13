import type { ScanResponse } from "../src/types/index.js";
import { SECTOR_ETFS } from "../src/utils/constants.js";
import {
  fetchUniverse,
  fetchHistorical,
  fetchQuoteSummary,
  processStock,
  fetchBenchmarkReturns,
} from "../src/services/yahooFinance.js";
import { getCachedScan, setCachedScan } from "../src/services/cache.js";
import { scoreDayTrade } from "../src/screeners/dayTrading.js";
import { scoreSwing } from "../src/screeners/swing.js";
import { analyzeIndex, computeMarketRegime } from "../src/screeners/marketRegime.js";
import { computeSectorStrength } from "../src/screeners/sectorStrength.js";
import { sleep } from "../src/utils/format.js";

const BATCH_SIZE = 6;

export async function runFullScan(): Promise<ScanResponse> {
  const existing = getCachedScan();
  if (existing) return existing;

  const benchmarks = await fetchBenchmarkReturns();
  const { spyBars, qqqBars, iwmBars, spyReturn20d, spyReturn3m } = benchmarks;

  const [universe, ...sectorBars] = await Promise.all([
    fetchUniverse(100),
    ...SECTOR_ETFS.map((s) => fetchHistorical(s.etf).then((bars) => ({ ...s, bars }))),
  ]);

  const dayResults = [];
  const swingResults = [];
  let processed = 0;
  let advancing = 0;

  for (let i = 0; i < universe.length; i += BATCH_SIZE) {
    const batch = universe.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async (symbol) => {
        try {
          const [quote, bars] = await Promise.all([
            fetchQuoteSummary(symbol),
            fetchHistorical(symbol),
          ]);
          const stock = processStock(quote, bars, spyReturn20d, spyReturn3m);
          if (!stock) return null;

          if (stock.return20d > 0) advancing++;
          processed++;

          const day = scoreDayTrade(stock);
          const swing = scoreSwing(stock);
          return { day, swing };
        } catch (err) {
          console.error(`Failed ${symbol}:`, err instanceof Error ? err.message : err);
          return null;
        }
      })
    );

    for (const r of batchResults) {
      if (!r) continue;
      if (r.day) dayResults.push(r.day);
      if (r.swing) swingResults.push(r.swing);
    }

    if (i + BATCH_SIZE < universe.length) await sleep(150);
  }

  dayResults.sort((a, b) => b.score - a.score);
  swingResults.sort((a, b) => b.score - a.score);

  const advancingRatio = processed > 0 ? advancing / processed : 0.5;
  const spyAnalysis = analyzeIndex("SPY", spyBars);
  const qqqAnalysis = analyzeIndex("QQQ", qqqBars);
  const iwmAnalysis = analyzeIndex("IWM", iwmBars);
  const marketRegime = computeMarketRegime(
    spyAnalysis,
    qqqAnalysis,
    iwmAnalysis,
    spyBars,
    advancingRatio
  );
  const sectorStrength = computeSectorStrength(sectorBars, spyBars);

  const response: ScanResponse = {
    success: true,
    dayTrading: dayResults.slice(0, 30),
    swing: swingResults.slice(0, 30),
    marketRegime,
    sectorStrength,
    scannedCount: universe.length,
    timestamp: new Date().toISOString(),
    cached: false,
  };

  setCachedScan(response);
  return response;
}
