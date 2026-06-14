import type { ScanResponse } from "../types";

const API_BASE = "/api";

export async function fetchScan(force = false): Promise<ScanResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55000); // 55초 타임아웃 (Vercel 제한: 60초)

  try {
    const res = await fetch(`${API_BASE}/scan${force ? "/refresh" : ""}`, {
      ...(force ? { method: "POST" } : undefined),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `Scan failed (${res.status})`);
    }
    return res.json();
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error("스캔 시간 초과 - 서버 응답이 너무 느립니다. 잠시 후 다시 시도해주세요.");
    }
    throw err;
  }
}

export const checkHealth = async () => fetch(`${API_BASE}/health`).then((r) => r.ok, () => false);
// src/services/api.ts - 기존 파일에 추가

// AI 분석 요청
export async function fetchAIAnalysis(
  symbol: string,
  stock: any,
  analysisType: "day" | "swing"
): Promise<{ analysis: string }> {
  const res = await fetch(`${API_BASE}/ai-analyze-stock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, stock, analysisType }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `AI 분석 실패 (${res.status})`);
  }
  return res.json();
}
