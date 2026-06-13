import { analyzeStockWithAI } from "../src/services/aiAnalysis.js";

export default async function handler(req: any, res: any) {
  try {
    const { symbol, stock, analysisType } = req.body;
    if (!symbol || !stock || !analysisType) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const analysis = await analyzeStockWithAI(stock, analysisType);
    return res.json({ symbol, analysis });
  } catch (err) {
    console.error("AI stock analysis error:", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "AI analysis failed",
    });
  }
}
