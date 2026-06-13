import type { DayTradeResult, SwingTradeResult } from "../types/index.js";

const API_KEY = process.env.OPENROUTER_API_KEY ?? "";
const API_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function analyzeStockWithAI(
  stock: DayTradeResult | SwingTradeResult,
  analysisType: "day" | "swing"
): Promise<string> {
  if (!API_KEY) {
    return "AI API 키가 설정되지 않았습니다. 환경변수 OPENROUTER_API_KEY를 설정해주세요.";
  }

  try {
    const prompt = buildAnalysisPrompt(stock, analysisType);

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "Ultimate Alpha Screener",
      },
      body: JSON.stringify({
        model: "google/gemma-4-31b-it:free",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("OpenRouter API 오류:", error);
      return `AI API 오류: ${response.status}`;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? "AI 응답을 가져올 수 없습니다.";
  } catch (error) {
    console.error("AI 분석 오류:", error);
    return "AI 분석 중 오류가 발생했습니다.";
  }
}

function buildAnalysisPrompt(
  stock: DayTradeResult | SwingTradeResult,
  analysisType: "day" | "swing"
): string {
  const baseInfo = `
종목: ${stock.name} (${stock.symbol})
현재가: $${stock.price.toFixed(2)}
섹터: ${stock.sector}
산업: ${stock.industry}
시가총액: $${(stock.marketCap / 1_000_000).toFixed(1)}M
거래량: ${(stock.volume / 1_000_000).toFixed(1)}M
점수: ${stock.score}/${stock.maxScore}
`;

  let specificInfo = "";

  if (analysisType === "day" && "rvol" in stock) {
    specificInfo = `
데이 트레이딩 지표:
- RVOL: ${stock.rvol.toFixed(2)}
- RSI: ${stock.rsi?.toFixed(1) ?? "N/A"}
- ATR%: ${stock.atrPct?.toFixed(2) ?? "N/A"}%
- 당일 변동률: ${stock.dayChange?.toFixed(2) ?? "N/A"}%
- 20일 수익률: ${stock.return20d.toFixed(2)}%
- 상대강도(RS20): ${stock.rs20d.toFixed(2)}%
- 갭업: ${stock.gapUp ? "Yes" : "No"}
- 플로트: ${(stock.floatShares / 1_000_000).toFixed(1)}M
`;
  } else if (analysisType === "swing" && "return3m" in stock) {
    specificInfo = `
스윙 트레이딩 지표:
- 3개월 수익률: ${stock.return3m.toFixed(2)}%
- 상대강도(RS3M): ${stock.rs3m.toFixed(2)}%
- 52주 고점 근접: ${stock.near52wHigh ? "Yes" : "No"}
- Minervini 트렌드: ${stock.minerviniPass ? "통과" : "미통과"}
- VCP 점수: ${stock.vcpScore}
`;
  }

  return `
당신은 전문 주식 분석가입니다. 다음 종목에 대해 ${analysisType === "day" ? "데이 트레이딩" : "스윙 트레이딩"} 관점에서 분석해주세요.

${baseInfo}
${specificInfo}

점수 구성:
${JSON.stringify(stock.breakdown, null, 2)}

다음 형식으로 분석해주세요:
1. **매매 신호**: 강력 매수/매수/보류/매도/강력 매도
2. **진입 전략**: 진입 가격대, 손절가, 목표가
3. **리스크 요인**: 주요 리스크 3가지
4. **기술적 분석**: 주요 지표 해석
5. **종합 의견**: 3문장 이내로 요약

분석은 한국어로 작성해주세요.
`;
}

export async function analyzeMarketWithAI(
  regime: any,
  sectors: any[]
): Promise<string> {
  if (!API_KEY) {
    return "AI API 키가 설정되지 않았습니다.";
  }

  try {
    const prompt = `
현재 시장 레짐:
${JSON.stringify(regime, null, 2)}

섹터 강도:
${sectors.map((s) => `${s.sector}: ${s.strength.toFixed(1)}`).join("\n")}

이 데이터를 바탕으로 현재 시장 상황을 분석하고, 어떤 섹터에 집중해야 할지 한국어로 조언해주세요.
`;

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "Ultimate Alpha Screener",
      },
      body: JSON.stringify({
        model: "google/gemma-4-31b-it:free",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("OpenRouter API 오류:", error);
      return `AI API 오류: ${response.status}`;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? "AI 응답을 가져올 수 없습니다.";
  } catch (error) {
    console.error("AI 시장 분석 오류:", error);
    return "AI 분석 중 오류가 발생했습니다.";
  }
}
