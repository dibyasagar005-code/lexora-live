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
  METALS: ["gold", "silver", "platinum", "palladium"],
  METAL_LB: ["copper"],
  /** Reject bad API values (e.g. copper $/lb mistaken as gold $/oz) */
  PRICE_RANGES: {
    gold: [1500, 6500], silver: [12, 120], platinum: [700, 3500], palladium: [800, 6000],
    copper: [2, 15], bitcoin: [10000, 250000], ethereum: [500, 25000],
    crude_oil: [35, 200], sp500: [3000, 9000], nasdaq: [10000, 35000],
    usd_inr: [70, 110], eur_usd: [0.85, 1.25], gbp_usd: [1.0, 1.45],
  },
  FALLBACK: {
    gold: 3340, silver: 31.2, platinum: 1020, palladium: 980, copper: 4.25,
    bitcoin: 97000, ethereum: 3600, crude_oil: 72, usd_inr: 83.5,
    sp500: 5900, nasdaq: 19500, eur_usd: 1.08, gbp_usd: 1.27,
  },
  LABELS: {
    gold: "Gold", silver: "Silver", platinum: "Platinum", palladium: "Palladium", copper: "Copper",
    bitcoin: "Bitcoin", ethereum: "Ethereum", crude_oil: "Crude Oil", usd_inr: "USD/INR",
    sp500: "S&P 500", nasdaq: "NASDAQ", eur_usd: "EUR/USD", gbp_usd: "GBP/USD",
  },
  YAHOO: {
    gold: "GC=F", silver: "SI=F", platinum: "PL=F", palladium: "PA=F", copper: "HG=F",
    bitcoin: "BTC-USD", ethereum: "ETH-USD", crude_oil: "CL=F",
    sp500: "^GSPC", nasdaq: "^IXIC",
  },
  YAHOO_ALT: {
    gold: ["XAUUSD=X", "GC=F"],
    silver: ["XAGUSD=X", "SI=F"],
    platinum: ["PL=F", "XPTUSD=X"],
    palladium: ["PA=F", "XPDUSD=X"],
  },
  _lastPrices: {},

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
      const r = await fetch(url, {
        signal: ctrl.signal,
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!r.ok) throw new Error(String(r.status));
      const text = await r.text();
      let data = JSON.parse(text);
      if (data && typeof data.contents === "string") {
        data = JSON.parse(data.contents);
      }
      return data;
    } finally {
      clearTimeout(t);
    }
  },

  cacheBust(url) {
    return url + (url.includes("?") ? "&" : "?") + "_t=" + Date.now();
  },

  resolveChange(key, price, apiChange) {
    const prev = this._lastPrices[key];
    let change = Number(apiChange) || 0;
    if (prev && prev > 0 && Math.abs(change) < 0.02) {
      change = ((price - prev) / prev) * 100;
    }
    this._lastPrices[key] = price;
    return Math.round(change * 100) / 100;
  },

  async fetchWithProxies(path) {
    const urls = [
      this.cacheBust(path),
      this.cacheBust("https://corsproxy.io/?" + encodeURIComponent(path)),
      this.cacheBust("https://api.allorigins.win/raw?url=" + encodeURIComponent(path)),
      this.cacheBust("https://api.allorigins.win/get?url=" + encodeURIComponent(path)),
    ];
    let lastErr;
    for (const url of urls) {
      try {
        return await this.fetchJson(url);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("All proxies failed");
  },

  /** Gold + silver spot from global feed (works when Yahoo blocked) */
  async fetchGoldPriceOrg() {
    const out = {};
    try {
      const data = await this.fetchWithProxies("https://data-asg.goldprice.org/dbXRates/USD");
      const item = (Array.isArray(data?.items) ? data.items[0] : null) || data;
      if (!item) return out;
      if (item.xauPrice && this.isValidPrice("gold", item.xauPrice)) {
        out.gold = {
          price: Number(item.xauPrice),
          change: Number(item.chgXau || item.chgXAU || 0),
          unit: "oz",
          source: "goldprice.org",
        };
      }
      if (item.xagPrice && this.isValidPrice("silver", item.xagPrice)) {
        out.silver = {
          price: Number(item.xagPrice),
          change: Number(item.chgXag || item.chgXAG || 0),
          unit: "oz",
          source: "goldprice.org",
        };
      }
      const xpt = item.xptPrice || item.xpt;
      if (xpt && this.isValidPrice("platinum", xpt)) {
        out.platinum = { price: Number(xpt), change: 0, unit: "oz", source: "goldprice.org" };
      }
    } catch (e) {
      console.warn("[LexorA] goldprice.org:", e.message);
    }
    return out;
  },

  yahooChartUrl(symbol, fresh = false) {
    if (fresh) {
      return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`;
    }
    return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=2d`;
  },

  isValidPrice(key, price) {
    const range = this.PRICE_RANGES[key];
    if (!range) return price > 0;
    return price >= range[0] && price <= range[1];
  },

  parseYahooChart(data) {
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const meta = result.meta || {};
    const closes = result.indicators?.quote?.[0]?.close?.filter((x) => x != null) || [];
    let price = meta.regularMarketPrice ?? meta.previousClose ?? closes[closes.length - 1];
    if (!price || !Number.isFinite(Number(price))) return null;
    price = Number(price);
    const prev = closes.length > 1 ? Number(closes[closes.length - 2]) : price;
    let change = meta.regularMarketChangePercent;
    if (change == null && prev) change = ((price - prev) / prev) * 100;
    return { price, change: Number(change) || 0, closes };
  },

  assetUnit(key) {
    if (this.METALS.includes(key)) return "oz";
    if (this.METAL_LB.includes(key)) return "lb";
    return "unit";
  },

  async fetchYahooSymbol(sym, key, fresh = false) {
    try {
      const data = await this.fetchWithProxies(this.yahooChartUrl(sym, fresh));
      const parsed = this.parseYahooChart(data);
      if (!parsed || !this.isValidPrice(key, parsed.price)) return null;
      return {
        price: parsed.price,
        change: this.resolveChange(key, parsed.price, parsed.change),
        unit: this.assetUnit(key),
      };
    } catch (e) {
      return null;
    }
  },

  async fetchYahoo(key, fresh = false) {
    const symbols = [...new Set([this.YAHOO[key], ...(this.YAHOO_ALT[key] || [])].filter(Boolean))];
    for (const sym of symbols) {
      const hit = await this.fetchYahooSymbol(sym, key, fresh);
      if (hit) return hit;
    }
    return null;
  },

  /** Single-asset instant refresh */
  async fetchAssetLive(key) {
    if (key === "gold" || key === "silver" || key === "platinum") {
      const org = await this.fetchGoldPriceOrg();
      if (org[key]) {
        const hit = org[key];
        hit.change = this.resolveChange(key, hit.price, hit.change);
        return hit;
      }
    }
    if (key === "gold") {
      const api = await this.fetchGoldApiSpot();
      if (api) {
        api.change = this.resolveChange(key, api.price, api.change);
        return api;
      }
    }
    if (key === "bitcoin" || key === "ethereum") {
      const c = await this.fetchCrypto();
      const hit = c[key];
      if (hit) {
        return {
          price: hit.price,
          change: this.resolveChange(key, hit.price, hit.change),
          unit: "unit",
        };
      }
    }
    return this.fetchYahoo(key, true);
  },

  async fetchGoldApiMetal(metal, key) {
    const path = `https://api.gold-api.com/price/${metal}`;
    const loaders = [
      () => this.fetchJson(this.cacheBust(path)),
      () => this.fetchWithProxies(path),
    ];
    for (const load of loaders) {
      try {
        const data = await load();
        const p = Number(data?.price ?? data?.metalPrice ?? data?.value);
        if (this.isValidPrice(key, p)) {
          return {
            price: p,
            change: Number(data?.chg || data?.change || 0),
            unit: "oz",
            source: "gold-api.com",
          };
        }
      } catch (e) {
        /* try next */
      }
    }
    return null;
  },

  async fetchGoldApiSpot() {
    return this.fetchGoldApiMetal("XAU", "gold");
  },

  async fetchCryptoBinance() {
    const out = {};
    const pairs = { bitcoin: "BTCUSDT", ethereum: "ETHUSDT" };
    await Promise.all(
      Object.entries(pairs).map(async ([key, sym]) => {
        try {
          const d = await this.fetchJson(
            this.cacheBust(`https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}`)
          );
          const p = Number(d.lastPrice);
          if (this.isValidPrice(key, p)) {
            out[key] = {
              price: p,
              change: Number(d.priceChangePercent) || 0,
              unit: "unit",
              source: "binance",
            };
          }
        } catch (e) {
          console.warn("[LexorA] binance", sym, e.message);
        }
      })
    );
    return out;
  },

  async fetchMetal(key) {
    const tries = [];
    if (key === "gold") tries.push(() => this.fetchGoldApiSpot());
    if (key === "silver") tries.push(() => this.fetchGoldApiMetal("XAG", "silver"));
    tries.push(() => this.fetchYahoo(key, true));
    for (const fn of tries) {
      const hit = await fn();
      if (hit && this.isValidPrice(key, hit.price)) return hit;
    }
    return null;
  },

  async fetchMetalsBundle() {
    const out = {};
    const org = await this.fetchGoldPriceOrg();
    Object.entries(org).forEach(([k, v]) => {
      out[k] = v;
    });
    const keys = ["gold", "silver", "platinum", "palladium", "copper"];
    await Promise.all(
      keys.map(async (k) => {
        if (out[k] && this.isValidPrice(k, out[k].price)) return;
        const y = await this.fetchMetal(k);
        if (y) out[k] = y;
      })
    );
    return out;
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
    const binance = await this.fetchCryptoBinance();
    if (binance.bitcoin && binance.ethereum) return binance;

    const path =
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true";
    let data = {};
    try {
      data = await this.fetchJson(this.cacheBust(path));
    } catch (e) {
      try {
        data = await this.fetchWithProxies(path);
      } catch (e2) {
        data = {};
      }
    }
    const out = { ...binance };
    if (data.bitcoin && !out.bitcoin) {
      out.bitcoin = {
        price: data.bitcoin.usd,
        change: data.bitcoin.usd_24h_change || 0,
        unit: "unit",
        source: "coingecko",
      };
    }
    if (data.ethereum && !out.ethereum) {
      out.ethereum = {
        price: data.ethereum.usd,
        change: data.ethereum.usd_24h_change || 0,
        unit: "unit",
        source: "coingecko",
      };
    }
    for (const key of ["bitcoin", "ethereum"]) {
      if (!out[key]) {
        const y = await this.fetchYahoo(key, true);
        if (y) out[key] = { ...y, source: "yahoo" };
      }
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
    if (this.METAL_LB.includes(sym)) {
      const local = cur === "USD" ? usd : this.convertFromUsd(usd, cur);
      return {
        primary: this.formatAmount(local, cur) + " /lb",
        secondary: "$" + usd.toFixed(2) + " /lb USD",
      };
    }
    if (this.METALS.includes(sym)) {
      const perGram = this.usdPerGram(usd);
      const rate = cur === "USD" ? 1 : this.fxRates[cur] || this.usdInrRate;
      const gramLocal = cur === "USD" ? perGram : perGram * rate;
      return {
        primary: this.formatAmount(gramLocal, cur) + " /g",
        secondary: this.formatUsdSpot(usd) + " /oz spot",
      };
    }
    const converted = cur === "USD" ? usd : this.convertFromUsd(usd, cur);
    return {
      primary: this.formatAmount(converted, cur),
      secondary: cur !== "USD" ? this.formatUsdSpot(usd) + " USD" : "",
    };
  },

  async fetchForex() {
    try {
      const data = await this.fetchJson(
        this.cacheBust("https://api.frankfurter.app/latest?from=USD&to=INR,EUR,GBP")
      );
      const r = data.rates || {};
      return {
        usd_inr: r.INR,
        eur_usd: r.EUR ? 1 / r.EUR : null,
        gbp_usd: r.GBP ? 1 / r.GBP : null,
      };
    } catch (e) {
      return {};
    }
  },

  usdPerGram(usdPerOz) {
    return Number(usdPerOz) / this.TROY_OZ_GRAMS;
  },

  /** Avoid $4,511 reading as $4.511 — plain US$ + rounded dollars */
  formatUsdSpot(usd) {
    const n = Number(usd);
    if (!Number.isFinite(n)) return "—";
    if (n >= 100) return "US$ " + Math.round(n).toString();
    return "US$ " + n.toFixed(2);
  },

  /** Main market fetch — Yahoo + CoinGecko + Frankfurter */
  async fetchMarket(force = false) {
    if (this.isLocalFlask()) {
      try {
        const url = force ? "/api/market?fresh=1" : "/api/market";
        const r = await fetch(this.cacheBust(url), { cache: "no-store" });
        if (r.ok) return await r.json();
      } catch (e) {
        console.warn("[LexorA] Flask /api/market:", e.message);
      }
    }

    const assets = {};
    const stockKeys = ["sp500", "nasdaq", "crude_oil"];
    const [metals, crypto, forex, stocks] = await Promise.all([
      this.fetchMetalsBundle(),
      this.fetchCrypto().catch(() => ({})),
      this.fetchForex().catch(() => ({})),
      Promise.all(stockKeys.map(async (key) => [key, await this.fetchYahoo(key, true)])),
    ]);
    await this.fetchFxRates();

    const putAsset = (key, y, isLive = true) => {
      if (!y || !this.isValidPrice(key, y.price)) return;
      assets[key] = {
        price: y.price,
        change: this.resolveChange(key, y.price, y.change),
        symbol: key.toUpperCase(),
        unit: y.unit || this.assetUnit(key),
        updated: Date.now(),
        live: isLive,
        apiSource: y.source || (isLive ? "live" : "fallback"),
      };
    };

    Object.entries(metals).forEach(([key, y]) => putAsset(key, y, true));

    stocks.forEach(([key, y]) => {
      if (y) putAsset(key, y, true);
    });

    Object.entries(crypto).forEach(([k, v]) => {
      if (!assets[k]) putAsset(k, v, true);
      else if (Math.abs(v.change || 0) >= Math.abs(assets[k].change || 0)) putAsset(k, v, true);
    });

    if (forex.usd_inr) {
      putAsset("usd_inr", { price: forex.usd_inr, change: 0, unit: "rate", source: "frankfurter" }, true);
    }
    if (forex.eur_usd) {
      putAsset("eur_usd", { price: forex.eur_usd, change: 0, unit: "rate", source: "frankfurter" }, true);
    }
    if (forex.gbp_usd) {
      putAsset("gbp_usd", { price: forex.gbp_usd, change: 0, unit: "rate", source: "frankfurter" }, true);
    }

    let liveCount = Object.values(assets).filter((a) => a.live).length;
    Object.keys(this.FALLBACK).forEach((sym) => {
      if (!assets[sym] || !this.isValidPrice(sym, assets[sym].price)) {
        putAsset(
          sym,
          {
            price: this.FALLBACK[sym],
            change: 0,
            unit: this.assetUnit(sym),
            source: "offline-estimate",
          },
          false
        );
      }
    });

    liveCount = Object.values(assets).filter((a) => a.live).length;
    const source = liveCount >= 10 ? "live" : liveCount >= 5 ? "mixed" : "offline";
    return { timestamp: new Date().toISOString(), source, assets, refreshSec: 5, liveCount };
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

  async predict(symbol, market) {
    if (this.isLocalFlask()) {
      try {
        const r = await fetch(this.cacheBust(`/api/predict/${symbol}`));
        const j = await r.json();
        if (j.success) return j.data;
      } catch (e) { /* */ }
    }
    const live = market?.assets?.[symbol];
    const prices = await this.history(symbol, 40);
    let current = prices[prices.length - 1];
    if (live?.price && this.isValidPrice(symbol, live.price)) {
      current = Number(live.price);
      prices[prices.length - 1] = current;
    }
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

  async predictAll(market) {
    if (this.isLocalFlask()) {
      try {
        const r = await fetch(this.cacheBust("/api/predictions/all"));
        const j = await r.json();
        if (j.success) return j.data;
      } catch (e) { /* */ }
    }
    const m = market || (typeof LexoraApp !== "undefined" ? LexoraApp.market : null);
    const syms = [
      "gold", "silver", "platinum", "palladium", "copper",
      "bitcoin", "ethereum", "crude_oil", "sp500", "nasdaq",
      "usd_inr", "eur_usd", "gbp_usd",
    ];
    const out = {};
    for (const s of syms) out[s] = await this.predict(s, m);
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
