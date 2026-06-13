// netlify/functions/analyze.js
// OpenRouter를 통해 Gemma 모델로 상위 종목 AI 분석
// API 키는 환경변수에서만 읽어 절대 프론트엔드에 노출하지 않음

const fetch = require("node-fetch");

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemma-3-27b-it:free";

// ─── 단일 종목 AI 분석 프롬프트 생성 ────────────────────────────────────────

function buildPrompt(stock) {
  const priceStr = stock.price ? `$${stock.price.toFixed(2)}` : "N/A";
  const rsiStr = stock.rsi ? stock.rsi.toFixed(1) : "N/A";
  const macdStr = stock.macdHist
    ? (stock.macdHist > 0 ? "▲ bullish" : "▼ bearish")
    : "N/A";
  const ema20Str = stock.ema20 ? `$${stock.ema20.toFixed(2)}` : "N/A";
  const ema50Str = stock.ema50 ? `$${stock.ema50.toFixed(2)}` : "N/A";
  const atrStr = stock.atr ? `$${stock.atr.toFixed(2)}` : "N/A";
  const high52wStr = stock.high52w ? `$${stock.high52w.toFixed(2)}` : "N/A";
  const low52wStr = stock.low52w ? `$${stock.low52w.toFixed(2)}` : "N/A";
  const dayChangeStr = stock.dayChange
    ? `${stock.dayChange > 0 ? "+" : ""}${stock.dayChange.toFixed(2)}%`
    : "N/A";
  const mktCapStr = stock.marketCap
    ? `$${(stock.marketCap / 1e9).toFixed(2)}B`
    : "N/A";
  const rvolStr = stock.rvol ? stock.rvol.toFixed(2) + "x" : "N/A";

  const typeLabel =
    stock.type === "common"
      ? "단타+스윙 공통"
      : stock.type === "daytrade"
      ? "단타"
      : "스윙";

  return `
당신은 미국 주식 전문 트레이더입니다. 아래 종목을 분석하고 JSON으로만 응답하세요.
불필요한 설명 없이 JSON만 출력하세요.

종목: ${stock.ticker} (${stock.name})
유형: ${typeLabel}
현재가: ${priceStr}
당일등락: ${dayChangeStr}
시가총액: ${mktCapStr}
RSI(14): ${rsiStr}
MACD: ${macdStr}
20EMA: ${ema20Str}
50EMA: ${ema50Str}
ATR(14): ${atrStr}
52주고가: ${high52wStr}
52주저가: ${low52wStr}
거래량비율: ${rvolStr}
점수: ${stock.score || stock.combinedScore || 0}/100

아래 JSON 구조로만 응답 (한국어로):
{
  "summary": "한줄 요약 (최대 40자)",
  "upside": "상승 가능성 (높음/중간/낮음)",
  "strengths": "핵심 강점 1-2가지 (최대 60자)",
  "risks": "주요 위험요소 1-2가지 (최대 60자)",
  "entry": "진입 전략 (최대 50자)",
  "stopLoss": "손절가 (숫자만, 예: 45.20)",
  "target1": "1차 목표가 (숫자만)",
  "target2": "2차 목표가 (숫자만)",
  "dayFit": "단타 적합성 (상/중/하)",
  "swingFit": "스윙 적합성 (상/중/하)"
}
`.trim();
}

// ─── OpenRouter 호출 ─────────────────────────────────────────────────────────

async function callOpenRouter(prompt, apiKey) {
  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://ai-stock-scanner.netlify.app",
      "X-Title": "AI Stock Scanner",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      temperature: 0.3,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
    timeout: 30000,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content || "";
  return text;
}

// JSON 추출 (코드 블록 제거)
function extractJSON(text) {
  let cleaned = text.trim();
  // ```json ... ``` 블록 제거
  cleaned = cleaned.replace(/```json\s*/gi, "").replace(/```\s*/g, "");
  // 첫 번째 { 부터 마지막 } 까지 추출
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  return cleaned.slice(start, end + 1);
}

// ─── 손절/목표가 계산 (AI 실패 시 폴백) ─────────────────────────────────────

function calcFallbackLevels(stock) {
  const price = stock.price || 0;
  const atr = stock.atr || price * 0.02;
  const isDay = stock.type === "daytrade" || stock.type === "common";
  const isSwing = stock.type === "swing" || stock.type === "common";

  const stopLossMultiplier = isDay ? 1.5 : 2.0;
  const t1Multiplier = isDay ? 2.0 : 3.0;
  const t2Multiplier = isDay ? 3.5 : 5.0;

  return {
    summary: `${stock.ticker} - 점수 ${stock.score || stock.combinedScore}/100 강세 종목`,
    upside: (stock.score || stock.combinedScore || 0) >= 85 ? "높음" : (stock.score || stock.combinedScore || 0) >= 70 ? "중간" : "낮음",
    strengths: "거래량 급증, 기술적 돌파",
    risks: "변동성 높음, 시장 상황 주의",
    entry: `현재가 ${price.toFixed(2)} 근처 진입, 확인 후 매수`,
    stopLoss: (price - atr * stopLossMultiplier).toFixed(2),
    target1: (price + atr * t1Multiplier).toFixed(2),
    target2: (price + atr * t2Multiplier).toFixed(2),
    dayFit: stock.type === "daytrade" ? "상" : stock.type === "common" ? "상" : "중",
    swingFit: stock.type === "swing" ? "상" : stock.type === "common" ? "상" : "중",
  };
}

// ─── 메인 핸들러 ─────────────────────────────────────────────────────────────

exports.handler = async function (event, context) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    // API 키 없을 때 폴백 데이터 반환
    try {
      const { stocks } = JSON.parse(event.body || "{}");
      const results = {};
      (stocks || []).slice(0, 20).forEach((stock) => {
        results[stock.ticker] = calcFallbackLevels(stock);
      });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, results, fallback: true }),
      };
    } catch (e) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "No API key configured" }),
      };
    }
  }

  let stocks = [];
  try {
    const body = JSON.parse(event.body || "{}");
    stocks = body.stocks || [];
  } catch (e) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Invalid request body" }),
    };
  }

  if (!stocks.length) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "No stocks provided" }),
    };
  }

  // 최대 20개로 제한
  const targetStocks = stocks.slice(0, 20);
  const results = {};
  const errors = {};

  // 순차 처리 (Rate limit 방지)
  for (const stock of targetStocks) {
    try {
      const prompt = buildPrompt(stock);
      const rawResponse = await callOpenRouter(prompt, apiKey);

      const jsonStr = extractJSON(rawResponse);
      if (!jsonStr) {
        console.warn(`No JSON in response for ${stock.ticker}:`, rawResponse.slice(0, 200));
        results[stock.ticker] = calcFallbackLevels(stock);
        continue;
      }

      try {
        const parsed = JSON.parse(jsonStr);
        // 필수 필드 검증
        const required = ["summary", "upside", "strengths", "risks", "entry", "stopLoss", "target1", "target2", "dayFit", "swingFit"];
        const missing = required.filter((k) => !parsed[k]);
        if (missing.length > 3) {
          results[stock.ticker] = { ...calcFallbackLevels(stock), ...parsed };
        } else {
          results[stock.ticker] = parsed;
        }
      } catch (parseErr) {
        console.error(`JSON parse error for ${stock.ticker}:`, parseErr.message);
        results[stock.ticker] = calcFallbackLevels(stock);
      }

      // API rate limit 방지
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`OpenRouter error for ${stock.ticker}:`, err.message);
      errors[stock.ticker] = err.message;
      results[stock.ticker] = calcFallbackLevels(stock);
    }
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      results,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    }),
  };
};
