const fmt = (n: number | null | undefined, d = 2): string => n == null || Number.isNaN(n) ? "—" : n.toFixed(d);

export const formatPrice = (n: number | null | undefined): string => `$${fmt(n)}`;
export const formatPct = (n: number | null | undefined, d = 2): string => `${n != null && n > 0 ? "+" : ""}${fmt(n, d)}%`;

const formatScale = (n: number, units: [number, string][]): string => {
  for (const [threshold, suffix] of units) if (n >= threshold) return `${(n / threshold).toFixed(suffix === "K" ? 0 : 2)}${suffix}`;
  return n.toFixed(0);
};

export const formatCompact = (n: number | null | undefined): string =>
  n == null || Number.isNaN(n) ? "—" : `$${formatScale(n, [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]])}`;

export const formatVolume = (n: number | null | undefined): string =>
  n == null || Number.isNaN(n) ? "—" : formatScale(n, [[1e9, "B"], [1e6, "M"], [1e3, "K"]]);

export const formatTime = (iso: string): string =>
  new Date(iso).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
