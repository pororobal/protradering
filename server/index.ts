// server/index.ts
// Express API 서버 — 5분 캐시 + 에러 핸들링 포함
// yahoo-finance2 관련 오류는 yahoo.ts 래퍼에서 처리

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { runScan, type ScanResult } from "./scanner.js";

const app = express();
const PORT = process.env.PORT ?? 3001;

// ─── 미들웨어 ────────────────────────────────────────────────────────────────

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "2mb" }));

// 요청 로거
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─── 5분 캐시 ────────────────────────────────────────────────────────────────

interface CacheEntry {
  data: ScanResult;
  ts: number;
}

let cache: CacheEntry | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5분
let scanInProgress = false;

function isCacheValid() {
  return cache !== null && Date.now() - cache.ts < CACHE_TTL;
}

// ─── 라우트 ──────────────────────────────────────────────────────────────────

// 헬스 체크
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    cacheValid: isCacheValid(),
    cacheAge: cache ? Math.round((Date.now() - cache.ts) / 1000) : null,
    timestamp: new Date().toISOString(),
  });
});

// 메인 스캔 엔드포인트 (캐시 우선)
app.get("/api/scan", async (_req: Request, res: Response) => {
  // 캐시 히트
  if (isCacheValid()) {
    console.log("[api/scan] 캐시 반환");
    return res.json({ success: true, cached: true, ...cache!.data });
  }

  // 이미 스캔 중이면 잠시 기다린 후 반환
  if (scanInProgress) {
    await new Promise<void>((r) => {
      const check = setInterval(() => {
        if (!scanInProgress || isCacheValid()) {
          clearInterval(check);
          r();
        }
      }, 500);
    });
    if (isCacheValid()) {
      return res.json({ success: true, cached: true, ...cache!.data });
    }
  }

  scanInProgress = true;
  try {
    const result = await runScan();
    cache = { data: result, ts: Date.now() };
    return res.json({ success: true, cached: false, ...result });
  } catch (err: any) {
    console.error("[api/scan] 스캔 오류:", err.message);
    // 이전 캐시가 있으면 만료되어도 반환 (stale-while-revalidate)
    if (cache) {
      return res.json({
        success: true,
        cached: true,
        stale: true,
        error: err.message,
        ...cache.data,
      });
    }
    return res.status(500).json({
      success: false,
      error: err.message || "스캔 실패",
    });
  } finally {
    scanInProgress = false;
  }
});

// 강제 새로고침 (캐시 무효화 후 재스캔)
app.post("/api/scan/refresh", async (_req: Request, res: Response) => {
  cache = null;
  scanInProgress = false;

  try {
    const result = await runScan();
    cache = { data: result, ts: Date.now() };
    return res.json({ success: true, cached: false, ...result });
  } catch (err: any) {
    console.error("[api/scan/refresh] 오류:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 캐시 상태 확인
app.get("/api/cache/status", (_req: Request, res: Response) => {
  res.json({
    valid: isCacheValid(),
    age: cache ? Math.round((Date.now() - cache.ts) / 1000) : null,
    ttl: CACHE_TTL / 1000,
    hasData: cache !== null,
  });
});

// 캐시 초기화
app.delete("/api/cache", (_req: Request, res: Response) => {
  cache = null;
  res.json({ success: true, message: "캐시 초기화됨" });
});

// ─── 전역 오류 핸들러 ────────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[server] 처리되지 않은 오류:", err.message);
  res.status(500).json({ success: false, error: err.message });
});

// ─── 서버 시작 ───────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[server] 포트 ${PORT} 에서 실행 중`);
  console.log(`[server] 헬스 체크: http://localhost:${PORT}/api/health`);

  // 서버 시작 시 백그라운드 프리워밍 (선택사항)
  // setTimeout(() => {
  //   runScan().then((r) => { cache = { data: r, ts: Date.now() }; }).catch(() => {});
  // }, 2000);
});
// server/index.ts - 추가할 부분 (라우트 섹션에 위치)

// ─── AI 분석 엔드포인트 (OpenRouter) ─────────────────────────────────────────

app.post("/api/ai/analyze-stock", async (req: Request, res: Response) => {
  const { symbol, stock, analysisType } = req.body;

  if (!symbol || !stock) {
    return res.status(400).json({ error: "종목 정보가 필요합니다." });
  }

  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterKey) {
    console.error("[AI] OPENROUTER_API_KEY 환경변수 없음");
    return res.status(500).json({ error: "AI 서비스 설정 오류" });
  }

  // 프롬프트 생성
  const prompt = `
당신은 전문 트레이더입니다. 아래 정보를 바탕으로 ${analysisType === "day" ? "단타(당일 매매)" : "스윙(2~10일 보유)"} 관점의 매매 아이디어를 제공하세요.

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

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openRouterKey}`,
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
      console.error("[AI] OpenRouter 오류:", response.status, errorText);
      return res.status(response.status).json({ error: "AI 서비스 응답 오류" });
    }

    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content || "분석 결과를 생성하지 못했습니다.";
    res.json({ analysis });
  } catch (err: any) {
    console.error("[AI] 요청 실패:", err.message);
    res.status(500).json({ error: "AI 분석 중 서버 오류 발생" });
  }
});
export default app;
