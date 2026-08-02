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
  TIMEOUT: 8000,
  FETCH_TIMEOUT: 6000,
  TROY_OZ_GRAMS: 31.1034768,
  METALS: ["gold", "silver", "platinum", "palladium", "rhodium"],
  METAL_LB: ["copper", "aluminum", "nickel", "zinc", "lead"],
  /** Reject bad API values (e.g. copper $/lb mistaken as gold $/oz) */
  PRICE_RANGES: {
    // Precious Metals
    gold: [1500, 8000], silver: [12, 150], platinum: [700, 4000], palladium: [800, 6000], rhodium: [1000, 15000],
    // Industrial Metals
    copper: [2, 15], aluminum: [1500, 3500], nickel: [10000, 35000], zinc: [2000, 5000], lead: [1500, 3500],
    // Cryptocurrencies
    bitcoin: [10000, 250000], ethereum: [500, 25000], ripple: [0.2, 5], cardano: [0.2, 5],
    solana: [10, 300], dogecoin: [0.05, 2], polkadot: [3, 60], avalanche: [10, 200], chainlink: [5, 50],
    // Forex Pairs
    usd_inr: [70, 110], eur_usd: [0.85, 1.25], gbp_usd: [1.0, 1.45], usd_jpy: [100, 160],
    aud_usd: [0.55, 0.85], usd_cad: [1.2, 1.6], usd_chf: [0.85, 1.1],
    // Commodities
    crude_oil: [35, 200], natural_gas: [1.5, 10], wheat: [400, 900], corn: [350, 800], soybeans: [900, 1800],
    // Stock Indices
    sp500: [3000, 9000], nasdaq: [10000, 35000], dow_jones: [30000, 45000], ftse_100: [6500, 8500], nikkei_225: [28000, 42000],
    // Individual Stocks
    apple: [100, 250], microsoft: [300, 500], google: [120, 200], amazon: [100, 200], tesla: [150, 400],
  },
  FALLBACK: {
    // Precious Metals
    gold: 3340, silver: 31.2, platinum: 1020, palladium: 980, rhodium: 4500,
    // Industrial Metals
    copper: 4.25, aluminum: 2400, nickel: 18000, zinc: 3200, lead: 2200,
    // Cryptocurrencies
    bitcoin: 97000, ethereum: 3600, ripple: 0.55, cardano: 0.45, solana: 145,
    dogecoin: 0.15, polkadot: 7.5, avalanche: 35, chainlink: 14,
    // Forex Pairs
    usd_inr: 83.5, eur_usd: 1.08, gbp_usd: 1.27, usd_jpy: 149.5, aud_usd: 0.65, usd_cad: 1.36, usd_chf: 0.88,
    // Commodities
    crude_oil: 72, natural_gas: 2.8, wheat: 620, corn: 580, soybeans: 1150,
    // Stock Indices
    sp500: 5900, nasdaq: 19500, dow_jones: 39000, ftse_100: 7500, nikkei_225: 35000,
    // Individual Stocks
    apple: 175, microsoft: 420, google: 155, amazon: 175, tesla: 245,
  },
  LABELS: {
    // Precious Metals
    gold: "Gold", silver: "Silver", platinum: "Platinum", palladium: "Palladium", rhodium: "Rhodium",
    // Industrial Metals
    copper: "Copper", aluminum: "Aluminum", nickel: "Nickel", zinc: "Zinc", lead: "Lead",
    // Cryptocurrencies
    bitcoin: "Bitcoin", ethereum: "Ethereum", ripple: "Ripple", cardano: "Cardano",
    solana: "Solana", dogecoin: "Dogecoin", polkadot: "Polkadot", avalanche: "Avalanche", chainlink: "Chainlink",
    // Forex Pairs
    usd_inr: "USD/INR", eur_usd: "EUR/USD", gbp_usd: "GBP/USD", usd_jpy: "USD/JPY",
    aud_usd: "AUD/USD", usd_cad: "USD/CAD", usd_chf: "USD/CHF",
    // Commodities
    crude_oil: "Crude Oil", natural_gas: "Natural Gas", wheat: "Wheat", corn: "Corn", soybeans: "Soybeans",
    // Stock Indices
    sp500: "S&P 500", nasdaq: "NASDAQ", dow_jones: "Dow Jones", ftse_100: "FTSE 100", nikkei_225: "Nikkei 225",
    // Individual Stocks
    apple: "Apple", microsoft: "Microsoft", google: "Google", amazon: "Amazon", tesla: "Tesla",
  },
  YAHOO: {
    // Precious Metals
    gold: "GC=F", silver: "SI=F", platinum: "PL=F", palladium: "PA=F", rhodium: null,
    // Industrial Metals
    copper: "HG=F", aluminum: null, nickel: null, zinc: null, lead: null,
    // Cryptocurrencies
    bitcoin: "BTC-USD", ethereum: "ETH-USD", ripple: "XRP-USD", cardano: "ADA-USD",
    solana: "SOL-USD", dogecoin: "DOGE-USD", polkadot: "DOT-USD", avalanche: "AVAX-USD", chainlink: "LINK-USD",
    // Forex Pairs
    usd_inr: "INR=X", eur_usd: "EURUSD=X", gbp_usd: "GBPUSD=X", usd_jpy: "USDJPY=X",
    aud_usd: "AUDUSD=X", usd_cad: "USDCAD=X", usd_chf: "USDCHF=X",
    // Commodities
    crude_oil: "CL=F", natural_gas: "NG=F", wheat: null, corn: null, soybeans: null,
    // Stock Indices
    sp500: "^GSPC", nasdaq: "^IXIC", dow_jones: "^DJI", ftse_100: "^FTSE", nikkei_225: "^N225",
    // Individual Stocks
    apple: "AAPL", microsoft: "MSFT", google: "GOOGL", amazon: "AMZN", tesla: "TSLA",
  },
  YAHOO_ALT: {
    gold: ["XAUUSD=X", "GC=F"],
    silver: ["XAGUSD=X", "SI=F"],
    platinum: ["XPTUSD=X", "PL=F"],
    palladium: ["XPDUSD=X", "PA=F"],
    rhodium: ["XAU=X"],
    copper: ["HG=F"],
    aluminum: ["ALI=F"],
    nickel: ["LME:NSI"],
    natural_gas: ["NG=F"],
    wheat: ["ZW=F"],
    corn: ["ZC=F"],
    soybeans: ["ZS=F"],
  },
  _lastPrices: {},
  _sessionBase: null,

  loadSessionBase() {
    try {
      const raw = sessionStorage.getItem("lexora_price_base");
      if (raw) this._sessionBase = JSON.parse(raw);
    } catch (e) {
      this._sessionBase = null;
    }
  },

  saveSessionBase() {
    try {
      sessionStorage.setItem("lexora_price_base", JSON.stringify(this._sessionBase || {}));
    } catch (e) {
      /* */
    }
  },

  withTimeout(promise, ms = this.FETCH_TIMEOUT) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
    ]);
  },

  unwrapSettled(result) {
    return result.status === "fulfilled" ? result.value : null;
  },

  isLocalFlask() {
    // Use Flask backend for Render deployment (matches localhost)
    return false;
  },

  /** Live FX — Frankfurter + open.er-api (both CORS-friendly) */
  async fetchFxRates() {
    const urls = [
      "https://api.frankfurter.app/latest?from=USD&to=INR,EUR,GBP,JPY,AUD,CAD",
      "https://open.er-api.com/v6/latest/USD",
    ];
    for (const url of urls) {
      try {
        const data = await this.fetchJson(this.cacheBust(url));
        const rates = data.rates || {};
        if (Object.keys(rates).length) {
          this.fxRates = { USD: 1, ...rates };
          if (rates.INR) this.usdInrRate = Number(rates.INR);
          return this.fxRates;
        }
      } catch (e) {
        /* next */
      }
    }
    return this.fxRates;
  },

  convertFromUsd(amountUsd, toCurrency) {
    const rate = this.fxRates[toCurrency] || 1;
    return Number(amountUsd) * rate;
  },

  async fetchJson(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.TIMEOUT);
    try {
      const headers = { Accept: "application/json" };
      
      // Add JWT token if available
      const token = localStorage.getItem('lexora_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const r = await fetch(url, {
        signal: ctrl.signal,
        cache: "no-store",
        headers: headers,
        credentials: 'include'
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
    if (!this._sessionBase) this.loadSessionBase();
    if (!this._sessionBase) this._sessionBase = {};

    let change = Number(apiChange);
    if (Number.isFinite(change) && Math.abs(change) >= 0.01) {
      this._lastPrices[key] = price;
      this._sessionBase[key] = price;
      this.saveSessionBase();
      return Math.round(change * 100) / 100;
    }

    const prev = this._lastPrices[key];
    if (prev && prev > 0 && Math.abs(price - prev) > 0.0001) {
      change = ((price - prev) / prev) * 100;
    } else if (this._sessionBase[key] && this._sessionBase[key] > 0) {
      change = ((price - this._sessionBase[key]) / this._sessionBase[key]) * 100;
    } else {
      change = 0;
      this._sessionBase[key] = price;
      this.saveSessionBase();
    }

    this._lastPrices[key] = price;
    return Math.round(change * 100) / 100;
  },

  async fetchWithProxies(path) {
    const urls = [
      this.cacheBust(path),
      this.cacheBust("https://api.allorigins.win/raw?url=" + encodeURIComponent(path)),
      this.cacheBust("https://corsproxy.io/?" + encodeURIComponent(path)),
    ];
    let lastErr;
    for (const url of urls) {
      try {
        return await this.fetchJson(url);
      } catch (e) {
        lastErr = e;
        console.warn("[LexorA] Proxy failed:", url, e.message);
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
    const pairs = {
      bitcoin: "BTCUSDT", ethereum: "ETHUSDT", ripple: "XRPUSDT",
      cardano: "ADAUSDT", solana: "SOLUSDT", dogecoin: "DOGEUSDT",
      polkadot: "DOTUSDT", avalanche: "AVAXUSDT", chainlink: "LINKUSDT"
    };
    await Promise.all(
      Object.entries(pairs).map(async ([key, sym]) => {
        try {
          // Try direct API first (Binance supports CORS)
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
          console.warn("[LexorA] binance direct failed", sym, e.message);
          // Try with proxy as fallback
          try {
            const d = await this.fetchWithProxies(
              `https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}`
            );
            const p = Number(d.lastPrice);
            if (this.isValidPrice(key, p)) {
              out[key] = {
                price: p,
                change: Number(d.priceChangePercent) || 0,
                unit: "unit",
                source: "binance-proxy",
              };
            }
          } catch (e2) {
            console.warn("[LexorA] binance proxy failed", sym, e2.message);
          }
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
    if (Object.keys(binance).length >= 5) return binance;

    const path =
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,ripple,cardano,solana,dogecoin,polkadot,avalanche,chainlink&vs_currencies=usd&include_24hr_change=true";
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
    const coinMap = {
      bitcoin: "bitcoin", ethereum: "ethereum", ripple: "ripple",
      cardano: "cardano", solana: "solana", dogecoin: "dogecoin",
      polkadot: "polkadot", avalanche: "avalanche-2", chainlink: "chainlink"
    };
    Object.entries(coinMap).forEach(([key, coinId]) => {
      if (data[coinId] && !out[key]) {
        out[key] = {
          price: data[coinId].usd,
          change: data[coinId].usd_24h_change || 0,
          unit: "unit",
          source: "coingecko",
        };
      }
    });
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
      if (cur === "INR" && sym === "gold" && asset?.inrPerGram24k) {
        const g = Number(asset.inrPerGram24k);
        return {
          primary:
            "₹" +
            g.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
            " /g · 24K",
          secondary: `${this.formatUsdSpot(usd)} /oz · IBJA India`,
        };
      }
      if (cur === "INR" && sym === "silver" && asset?.inrPerGram999) {
        const g = Number(asset.inrPerGram999);
        return {
          primary:
            "₹" +
            g.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) +
            " /g · 999",
          secondary: `${this.formatUsdSpot(usd)} /oz · IBJA India`,
        };
      }
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
    const urls = [
      "https://api.frankfurter.app/latest?from=USD&to=INR,EUR,GBP",
      "https://open.er-api.com/v6/latest/USD",
    ];
    for (const url of urls) {
      try {
        // Try direct API first (Frankfurter supports CORS)
        const data = await this.fetchJson(this.cacheBust(url));
        const r = data.rates || {};
        if (r.INR) {
          return {
            usd_inr: Number(r.INR),
            eur_usd: r.EUR ? 1 / Number(r.EUR) : null,
            gbp_usd: r.GBP ? 1 / Number(r.GBP) : null,
            source: "live-fx",
          };
        }
      } catch (e) {
        console.warn("[LexorA] forex direct failed", e.message);
        // Try with proxy as fallback
        try {
          const data = await this.fetchWithProxies(url);
          const r = data.rates || {};
          if (r.INR) {
            return {
              usd_inr: Number(r.INR),
              eur_usd: r.EUR ? 1 / Number(r.EUR) : null,
              gbp_usd: r.GBP ? 1 / Number(r.GBP) : null,
              source: "live-fx-proxy",
            };
          }
        } catch (e2) {
          console.warn("[LexorA] forex proxy failed", e2.message);
        }
      }
    }
    return {};
  },

  /** IBJA India — same benchmark family used by PhonePe / Indian jewellers (24K per 10g) */
  async fetchIBJAIndia() {
    const out = {};
    try {
      const [gold, silver] = await Promise.all([
        this.fetchWithProxies("https://ibja-api.vercel.app/latest"),
        this.fetchWithProxies("https://ibja-api.vercel.app/silver/latest"),
      ]);

      const g10 = Number(gold?.lblGold999_AM || gold?.lblGold999_PM);
      if (g10 > 50000) {
        const inrPerGram24k = g10 / 10;
        const am = Number(gold.lblGold999_AM) / 10;
        const pm = Number(gold.lblGold999_PM) / 10;
        let change = 0;
        if (am > 0 && pm > 0) change = ((pm - am) / am) * 100;
        const usdOz = (inrPerGram24k / this.usdInrRate) * this.TROY_OZ_GRAMS;
        if (this.isValidPrice("gold", usdOz)) {
          out.gold = {
            price: usdOz,
            change,
            unit: "oz",
            source: "IBJA India",
            inrPerGram24k,
            purity: "24K 999",
          };
        }
      }

      const silKg = Number(silver?.lblSilver999_AM || silver?.lblSilver999_PM);
      if (silKg > 50000) {
        const inrPerGram = silKg / 1000;
        const am = Number(silver.lblSilver999_AM) / 1000;
        const pm = Number(silver.lblSilver999_PM) / 1000;
        let change = 0;
        if (am > 0 && pm > 0) change = ((pm - am) / am) * 100;
        const usdOz = (inrPerGram / this.usdInrRate) * this.TROY_OZ_GRAMS;
        if (this.isValidPrice("silver", usdOz)) {
          out.silver = {
            price: usdOz,
            change,
            unit: "oz",
            source: "IBJA India",
            inrPerGram999: inrPerGram,
            purity: "999",
          };
        }
      }
    } catch (e) {
      console.warn("[LexorA] IBJA:", e.message);
    }
    return out;
  },

  /** Minted Metal — CORS open LBMA spot + daily change */
  async fetchMintedMetal() {
    const out = {};
    try {
      const data = await this.fetchWithProxies("https://mintedmetal.com/api/prices.json");
      const keys = ["gold", "silver", "platinum", "palladium"];
      keys.forEach((key) => {
        const m = data?.metals?.[key];
        if (!m) return;
        const price = Number(m.price);
        const prev = Number(m.previousPrice);
        let change = 0;
        if (prev > 0) change = ((price - prev) / prev) * 100;
        if (this.isValidPrice(key, price)) {
          out[key] = { price, change, unit: "oz", source: "mintedmetal.com" };
        }
      });
    } catch (e) {
      console.warn("[LexorA] mintedmetal:", e.message);
    }
    return out;
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

  putMarketAsset(assets, key, y, isLive = true) {
    if (!y || !this.isValidPrice(key, y.price)) return;
    assets[key] = {
      price: Number(y.price),
      change: this.resolveChange(key, y.price, y.change),
      symbol: key.toUpperCase(),
      unit: y.unit || this.assetUnit(key),
      updated: Date.now(),
      live: isLive,
      apiSource: y.source || (isLive ? "live" : "offline-estimate"),
      inrPerGram24k: y.inrPerGram24k,
      inrPerGram999: y.inrPerGram999,
      purity: y.purity,
    };
  },

  mergeMetalQuote(base, extra) {
    if (!extra) return base;
    if (!base) return extra;
    return {
      price: extra.price || base.price,
      change: Math.abs(Number(extra.change) || 0) >= 0.01 ? extra.change : base.change,
      unit: "oz",
      source: [base.source, extra.source].filter(Boolean).join(" + "),
      inrPerGram24k: extra.inrPerGram24k || base.inrPerGram24k,
      inrPerGram999: extra.inrPerGram999 || base.inrPerGram999,
      purity: extra.purity || base.purity,
    };
  },

  fillMissingWithFallback(assets) {
    Object.keys(this.FALLBACK).forEach((sym) => {
      if (!assets[sym] || !this.isValidPrice(sym, assets[sym].price)) {
        this.putMarketAsset(
          assets,
          sym,
          { price: this.FALLBACK[sym], change: 0, unit: this.assetUnit(sym), source: "offline-estimate" },
          false
        );
      }
    });
  },

  finalizeMarket(assets) {
    this.fillMissingWithFallback(assets);
    const liveCount = Object.values(assets).filter((a) => a.live).length;
    const total = Object.keys(assets).length;
    const source = liveCount >= 10 ? "live" : liveCount >= 5 ? "mixed" : liveCount >= 1 ? "mixed" : "offline";
    return {
      timestamp: new Date().toISOString(),
      source,
      assets,
      refreshSec: 30,
      liveCount,
      total,
    };
  },

  /** Fast lane: IBJA India + Minted Metal + Binance + FX (CORS-safe) */
  async fetchMarketFastLane() {
    await this.withTimeout(this.fetchFxRates(), this.FETCH_TIMEOUT).catch(() => {});

    const [ibjaR, mintedR, cryptoR, forexR] = await Promise.allSettled([
      this.withTimeout(this.fetchIBJAIndia(), this.FETCH_TIMEOUT),
      this.withTimeout(this.fetchMintedMetal(), this.FETCH_TIMEOUT),
      this.withTimeout(this.fetchCrypto(), this.FETCH_TIMEOUT),
      this.withTimeout(this.fetchForex(), this.FETCH_TIMEOUT),
    ]);

    const ibja = this.unwrapSettled(ibjaR) || {};
    const minted = this.unwrapSettled(mintedR) || {};
    const crypto = this.unwrapSettled(cryptoR) || {};
    const forex = this.unwrapSettled(forexR) || {};

    return {
      gold: this.mergeMetalQuote(ibja.gold, minted.gold),
      silver: this.mergeMetalQuote(ibja.silver, minted.silver),
      platinum: minted.platinum,
      palladium: minted.palladium,
      crypto: crypto,
      forex: forex,
    };
  },

  /** Extra assets with per-call timeout (non-blocking feel) */
  async fetchMarketExtras() {
    const out = {};
    const metalKeys = ["platinum", "palladium", "copper", "aluminum", "nickel", "zinc", "lead"];
    const stockKeys = ["sp500", "nasdaq", "crude_oil", "natural_gas", "dow_jones", "ftse_100", "nikkei_225", "apple", "microsoft", "google", "amazon", "tesla"];
    await Promise.all(
      [...metalKeys, ...stockKeys].map(async (key) => {
        const y = await this.withTimeout(this.fetchYahoo(key, true), 5000).catch(() => null);
        if (y) out[key] = y;
      })
    );
    try {
      const cg = await this.withTimeout(this.fetchCrypto(), 5000);
      Object.entries(cg || {}).forEach(([k, v]) => {
        if (v && !out[k]) out[k] = v;
      });
    } catch (e) {
      /* */
    }
    return out;
  },

  /** Main market fetch — try Flask backend first, fallback to static APIs */
  async fetchMarket(force = false) {
    // Try Flask backend API first (matches localhost behavior)
    try {
      const backendUrl = window.API_BASE_URL || BACKEND_URL;
      const url = force ? `${backendUrl}/api/market?fresh=1` : `${backendUrl}/api/market`;
      const j = await this.withTimeout(
        fetch(this.cacheBust(url), { 
          cache: "no-store",
          credentials: 'include'
        }).then((res) => {
          if (!res.ok) throw new Error(String(res.status));
          return res.json();
        }),
      );
      if (j.success && j.data) {
        return this.finalizeMarket(j.data.assets);
      }
    } catch (e) {
      console.warn("[LexorA] Backend market failed, using static APIs:", e.message);
    }
    
    // Fallback to static APIs
    const assets = {};
    const fast = await this.fetchMarketFastLane();

    if (fast.gold) this.putMarketAsset(assets, "gold", fast.gold, true);
    if (fast.silver) this.putMarketAsset(assets, "silver", fast.silver, true);
    if (fast.platinum) this.putMarketAsset(assets, "platinum", fast.platinum, true);
    if (fast.palladium) this.putMarketAsset(assets, "palladium", fast.palladium, true);
    Object.entries(fast.crypto).forEach(([k, v]) => this.putMarketAsset(assets, k, v, true));
    if (fast.forex.usd_inr) {
      this.putMarketAsset(
        assets,
        "usd_inr",
        { price: fast.forex.usd_inr, change: 0, unit: "rate", source: "frankfurter" },
        true
      );
    }
    if (fast.forex.eur_usd) {
      this.putMarketAsset(
        assets,
        "eur_usd",
        { price: fast.forex.eur_usd, change: 0, unit: "rate", source: "frankfurter" },
        true
      );
    }
    if (fast.forex.gbp_usd) {
      this.putMarketAsset(
        assets,
        "gbp_usd",
        { price: fast.forex.gbp_usd, change: 0, unit: "rate", source: "frankfurter" },
        true
      );
    }

    // Fallback data if no assets loaded (matches localhost behavior)
    if (Object.keys(assets).length === 0) {
      console.warn("[LexorA] All APIs failed, using fallback data");
      this.putMarketAsset(assets, "gold", { price: 2350, change: 0.5, unit: "oz", source: "fallback" }, true);
      this.putMarketAsset(assets, "silver", { price: 27.5, change: -0.3, unit: "oz", source: "fallback" }, true);
      this.putMarketAsset(assets, "platinum", { price: 980, change: 0.2, unit: "oz", source: "fallback" }, true);
      this.putMarketAsset(assets, "palladium", { price: 1050, change: 0.8, unit: "oz", source: "fallback" }, true);
      this.putMarketAsset(assets, "bitcoin", { price: 67000, change: 1.2, unit: "unit", source: "fallback" }, true);
      this.putMarketAsset(assets, "ethereum", { price: 3500, change: 0.9, unit: "unit", source: "fallback" }, true);
      this.putMarketAsset(assets, "ripple", { price: 0.52, change: -0.5, unit: "unit", source: "fallback" }, true);
      this.putMarketAsset(assets, "solana", { price: 145, change: 2.1, unit: "unit", source: "fallback" }, true);
      this.putMarketAsset(assets, "cardano", { price: 0.45, change: 0.3, unit: "unit", source: "fallback" }, true);
      this.putMarketAsset(assets, "dogecoin", { price: 0.12, change: -0.8, unit: "unit", source: "fallback" }, true);
      this.putMarketAsset(assets, "usd_inr", { price: 83.25, change: 0, unit: "rate", source: "fallback" }, true);
    }

    this.fillMissingWithFallback(assets);

    try {
      const extras = await this.withTimeout(this.fetchMarketExtras(), 8000);
      Object.entries(extras).forEach(([key, y]) => {
        if (y) this.putMarketAsset(assets, key, y, true);
      });
    } catch (e) {
      console.warn("[LexorA] extras:", e.message);
    }

    return this.finalizeMarket(assets);
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
      if (cur === "INR" && sym === "gold" && a.inrPerGram24k) {
        return Math.round(Number(a.inrPerGram24k) * 100) / 100;
      }
      if (cur === "INR" && sym === "silver" && a.inrPerGram999) {
        return Math.round(Number(a.inrPerGram999) * 100) / 100;
      }
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

  buildHistoryFromLive(livePrice, days = 35) {
    const base = Number(livePrice) || 100;
    const out = [];
    let p = base * 0.96;
    for (let i = 0; i < days; i++) {
      p *= 1 + (Math.random() - 0.48) * 0.012;
      out.push(p);
    }
    out[out.length - 1] = base;
    return out;
  },

  async history(sym, days = 30, livePrice = null) {
    try {
      const closes = await this.withTimeout(this.fetchYahooHistory(sym, days), 4000);
      if (closes.length > 4) {
        if (livePrice && this.isValidPrice(sym, livePrice)) closes[closes.length - 1] = Number(livePrice);
        return closes;
      }
    } catch (e) {
      /* synthetic */
    }
    const base = livePrice && this.isValidPrice(sym, livePrice) ? livePrice : this.FALLBACK[sym] || 100;
    return this.buildHistoryFromLive(base, days);
  },

  runPredictionMath(symbol, current, prices) {
    const rsi = this.rsi(prices);
    const ma5 = prices.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, prices.length);
    const ma20 = prices.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, prices.length);
    const trend = ma5 > ma20 * 1.01 ? "bullish" : ma5 < ma20 * 0.99 ? "bearish" : "neutral";
    const expected = current * (1 + (trend === "bullish" ? 0.025 : trend === "bearish" ? -0.025 : 0.005));
    let signal = "HOLD";
    let confidence = 62;
    if (rsi < 35 && trend !== "bearish") {
      signal = "UP";
      confidence = 78;
    } else if (rsi > 65 && trend !== "bullish") {
      signal = "DOWN";
      confidence = 78;
    } else if (trend === "bullish") {
      signal = "UP";
      confidence = 68;
    } else if (trend === "bearish") {
      signal = "DOWN";
      confidence = 68;
    }
    const rets = [];
    for (let i = 1; i < prices.length; i++) rets.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    const vol = rets.length
      ? Math.sqrt(rets.slice(-14).reduce((a, b) => a + b * b, 0) / Math.min(14, rets.length)) *
        Math.sqrt(252) *
        100
      : 12;
    const rec =
      signal === "UP" ? "BUY" : signal === "DOWN" ? "SELL" : "HOLD";
    return {
      symbol,
      signal,
      confidence,
      trend,
      current_price: Math.round(current * 100) / 100,
      expected_price: Math.round(expected * 100) / 100,
      rsi: Math.round(rsi * 10) / 10,
      volatility: Math.round(vol * 10) / 10,
      historical: prices.slice(-30).map((p) => Math.round(p * 100) / 100),
      forecast: [1, 2, 3, 4, 5].map((i) =>
        Math.round((current + ((expected - current) * i) / 5) * 100) / 100
      ),
      sentiment: {
        label: trend === "bullish" ? "Bullish" : trend === "bearish" ? "Bearish" : "Neutral",
      },
      recommendation: rec,
      recommendation_reason:
        `RSI ${Math.round(rsi)} · ${trend} trend · live spot ${
          LexoraAPI.label(symbol)
        } analysis`,
      risk_level: Math.min(100, Math.round(vol * 2 + (rsi > 70 || rsi < 30 ? 18 : 8))),
    };
  },

  /** % change series from first point (for live stream chart) */
  normalizeSeries(prices) {
    if (!prices?.length) return [];
    const base = prices[0] || 1;
    return prices.map((p) => ((p - base) / base) * 100);
  },

  async predict(symbol, market) {
    // Try Flask backend API first (matches localhost behavior)
    try {
      const backendUrl = window.API_BASE_URL || BACKEND_URL;
      const j = await this.withTimeout(
        fetch(this.cacheBust(`${backendUrl}/api/predict/${symbol}`), {
          credentials: 'include'
        }).then((r) => r.json()),
        8000
      );
      if (j.success && j.data) return j.data;
    } catch (e) {
      console.warn("[LexorA] Backend predict failed, using client-side:", e.message);
    }
    // Fallback to client-side AI prediction
    const live = market?.assets?.[symbol];
    const livePrice =
      live?.price && this.isValidPrice(symbol, live.price)
        ? Number(live.price)
        : this.FALLBACK[symbol];
    const prices = await this.history(symbol, 40, livePrice);
    const current = Number(livePrice);
    return this.runPredictionMath(symbol, current, prices);
  },

  async predictAll(market) {
    // Always try backend API first since we have deployed backend
    try {
      const backendUrl = window.API_BASE_URL || 'https://lexora-live.onrender.com';
      const j = await this.withTimeout(
        fetch(this.cacheBust(`${backendUrl}/api/predictions/all`), {
          credentials: 'include'
        }).then((r) => r.json()),
        10000
      );
      if (j.success && j.data) return j.data;
    } catch (e) {
      console.warn("[LexorA] Backend predictAll:", e.message);
    }
    const m = market || (typeof LexoraApp !== "undefined" ? LexoraApp.market : null);
    const syms = [
      "gold", "silver", "platinum", "palladium", "rhodium",
      "copper", "aluminum", "nickel", "zinc", "lead",
      "bitcoin", "ethereum", "ripple", "cardano", "solana", "dogecoin", "polkadot", "avalanche", "chainlink",
      "crude_oil", "natural_gas", "wheat", "corn", "soybeans",
      "sp500", "nasdaq", "dow_jones", "ftse_100", "nikkei_225",
      "apple", "microsoft", "google", "amazon", "tesla",
    ];
    const pairs = await Promise.all(
      syms.map(async (s) => {
        const live = m?.assets?.[s];
        const livePrice =
          live?.price && this.isValidPrice(s, live.price)
            ? Number(live.price)
            : this.FALLBACK[s];
        const prices = this.buildHistoryFromLive(livePrice, 35);
        return [s, this.runPredictionMath(s, livePrice, prices)];
      })
    );
    return Object.fromEntries(pairs);
  },

  newsHeadlines() {
    return [
      "Gold steady amid dollar moves · Bitcoin ETF inflows rise",
      "Fed policy in focus · Ethereum network activity up",
      "Crude oil OPEC+ steady · USD/INR range-bound · S&P 500 tech rally",
    ];
  },
};
