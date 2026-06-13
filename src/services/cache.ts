import type { ScanResponse } from "../types/index.js";
import { CACHE_TTL_MS } from "../utils/constants.js";

let cache: { data: ScanResponse; expiresAt: number } | null = null;

export const getCachedScan = (): ScanResponse | null => {
  if (!cache || Date.now() > cache.expiresAt) {
    cache = null;
    return null;
  }
  return { ...cache.data, cached: true };
};

export const setCachedScan = (data: ScanResponse): void => {
  cache = { data: { ...data, cached: false }, expiresAt: Date.now() + CACHE_TTL_MS };
};

export const clearCache = (): void => { cache = null; };
