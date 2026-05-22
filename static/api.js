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
  TIMEOUT: 14000,
  TROY_OZ_GRAMS: 31.1034768,
  METALS: ["gold", "silver", "platinum"],
  FALLBACK: {
    gold: 3340, silver: 31.2, bitcoin: 97000, ethereum: 3600, platinum: 1020,
    crude_oil: 72, usd_inr: 83.5, sp500: 5900, nasdaq: 19500, eur_usd: 1.08, gbp_usd: 1.27,
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

  async fetchWithProxies(path) {
    const urls = [
      path,
      "https://corsproxy.io/?" + encodeURIComponent(path),
      "https://api.allorigins.win/raw?url=" + encodeURIComponent(path),
    ];
    for (const url of urls) {
      try {
        return await this.fetchJson(url);
      } catch (e) { /* next */ }
    }
    throw new Error("All proxies failed");
  },

  yahooChartUrl(symbol) {
    return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  },

  parseYahooChart(data) {
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const meta = result.meta || {};
    const closes = result.indicators?.quote?.[0]?.close?.filter((x) => x != null) || [];
    const price = meta.regularMarketPrice || closes[closes.length - 1];
    if (!price) return null;
    const prev = closes.length > 1 ? closes[closes.length - 2] : price;
    const change =
      meta.regularMarketChangePercent ??
      (prev ? ((price - prev) / prev) * 100 : 0);
    return { price: Number(price), change: Number(change), closes };
  },

  async fetchYahoo(key) {
    const sym = this.YAHOO[key];
    if (!sym) return null;
    try {
      const data = await this.fetchWithProxies(this.yahooChartUrl(sym));
      const parsed = this.parseYahooChart(data);
      if (!parsed) return null;
      return {
        price: parsed.price,
        change: parsed.change,
        unit: this.METALS.includes(key) ? "oz" : "unit",
      };
    } catch (e) {
      return null;
    }
  },

  async fetchYahooHistory(key, days = 30) {
    const sym = this.YAHOO[key];
    if (!sym) return [];
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=${days}d`;
      const data = await this.fetchWithProxies(url);
      const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter((x) => x != null) || [];
      return closes.map(Number);
    } catch (e) {
      return [];
    }
  },

  async fetchCrypto() {
    const path =
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true";
    let data;
    try {
      data = await this.fetchWithProxies(path);
    } catch (e) {
      return {};
    }
    const out = {};
    if (data.bitcoin) {
      out.bitcoin = { price: data.bitcoin.usd, change: data.bitcoin.usd_24h_change || 0, unit: "unit" };
    }
    if (data.ethereum) {
      out.ethereum = { price: data.ethereum.usd, change: data.ethereum.usd_24h_change || 0, unit: "unit" };
    }
    return out;
  },

  /** Clear primary + secondary price lines for UI */
  priceDisplay(sym, asset, currency) {
    const cur = currency || localStorage.getItem("lexora_currency") || "INR";
    const usd = Number(asset?.price);
    if (!Number.isFinite(usd)) return { primary: "—", secondary: "" };
    if (sym === "usd_inr") {
      return { primary: "₹" + usd.toFixed(2), secondary: "per USD" };
    }
    if (sym === "eur_usd" || sym === "gbp_usd") {
      return { primary: usd.toFixed(4), secondary: "exchange rate" };
    }
    if (this.METALS.includes(sym)) {
      const perGram = this.usdPerGram(usd);
      const rate = cur === "USD" ? 1 : this.fxRates[cur] || this.usdInrRate;
      const gramLocal = cur === "USD" ? perGram : perGram * rate;
      return {
        primary: this.formatAmount(gramLocal, cur) + " /g",
        secondary: "$" + usd.toLocaleString("en-US", { maximumFractionDigits: 0 }) + " /oz",
      };
    }
    const converted = cur === "USD" ? usd : this.convertFromUsd(usd, cur);
    return {
      primary: this.formatAmount(converted, cur),
      secondary: cur !== "USD" ? "$" + usd.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "",
    };
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

  usdPerGram(usdPerOz) {
    return Number(usdPerOz) / this.TROY_OZ_GRAMS;
  },

  /** Main market fetch — Yahoo + CoinGecko + Frankfurter */
  async fetchMarket() {
    if (this.isLocalFlask()) {
      try {
        const r = await fetch("/api/market");
        if (r.ok) return await r.json();
      } catch (e) { /* client fallback */ }
    }

    const assets = {};
    const yahooKeys = Object.keys(this.YAHOO);
    const [yahooResults, crypto, forex] = await Promise.all([
      Promise.all(yahooKeys.map(async (key) => [key, await this.fetchYahoo(key)])),
      this.fetchCrypto().catch(() => ({})),
      this.fetchForex().catch(() => ({})),
      this.fetchFxRates(),
    ]);

    yahooResults.forEach(([key, y]) => {
      if (y) {
        assets[key] = {
          price: y.price,
          change: y.change,
          symbol: key.toUpperCase(),
          unit: y.unit || "unit",
        };
      }
    });

    Object.entries(crypto).forEach(([k, v]) => {
      if (!assets[k] || Math.abs((assets[k].change || 0)) < Math.abs(v.change || 0)) {
        assets[k] = { price: v.price, change: v.change, symbol: k.toUpperCase().slice(0, 3), unit: "unit" };
      }
    });

    if (forex.usd_inr) assets.usd_inr = { price: forex.usd_inr, change: 0, symbol: "USD/INR", unit: "rate" };
    if (forex.eur_usd) assets.eur_usd = { price: forex.eur_usd, change: 0, symbol: "EUR/USD", unit: "rate" };
    if (forex.gbp_usd) assets.gbp_usd = { price: forex.gbp_usd, change: 0, symbol: "GBP/USD", unit: "rate" };

    let liveCount = Object.keys(assets).length;
    Object.keys(this.FALLBACK).forEach((sym) => {
      if (!assets[sym]) {
        assets[sym] = {
          price: this.FALLBACK[sym],
          change: 0,
          symbol: sym.toUpperCase(),
          unit: this.METALS.includes(sym) ? "oz" : "unit",
        };
      }
    });

    const source = liveCount >= 8 ? "live" : liveCount >= 4 ? "mixed" : "fallback";
    return { timestamp: new Date().toISOString(), source, assets };
  },

  formatPrice(sym, priceUsd, currency) {
    const cur = currency || localStorage.getItem("lexora_currency") || "INR";
    const n = Number(priceUsd);
    if (!Number.isFinite(n)) return "—";
    if (sym === "usd_inr") return "₹" + n.toFixed(2);
    if (sym === "eur_usd" || sym === "gbp_usd") return n.toFixed(4);
    if (this.METALS.includes(sym)) {
      if (cur === "USD") {
        return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 }) + " /oz";
      }
      const perGram = this.usdPerGram(n) * (this.fxRates[cur] || this.usdInrRate);
      return this.formatAmount(perGram, cur) + " /g";
    }
    const converted = cur === "USD" ? n : this.convertFromUsd(n, cur);
    return this.formatAmount(converted, cur);
  },

  /** Live price for calculator fields (per gram for metals in selected currency) */
  calcLivePrice(sym, assets, currency) {
    const a = assets?.[sym];
    if (!a) return null;
    const cur = currency || "INR";
    const usd = Number(a.price);
    if (this.METALS.includes(sym)) {
      const perGramUsd = this.usdPerGram(usd);
      if (cur === "USD") return Math.round(perGramUsd * 100) / 100;
      const rate = this.fxRates[cur] || this.usdInrRate;
      return Math.round(perGramUsd * rate * 100) / 100;
    }
    if (cur === "USD") return Math.round(usd * 100) / 100;
    return Math.round(this.convertFromUsd(usd, cur) * 100) / 100;
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
    const closes = await this.fetchYahooHistory(sym, days);
    if (closes.length > 2) return closes;
    const base = this.FALLBACK[sym] || 100;
    const out = [base];
    for (let i = 0; i < days; i++) out.push(out[out.length - 1] * (1 + (Math.random() - 0.5) * 0.015));
    return out;
  },

  /** % change series from first point (for live stream chart) */
  normalizeSeries(prices) {
    if (!prices?.length) return [];
    const base = prices[0] || 1;
    return prices.map((p) => ((p - base) / base) * 100);
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
