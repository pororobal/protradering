import { runFullScan } from "../server/scanner.js";
import { getCachedScan } from "../src/services/cache.js";

export default async function handler(req: any, res: any) {
  try {
    const cached = getCachedScan();
    if (cached) {
      return res.json(cached);
    }

    const result = await runFullScan();
    return res.json(result);
  } catch (err) {
    console.error("Scan error:", err);
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Scan failed",
      timestamp: new Date().toISOString(),
    });
  }
}
