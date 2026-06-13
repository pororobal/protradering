import type { ScanResponse } from "../types";

const API_BASE = "/api";

export async function fetchScan(force = false): Promise<ScanResponse> {
  const url = force ? `${API_BASE}/scan/refresh` : `${API_BASE}/scan`;
  const res = await fetch(url, force ? { method: "POST" } : undefined);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Scan failed (${res.status})`);
  }
  return res.json();
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
