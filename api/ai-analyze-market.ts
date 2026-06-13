import { analyzeMarketWithAI } from "../src/services/aiAnalysis.js";

export default async function handler(req: any, res: any) {
  try {
    const { regime, sectors } = req.body;
    if (!regime || !sectors) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const analysis = await analyzeMarketWithAI(regime, sectors);
    return res.json({ analysis });
  } catch (err) {
    console.error("AI market analysis error:", err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : "AI analysis failed",
    });
  }
}
