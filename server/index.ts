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

export default app;
