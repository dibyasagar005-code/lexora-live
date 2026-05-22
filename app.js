/**
 * LexorA — public site (same UX as localhost), live data every 30s.
 */
const LexoraApp = {
  refreshInterval: 30000,
  refreshTimer: null,
  currentPage: "home",
  market: null,

  init() {
    this.loadNewsTicker();
    this.renderMarketGrid(document.getElementById("homeMarketGrid"));
    this.renderMarketTable();
    const cached = LexoraLiveData.loadCache();
    if (cached) {
      this.market = cached;
      this.updateAllPrices();
    }
    this.refreshMarketData();
    this.startLiveRefresh();
    this.initNav();
    this.initMobileMenu();
    this.initCalcTabs();
    if (typeof LexoraCharts !== "undefined") {
      LexoraCharts.initComparisonChart("comparisonChart");
      LexoraCharts.initVolatilityChart("volatilityChart");
    }
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
    if (page === "markets") this.renderMarketTable();
  },

  initMobileMenu() {
    document.getElementById("menuBtn")?.addEventListener("click", () => {
      document.getElementById("sidebar")?.classList.toggle("open");
    });
  },

  loadNewsTicker() {
    const headlines = [
      "Gold steady amid dollar moves · Bitcoin ETF inflows rise · Fed policy in focus",
      "Ethereum upgrade boosts DeFi · USD/INR range-bound · S&P 500 tech rally continues",
      "Crude oil OPEC+ output steady · Silver industrial demand up · Global SIP flows strong",
    ];
    const el = document.getElementById("tickerContent");
    if (el) el.textContent = headlines.join("  ·  ");
  },

  startLiveRefresh() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = setInterval(() => this.refreshMarketData(), this.refreshInterval);
  },

  async refreshMarketData() {
    const pulse = document.querySelector(".pulse-text");
    if (pulse) pulse.textContent = "Updating…";
    try {
      this.market = await LexoraLiveData.fetchMarket();
      this.updateAllPrices();
      this.updateLastRefresh(this.market.timestamp);
      const badge = document.getElementById("refreshBadge");
      if (badge) badge.textContent = "Updated " + new Date().toLocaleTimeString();
      if (pulse) pulse.textContent = "AI Active · " + (this.market.source === "live" ? "LIVE" : "Fallback");
      document.getElementById("assetCount").textContent =
        Object.keys(this.market.assets).length + " assets tracked";
      document.getElementById("dataSource").textContent = this.market.source.toUpperCase();
      if (typeof LexoraCharts !== "undefined") {
        LexoraCharts.initComparisonChart("comparisonChart");
        LexoraCharts.initVolatilityChart("volatilityChart");
      }
    } catch (e) {
      if (pulse) pulse.textContent = "Retrying…";
      console.warn(e);
    }
  },

  updateLastRefresh(ts) {
    const el = document.getElementById("lastUpdate");
    if (el) el.textContent = new Date(ts || Date.now()).toLocaleTimeString();
  },

  updateAllPrices() {
    if (!this.market?.assets) return;
    Object.entries(this.market.assets).forEach(([sym, asset]) => {
      document.querySelectorAll(`[data-symbol="${sym}"]`).forEach((card) => {
        const priceEl = card.querySelector(".card-price, .price-cell");
        const changeEl = card.querySelector(".card-change");
        if (priceEl) {
          priceEl.classList.add("price-flash");
          priceEl.textContent = LexoraLiveData.formatPrice(sym, asset.price);
          setTimeout(() => priceEl.classList.remove("price-flash"), 600);
        }
        if (changeEl) {
          const ch = asset.change || 0;
          changeEl.textContent = (ch >= 0 ? "+" : "") + ch.toFixed(2) + "%";
          changeEl.className = "card-change " + (ch >= 0 ? "positive" : "negative");
        }
      });
    });
    if (this.currentPage === "markets") this.renderMarketTable();
  },

  renderMarketGrid(container) {
    if (!container) return;
    const order = Object.keys(LexoraLiveData.FALLBACK);
    container.innerHTML = order
      .map(
        (sym) => `
      <div class="market-card" data-symbol="${sym}">
        <div class="card-header">
          <span class="symbol-name">${LexoraLiveData.label(sym)}</span>
          <span class="live-dot"></span>
        </div>
        <div class="card-price">—</div>
        <div class="card-change">—</div>
      </div>`
      )
      .join("");
  },

  renderMarketTable() {
    const body = document.getElementById("marketsBody");
    if (!body || !this.market?.assets) return;
    body.innerHTML = Object.entries(this.market.assets)
      .map(
        ([sym, a]) => `
      <tr data-symbol="${sym}">
        <td><strong>${LexoraLiveData.label(sym)}</strong></td>
        <td class="price-cell">${LexoraLiveData.formatPrice(sym, a.price)}</td>
        <td class="${(a.change || 0) >= 0 ? "positive" : "negative"}">${(a.change || 0) >= 0 ? "+" : ""}${(a.change || 0).toFixed(2)}%</td>
      </tr>`
      )
      .join("");
  },

  initCalcTabs() {
    document.querySelectorAll(".calc-tabs .tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".calc-tabs .tab").forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".calc-panel").forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById("calc-" + tab.dataset.calc)?.classList.add("active");
      });
    });
    document.querySelectorAll(".calc-form").forEach((form) => {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        this.runCalc(form);
      });
    });
  },

  runCalc(form) {
    const type = form.dataset.type;
    const fd = new FormData(form);
    const el = document.getElementById("result-" + type);
    if (!el) return;
    if (type === "sip") {
      const monthly = +fd.get("monthly");
      const rate = +fd.get("rate") / 100 / 12;
      const months = +fd.get("years") * 12;
      const fv = rate > 0 ? monthly * (((1 + rate) ** months - 1) / rate) * (1 + rate) : monthly * months;
      el.innerHTML = `<strong>Future Value:</strong> $${fv.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    }
  },
};

document.addEventListener("DOMContentLoaded", () => LexoraApp.init());
