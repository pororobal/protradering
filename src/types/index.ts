export interface OHLCVBar {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  volume: number;
  marketCap: number;
  sharesOutstanding: number;
  floatShares: number;
  sector: string;
  industry: string;
}

export interface ProcessedStock extends StockQuote {
  bars: OHLCVBar[];
  ema9: number | null;
  ema20: number | null;
  ema50: number | null;
  ema150: number | null;
  ema200: number | null;
  rsi: number | null;
  atr: number | null;
  atrPct: number | null;
  rvol: number;
  avgVolume20: number;
  dollarVolume: number;
  high20: number;
  high30: number;
  high52w: number;
  return20d: number;
  return3m: number;
  rangePosition: number;
  orderBlockHigh: number;
  gapUp: boolean;
  institutionalAccumulation: boolean;
  obvTrend: "up" | "down" | "flat";
  adTrend: "up" | "down" | "flat";
  vcpScore: number;
  minerviniPass: boolean;
  ema200Rising: boolean;
  volContractionExpansion: boolean;
  breakout30d: boolean;
  nearBreakout30d: boolean;
  near52wHigh: boolean;
  spyReturn20d: number;
  spyReturn3m: number;
}

export interface ScoreBreakdown {
  [key: string]: number;
}

// 매수/매도/손절/확률 플랜 (server/tradePlan.ts와 동일한 형태)
export interface TradePlan {
  entry: number;
  entryType: "market" | "pullback";
  stopLoss: number;
  stopLossPct: number;
  target1: number;
  target1Pct: number;
  target2: number;
  target2Pct: number;
  riskRewardRatio: number;
  winProbability: number;
}

export interface DayTradeResult {
  symbol: string;
  name: string;
  price: number;
  score: number;
  maxScore: 300;
  breakdown: ScoreBreakdown;
  sector: string;
  industry: string;
  rvol: number;
  rsi: number | null;
  atrPct: number | null;
  floatShares: number;
  dayChange: number;
  return20d: number;
  rs20d: number;
  gapUp: boolean;
  marketCap: number;
  volume: number;
  // SwingPicker-web 메트릭 (옵션)
  ebs?: number;
  structScore?: number;
  timingScore?: number;
  finalScore?: number;
  state?: string;
  tradePlan?: TradePlan;
}

export interface SwingTradeResult {
  symbol: string;
  name: string;
  price: number;
  score: number;
  maxScore: 500;
  breakdown: ScoreBreakdown;
  sector: string;
  industry: string;
  return3m: number;
  rs3m: number;
  near52wHigh: boolean;
  minerviniPass: boolean;
  vcpScore: number;
  marketCap: number;
  volume: number;
  // SwingPicker-web 메트릭 (옵션)
  ebs?: number;
  structScore?: number;
  timingScore?: number;
  finalScore?: number;
  state?: string;
  tradePlan?: TradePlan;
}

export type MarketRegime = "RISK_ON" | "NEUTRAL" | "RISK_OFF";

export interface MarketRegimeResult {
  regime: MarketRegime;
  spy: IndexAnalysis;
  qqq: IndexAnalysis;
  iwm: IndexAnalysis;
  breadth: number;
  volumeTrend: "expanding" | "contracting" | "neutral";
  volatility: "low" | "moderate" | "high";
  summary: string;
}

export interface IndexAnalysis {
  symbol: string;
  price: number;
  aboveEma50: boolean;
  aboveEma200: boolean;
  ema50Slope: number;
  change20d: number;
}

export interface SectorStrength {
  name: string;
  etf: string;
  return1w: number;
  return1m: number;
  return3m: number;
  vsSpy1w: number;
  vsSpy1m: number;
  vsSpy3m: number;
  strengthScore: number;
}

export interface ScanResponse {
  success: boolean;
  dayTrading: DayTradeResult[];
  swing: SwingTradeResult[];
  marketRegime: MarketRegimeResult;
  sectorStrength: SectorStrength[];
  scannedCount: number;
  timestamp: string;
  cached: boolean;
}

export interface WatchlistItem {
  symbol: string;
  name: string;
  addedAt: string;
  source: "day" | "swing" | "manual";
}

export interface JournalEntry {
  id: string;
  symbol: string;
  note: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export type AppTab = "day" | "swing" | "regime" | "sector" | "watchlist" | "journal";
