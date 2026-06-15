// api/ai-analyze-stock.ts

export default async function handler(req: any, res: any) {
  // CORS 설정
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { symbol, stock, analysisType, chartData } = req.body;

    if (!symbol || !stock) {
      return res.status(400).json({ error: "종목 정보가 필요합니다." });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.error("[AI] OPENROUTER_API_KEY 없음");
      return res.status(500).json({ error: "AI 서비스 키가 설정되지 않았습니다." });
    }

    // 기술적 지표 계산 헬퍼 함수
    const calcPctDiff = (price: number, reference: number) => {
      if (!reference || reference === 0) return 0;
      return ((price - reference) / reference * 100).toFixed(2);
    };

    const getTrend = (price: number, ma: number) => {
      if (!ma) return "데이터 없음";
      if (price > ma) return "상승 (가격이 이동평균 위)";
      if (price < ma) return "하락 (가격이 이동평균 아래)";
      return "중립";
    };

    const getRSIStatus = (rsi: number) => {
      if (!rsi) return "데이터 없음";
      if (rsi >= 70) return "과매수 (70 이상) - 조정 가능성";
      if (rsi <= 30) return "과매도 (30 이하) - 반등 가능성";
      if (rsi >= 50) return "강한 모멘텀 (50 이상)";
      return "약한 모멘텀 (50 미만)";
    };

    const getVolumeStatus = (volume: number, avgVolume: number) => {
      if (!volume || !avgVolume) return "데이터 없음";
      const ratio = volume / avgVolume;
      if (ratio >= 2) return `매우 높음 (평균 대비 ${ratio.toFixed(1)}배) - 거래량 급증`;
      if (ratio >= 1.2) return `높음 (평균 대비 ${ratio.toFixed(1)}배) - 관심 증가`;
      if (ratio <= 0.5) return `낮음 (평균 대비 ${ratio.toFixed(1)}배) - 관심 부족`;
      return `보통 (평균 대비 ${ratio.toFixed(1)}배)`;
    };

    // 차트 데이터 포맷팅
    const chartAnalysisText = chartData ? `
[📊 차트 기술적 분석 데이터]

■ 이동평균선
- 20일 이동평균: ${chartData.ma20?.toLocaleString() || '데이터 없음'}원
- 50일 이동평균: ${chartData.ma50?.toLocaleString() || '데이터 없음'}원
- 200일 이동평균: ${chartData.ma200?.toLocaleString() || '데이터 없음'}원
- 현재가 대비 이격도 (MA20): ${calcPctDiff(chartData.currentPrice, chartData.ma20)}%
- 현재가 대비 이격도 (MA50): ${calcPctDiff(chartData.currentPrice, chartData.ma50)}%
- 추세 상태 (MA20 기준): ${getTrend(chartData.currentPrice, chartData.ma20)}
- 추세 상태 (MA50 기준): ${getTrend(chartData.currentPrice, chartData.ma50)}

■ 모멘텀 지표
- RSI(14): ${chartData.rsi?.toFixed(1) || '데이터 없음'} - ${getRSIStatus(chartData.rsi)}
- MACD 시그널: ${chartData.macdSignal || '데이터 없음'} (${chartData.macdSignal === "bullish" ? "상승 신호 ↑" : chartData.macdSignal === "bearish" ? "하락 신호 ↓" : "중립"})

■ 거래량 분석
- 현재 거래량: ${chartData.volume?.toLocaleString() || '데이터 없음'}주
- 평균 거래량(20일): ${chartData.avgVolume?.toLocaleString() || '데이터 없음'}주
- 거래량 상태: ${getVolumeStatus(chartData.volume, chartData.avgVolume)}

■ 가격 위치
- 52주 최고가 대비: ${calcPctDiff(chartData.currentPrice, chartData.high52w)}% (최고가: ${chartData.high52w?.toLocaleString()}원)
- 52주 최저가 대비: ${calcPctDiff(chartData.currentPrice, chartData.low52w)}% (최저가: ${chartData.low52w?.toLocaleString()}원)
- 볼린저 밴드 위치: ${chartData.bbPosition || '데이터 없음'} (상단: ${chartData.bbUpper?.toLocaleString()}원, 하단: ${chartData.bbLower?.toLocaleString()}원)

■ 지지/저항 레벨 (추정)
- 1차 지지선: ${chartData.support1?.toLocaleString() || '계산 불가'}원
- 2차 지지선: ${chartData.support2?.toLocaleString() || '계산 불가'}원
- 1차 저항선: ${chartData.resistance1?.toLocaleString() || '계산 불가'}원
- 2차 저항선: ${chartData.resistance2?.toLocaleString() || '계산 불가'}원
` : "";

    // 프롬프트 생성
    const prompt = `
당신은 전문 트레이더입니다. 아래 정보를 바탕으로 ${analysisType === "day" ? "단타(데이 트레이딩, 당일 또는 익일 청산)" : "스윙(2~10일 보유)"} 관점의 매매 아이디어를 제공하세요.

[📈 종목 기본 정보]
종목명: ${stock.name}
현재가: ${stock.price.toLocaleString()}원
종합 점수: ${stock.score}/100
섹터: ${stock.sector || "정보 없음"}
산업군: ${stock.industry || "정보 없음"}

[💰 거래 계획]
- 진입가: ${stock.tradePlan?.entry?.toLocaleString() || '정보 없음'}원
- 1차 목표가: ${stock.tradePlan?.target1?.toLocaleString() || '정보 없음'}원 (수익률 ${stock.tradePlan?.target1Pct || 0}%)
- 2차 목표가: ${stock.tradePlan?.target2?.toLocaleString() || '정보 없음'}원 (수익률 ${stock.tradePlan?.target2Pct || 0}%)
- 손절가: ${stock.tradePlan?.stopLoss?.toLocaleString() || '정보 없음'}원 (손실률 ${stock.tradePlan?.stopLossPct || 0}%)
- 손익비: 1 : ${stock.tradePlan?.riskRewardRatio || 0}
- 예상 성공 확률: ${stock.tradePlan?.winProbability || 0}%

${chartAnalysisText}

다음 질문에 대해 구체적이고 전문적으로 답변해주세요 (각 항목 2-3문장):

1. 📊 **차트 패턴 분석**: 이동평균선, RSI, 거래량 등을 종합하여 현재 차트의 기술적 상태를 분석해주세요.
2. ⏱️ **매매 타이밍**: 현재 진입하기에 적절한 시점인가요? 그 이유는 무엇인가요?
3. ⚠️ **리스크 분석**: 이 거래에서 가장 큰 리스크 요인은 무엇이며, 어떻게 대비해야 하나요?
4. 🎯 **목표가/손절가 평가**: 제시된 목표가와 손절가가 적절한가요? 조정이 필요하다면 어떻게 제안하나요?
5. 💡 **종합 의견**: 최종 매매 판단과 주의할 점을 한 문장으로 요약해주세요.

답변은 전문적이면서도 이해하기 쉽게, 존칭 없이 작성해주세요.
`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemma-4-31b-it:free",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[AI] OpenRouter 오류:", response.status, errorText);
      return res.status(response.status).json({ error: "AI 서비스 응답 오류" });
    }

    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content || "분석 결과를 생성하지 못했습니다.";
    return res.status(200).json({ analysis });
  } catch (err: any) {
    console.error("[AI] 요청 실패:", err?.message || err);
    return res.status(500).json({ error: err?.message || "AI 분석 중 서버 오류 발생" });
  }
}
