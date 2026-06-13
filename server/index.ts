import express from "express";
import cors from "cors";
import { runFullScan } from "./scanner.js";
import { getCachedScan, clearCache } from "../src/services/cache.js";
import { analyzeStockWithAI, analyzeMarketWithAI } from "../src/services/aiAnalysis.js";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get("/api/scan", async (_req, res) => {
  try {
    const cached = getCachedScan();
    if (cached) {
      return res.json(cached);
    }

    const result = await runFullScan();
    res.json(result);
  } catch (err) {
    console.error("Scan error:", err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Scan failed",
      timestamp: new Date().toISOString(),
    });
  }
});

app.post("/api/scan/refresh", async (_req, res) => {
  try {
    clearCache();
    const result = await runFullScan();
    res.json(result);
  } catch (err) {
    console.error("Refresh scan error:", err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Scan failed",
      timestamp: new Date().toISOString(),
    });
  }
});

app.post("/api/ai/analyze-stock", async (req, res) => {
  try {
    const { symbol, stock, analysisType } = req.body;
    if (!symbol || !stock || !analysisType) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const analysis = await analyzeStockWithAI(stock, analysisType);
    res.json({ symbol, analysis });
  } catch (err) {
    console.error("AI stock analysis error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "AI analysis failed",
    });
  }
});

app.post("/api/ai/analyze-market", async (req, res) => {
  try {
    const { regime, sectors } = req.body;
    if (!regime || !sectors) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const analysis = await analyzeMarketWithAI(regime, sectors);
    res.json({ analysis });
  } catch (err) {
    console.error("AI market analysis error:", err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "AI analysis failed",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Alpha Screener API running on http://localhost:${PORT}`);
});
