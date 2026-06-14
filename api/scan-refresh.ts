import { runScan } from "../server/scanner.js";
import { clearCache } from "../src/services/cache.js";

export default async function handler(req: any, res: any) {
  try {
    clearCache();
    const result = await runScan();
    // Transform ScanResult to ScanResponse format
    const response = {
      success: true,
      dayTrading: result.daytrade.map((s) => ({
        symbol: s.ticker,
        name: s.name,
        price: s.price,
        score: s.score,
        maxScore: 100,
        breakdown: s.breakdown,
        sector: "",
        industry: "",
        rvol: s.rvol,
        rsi: s.rsi,
        atrPct: s.atr && s.price ? (s.atr / s.price) * 100 : null,
        floatShares: 0,
        dayChange: s.dayChange,
        return20d: s.change5d || 0,
        rs20d: 0,
        gapUp: false,
        marketCap: s.marketCap,
        volume: s.volume,
        // SwingPicker-web metrics
        ebs: s.ebs,
        structScore: s.structScore,
        timingScore: s.timingScore,
        aiScore: s.aiScore,
        finalScore: s.finalScore,
        state: s.state,
      })),
      swing: result.swing.map((s) => ({
        symbol: s.ticker,
        name: s.name,
        price: s.price,
        score: s.score,
        maxScore: 100,
        breakdown: s.breakdown,
        sector: "",
        industry: "",
        return3m: s.change3m || 0,
        rs3m: 0,
        near52wHigh: s.high52w > 0 && s.price >= s.high52w * 0.98,
        minerviniPass: false,
        vcpScore: s.vcpScore || 0,
        marketCap: s.marketCap,
        volume: s.volume,
        // SwingPicker-web metrics
        ebs: s.ebs,
        structScore: s.structScore,
        timingScore: s.timingScore,
        aiScore: s.aiScore,
        finalScore: s.finalScore,
        state: s.state,
      })),
      marketRegime: null,
      sectorStrength: [],
      scannedCount: result.scannedCount,
      timestamp: result.timestamp,
      cached: false,
    };
    return res.json(response);
  } catch (err) {
    console.error("Refresh scan error:", err);
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Scan failed",
      timestamp: new Date().toISOString(),
    });
  }
}
