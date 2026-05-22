/**
 * LexorA Chart.js — comparison, volatility, live price stream
 */
const LexoraCharts = {
  mobileOptions: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: "#c5d9ea", boxWidth: 12, font: { size: 11 } },
      },
    },
    scales: {
      x: {
        ticks: { color: "#7a9bb8", maxRotation: 45, minRotation: 0, font: { size: 10 } },
        grid: { color: "rgba(0,240,255,0.05)" },
      },
      y: {
        ticks: { color: "#7a9bb8", font: { size: 10 } },
        grid: { color: "rgba(0,240,255,0.05)" },
      },
    },
  },

  _instances: {},

  _destroy(id) {
    if (this._instances[id]) {
      this._instances[id].destroy();
      delete this._instances[id];
    }
  },

  _wrapCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas?.parentElement) return canvas;
    const wrap = canvas.parentElement;
    if (!wrap.classList.contains("chart-canvas-wrap")) {
      wrap.classList.add("chart-canvas-wrap");
    }
    return canvas;
  },

  /** 24h % change comparison — fair across gold, crypto, stocks */
  initComparisonChart(canvasId, market) {
    const canvas = this._wrapCanvas(canvasId);
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const m = market || LexoraApp?.market;
    if (!m?.assets) return;

    const order = ["gold", "silver", "platinum", "palladium", "copper", "bitcoin", "ethereum", "crude_oil", "sp500", "nasdaq"];
    const rows = order
      .filter((s) => m.assets[s])
      .map((s) => ({
        sym: s,
        label: LexoraAPI.label(s),
        change: Number(m.assets[s].change) || 0,
      }));

    const labels = rows.map((r) => r.label);
    const values = rows.map((r) => r.change);
    const colors = values.map((v) =>
      v >= 0 ? "rgba(0,255,136,0.75)" : "rgba(255,68,102,0.75)"
    );

    this._destroy(canvasId);
    this._instances[canvasId] = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Live move %",
            data: values,
            backgroundColor: colors,
            borderRadius: 6,
          },
        ],
      },
      options: {
        ...this.mobileOptions,
        plugins: {
          ...this.mobileOptions.plugins,
          title: {
            display: true,
            text: "Live move from Yahoo / CoinGecko",
            color: "#7a9bb8",
            font: { size: 11 },
          },
        },
      },
    });
  },

  async initVolatilityChart(canvasId) {
    const canvas = this._wrapCanvas(canvasId);
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    try {
      const data = await LexoraAPI.predictAll();
      const labels = [];
      const values = [];
      Object.entries(data).slice(0, 8).forEach(([sym, p]) => {
        labels.push(LexoraAPI.label(sym));
        values.push(p.volatility || 10);
      });
      this._destroy(canvasId);
      this._instances[canvasId] = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Volatility %",
              data: values,
              borderColor: "#ff4466",
              backgroundColor: "rgba(255,68,102,0.2)",
              fill: true,
              tension: 0.4,
            },
          ],
        },
        options: this.mobileOptions,
      });
    } catch (e) { /* silent */ }
  },

  /** Live 30-day % trend — gold, silver, bitcoin */
  async initLivePriceChart(canvasId, market) {
    const canvas = this._wrapCanvas(canvasId);
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;

    const symbols = [
      { key: "gold", label: "Gold", color: "#ffd700" },
      { key: "silver", label: "Silver", color: "#c0c0c0" },
      { key: "platinum", label: "Platinum", color: "#e5e4e2" },
      { key: "palladium", label: "Palladium", color: "#9eb4c8" },
      { key: "bitcoin", label: "Bitcoin", color: "#00f0ff" },
    ];

    const datasets = [];
    let maxLen = 0;

    await Promise.all(
      symbols.map(async ({ key, label, color }) => {
        const prices = await LexoraAPI.fetchYahooHistory(key, 30);
        if (prices.length < 3) return;
        const normalized = LexoraAPI.normalizeSeries(prices);
        maxLen = Math.max(maxLen, normalized.length);
        datasets.push({
          label: label + " %",
          data: normalized,
          borderColor: color,
          backgroundColor: color + "22",
          tension: 0.35,
          fill: false,
          pointRadius: 0,
          borderWidth: 2,
        });
      })
    );

    if (!datasets.length) {
      const el = canvas.parentElement;
      if (el) {
        const note = el.querySelector(".chart-fallback");
        if (!note) {
          const p = document.createElement("p");
          p.className = "chart-fallback calc-hint";
          p.textContent = "Loading live stream… refresh in a moment.";
          el.appendChild(p);
        }
      }
      return;
    }

    this._destroy(canvasId);
    const labels = Array.from({ length: maxLen }, (_, i) => `D${i + 1}`);
    this._instances[canvasId] = new Chart(ctx, {
      type: "line",
      data: { labels, datasets },
      options: {
        ...this.mobileOptions,
        plugins: {
          ...this.mobileOptions.plugins,
          title: {
            display: true,
            text: "30-day % change (Yahoo Finance live)",
            color: "#7a9bb8",
            font: { size: 11 },
          },
        },
      },
    });
  },

  initHistoryChart(canvasId, prices) {
    const ctx = document.getElementById(canvasId)?.getContext("2d");
    if (!ctx || !prices?.length) return;
    this._destroy(canvasId);
    this._instances[canvasId] = new Chart(ctx, {
      type: "line",
      data: {
        labels: prices.map((_, i) => i + 1),
        datasets: [
          {
            label: "Price",
            data: prices,
            borderColor: "#00f0ff",
            backgroundColor: "rgba(0,240,255,0.1)",
            fill: true,
            tension: 0.3,
          },
        ],
      },
      options: { ...this.mobileOptions, maintainAspectRatio: true },
    });
  },

  initForecastChart(canvasId, historical, forecast) {
    const ctx = document.getElementById(canvasId)?.getContext("2d");
    if (!ctx) return;
    this._destroy(canvasId);
    const histLen = historical.length;
    const labels = [
      ...historical.map((_, i) => `T-${histLen - i}`),
      ...forecast.map((_, i) => `F+${i + 1}`),
    ];
    this._instances[canvasId] = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Historical",
            data: [...historical, ...Array(forecast.length).fill(null)],
            borderColor: "#00f0ff",
            tension: 0.3,
          },
          {
            label: "AI Forecast",
            data: [...Array(historical.length - 1).fill(null), historical[historical.length - 1], ...forecast],
            borderColor: "#ffd700",
            borderDash: [5, 5],
            tension: 0.3,
          },
        ],
      },
      options: { ...this.mobileOptions, maintainAspectRatio: true },
    });
  },

  refreshAll(market) {
    if (document.getElementById("comparisonChart")) {
      this.initComparisonChart("comparisonChart", market);
    }
    if (document.getElementById("volatilityChart")) {
      this.initVolatilityChart("volatilityChart");
    }
    if (document.getElementById("livePriceChart") && LexoraApp?.currentPage === "markets") {
      this.initLivePriceChart("livePriceChart", market);
    }
  },
};
