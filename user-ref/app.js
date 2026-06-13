// app.js - AI 미국 주식 탐색기 메인 로직
// 모든 API 통신은 Netlify Functions를 통해 처리
// 프론트엔드에 API 키 절대 미포함

"use strict";

// ─── 상태 관리 ─────────────────────────────────────────────────────────────

const STATE = {
  isLoading: false,
  lastScanTime: null,
  scannedCount: 0,
  data: {
    daytrade: [],
    swing: [],
    common: [],
  },
  aiResults: {},   // ticker → AI 분석 결과
  aiLoading: new Set(), // 현재 AI 분석 요청 중인 티커
  currentTab: "daytrade",
  activeModal: null,
  // 5분 캐시
  cacheTimestamp: null,
  CACHE_TTL: 5 * 60 * 1000,
};

// ─── DOM 참조 ──────────────────────────────────────────────────────────────

const DOM = {
  scanBtn: null,
  scanBtnText: null,
  scanBtnIcon: null,
  progressWrap: null,
  progressFill: null,
  progressLabel: null,
  progressPct: null,
  statusDot: null,
  headerStatus: null,
  statsBanner: null,
  statsScanned: null,
  statsDay: null,
  statsSwing: null,
  statsCommon: null,
  errorBanner: null,
  errorMsg: null,
  retryBtn: null,
  tabBtns: null,
  tabPanels: null,
  dayList: null,
  swingList: null,
  commonList: null,
  dayBadge: null,
  swingBadge: null,
  commonBadge: null,
  lastTimeEl: null,
  scanCountEl: null,
  modalOverlay: null,
  modal: null,
  modalClose: null,
  modalBody: null,
};

// ─── 초기화 ────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  initDOM();
  bindEvents();
  loadCachedData();
});

function initDOM() {
  DOM.scanBtn        = document.getElementById("scanBtn");
  DOM.scanBtnText    = document.getElementById("scanBtnText");
  DOM.scanBtnIcon    = document.getElementById("scanBtnIcon");
  DOM.progressWrap   = document.getElementById("progressWrap");
  DOM.progressFill   = document.getElementById("progressFill");
  DOM.progressLabel  = document.getElementById("progressLabel");
  DOM.progressPct    = document.getElementById("progressPct");
  DOM.statusDot      = document.getElementById("statusDot");
  DOM.headerStatus   = document.getElementById("headerStatus");
  DOM.statsBanner    = document.getElementById("statsBanner");
  DOM.statsScanned   = document.getElementById("statsScanned");
  DOM.statsDay       = document.getElementById("statsDay");
  DOM.statsSwing     = document.getElementById("statsSwing");
  DOM.statsCommon    = document.getElementById("statsCommon");
  DOM.errorBanner    = document.getElementById("errorBanner");
  DOM.errorMsg       = document.getElementById("errorMsg");
  DOM.retryBtn       = document.getElementById("retryBtn");
  DOM.tabBtns        = document.querySelectorAll(".tab-btn");
  DOM.tabPanels      = document.querySelectorAll(".tab-panel");
  DOM.dayList        = document.getElementById("dayList");
  DOM.swingList      = document.getElementById("swingList");
  DOM.commonList     = document.getElementById("commonList");
  DOM.dayBadge       = document.getElementById("dayBadge");
  DOM.swingBadge     = document.getElementById("swingBadge");
  DOM.commonBadge    = document.getElementById("commonBadge");
  DOM.lastTimeEl     = document.getElementById("lastTime");
  DOM.scanCountEl    = document.getElementById("scanCount");
  DOM.modalOverlay   = document.getElementById("modalOverlay");
  DOM.modal          = document.getElementById("modal");
  DOM.modalClose     = document.getElementById("modalClose");
  DOM.modalBody      = document.getElementById("modalBody");
}

function bindEvents() {
  DOM.scanBtn.addEventListener("click", handleScan);
  DOM.retryBtn.addEventListener("click", handleScan);

  // 탭 전환
  DOM.tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // 모달 닫기
  DOM.modalClose.addEventListener("click", closeModal);
  DOM.modalOverlay.addEventListener("click", (e) => {
    if (e.target === DOM.modalOverlay) closeModal();
  });

  // 모달 스와이프 닫기 (터치)
  let touchStartY = 0;
  DOM.modal.addEventListener("touchstart", (e) => {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  DOM.modal.addEventListener("touchmove", (e) => {
    const delta = e.touches[0].clientY - touchStartY;
    if (delta > 60) closeModal();
  }, { passive: true });
}

// ─── 캐시 관리 ─────────────────────────────────────────────────────────────

function saveCache(data) {
  try {
    const cache = {
      data,
      timestamp: Date.now(),
    };
    sessionStorage.setItem("stockScanCache", JSON.stringify(cache));
  } catch (e) {
    // sessionStorage 실패 시 무시
  }
}

function loadCachedData() {
  try {
    const raw = sessionStorage.getItem("stockScanCache");
    if (!raw) return;
    const cache = JSON.parse(raw);
    const age = Date.now() - cache.timestamp;
    if (age < STATE.CACHE_TTL && cache.data) {
      applyData(cache.data);
      STATE.cacheTimestamp = cache.timestamp;
      STATE.lastScanTime = new Date(cache.timestamp);
      updateLastTime();
    }
  } catch (e) {
    // 캐시 파싱 실패 시 무시
  }
}

function isCacheValid() {
  if (!STATE.cacheTimestamp) return false;
  return (Date.now() - STATE.cacheTimestamp) < STATE.CACHE_TTL;
}

// ─── 스캔 실행 ─────────────────────────────────────────────────────────────

async function handleScan() {
  if (STATE.isLoading) return;

  // 캐시 유효하면 재스캔 안 함
  if (isCacheValid()) {
    showToast("최근 결과를 표시 중입니다 (5분 캐시)");
    return;
  }

  hideError();
  setLoading(true);
  updateProgress(0, "종목 스캔 초기화 중...");

  try {
    // 단계 1: 종목 데이터 수집
    updateProgress(10, "Yahoo Finance 연결 중...");
    await sleep(300);

    updateProgress(25, "활성 종목 스크리닝...");

    const searchRes = await fetchWithTimeout(
      "/api/search",
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      },
      90000 // 90초 타임아웃
    );

    if (!searchRes.ok) {
      const errData = await searchRes.json().catch(() => ({}));
      throw new Error(errData.error || `서버 오류 (${searchRes.status})`);
    }

    updateProgress(60, "점수 계산 및 순위 선정...");
    const scanData = await searchRes.json();

    if (!scanData.success) {
      throw new Error(scanData.error || "스캔 실패");
    }

    updateProgress(75, "AI 분석 준비 중...");

    // 단계 2: AI 분석 요청
    const allStocks = [
      ...scanData.common,
      ...scanData.daytrade,
      ...scanData.swing,
    ];

    // 중복 제거
    const uniqueStocks = [];
    const seenTickers = new Set();
    allStocks.forEach((s) => {
      if (!seenTickers.has(s.ticker)) {
        seenTickers.add(s.ticker);
        uniqueStocks.push(s);
      }
    });

    updateProgress(85, `AI 분석 중 (${Math.min(uniqueStocks.length, 20)}개 종목)...`);

    let aiResults = {};
    try {
      const analyzeRes = await fetchWithTimeout(
        "/api/analyze",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stocks: uniqueStocks.slice(0, 20) }),
        },
        120000 // 120초 타임아웃
      );

      if (analyzeRes.ok) {
        const aiData = await analyzeRes.json();
        aiResults = aiData.results || {};
      }
    } catch (aiErr) {
      console.warn("AI 분석 실패 (폴백 사용):", aiErr.message);
    }

    updateProgress(95, "결과 렌더링...");

    STATE.aiResults = aiResults;
    const fullData = { ...scanData, aiResults };

    applyData(fullData);
    saveCache(fullData);

    STATE.cacheTimestamp = Date.now();
    STATE.lastScanTime = new Date();
    updateLastTime();
    updateProgress(100, "스캔 완료!");

    await sleep(500);

    setLoading(false);
    hideProgress();

    // 결과 있으면 첫 탭으로
    if (scanData.common.length > 0) {
      switchTab("common");
    }

    showToast(`✅ ${scanData.scannedCount || 0}개 종목 스캔 완료`);

  } catch (err) {
    console.error("Scan error:", err);
    setLoading(false);
    hideProgress();
    showError(err.message);
  }
}

// ─── 데이터 적용 ───────────────────────────────────────────────────────────

function applyData(data) {
  STATE.data.daytrade = data.daytrade || [];
  STATE.data.swing    = data.swing    || [];
  STATE.data.common   = data.common   || [];
  STATE.scannedCount  = data.scannedCount || 0;
  if (data.aiResults) {
    STATE.aiResults = data.aiResults;
  }

  // 배지 업데이트
  DOM.dayBadge.textContent    = STATE.data.daytrade.length;
  DOM.swingBadge.textContent  = STATE.data.swing.length;
  DOM.commonBadge.textContent = STATE.data.common.length;

  // 통계 배너
  DOM.statsScanned.textContent = STATE.scannedCount;
  DOM.statsDay.textContent     = STATE.data.daytrade.length;
  DOM.statsSwing.textContent   = STATE.data.swing.length;
  DOM.statsCommon.textContent  = STATE.data.common.length;
  DOM.statsBanner.classList.add("visible");

  // 상태 표시
  DOM.statusDot.classList.add("live");
  DOM.headerStatus.textContent = "라이브";

  // 카드 렌더링
  renderDayCards();
  renderSwingCards();
  renderCommonCards();
}

// ─── 카드 렌더링 ───────────────────────────────────────────────────────────

function getGrade(score) {
  if (score >= 95) return "S";
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  return "C";
}

function getGradeClass(grade) {
  const map = { "S": "grade-S", "A+": "grade-Aplus", "A": "grade-A", "B": "grade-B", "C": "grade-C" };
  return map[grade] || "grade-C";
}

function formatChange(pct) {
  if (pct === null || pct === undefined || isNaN(pct)) return { text: "0.00%", cls: "flat" };
  const sign = pct > 0 ? "+" : "";
  const cls = pct > 0.05 ? "up" : pct < -0.05 ? "down" : "flat";
  return { text: `${sign}${pct.toFixed(2)}%`, cls };
}

function formatPrice(price) {
  if (!price || isNaN(price)) return "—";
  return `$${price.toFixed(2)}`;
}

function formatVolume(vol) {
  if (!vol || isNaN(vol)) return "—";
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(0)}K`;
  return vol.toString();
}

function formatMarketCap(cap) {
  if (!cap || isNaN(cap)) return "—";
  if (cap >= 1_000_000_000) return `$${(cap / 1_000_000_000).toFixed(1)}B`;
  if (cap >= 1_000_000) return `$${(cap / 1_000_000).toFixed(0)}M`;
  return `$${cap.toLocaleString()}`;
}

function renderDayCards() {
  const container = DOM.dayList;
  const stocks = STATE.data.daytrade;

  if (!stocks.length) {
    container.innerHTML = emptyState("📊", "스캔 결과 없음", "종목 스캔 시작 버튼을 눌러<br>현재 단타 강세 종목을 탐색하세요.");
    return;
  }

  container.innerHTML = stocks.map((stock, idx) => buildDayCard(stock, idx)).join("");
  bindCardEvents(container, stocks, "daytrade");
}

function renderSwingCards() {
  const container = DOM.swingList;
  const stocks = STATE.data.swing;

  if (!stocks.length) {
    container.innerHTML = emptyState("📈", "스캔 결과 없음", "종목 스캔 시작 버튼을 눌러<br>현재 스윙 강세 종목을 탐색하세요.");
    return;
  }

  container.innerHTML = stocks.map((stock, idx) => buildSwingCard(stock, idx)).join("");
  bindCardEvents(container, stocks, "swing");
}

function renderCommonCards() {
  const container = DOM.commonList;
  const stocks = STATE.data.common;

  if (!stocks.length) {
    container.innerHTML = emptyState("🏆", "공통 종목 없음", "단타 TOP10과 스윙 TOP10에 동시에<br>포함된 종목이 없습니다.");
    return;
  }

  container.innerHTML = stocks.map((stock, idx) => buildCommonCard(stock, idx)).join("");
  bindCardEvents(container, stocks, "common");
}

function buildDayCard(stock, idx) {
  const grade = getGrade(stock.score);
  const gradeClass = getGradeClass(grade);
  const chg = formatChange(stock.dayChange);
  const rsiColor = stock.rsi
    ? (stock.rsi >= 55 && stock.rsi <= 85 ? "positive" : stock.rsi > 85 ? "warning" : "")
    : "";

  return `
<div class="stock-card ${gradeClass === 'grade-S' ? 'grade-S' : ''}" data-ticker="${stock.ticker}" data-idx="${idx}" data-type="daytrade">
  <div class="card-top">
    <div class="card-left">
      <span class="card-rank">#${idx + 1}</span>
      <div class="card-ticker-wrap">
        <span class="card-ticker">${esc(stock.ticker)}</span>
        <span class="card-name">${esc(truncate(stock.name, 22))}</span>
      </div>
    </div>
    <div class="card-right">
      <span class="card-price">${formatPrice(stock.price)}</span>
      <span class="card-change ${chg.cls}">${chg.text}</span>
    </div>
  </div>

  <div class="card-metrics">
    <span class="metric-pill highlighted">
      <span class="pill-label">RVOL</span>
      ${stock.rvol ? stock.rvol.toFixed(1) + "x" : "—"}
    </span>
    <span class="metric-pill ${rsiColor}">
      <span class="pill-label">RSI</span>
      ${stock.rsi ? stock.rsi.toFixed(0) : "—"}
    </span>
    <span class="metric-pill">
      <span class="pill-label">VOL</span>
      ${formatVolume(stock.volume)}
    </span>
    <span class="metric-pill">
      <span class="pill-label">MCAP</span>
      ${formatMarketCap(stock.marketCap)}
    </span>
    ${stock.macdHist !== null && stock.macdHist !== undefined
      ? `<span class="metric-pill ${stock.macdHist > 0 ? 'positive' : ''}">
           <span class="pill-label">MACD</span>${stock.macdHist > 0 ? '▲' : '▼'}
         </span>`
      : ""}
  </div>

  <div class="card-bottom">
    <div class="card-score-wrap">
      <span class="score-grade ${gradeClass}">${grade}</span>
      <div class="score-bar-wrap">
        <span class="score-number">${stock.score}점</span>
        <div class="score-bar-bg">
          <div class="score-bar-fill ${gradeClass}-fill" style="width:${stock.score}%"></div>
        </div>
      </div>
    </div>
    <button class="detail-btn" data-ticker="${stock.ticker}" data-idx="${idx}" data-type="daytrade">
      분석 보기
    </button>
  </div>
</div>`;
}

function buildSwingCard(stock, idx) {
  const grade = getGrade(stock.score);
  const gradeClass = getGradeClass(grade);
  const chg = formatChange(stock.dayChange);
  const chg3m = formatChange(stock.change3m);

  return `
<div class="stock-card ${gradeClass === 'grade-S' ? 'grade-S' : ''}" data-ticker="${stock.ticker}" data-idx="${idx}" data-type="swing">
  <div class="card-top">
    <div class="card-left">
      <span class="card-rank">#${idx + 1}</span>
      <div class="card-ticker-wrap">
        <span class="card-ticker">${esc(stock.ticker)}</span>
        <span class="card-name">${esc(truncate(stock.name, 22))}</span>
      </div>
    </div>
    <div class="card-right">
      <span class="card-price">${formatPrice(stock.price)}</span>
      <span class="card-change ${chg.cls}">${chg.text}</span>
    </div>
  </div>

  <div class="card-metrics">
    <span class="metric-pill ${chg3m.cls === 'up' ? 'positive' : chg3m.cls === 'down' ? '' : ''}">
      <span class="pill-label">3M</span>
      ${chg3m.text}
    </span>
    <span class="metric-pill">
      <span class="pill-label">RSI</span>
      ${stock.rsi ? stock.rsi.toFixed(0) : "—"}
    </span>
    ${stock.ema20 && stock.ema50
      ? `<span class="metric-pill ${stock.ema20 > stock.ema50 ? 'positive' : ''}">
           <span class="pill-label">EMA정렬</span>${stock.ema20 > stock.ema50 ? '✓' : '✗'}
         </span>`
      : ""}
    <span class="metric-pill">
      <span class="pill-label">52W고</span>
      ${formatPrice(stock.high52w)}
    </span>
    ${stock.vcpScore > 0
      ? `<span class="metric-pill positive">
           <span class="pill-label">VCP</span>${stock.vcpScore}/15
         </span>`
      : ""}
  </div>

  <div class="card-bottom">
    <div class="card-score-wrap">
      <span class="score-grade ${gradeClass}">${grade}</span>
      <div class="score-bar-wrap">
        <span class="score-number">${stock.score}점</span>
        <div class="score-bar-bg">
          <div class="score-bar-fill ${gradeClass}-fill" style="width:${stock.score}%"></div>
        </div>
      </div>
    </div>
    <button class="detail-btn" data-ticker="${stock.ticker}" data-idx="${idx}" data-type="swing">
      분석 보기
    </button>
  </div>
</div>`;
}

function buildCommonCard(stock, idx) {
  const chg = formatChange(stock.dayChange);

  return `
<div class="stock-card common-card" data-ticker="${stock.ticker}" data-idx="${idx}" data-type="common">
  <div class="card-top">
    <div class="card-left">
      <span class="card-rank">#${idx + 1}</span>
      <div class="card-ticker-wrap">
        <span class="card-ticker">${esc(stock.ticker)}</span>
        <span class="card-name">${esc(truncate(stock.name, 20))}</span>
      </div>
    </div>
    <div class="card-right">
      <span class="card-price">${formatPrice(stock.price)}</span>
      <span class="card-change ${chg.cls}">${chg.text}</span>
    </div>
  </div>

  <div class="card-metrics">
    <span class="metric-pill">
      <span class="pill-label">RVOL</span>
      ${stock.rvol ? stock.rvol.toFixed(1) + "x" : "—"}
    </span>
    <span class="metric-pill">
      <span class="pill-label">RSI</span>
      ${stock.rsi ? stock.rsi.toFixed(0) : "—"}
    </span>
    ${stock.ema20 && stock.ema50
      ? `<span class="metric-pill ${stock.ema20 > stock.ema50 ? 'positive' : ''}">
           <span class="pill-label">EMA</span>${stock.ema20 > stock.ema50 ? '정배열' : '역배열'}
         </span>`
      : ""}
    <span class="metric-pill">
      <span class="pill-label">MCAP</span>
      ${formatMarketCap(stock.marketCap)}
    </span>
  </div>

  <div class="card-bottom">
    <div class="card-score-wrap">
      <div class="common-dual-score">
        <span class="score-tag day-tag">단타 ${stock.dayScore}</span>
        <span class="score-tag swing-tag">스윙 ${stock.swingScore}</span>
      </div>
      <div class="score-bar-wrap">
        <span class="score-number">종합 ${stock.combinedScore}점</span>
        <div class="score-bar-bg">
          <div class="score-bar-fill" style="width:${stock.combinedScore}%;background:linear-gradient(90deg,#b8860b,#ffd700)"></div>
        </div>
      </div>
    </div>
    <button class="detail-btn" data-ticker="${stock.ticker}" data-idx="${idx}" data-type="common">
      분석 보기
    </button>
  </div>
</div>`;
}

function emptyState(icon, title, desc) {
  return `
<div class="empty-state">
  <div class="empty-state-icon">${icon}</div>
  <div class="empty-state-title">${title}</div>
  <p class="empty-state-desc">${desc}</p>
</div>`;
}

// ─── 카드 이벤트 바인딩 ─────────────────────────────────────────────────────

function bindCardEvents(container, stocks, type) {
  container.querySelectorAll(".detail-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      openModal(stocks[idx], type);
    });
  });

  container.querySelectorAll(".stock-card").forEach((card) => {
    card.addEventListener("click", () => {
      const idx = parseInt(card.dataset.idx);
      openModal(stocks[idx], type);
    });
  });
}

// ─── 모달 ──────────────────────────────────────────────────────────────────

function openModal(stock, type) {
  STATE.activeModal = { stock, type };
  const isCommon = type === "common";
  const ticker = stock.ticker;
  const ai = STATE.aiResults[ticker] || null;
  const score = stock.score || stock.combinedScore || 0;

  // 모달 클래스 설정
  DOM.modal.className = `modal${isCommon ? " common-modal" : ""}`;
  DOM.modalOverlay.classList.add("open");
  document.body.style.overflow = "hidden";

  // 헤더 구성
  const chg = formatChange(stock.dayChange);
  document.getElementById("modalTicker").textContent = ticker;
  document.getElementById("modalCompany").textContent = stock.name || "—";
  document.getElementById("modalPrice").textContent = formatPrice(stock.price);
  const changeEl = document.getElementById("modalChange");
  changeEl.textContent = chg.text;
  changeEl.className = `card-change ${chg.cls}`;

  // 바디 구성
  DOM.modalBody.innerHTML = buildModalBody(stock, type, ai);

  // AI 분석이 없으면 비동기로 요청
  if (!ai) {
    requestSingleAI(stock, type);
  }
}

function buildModalBody(stock, type, ai) {
  const isCommon = type === "common";
  const score = stock.score || stock.combinedScore || 0;
  const grade = getGrade(score);
  const gradeClass = getGradeClass(grade);

  // 점수 분해 데이터
  const breakdown = stock.breakdown || stock.dayBreakdown || {};
  const swingBreakdown = stock.swingBreakdown || {};

  let html = "";

  // ── AI 분석 섹션 ──
  html += `<div class="modal-section">
    <div class="modal-section-title">🤖 AI 분석 (Gemma)</div>
    <div class="ai-analysis-card" id="aiCard-${stock.ticker}">
      ${ai ? buildAIContent(ai) : `
        <div class="ai-loading">
          <div class="ai-spinner"></div>
          <span>AI 분석 요청 중...</span>
        </div>
      `}
    </div>
  </div>`;

  // ── 진입/손절/목표가 ──
  html += `<div class="modal-section">
    <div class="modal-section-title">💰 매매 레벨</div>
    <div class="levels-grid">
      <div class="level-box entry">
        <div class="level-label">진입가</div>
        <div class="level-value">${ai ? formatAIPrice(ai.stopLoss, stock.price, "entry") : formatPrice(stock.price)}</div>
      </div>
      <div class="level-box stoploss">
        <div class="level-label">손절가</div>
        <div class="level-value">${ai ? formatAIPrice(ai.stopLoss, stock.price, "stop") : calcFallbackStop(stock)}</div>
      </div>
      <div class="level-box target1">
        <div class="level-label">1차 목표가</div>
        <div class="level-value">${ai ? formatAIPrice(ai.target1, stock.price, "t1") : calcFallbackT1(stock)}</div>
      </div>
      <div class="level-box target2">
        <div class="level-label">2차 목표가</div>
        <div class="level-value">${ai ? formatAIPrice(ai.target2, stock.price, "t2") : calcFallbackT2(stock)}</div>
      </div>
    </div>
  </div>`;

  // ── 기술 지표 ──
  html += `<div class="modal-section">
    <div class="modal-section-title">📊 기술 지표</div>
    <div class="indicators-grid">
      <div class="indicator-box">
        <div class="indicator-label">RSI (14)</div>
        <div class="indicator-value ${stock.rsi ? (stock.rsi >= 55 && stock.rsi <= 85 ? 'positive' : stock.rsi > 85 ? 'neutral' : 'negative') : ''}">
          ${stock.rsi ? stock.rsi.toFixed(1) : "—"}
        </div>
      </div>
      <div class="indicator-box">
        <div class="indicator-label">MACD</div>
        <div class="indicator-value ${stock.macdHist !== null && stock.macdHist !== undefined ? (stock.macdHist > 0 ? 'positive' : 'negative') : ''}">
          ${stock.macdHist !== null && stock.macdHist !== undefined ? (stock.macdHist > 0 ? "▲ 상승" : "▼ 하락") : "—"}
        </div>
      </div>
      <div class="indicator-box">
        <div class="indicator-label">20 EMA</div>
        <div class="indicator-value ${stock.ema20 && stock.price > stock.ema20 ? 'positive' : ''}">
          ${formatPrice(stock.ema20)}
        </div>
      </div>
      <div class="indicator-box">
        <div class="indicator-label">50 EMA</div>
        <div class="indicator-value ${stock.ema50 && stock.price > stock.ema50 ? 'positive' : ''}">
          ${formatPrice(stock.ema50)}
        </div>
      </div>
      <div class="indicator-box">
        <div class="indicator-label">200 EMA</div>
        <div class="indicator-value ${stock.ema200 && stock.price > stock.ema200 ? 'positive' : ''}">
          ${formatPrice(stock.ema200)}
        </div>
      </div>
      <div class="indicator-box">
        <div class="indicator-label">ATR (14)</div>
        <div class="indicator-value">${formatPrice(stock.atr)}</div>
      </div>
      <div class="indicator-box">
        <div class="indicator-label">52주 최고가</div>
        <div class="indicator-value">${formatPrice(stock.high52w)}</div>
      </div>
      <div class="indicator-box">
        <div class="indicator-label">52주 최저가</div>
        <div class="indicator-value">${formatPrice(stock.low52w)}</div>
      </div>
    </div>
  </div>`;

  // ── 점수 상세 (단타) ──
  if (type === "daytrade" || (isCommon && stock.dayBreakdown)) {
    const bd = breakdown;
    html += buildBreakdownSection("단타 점수 분해", [
      { label: "거래량", score: bd.volume || 0, max: 25 },
      { label: "모멘텀", score: bd.momentum || 0, max: 20 },
      { label: "돌파", score: bd.breakout || 0, max: 25 },
      { label: "기술강도", score: bd.technical || 0, max: 15 },
      { label: "변동성", score: bd.volatility || 0, max: 15 },
    ], "📈");
  }

  // ── 점수 상세 (스윙) ──
  if (type === "swing" || (isCommon && stock.swingBreakdown)) {
    const bd = type === "swing" ? breakdown : swingBreakdown;
    html += buildBreakdownSection("스윙 점수 분해", [
      { label: "추세", score: bd.trend || 0, max: 25 },
      { label: "상대강도", score: bd.relStrength || 0, max: 20 },
      { label: "신고가", score: bd.nearHigh || 0, max: 20 },
      { label: "VCP", score: bd.vcp || 0, max: 15 },
      { label: "거래량축적", score: bd.accumulation || 0, max: 10 },
    ], "🔄");
  }

  // ── 적합성 ──
  if (ai) {
    const dayFitClass = fitClass(ai.dayFit);
    const swingFitClass = fitClass(ai.swingFit);
    html += `<div class="modal-section">
      <div class="modal-section-title">✅ 적합성 평가</div>
      <div class="fit-tags">
        <span class="fit-tag ${dayFitClass}">
          📊 단타 ${ai.dayFit || "—"}
        </span>
        <span class="fit-tag ${swingFitClass}">
          📈 스윙 ${ai.swingFit || "—"}
        </span>
      </div>
    </div>`;
  }

  return html;
}

function buildBreakdownSection(title, items, icon) {
  const total = items.reduce((sum, i) => sum + i.score, 0);
  return `
<div class="modal-section">
  <div class="modal-section-title">${icon} ${title}</div>
  <div class="score-breakdown">
    ${items.map((item) => {
      const pct = item.max > 0 ? (item.score / item.max) * 100 : 0;
      return `
      <div class="breakdown-row">
        <span class="breakdown-label">${item.label}</span>
        <div class="breakdown-bar-bg">
          <div class="breakdown-bar-fill" style="width:${pct}%"></div>
        </div>
        <span class="breakdown-score">${item.score}/${item.max}</span>
      </div>`;
    }).join("")}
    <div class="breakdown-row" style="border-top:1px solid var(--border-primary);margin-top:4px;padding-top:6px">
      <span class="breakdown-label" style="color:var(--text-secondary);font-weight:600">합계</span>
      <div class="breakdown-bar-bg"></div>
      <span class="breakdown-score" style="color:var(--text-primary);font-weight:700">${total}점</span>
    </div>
  </div>
</div>`;
}

function buildAIContent(ai) {
  return `
<p class="ai-summary">${esc(ai.summary || "—")}</p>
<div class="ai-row">
  <span class="ai-label">상승 가능성</span>
  <span class="ai-value ${ai.upside === '높음' ? 'positive' : ai.upside === '낮음' ? 'negative' : 'neutral'}">${esc(ai.upside || "—")}</span>
</div>
<div class="ai-row">
  <span class="ai-label">핵심 강점</span>
  <span class="ai-value">${esc(ai.strengths || "—")}</span>
</div>
<div class="ai-row">
  <span class="ai-label">위험 요소</span>
  <span class="ai-value negative">${esc(ai.risks || "—")}</span>
</div>
<div class="ai-row">
  <span class="ai-label">진입 전략</span>
  <span class="ai-value">${esc(ai.entry || "—")}</span>
</div>`;
}

// AI 분석 단일 종목 비동기 요청
async function requestSingleAI(stock, type) {
  const ticker = stock.ticker;
  if (STATE.aiLoading.has(ticker)) return;

  STATE.aiLoading.add(ticker);

  try {
    const res = await fetchWithTimeout(
      "/api/analyze",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stocks: [stock] }),
      },
      45000
    );

    if (!res.ok) return;
    const data = await res.json();
    const aiResult = data.results?.[ticker];

    if (aiResult) {
      STATE.aiResults[ticker] = aiResult;

      // 모달이 아직 열려있으면 업데이트
      if (STATE.activeModal && STATE.activeModal.stock.ticker === ticker) {
        const aiCard = document.getElementById(`aiCard-${ticker}`);
        if (aiCard) {
          aiCard.innerHTML = buildAIContent(aiResult);
        }

        // 매매 레벨도 업데이트
        const levelsGrid = DOM.modalBody.querySelector(".levels-grid");
        if (levelsGrid) {
          levelsGrid.innerHTML = `
          <div class="level-box entry">
            <div class="level-label">진입가</div>
            <div class="level-value">${formatAIPrice(aiResult.stopLoss, stock.price, "entry")}</div>
          </div>
          <div class="level-box stoploss">
            <div class="level-label">손절가</div>
            <div class="level-value">${formatAIPrice(aiResult.stopLoss, stock.price, "stop")}</div>
          </div>
          <div class="level-box target1">
            <div class="level-label">1차 목표가</div>
            <div class="level-value">${formatAIPrice(aiResult.target1, stock.price, "t1")}</div>
          </div>
          <div class="level-box target2">
            <div class="level-label">2차 목표가</div>
            <div class="level-value">${formatAIPrice(aiResult.target2, stock.price, "t2")}</div>
          </div>`;
        }

        // 적합성 업데이트
        const dayFitClass = fitClass(aiResult.dayFit);
        const swingFitClass = fitClass(aiResult.swingFit);
        const fitSection = DOM.modalBody.querySelector(".fit-tags");
        if (fitSection) {
          fitSection.innerHTML = `
          <span class="fit-tag ${dayFitClass}">📊 단타 ${aiResult.dayFit || "—"}</span>
          <span class="fit-tag ${swingFitClass}">📈 스윙 ${aiResult.swingFit || "—"}</span>`;
        }
      }
    }
  } catch (err) {
    console.warn(`Single AI request failed for ${ticker}:`, err.message);
    // AI 카드를 폴백으로 업데이트
    if (STATE.activeModal && STATE.activeModal.stock.ticker === ticker) {
      const aiCard = document.getElementById(`aiCard-${ticker}`);
      if (aiCard) {
        const fb = calcFallbackForModal(stock);
        aiCard.innerHTML = buildAIContent(fb);
      }
    }
  } finally {
    STATE.aiLoading.delete(ticker);
  }
}

// 폴백 가격 계산 (클라이언트)
function calcFallbackStop(stock) {
  const atr = stock.atr || (stock.price * 0.02);
  return `$${Math.max(0, stock.price - atr * 1.5).toFixed(2)}`;
}

function calcFallbackT1(stock) {
  const atr = stock.atr || (stock.price * 0.02);
  return `$${(stock.price + atr * 2).toFixed(2)}`;
}

function calcFallbackT2(stock) {
  const atr = stock.atr || (stock.price * 0.02);
  return `$${(stock.price + atr * 3.5).toFixed(2)}`;
}

function calcFallbackForModal(stock) {
  const atr = stock.atr || (stock.price * 0.02);
  const score = stock.score || stock.combinedScore || 0;
  return {
    summary: `${stock.ticker} — 기술적 강세 종목, 점수 ${score}/100`,
    upside: score >= 85 ? "높음" : score >= 70 ? "중간" : "낮음",
    strengths: "거래량 급증, 기술적 돌파 신호",
    risks: "시장 변동성, 거시경제 리스크",
    entry: `현재가 $${stock.price?.toFixed(2)} 부근 진입`,
    stopLoss: Math.max(0, stock.price - atr * 1.5).toFixed(2),
    target1: (stock.price + atr * 2).toFixed(2),
    target2: (stock.price + atr * 3.5).toFixed(2),
    dayFit: stock.type === "daytrade" || stock.type === "common" ? "상" : "중",
    swingFit: stock.type === "swing" || stock.type === "common" ? "상" : "중",
  };
}

// AI 응답에서 가격 문자열 포맷
function formatAIPrice(val, currentPrice, role) {
  if (!val) {
    // 폴백
    const atr = 0; // 여기서는 ATR 없음
    if (role === "entry") return formatPrice(currentPrice);
    if (role === "stop") return `$${(currentPrice * 0.96).toFixed(2)}`;
    if (role === "t1") return `$${(currentPrice * 1.05).toFixed(2)}`;
    if (role === "t2") return `$${(currentPrice * 1.10).toFixed(2)}`;
  }
  const num = parseFloat(String(val).replace(/[^0-9.]/g, ""));
  if (isNaN(num) || num <= 0) return role === "entry" ? formatPrice(currentPrice) : "—";
  return `$${num.toFixed(2)}`;
}

function fitClass(val) {
  if (!val) return "medium";
  if (val === "상") return "high";
  if (val === "하") return "low";
  return "medium";
}

function closeModal() {
  DOM.modalOverlay.classList.remove("open");
  document.body.style.overflow = "";
  STATE.activeModal = null;
}

// ─── 탭 전환 ───────────────────────────────────────────────────────────────

function switchTab(tab) {
  STATE.currentTab = tab;

  DOM.tabBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });

  DOM.tabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === tab);
  });
}

// ─── 로딩 상태 ─────────────────────────────────────────────────────────────

function setLoading(loading) {
  STATE.isLoading = loading;
  DOM.scanBtn.disabled = loading;

  if (loading) {
    DOM.scanBtnText.textContent = "스캔 중...";
    DOM.scanBtn.classList.add("loading");
    DOM.scanBtnIcon.textContent = "⟳";
  } else {
    DOM.scanBtnText.textContent = "종목 스캔 시작";
    DOM.scanBtn.classList.remove("loading");
    DOM.scanBtnIcon.textContent = "⚡";
  }
}

function updateProgress(pct, label) {
  DOM.progressWrap.classList.add("visible");
  DOM.progressFill.style.width = `${pct}%`;
  DOM.progressLabel.textContent = label;
  if (DOM.progressPct) DOM.progressPct.textContent = `${pct}%`;
}

function hideProgress() {
  setTimeout(() => {
    DOM.progressWrap.classList.remove("visible");
    DOM.progressFill.style.width = "0%";
  }, 800);
}

// ─── 에러 ──────────────────────────────────────────────────────────────────

function showError(msg) {
  DOM.errorBanner.classList.add("visible");
  DOM.errorMsg.textContent = msg || "알 수 없는 오류가 발생했습니다.";
}

function hideError() {
  DOM.errorBanner.classList.remove("visible");
}

// ─── 시간 표시 ─────────────────────────────────────────────────────────────

function updateLastTime() {
  if (!STATE.lastScanTime) return;
  const d = STATE.lastScanTime;
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  if (DOM.lastTimeEl) {
    DOM.lastTimeEl.textContent = `마지막 스캔: ${h}:${m}:${s}`;
  }
}

// ─── 토스트 ────────────────────────────────────────────────────────────────

function showToast(msg) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-tertiary);
    border: 1px solid var(--border-secondary);
    color: var(--text-primary);
    padding: 10px 18px;
    border-radius: 99px;
    font-size: 13px;
    font-family: var(--font-main);
    z-index: 9999;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    white-space: nowrap;
    animation: toastIn 0.3s ease;
  `;

  const style = document.createElement("style");
  style.textContent = `@keyframes toastIn { from { opacity:0; transform: translateX(-50%) translateY(10px); } to { opacity:1; transform: translateX(-50%) translateY(0); } }`;
  document.head.appendChild(style);

  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ─── 유틸 ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(str, len) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "…" : str;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}
