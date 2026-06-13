# Ultimate Alpha Screener

개인 전용 미국주식 알파 발굴 엔진. Yahoo Finance 단일 데이터 소스, TypeScript 풀스택.

## 실행

```bash
npm install
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3001

## 구조

```
src/
  components/     UI (Day/Swing/Regime/Sector/Watchlist/Journal)
  services/       Yahoo Finance, API, 5분 캐시
  indicators/     EMA, RSI, ATR, OBV, A/D, VCP
  screeners/      Day 300pt · Swing 500pt · Regime · Sector
  utils/          포맷, 상수
  hooks/          useScreener, useWatchlist, useJournal
  types/          공유 타입
server/           Express API + 스캔 오케스트레이션
```

## 데이터

- `yahoo-finance2` only
- 5분 서버 캐시 (`/api/scan`, `/api/scan/refresh`)
- Watchlist / Journal → LocalStorage

## 참고

- SwingPicker (Python) 스코어링·VCP·레짐 철학 참조
- pororobal stock-scanner Yahoo 스크리너·UI 패턴 참조
