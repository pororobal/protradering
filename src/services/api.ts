import type { ScanResponse } from "../types";

const API_BASE = "/api";

export async function fetchScan(force = false): Promise<ScanResponse> {
  const res = await fetch(`${API_BASE}/scan${force ? "/refresh" : ""}`, force ? { method: "POST" } : undefined);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Scan failed (${res.status})`);
  }
  return res.json();
}

export const checkHealth = async () => fetch(`${API_BASE}/health`).then((r) => r.ok, () => false);
