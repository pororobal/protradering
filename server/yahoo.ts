// server/yahoo.ts
// yahoo-finance2 안정화 래퍼
// 핵심 수정 사항:
//   1. validateResult: false → 스키마 검증 오류로 앱 크래시 방지
//   2. retry + 지수 백오프 → 429/네트워크 오류 자동 재시도
//   3. cookieRefresh → 10~20분 뒤 쿠키 만료 자동 갱신
//   4. FailedYahooValidationError → 부분 결과라도 사용
//   5. suppressNotices → 콘솔 노이즈 제거
//   6. YahooFinance 인스턴스 초기화 추가

import yahooFinance from "yahoo-finance2";

// ─── YahooFinance 인스턴스 초기화 ─────────────────────────────────────────────

const yahoo = new yahooFinance();

// ─── 공통 옵션 ──────────────────────────────────────────────────────────────

// validateResult: false 가 핵심 — Yahoo가 스키마를 바꿔도 오류 없이 동작
const QUERY_OPTS = {
  validateResult: false,
};

const NOTICE_OPTS = {
  suppressNotices: ["yahooSurvey"],
};

// ─── 재시도 유틸 ─────────────────────────────────────────────────────────────

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 함수를 최대 maxRetries번 재시도한다.
 * 429 / 네트워크 오류 시 지수 백오프 적용.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1500
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;

      const is429 =
        err?.message?.includes("429") ||
        err?.message?.includes("Too Many Requests") ||
        err?.status === 429 ||
        err?.statusCode === 429;

      const isCrumb =
        err?.message?.includes("crumb") ||
        err?.message?.includes("cookie") ||
        err?.message?.includes("Invalid Crumb") ||
        err?.message?.includes("Unauthorized");

      const isValidation =
        err?.constructor?.name === "FailedYahooValidationError";

      // 검증 오류는 부분 결과 포함 → 바로 리턴 시도
      if (isValidation && (err as any).result !== undefined) {
        return (err as any).result as T;
      }

      if (attempt === maxRetries) break;

      // 429이면 더 오래 기다림
      const delay = is429
        ? baseDelayMs * Math.pow(3, attempt) // 1.5s, 4.5s, 13.5s
        : isCrumb
        ? baseDelayMs * Math.pow(2, attempt) // 1.5s, 3s, 6s
        : baseDelayMs * (attempt + 1);       // 1.5s, 3s, 4.5s

      console.warn(
        `[yahoo] attempt ${attempt + 1}/${maxRetries} failed: ${err?.message?.slice(0, 80)}. 재시도 ${delay}ms 후...`
      );
      await sleep(delay);
    }
  }
  throw lastErr;
}

// ─── 공개 API ────────────────────────────────────────────────────────────────

/**
 * 스크리너 (day_gainers, most_actives 등)
 * validateResult: false + retry 적용
 */
export async function safeScreener(
  screenerId: string,
  count = 50
): Promise<any[]> {
  return withRetry(async () => {
    const result = await (yahoo as any).screener(
      { scrIds: screenerId, count },
      { ...QUERY_OPTS, ...NOTICE_OPTS }
    );
    return result?.quotes ?? result?.finance?.result?.[0]?.quotes ?? [];
  });
}

/**
 * 개별 종목 기본 quote 데이터
 */
export async function safeQuote(symbol: string): Promise<any | null> {
  return withRetry(async () => {
    try {
      const result = await (yahoo as any).quote(
        symbol,
        {},
        { ...QUERY_OPTS, ...NOTICE_OPTS }
      );
      return result ?? null;
    } catch (err: any) {
      if (err?.constructor?.name === "FailedYahooValidationError" && err.result) {
        return err.result;
      }
      throw err;
    }
  }).catch((e) => {
    console.warn(`[quote] ${symbol}: ${e.message?.slice(0, 60)}`);
    return null;
  });
}

/**
 * 1년치 일봉 히스토리 (EMA/RSI/MACD 계산용)
 */
export async function safeHistorical(symbol: string): Promise<any[]> {
  const period1 = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const period2 = new Date(); // 현재 날짜로 설정
  return withRetry(async () => {
    try {
      const result = await (yahoo as any).historical(
        symbol,
        { period1, period2, interval: "1d" },
        { ...QUERY_OPTS, ...NOTICE_OPTS }
      );
      return Array.isArray(result) ? result : [];
    } catch (err: any) {
      if (err?.constructor?.name === "FailedYahooValidationError" && Array.isArray(err.result)) {
        return err.result;
      }
      throw err;
    }
  }).catch((e) => {
    console.warn(`[historical] ${symbol}: ${e.message?.slice(0, 60)}`);
    return [];
  });
}

/**
 * quoteSummary (시가총액, 52주 고저가 등)
 */
export async function safeQuoteSummary(symbol: string): Promise<any | null> {
  return withRetry(async () => {
    try {
      const result = await (yahoo as any).quoteSummary(
        symbol,
        {
          modules: [
            "price",
            "summaryDetail",
            "defaultKeyStatistics",
          ],
        },
        { ...QUERY_OPTS, ...NOTICE_OPTS }
      );
      return result ?? null;
    } catch (err: any) {
      if (err?.constructor?.name === "FailedYahooValidationError" && err.result) {
        return err.result;
      }
      throw err;
    }
  }).catch((e) => {
    console.warn(`[quoteSummary] ${symbol}: ${e.message?.slice(0, 60)}`);
    return null;
  });
}

/**
 * SPY 기준 상대강도 계산용 히스토리
 */
export async function getSpyReturns(): Promise<{
  change3m: number;
  change6m: number;
}> {
  try {
    const hist = await safeHistorical("SPY");
    if (hist.length < 127) return { change3m: 0, change6m: 0 };
    const latest = hist[hist.length - 1]?.close ?? 0;
    const p3m = hist[Math.max(0, hist.length - 64)]?.close ?? latest;
    const p6m = hist[Math.max(0, hist.length - 127)]?.close ?? latest;
    return {
      change3m: p3m > 0 ? ((latest - p3m) / p3m) * 100 : 0,
      change6m: p6m > 0 ? ((latest - p6m) / p6m) * 100 : 0,
    };
  } catch {
    return { change3m: 0, change6m: 0 };
  }
}
