import { runScan } from "../server/scanner.js";
import { clearCache } from "../src/services/cache.js";

export default async function handler(req: any, res: any) {
  try {
    clearCache();
    const result = await runScan();
    return res.json(result);
  } catch (err) {
    console.error("Refresh scan error:", err);
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Scan failed",
      timestamp: new Date().toISOString(),
    });
  }
}
