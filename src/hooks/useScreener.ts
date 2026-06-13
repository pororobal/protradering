import { useState, useCallback } from "react";
import type { ScanResponse } from "../types";
import { fetchScan } from "../services/api";

export function useScreener() {
  const [data, setData] = useState<ScanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");

  const scan = useCallback(async (force = false) => {
    if (loading || (!force && data?.cached)) return;
    setLoading(true);
    setError(null);
    setProgress(force ? "강제 재스캔 중..." : "Yahoo Finance 데이터 수집 중...");
    try {
      setData(await fetchScan(force));
    } catch (err) {
      setError(err instanceof Error ? err.message : "스캔 실패");
    } finally {
      setLoading(false);
      setProgress("");
    }
  }, [loading, data]);

  return { data, loading, error, progress, scan };
}
