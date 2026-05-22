/**
 * LexorA AI Market Predictor — works on localhost Flask AND GitHub Pages.
 */
const LexoraApp = {
  refreshInterval: 30000,
  refreshTimer: null,
  market: null,
  currentPage: "home",
  currency: localStorage.getItem("lexora_currency") || "INR",
  usdInrRate: 83.25,

  init() {
    this.initCurrency();
    if (typeof LexoraAPI !== "undefined") LexoraAPI.fetchFxRates().then(() => this.updateFxBadge());
    const ticker = document.getElementById("tickerContent");
    if (ticker && typeof LexoraAPI !== "undefined") {
      ticker.textContent = LexoraAPI.newsHeadlines().join("  ·  ");
    }
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
    this.closeMobileSidebar();
    if (page === "markets") {
      this.renderMarketsTable();
      if (this.market) LexoraCharts.initLivePriceChart("livePriceChart", this.market);
    }
    if (page === "prediction") this.loadPrediction(document.querySelector(".symbol-chip.active")?.dataset.sym || "bitcoin");
    if (page === "calculator") this.syncCalculatorLivePrices();
  },

  closeMobileSidebar() {
    document.getElementById("sidebar")?.classList.remove("open");
    document.getElementById("sidebarBackdrop")?.classList.remove("visible");
    document.body.classList.remove("menu-open");
  },

  openMobileSidebar() {
    document.getElementById("sidebar")?.classList.add("open");
    document.getElementById("sidebarBackdrop")?.classList.add("visible");
    document.body.classList.add("menu-open");
  },

  initMobileMenu() {
    document.getElementById("menuBtn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const sb = document.getElementById("sidebar");
      if (sb?.classList.contains("open")) this.closeMobileSidebar();
      else this.openMobileSidebar();
    });
    document.getElementById("sidebarClose")?.addEventListener("click", () => this.closeMobileSidebar());
    document.getElementById("sidebarBackdrop")?.addEventListener("click", () => this.closeMobileSidebar());
    document.querySelectorAll(".sidebar-nav .nav-link").forEach((link) => {
      link.addEventListener("click", () => this.closeMobileSidebar());
    });
  },

  getLiveCalcPrice(sym) {
    if (typeof LexoraAPI === "undefined" || !this.market?.assets) return null;
    return LexoraAPI.calcLivePrice(sym, this.market.assets, this.currency);
  },

  syncCalculatorLivePrices() {
    if (!this.market?.assets) return;
    document.querySelectorAll("[data-live-badge]").forEach((el) => {
      const sym = el.dataset.liveBadge;
      const p = this.getLiveCalcPrice(sym);
      if (p != null) {
        const unit = ["gold", "silver", "platinum"].includes(sym) ? "/g" : "";
        el.textContent = `Live: ${this.formatCalcMoney(p)}${unit}`;
      }
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
      if (this.market?.assets?.usd_inr?.price) {
        this.usdInrRate = this.market.assets.usd_inr.price;
        LexoraAPI.usdInrRate = this.usdInrRate;
      }
      this.updateMarketCards(this.market);
      this.updateLastRefresh(this.market.timestamp);
      const badge = document.getElementById("refreshBadge");
      if (badge) badge.textContent = "Updated " + new Date().toLocaleTimeString();
      const src = document.getElementById("dataSource");
      if (src) src.textContent = this.market.source.toUpperCase();
      if (pulse) pulse.textContent = this.market.source === "live" ? "● LIVE" : "● Fallback";
      if (this.currentPage === "markets") this.renderMarketsTable();
      if (this.currentPage === "calculator") this.syncCalculatorLivePrices();
      LexoraCharts.refreshAll(this.market);
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
      const display = LexoraAPI.priceDisplay(symbol, asset, this.currency);
      document.querySelectorAll(`[data-symbol="${symbol}"]`).forEach((card) => {
        const mainEl = card.querySelector(".card-price-main, .card-price");
        const subEl = card.querySelector(".card-price-sub");
        const changeEl = card.querySelector(".card-change");
        if (mainEl) {
          mainEl.classList.add("price-flash");
          mainEl.textContent = display.primary;
          setTimeout(() => mainEl.classList.remove("price-flash"), 500);
        }
        if (subEl) subEl.textContent = display.secondary || "";
        if (changeEl) {
          const ch = asset.change || 0;
          changeEl.textContent = (ch >= 0 ? "+" : "") + ch.toFixed(2) + "% (24h)";
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
        <div class="card-price-main">—</div>
        <div class="card-price-sub"></div>
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
    body.innerHTML = Object.entries(this.market.assets)
      .map(([sym, a]) => {
        const d = LexoraAPI.priceDisplay(sym, a, this.currency);
        const ch = a.change || 0;
        return `<tr data-symbol="${sym}">
        <td><strong>${LexoraAPI.label(sym)}</strong><br><small class="price-sub-cell">${d.secondary || ""}</small></td>
        <td class="price-cell"><span class="price-main-cell">${d.primary}</span></td>
        <td class="${ch >= 0 ? "positive" : "negative"}">${ch >= 0 ? "+" : ""}${ch.toFixed(2)}%</td>
        <td><span class="signal-badge hold" data-signal="${sym}">—</span></td>
        <td><button type="button" class="btn btn-sm btn-outline" data-analyze="${sym}">Analyze</button></td>
      </tr>`;
      })
      .join("");
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
      ["gold", "silver", "platinum", "bitcoin", "ethereum", "crude_oil", "sp500", "nasdaq", "usd_inr"].forEach((sym) => {
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
          <div class="current-price">${this.formatPrice(symbol, p.current_price)}</div>
          <div class="signal-large signal-${p.signal.toLowerCase()}">${p.signal}</div>
          <div class="confidence-bar"><div class="confidence-fill" style="width:${p.confidence}%"></div></div>
          <span class="confidence-text">${p.confidence}% Confidence</span>
        </div>
        <div class="pred-metrics">
          <div class="metric"><label>Expected</label><span>${this.formatPrice(symbol, p.expected_price)}</span></div>
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

  initCurrency() {
    document.querySelectorAll("#currencySelect, #calcCurrencySelect").forEach((sel) => {
      sel.value = this.currency;
      sel.addEventListener("change", () => {
        this.currency = sel.value;
        localStorage.setItem("lexora_currency", this.currency);
        document.querySelectorAll("#currencySelect, #calcCurrencySelect").forEach((s) => {
          s.value = this.currency;
        });
        this.applyMoneyLabels();
        this.updateFxBadge();
        if (this.market) {
          this.updateMarketCards(this.market);
          LexoraCharts.refreshAll(this.market);
        }
        if (this.currentPage === "markets") this.renderMarketsTable();
      });
    });
    this.applyMoneyLabels();
    this.updateFxBadge();
  },

  updateFxBadge() {
    const el = document.getElementById("fxRateBadge");
    if (!el || typeof LexoraAPI === "undefined") return;
    const r = LexoraAPI.fxRates[this.currency];
    if (this.currency === "USD") el.textContent = "Base: USD";
    else if (r) el.textContent = `1 USD = ${LexoraAPI.formatAmount(r, this.currency)}`;
    else el.textContent = "";
  },

  moneySymbol() {
    return LexoraAPI?.CURRENCIES?.[this.currency]?.symbol || "₹";
  },

  applyMoneyLabels() {
    const sym = this.moneySymbol();
    document.querySelectorAll(".lbl-money").forEach((lbl) => {
      const base = lbl.dataset.base || lbl.textContent.split("(")[0].trim();
      if (!lbl.dataset.base) lbl.dataset.base = base;
      lbl.textContent = `${base} (${sym})`;
    });
  },

  formatPrice(sym, price) {
    if (typeof LexoraAPI !== "undefined" && LexoraAPI.formatPrice) {
      return LexoraAPI.formatPrice(sym, price, this.currency);
    }
    return this.formatCalcMoney(price);
  },

  formatCalcMoney(amount) {
    if (typeof LexoraAPI !== "undefined" && LexoraAPI.formatAmount) {
      return LexoraAPI.formatAmount(amount, this.currency);
    }
    const n = Number(amount);
    return this.moneySymbol() + (Number.isFinite(n) ? n.toLocaleString() : "—");
  },

  isLocalFlask() {
    return /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  },

  parseCalcBody(form) {
    const type = form.dataset.type;
    const body = { type };
    new FormData(form).forEach((v, k) => {
      const n = parseFloat(v);
      body[k] = Number.isFinite(n) ? n : v;
    });
    return body;
  },

  hasCalcResult(r, type) {
    if (!r || typeof r !== "object" || r.error) return false;
    if (Object.keys(r).length === 0) return false;
    const need = {
      sip: ["future_value"],
      gold: ["future_value"],
      silver: ["future_value"],
      crypto: ["profit"],
      emi: ["emi"],
      compound: ["maturity", "final_amount"],
    }[type];
    return need ? need.some((k) => r[k] != null && !Number.isNaN(Number(r[k]))) : false;
  },

  normalizeCalcResult(type, r) {
    if (!this.hasCalcResult(r, type)) return null;
    if (type === "emi" && r.total_interest == null && r.interest != null) r.total_interest = r.interest;
    if (type === "compound") {
      if (r.maturity == null && r.final_amount != null) r.maturity = r.final_amount;
    }
    return r;
  },

  calcHintHtml() {
    return '<p class="calc-hint">Enter amounts in your selected currency, then tap Calculate.</p>';
  },

  renderCalcOutput(rows) {
    return `<div class="calc-output">${rows
      .map(
        ([label, value]) =>
          `<div class="calc-output-row"><span>${label}</span><strong class="calc-amount">${value}</strong></div>`
      )
      .join("")}</div>`;
  },

  resetCalculators() {
    document.querySelectorAll(".calc-form").forEach((form) => {
      form.reset();
      const type = form.dataset.type;
      const el = document.getElementById("result-" + type);
      if (el) {
        el.classList.remove("calc-error");
        el.innerHTML = this.calcHintHtml();
      }
    });
    document.querySelectorAll(".calc-tabs .tab").forEach((t, i) => {
      t.classList.toggle("active", i === 0);
    });
    document.querySelectorAll(".calc-panel").forEach((p, i) => {
      p.classList.toggle("active", i === 0);
    });
  },

  initCalculators() {
    document.getElementById("btnCalcReset")?.addEventListener("click", () => this.resetCalculators());

    document.querySelectorAll(".calc-tabs .tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".calc-tabs .tab").forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".calc-panel").forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById("calc-" + tab.dataset.calc)?.classList.add("active");
      });
    });

    document.querySelectorAll("[data-live-price]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!this.market?.assets) await this.refreshMarketData();
        const sym = btn.dataset.livePrice;
        const price = this.getLiveCalcPrice(sym);
        const form = btn.closest("form");
        if (!form || price == null) return;
        const field = btn.dataset.liveField || "price";
        const input = form.querySelector(`[name="${field}"]`);
        if (input) {
          input.value = price;
          input.classList.add("price-flash");
          setTimeout(() => input.classList.remove("price-flash"), 600);
        }
      });
    });

    document.querySelectorAll(".calc-form").forEach((form) => {
      if (form.dataset.bound === "1") return;
      form.dataset.bound = "1";
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const type = form.dataset.type;
        const body = this.parseCalcBody(form);
        const el = document.getElementById("result-" + type);
        if (el) el.innerHTML = '<p class="calc-hint">Calculating…</p>';

        let result = this.calcClient(type, body);
        if (this.isLocalFlask()) {
          try {
            const r = await fetch("/api/calculate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            if (r.ok) {
              const api = await r.json();
              if (this.hasCalcResult(api, type)) result = api;
            }
          } catch (err) { /* keep client result */ }
        }
        this.displayCalcResult(type, this.normalizeCalcResult(type, result));
      });
    });

    document.querySelectorAll(".calc-result").forEach((el) => {
      if (!el.innerHTML.trim()) el.innerHTML = this.calcHintHtml();
    });
  },

  calcClient(type, b) {
    if (type === "sip") {
      const r = b.rate / 100 / 12, m = b.years * 12;
      const fv = r > 0 ? b.monthly * (((1 + r) ** m - 1) / r) * (1 + r) : b.monthly * m;
      const invested = b.monthly * m;
      return { future_value: fv, invested, returns: fv - invested };
    }
    if (type === "gold" || type === "silver") {
      const cur = b.grams * b.price;
      const fut = cur * Math.pow(1 + (b.appreciation || 8) / 100, b.years);
      return { current_value: cur, future_value: fut, profit: fut - cur };
    }
    if (type === "crypto") {
      const profit = (b.sell_price - b.buy_price) * b.quantity;
      const roi = b.buy_price ? ((b.sell_price - b.buy_price) / b.buy_price) * 100 : 0;
      return { profit, roi };
    }
    if (type === "emi") {
      const mr = b.rate / 100 / 12;
      const emi = mr > 0
        ? (b.principal * mr * Math.pow(1 + mr, b.tenure)) / (Math.pow(1 + mr, b.tenure) - 1)
        : b.principal / b.tenure;
      const total = emi * b.tenure;
      return { emi, total_payment: total, total_interest: total - b.principal };
    }
    if (type === "compound") {
      const n = b.frequency || 4;
      const amount = b.principal * Math.pow(1 + b.rate / 100 / n, n * b.years);
      return { maturity: amount, interest_earned: amount - b.principal };
    }
    return {};
  },

  displayCalcResult(type, r) {
    const el = document.getElementById("result-" + type);
    if (!el) return;
    const fmt = (n) => this.formatCalcMoney(n);
    el.classList.remove("calc-error");

    if (!r) {
      el.classList.add("calc-error");
      el.innerHTML = '<p class="calc-hint">Could not calculate. Check your inputs.</p>';
      return;
    }

    if (type === "sip") {
      el.innerHTML = this.renderCalcOutput([
        ["Future value", fmt(r.future_value)],
        ["Total invested", fmt(r.invested)],
        ["Estimated returns", fmt(r.returns)],
      ]);
      return;
    }
    if (type === "gold" || type === "silver") {
      el.innerHTML = this.renderCalcOutput([
        ["Current value", fmt(r.current_value)],
        ["Future value", fmt(r.future_value)],
        ["Estimated profit", fmt(r.profit)],
      ]);
      return;
    }
    if (type === "crypto") {
      el.innerHTML = this.renderCalcOutput([
        ["Profit / Loss", fmt(r.profit)],
        ["Return (ROI)", `${Number(r.roi).toFixed(2)}%`],
      ]);
      return;
    }
    if (type === "emi") {
      el.innerHTML = this.renderCalcOutput([
        ["Monthly EMI", fmt(r.emi)],
        ["Total payment", fmt(r.total_payment)],
        ["Total interest", fmt(r.total_interest)],
      ]);
      return;
    }
    if (type === "compound") {
      el.innerHTML = this.renderCalcOutput([
        ["Maturity amount", fmt(r.maturity)],
        ["Interest earned", fmt(r.interest_earned)],
      ]);
      return;
    }
    el.classList.add("calc-error");
    el.innerHTML = '<p class="calc-hint">Could not calculate. Check your inputs.</p>';
  },
};

document.addEventListener("DOMContentLoaded", () => LexoraApp.init());
