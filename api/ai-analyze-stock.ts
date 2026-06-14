// api/ai/analyze-stock.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

// OpenRouter API 호출
async function callOpenRouter(prompt: string, apiKey: string) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemma-4-31b-it:free",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter 오류: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "분석 결과를 생성하지 못했습니다.";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS 헤더 설정
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // OPTIONS 요청 처리 (CORS preflight)
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // POST 요청만 허용
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { symbol, stock, analysisType } = req.body;

    if (!symbol || !stock) {
      return res.status(400).json({ error: "종목 정보가 필요합니다." });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.error("[AI] OPENROUTER_API_KEY 환경변수 없음");
      return res.status(500).json({ error: "AI 서비스 설정 오류" });
    }

    // 프롬프트 생성
    const prompt = `
당신은 전문 트레이더입니다. 아래 정보를 바탕으로 ${analysisType === "day" ? "단타(데이 트레이딩)" : "스윙(2~10일 보유)"} 관점의 매매 아이디어를 제공하세요.

종목명: ${stock.name}
현재가: ${stock.price}원
종합 점수: ${stock.score}/100
섹터: ${stock.sector}
산업군: ${stock.industry}

거래 계획:
- 진입가: ${stock.tradePlan?.entry}원
- 1차 목표가: ${stock.tradePlan?.target1}원 (수익률 ${stock.tradePlan?.target1Pct}%)
- 2차 목표가: ${stock.tradePlan?.target2}원 (수익률 ${stock.tradePlan?.target2Pct}%)
- 손절가: ${stock.tradePlan?.stopLoss}원 (손실률 ${stock.tradePlan?.stopLossPct}%)
- 손익비: 1 : ${stock.tradePlan?.riskRewardRatio}
- 예상 성공 확률: ${stock.tradePlan?.winProbability}%

다음 질문에 간결하게 답변하세요 (각 항목 1~2문장):
1. 현재 매매 타이밍은 적절한가?
2. 가장 큰 리스크는 무엇인가?
3. 손절가와 목표가가 적절한가?
4. 종합 의견 및 주의점
`;

    const analysis = await callOpenRouter(prompt, apiKey);

    return res.json({ analysis });
  } catch (err: any) {
    console.error("[AI] 요청 실패:", err.message);
    return res.status(500).json({ error: err.message || "AI 분석 중 서버 오류 발생" });
  }
}
