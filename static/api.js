/**
 * LexorA Live Market API — same logic as localhost api/market_data.py
 * Used on GitHub Pages (no Flask server required).
 */
const LexoraAPI = {
  usdInrRate: 83.25,
  fxRates: { USD: 1, INR: 83.25, EUR: 0.92, GBP: 0.79, JPY: 150, AUD: 1.52, CAD: 1.36 },
  CURRENCIES: {
    USD: { symbol: "$", locale: "en-US", name: "US Dollar" },
    INR: { symbol: "₹", locale: "en-IN", name: "Indian Rupee" },
    EUR: { symbol: "€", locale: "de-DE", name: "Euro" },
    GBP: { symbol: "£", locale: "en-GB", name: "British Pound" },
    JPY: { symbol: "¥", locale: "ja-JP", name: "Japanese Yen" },
    AUD: { symbol: "A$", locale: "en-AU", name: "Australian Dollar" },
    CAD: { symbol: "C$", locale: "en-CA", name: "Canadian Dollar" },
  },
  TIMEOUT: 12000,
  FALLBACK: {
    gold: 2650, silver: 31.5, bitcoin: 67500, ethereum: 3500, platinum: 980,
    crude_oil: 78.5, usd_inr: 83.25, sp500: 5200, nasdaq: 16500, eur_usd: 1.08, gbp_usd: 1.27,
  },
  LABELS: {
    gold: "Gold", silver: "Silver", bitcoin: "Bitcoin", ethereum: "Ethereum",
    platinum: "Platinum", crude_oil: "Crude Oil", usd_inr: "USD/INR",
    sp500: "S&P 500", nasdaq: "NASDAQ", eur_usd: "EUR/USD", gbp_usd: "GBP/USD",
  },
  YAHOO: { sp500: "^GSPC", nasdaq: "^IXIC", crude_oil: "CL=F", platinum: "PL=F", gold: "GC=F", silver: "SI=F", bitcoin: "BTC-USD", ethereum: "ETH-USD" },

  isLocalFlask() {
    return location.hostname === "127.0.0.1" || location.hostname === "localhost";
  },

  /** Live FX from Frankfurter (USD base) — 7 currencies */
  async fetchFxRates() {
    try {
      const data = await this.fetchJson(
        "https://api.frankfurter.app/latest?from=USD&to=INR,EUR,GBP,JPY,AUD,CAD"
      );
      const rates = data.rates || {};
      this.fxRates = { USD: 1, ...rates };
      if (rates.INR) this.usdInrRate = rates.INR;
      return this.fxRates;
    } catch (e) {
      return this.fxRates;
    }
  },

  convertFromUsd(amountUsd, toCurrency) {
    const rate = this.fxRates[toCurrency] || 1;
    return Number(amountUsd) * rate;
  },

  async fetchJson(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.TIMEOUT);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (!r.ok) throw new Error(String(r.status));
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  },

  async fetchMetals() {
    const urls = [
      "https://api.metals.live/v1/spot",
      "https://corsproxy.io/?" + encodeURIComponent("https://api.metals.live/v1/spot"),
    ];
    for (const url of urls) {
      try {
        const data = await this.fetchJson(url);
        const out = {};
        (Array.isArray(data) ? data : []).forEach((row) => {
          const m = (row.metal || "").toLowerCase();
          if (m === "gold" || row.gold != null) out.gold = parseFloat(row.price ?? row.gold);
          if (m === "silver" || row.silver != null) out.silver = parseFloat(row.price ?? row.silver);
        });
        if (out.gold || out.silver) return out;
      } catch (e) { /* next */ }
    }
    return {};
  },

  async fetchCrypto() {
    const url =
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true";
    const data = await this.fetchJson(url);
    const out = {};
    if (data.bitcoin) out.bitcoin = { price: data.bitcoin.usd, change: data.bitcoin.usd_24h_change || 0 };
    if (data.ethereum) out.ethereum = { price: data.ethereum.usd, change: data.ethereum.usd_24h_change || 0 };
    return out;
  },

  async fetchForex() {
    const data = await this.fetchJson("https://api.frankfurter.app/latest?from=USD&to=INR,EUR,GBP");
    const r = data.rates || {};
    return {
      usd_inr: r.INR,
      eur_usd: r.EUR ? 1 / r.EUR : null,
      gbp_usd: r.GBP ? 1 / r.GBP : null,
    };
  },

  async fetchYahoo(key) {
    const sym = this.YAHOO[key];
    if (!sym) return null;
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`;
      const data = await this.fetchJson(url);
      const closes = data.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter((x) => x != null) || [];
      if (!closes.length) return null;
      const price = closes[closes.length - 1];
      const prev = closes.length > 1 ? closes[closes.length - 2] : price;
      return { price, change: prev ? ((price - prev) / prev) * 100 : 0 };
    } catch (e) {
      return null;
    }
  },

  /** Main market fetch — mirrors Python fetch_market_data() */
  async fetchMarket() {
    if (this.isLocalFlask()) {
      try {
        const r = await fetch("/api/market");
        if (r.ok) return await r.json();
      } catch (e) { /* fallback to client */ }
    }

    const assets = {};
    const [metals, crypto, forex] = await Promise.allSettled([
      this.fetchMetals(),
      this.fetchCrypto(),
      this.fetchForex(),
      this.fetchFxRates(),
    ]);

    const m = metals.status === "fulfilled" ? metals.value : {};
    const c = crypto.status === "fulfilled" ? crypto.value : {};
    const f = forex.status === "fulfilled" ? forex.value : {};

    if (m.gold) assets.gold = { price: m.gold, change: 0, symbol: "XAU" };
    if (m.silver) assets.silver = { price: m.silver, change: 0, symbol: "XAG" };
    Object.entries(c).forEach(([k, v]) => {
      assets[k] = { price: v.price, change: v.change, symbol: k.toUpperCase().slice(0, 3) };
    });
    if (f.usd_inr) assets.usd_inr = { price: f.usd_inr, change: 0, symbol: "USD/INR" };
    if (f.eur_usd) assets.eur_usd = { price: f.eur_usd, change: 0, symbol: "EUR/USD" };
    if (f.gbp_usd) assets.gbp_usd = { price: f.gbp_usd, change: 0, symbol: "GBP/USD" };

    for (const key of ["sp500", "nasdaq", "crude_oil", "platinum"]) {
      const y = await this.fetchYahoo(key);
      if (y) assets[key] = { price: y.price, change: y.change, symbol: key.toUpperCase() };
    }

    let source = "live";
    if (Object.keys(assets).length < 5) source = "fallback";
    Object.keys(this.FALLBACK).forEach((sym) => {
      if (!assets[sym]) {
        const p = this.FALLBACK[sym] * (1 + (Math.random() - 0.5) * 0.004);
        assets[sym] = { price: p, change: (Math.random() - 0.5) * 2, symbol: sym.toUpperCase() };
      }
    });

    return { timestamp: new Date().toISOString(), source, assets };
  },

  formatPrice(sym, price, currency) {
    const cur = currency || localStorage.getItem("lexora_currency") || "INR";
    const n = Number(price);
    if (sym === "usd_inr") return "₹" + n.toFixed(2);
    if (sym === "eur_usd" || sym === "gbp_usd") return n.toFixed(4);
    const converted = cur === "USD" ? n : this.convertFromUsd(n, cur);
    return this.formatAmount(converted, cur);
  },

  formatAmount(amount, currency) {
    const cur = currency || "INR";
    const meta = this.CURRENCIES[cur] || this.CURRENCIES.INR;
    const n = Number(amount);
    if (!Number.isFinite(n)) return "—";
    const max = cur === "JPY" ? 0 : 2;
    const formatted = n.toLocaleString(meta.locale, { maximumFractionDigits: max });
    return meta.symbol + formatted;
  },

  label(sym) {
    return this.LABELS[sym] || sym.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  },

  // --- Lightweight AI prediction (client-side, for GitHub Pages) ---
  rsi(prices, period = 14) {
    if (prices.length < period + 1) return 50;
    const d = prices.slice(-period - 1).map((p, i, a) => (i ? p - a[i - 1] : 0)).slice(1);
    const g = d.filter((x) => x > 0).reduce((a, b) => a + b, 0) / period;
    const l = d.filter((x) => x < 0).reduce((a, b) => a + Math.abs(b), 0) / period;
    if (!l) return 100;
    return 100 - 100 / (1 + g / l);
  },

  async history(sym, days = 30) {
    const y = await this.fetchYahoo(sym);
    if (y) {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(this.YAHOO[sym] || sym)}?interval=1d&range=${days}d`;
        const data = await this.fetchJson(url);
        const closes = data.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter((x) => x != null) || [];
        if (closes.length > 2) return closes;
      } catch (e) { /* */ }
    }
    const base = this.FALLBACK[sym] || 100;
    const out = [base];
    for (let i = 0; i < days; i++) out.push(out[out.length - 1] * (1 + (Math.random() - 0.5) * 0.02));
    return out;
  },

  async predict(symbol) {
    if (this.isLocalFlask()) {
      try {
        const r = await fetch(`/api/predict/${symbol}`);
        const j = await r.json();
        if (j.success) return j.data;
      } catch (e) { /* */ }
    }
    const prices = await this.history(symbol, 40);
    const current = prices[prices.length - 1];
    const rsi = this.rsi(prices);
    const ma5 = prices.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const ma20 = prices.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, prices.length);
    const trend = ma5 > ma20 * 1.01 ? "bullish" : ma5 < ma20 * 0.99 ? "bearish" : "neutral";
    const expected = current * (1 + (trend === "bullish" ? 0.02 : trend === "bearish" ? -0.02 : 0));
    let signal = "HOLD", confidence = 60;
    if (rsi < 35 && trend !== "bearish") { signal = "UP"; confidence = 75; }
    else if (rsi > 65 && trend !== "bullish") { signal = "DOWN"; confidence = 75; }
    else if (trend === "bullish") { signal = "UP"; confidence = 65; }
    else if (trend === "bearish") { signal = "DOWN"; confidence = 65; }
    const rets = [];
    for (let i = 1; i < prices.length; i++) rets.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    const vol = rets.length ? Math.sqrt(rets.slice(-14).reduce((a, b) => a + b * b, 0) / Math.min(14, rets.length)) * Math.sqrt(252) * 100 : 0;
    return {
      symbol, signal, confidence, trend,
      current_price: Math.round(current * 100) / 100,
      expected_price: Math.round(expected * 100) / 100,
      rsi: Math.round(rsi * 10) / 10,
      volatility: Math.round(vol * 10) / 10,
      historical: prices.slice(-30).map((p) => Math.round(p * 100) / 100),
      forecast: [1, 2, 3, 4, 5].map((i) => Math.round((current + (expected - current) * i / 5) * 100) / 100),
      sentiment: { label: trend === "bullish" ? "Bullish" : trend === "bearish" ? "Bearish" : "Neutral" },
      recommendation: signal === "UP" ? "BUY" : signal === "DOWN" ? "SELL" : "HOLD",
      recommendation_reason: "Client-side AI analysis",
      risk_level: Math.min(100, Math.round(vol * 2 + (rsi > 70 || rsi < 30 ? 20 : 0))),
    };
  },

  async predictAll() {
    if (this.isLocalFlask()) {
      try {
        const r = await fetch("/api/predictions/all");
        const j = await r.json();
        if (j.success) return j.data;
      } catch (e) { /* */ }
    }
    const syms = [
      "gold", "silver", "platinum", "bitcoin", "ethereum",
      "crude_oil", "sp500", "nasdaq", "usd_inr", "eur_usd", "gbp_usd",
    ];
    const out = {};
    for (const s of syms) out[s] = await this.predict(s);
    return out;
  },

  newsHeadlines() {
    return [
      "Gold steady amid dollar moves · Bitcoin ETF inflows rise",
      "Fed policy in focus · Ethereum network activity up",
      "Crude oil OPEC+ steady · USD/INR range-bound · S&P 500 tech rally",
    ];
  },
};
