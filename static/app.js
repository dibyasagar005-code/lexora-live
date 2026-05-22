/**
 * LexorA AI Market Predictor — works on localhost Flask AND GitHub Pages.
 */
const LexoraApp = {
  refreshInterval: 30000,
  refreshTimer: null,
  market: null,
  currentPage: "home",

  init() {
    document.getElementById("tickerContent").textContent = LexoraAPI.newsHeadlines().join("  ·  ");
    this.initNav();
    this.initMobileMenu();
    this.initMarketTabs();
    this.initCalculators();
    this.initPrediction();
    this.renderMarketSkeleton();
    this.refreshMarketData();
    this.startLiveRefresh();
    if (document.getElementById("quickSignals")) this.loadQuickSignals();
    if (document.getElementById("comparisonChart")) LexoraCharts.initComparisonChart("comparisonChart");
    if (document.getElementById("livePriceChart")) LexoraCharts.initLivePriceChart("livePriceChart");
  },

  initNav() {
    document.querySelectorAll(".nav-link[data-page]").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        this.showPage(link.dataset.page);
      });
    });
  },

  showPage(page) {
    this.currentPage = page;
    document.querySelectorAll(".page-view").forEach((el) => {
      el.style.display = el.dataset.page === page ? "block" : "none";
    });
    document.querySelectorAll(".nav-link[data-page]").forEach((el) => {
      el.classList.toggle("active", el.dataset.page === page);
    });
    if (page === "markets") this.renderMarketsTable();
    if (page === "prediction") this.loadPrediction(document.querySelector(".symbol-chip.active")?.dataset.sym || "bitcoin");
    if (page === "markets" && document.getElementById("livePriceChart")) LexoraCharts.initLivePriceChart("livePriceChart");
  },

  initMobileMenu() {
    document.getElementById("menuBtn")?.addEventListener("click", () => {
      document.getElementById("sidebar")?.classList.toggle("open");
    });
  },

  startLiveRefresh() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = setInterval(() => this.refreshMarketData(), this.refreshInterval);
  },

  async refreshMarketData() {
    const pulse = document.querySelector(".pulse-text");
    if (pulse) pulse.textContent = "Updating live data…";
    try {
      this.market = await LexoraAPI.fetchMarket();
      this.updateMarketCards(this.market);
      this.updateLastRefresh(this.market.timestamp);
      const badge = document.getElementById("refreshBadge");
      if (badge) badge.textContent = "Updated " + new Date().toLocaleTimeString();
      const src = document.getElementById("dataSource");
      if (src) src.textContent = this.market.source.toUpperCase();
      if (pulse) pulse.textContent = this.market.source === "live" ? "● LIVE" : "● Fallback";
      if (this.currentPage === "markets") this.renderMarketsTable();
      LexoraCharts.initComparisonChart("comparisonChart");
      LexoraCharts.initVolatilityChart("volatilityChart");
      this.loadQuickSignals();
      this.loadMarketSignals();
    } catch (e) {
      if (pulse) pulse.textContent = "Retry…";
      console.error(e);
    }
  },

  updateLastRefresh(ts) {
    const el = document.getElementById("lastUpdate");
    if (el) el.textContent = new Date(ts || Date.now()).toLocaleTimeString();
    const c = document.getElementById("assetCount");
    if (c && this.market) c.textContent = Object.keys(this.market.assets).length + " assets tracked";
  },

  updateMarketCards(market) {
    if (!market?.assets) return;
    Object.entries(market.assets).forEach(([symbol, asset]) => {
      document.querySelectorAll(`[data-symbol="${symbol}"]`).forEach((card) => {
        const priceEl = card.querySelector(".card-price, .price-cell");
        const changeEl = card.querySelector(".card-change");
        if (priceEl) {
          priceEl.classList.add("price-flash");
          priceEl.textContent = LexoraAPI.formatPrice(symbol, asset.price);
          setTimeout(() => priceEl.classList.remove("price-flash"), 500);
        }
        if (changeEl) {
          const ch = asset.change || 0;
          changeEl.textContent = (ch >= 0 ? "+" : "") + ch.toFixed(2) + "%";
          changeEl.className = "card-change " + (ch >= 0 ? "positive" : "negative");
        }
      });
    });
  },

  renderMarketSkeleton() {
    const grid = document.getElementById("homeMarketGrid");
    if (!grid) return;
    grid.innerHTML = Object.keys(LexoraAPI.FALLBACK).map((sym) => `
      <div class="market-card" data-symbol="${sym}">
        <div class="card-header"><span class="symbol-name">${LexoraAPI.label(sym)}</span><span class="live-dot"></span></div>
        <div class="card-price">—</div>
        <div class="card-change">—</div>
        <a href="#" class="card-link" data-goto-pred="${sym}">Predict →</a>
      </div>`).join("");
    grid.querySelectorAll("[data-goto-pred]").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        document.querySelectorAll(".symbol-chip").forEach((c) => c.classList.toggle("active", c.dataset.sym === a.dataset.gotoPred));
        this.showPage("prediction");
        this.loadPrediction(a.dataset.gotoPred);
      });
    });
  },

  renderMarketsTable() {
    const body = document.getElementById("marketsBody");
    if (!body || !this.market?.assets) return;
    body.innerHTML = Object.entries(this.market.assets).map(([sym, a]) => `
      <tr data-symbol="${sym}">
        <td><strong>${LexoraAPI.label(sym)}</strong></td>
        <td class="price-cell">${LexoraAPI.formatPrice(sym, a.price)}</td>
        <td class="${(a.change || 0) >= 0 ? "positive" : "negative"}">${(a.change || 0) >= 0 ? "+" : ""}${(a.change || 0).toFixed(2)}%</td>
        <td><span class="signal-badge hold" data-signal="${sym}">—</span></td>
        <td><button type="button" class="btn btn-sm btn-outline" data-analyze="${sym}">Analyze</button></td>
      </tr>`).join("");
    body.querySelectorAll("[data-analyze]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".symbol-chip").forEach((c) => c.classList.toggle("active", c.dataset.sym === btn.dataset.analyze));
        this.showPage("prediction");
        this.loadPrediction(btn.dataset.analyze);
      });
    });
    this.loadMarketSignals();
  },

  async loadQuickSignals() {
    const box = document.getElementById("quickSignals");
    if (!box) return;
    try {
      const data = await LexoraAPI.predictAll();
      box.innerHTML = "";
      ["gold", "silver", "bitcoin", "ethereum", "crude_oil"].forEach((sym) => {
        const p = data[sym];
        if (!p) return;
        const d = document.createElement("div");
        d.className = "signal-card";
        d.innerHTML = `<div class="symbol-name">${LexoraAPI.label(sym)}</div>
          <div class="signal-badge signal-${p.signal.toLowerCase()}">${p.signal}</div>
          <div style="margin-top:8px;color:var(--text-muted)">${p.confidence}% conf.</div>`;
        box.appendChild(d);
      });
    } catch (e) {
      box.innerHTML = '<p class="loading-spinner">Loading signals…</p>';
    }
  },

  async loadMarketSignals() {
    try {
      const data = await LexoraAPI.predictAll();
      Object.entries(data).forEach(([sym, p]) => {
        const b = document.querySelector(`[data-signal="${sym}"]`);
        if (b) { b.textContent = p.signal; b.className = `signal-badge signal-${p.signal.toLowerCase()}`; }
      });
    } catch (e) { /* */ }
  },

  initMarketTabs() {
    const cats = { metals: ["gold", "silver", "platinum"], crypto: ["bitcoin", "ethereum"], forex: ["usd_inr", "eur_usd", "gbp_usd"], stocks: ["sp500", "nasdaq"] };
    document.querySelectorAll(".market-tabs .tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".market-tabs .tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const f = tab.dataset.filter;
        document.querySelectorAll("#marketsBody tr").forEach((row) => {
          row.style.display = f === "all" || cats[f]?.includes(row.dataset.symbol) ? "" : "none";
        });
      });
    });
  },

  initPrediction() {
    document.querySelectorAll(".symbol-chip").forEach((chip) => {
      chip.addEventListener("click", (e) => {
        e.preventDefault();
        document.querySelectorAll(".symbol-chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        this.loadPrediction(chip.dataset.sym);
      });
    });
  },

  async loadPrediction(symbol) {
    const box = document.getElementById("predictionPanel");
    if (!box) return;
    box.innerHTML = '<p class="loading-spinner">Running AI analysis…</p>';
    const p = await LexoraAPI.predict(symbol);
    box.innerHTML = `
      <div class="prediction-hero glass">
        <div class="pred-main">
          <h3>${LexoraAPI.label(symbol)}</h3>
          <div class="current-price">${LexoraAPI.formatPrice(symbol, p.current_price)}</div>
          <div class="signal-large signal-${p.signal.toLowerCase()}">${p.signal}</div>
          <div class="confidence-bar"><div class="confidence-fill" style="width:${p.confidence}%"></div></div>
          <span class="confidence-text">${p.confidence}% Confidence</span>
        </div>
        <div class="pred-metrics">
          <div class="metric"><label>Expected</label><span>${LexoraAPI.formatPrice(symbol, p.expected_price)}</span></div>
          <div class="metric"><label>Trend</label><span class="trend-${p.trend}">${p.trend}</span></div>
          <div class="metric"><label>RSI</label><span>${p.rsi}</span></div>
          <div class="metric"><label>Volatility</label><span>${p.volatility}%</span></div>
          <div class="metric"><label>Sentiment</label><span>${p.sentiment?.label || "—"}</span></div>
          <div class="metric"><label>Action</label><span>${p.recommendation}</span></div>
        </div>
      </div>
      <div class="risk-meter-wrap glass"><h4>Risk</h4><div class="risk-meter"><div class="risk-fill" style="width:${p.risk_level}%"></div></div></div>
      <div class="chart-row">
        <div class="chart-card glass"><h4>History</h4><canvas id="historyChart"></canvas></div>
        <div class="chart-card glass"><h4>Forecast</h4><canvas id="forecastChart"></canvas></div>
      </div>`;
    LexoraCharts.initHistoryChart("historyChart", p.historical);
    LexoraCharts.initForecastChart("forecastChart", p.historical, p.forecast);
  },

  initCalculators() {
    document.querySelectorAll(".calc-tabs .tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".calc-tabs .tab").forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".calc-panel").forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById("calc-" + tab.dataset.calc)?.classList.add("active");
      });
    });
    document.querySelectorAll(".calc-form").forEach((form) => {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const type = form.dataset.type;
        const fd = new FormData(form);
        const body = { type };
        fd.forEach((v, k) => (body[k] = parseFloat(v) || v));
        let result;
        if (LexoraAPI.isLocalFlask()) {
          try {
            const r = await fetch("/api/calculate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            result = await r.json();
          } catch (err) { /* */ }
        }
        if (!result) result = this.calcClient(type, body);
        this.displayCalcResult(type, result);
      });
    });
  },

  calcClient(type, b) {
    if (type === "sip") {
      const r = b.rate / 100 / 12, m = b.years * 12;
      const fv = r > 0 ? b.monthly * (((1 + r) ** m - 1) / r) * (1 + r) : b.monthly * m;
      return { future_value: fv, invested: b.monthly * m, returns: fv - b.monthly * m };
    }
    if (type === "gold") {
      const cur = b.grams * b.price;
      const fut = cur * Math.pow(1 + (b.appreciation || 8) / 100, b.years);
      return { current_value: cur, future_value: fut, profit: fut - cur };
    }
    if (type === "crypto") {
      const profit = (b.sell_price - b.buy_price) * b.quantity;
      return { profit, roi: ((b.sell_price - b.buy_price) / b.buy_price) * 100 };
    }
    return {};
  },

  displayCalcResult(type, r) {
    const el = document.getElementById("result-" + type);
    if (!el) return;
    if (type === "sip" && r.future_value)
      el.innerHTML = `<strong>Future:</strong> $${r.future_value.toLocaleString()} · <strong>Returns:</strong> $${r.returns.toLocaleString()}`;
    else el.innerHTML = JSON.stringify(r);
  },
};

document.addEventListener("DOMContentLoaded", () => LexoraApp.init());
