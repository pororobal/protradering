import type { ScanResponse } from "../types/index.js";
import { CACHE_TTL_MS } from "../utils/constants.js";

interface CacheEntry {
  data: ScanResponse;
  expiresAt: number;
}

let cache: CacheEntry | null = null;

export function getCachedScan(): ScanResponse | null {
  if (!cache || Date.now() > cache.expiresAt) {
    cache = null;
    return null;
  }
  return { ...cache.data, cached: true };
}

export function setCachedScan(data: ScanResponse): void {
  cache = {
    data: { ...data, cached: false },
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
}

export function clearCache(): void {
  cache = null;
}
