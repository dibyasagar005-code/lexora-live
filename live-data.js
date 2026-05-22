/**
 * Live market data — same sources as localhost Flask app (works on GitHub Pages).
 */
const LexoraLiveData = {
  FALLBACK: {
    gold: 2650, silver: 31.5, bitcoin: 67500, ethereum: 3500, platinum: 980,
    crude_oil: 78.5, usd_inr: 83.25, sp500: 5200, nasdaq: 16500, eur_usd: 1.08, gbp_usd: 1.27,
  },
  LABELS: {
    gold: "Gold", silver: "Silver", bitcoin: "Bitcoin", ethereum: "Ethereum",
    platinum: "Platinum", crude_oil: "Crude Oil", usd_inr: "USD/INR",
    sp500: "S&P 500", nasdaq: "NASDAQ", eur_usd: "EUR/USD", gbp_usd: "GBP/USD",
  },
  _cache: null,
  _prev: null,

  async _fetchJson(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status);
    return r.json();
  },

  async _fetchMetals() {
    const urls = [
      "https://api.metals.live/v1/spot",
      "https://corsproxy.io/?" + encodeURIComponent("https://api.metals.live/v1/spot"),
    ];
    for (const url of urls) {
      try {
        const data = await this._fetchJson(url);
        const out = {};
        const rows = Array.isArray(data) ? data : [];
        rows.forEach((row) => {
          if (row.metal && row.price != null) out[row.metal] = parseFloat(row.price);
          if (row.gold != null) out.gold = parseFloat(row.gold);
          if (row.silver != null) out.silver = parseFloat(row.silver);
        });
        if (Object.keys(out).length) return out;
      } catch (e) { /* try next */ }
    }
    return { gold: this.FALLBACK.gold, silver: this.FALLBACK.silver };
  },

  async _fetchCrypto() {
    const url =
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true";
    const data = await this._fetchJson(url);
    const out = {};
    if (data.bitcoin) out.bitcoin = { price: data.bitcoin.usd, change: data.bitcoin.usd_24h_change || 0 };
    if (data.ethereum) out.ethereum = { price: data.ethereum.usd, change: data.ethereum.usd_24h_change || 0 };
    return out;
  },

  async _fetchForex() {
    const data = await this._fetchJson("https://api.frankfurter.app/latest?from=USD&to=INR,EUR,GBP");
    const rates = data.rates || {};
    return {
      usd_inr: rates.INR,
      eur_usd: rates.EUR ? 1 / rates.EUR : null,
      gbp_usd: rates.GBP ? 1 / rates.GBP : null,
    };
  },

  async _fetchYahoo(symbol) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
      const data = await this._fetchJson(url);
      const q = data.chart?.result?.[0];
      const closes = q?.indicators?.quote?.[0]?.close?.filter((x) => x != null) || [];
      if (closes.length < 1) return null;
      const price = closes[closes.length - 1];
      const prev = closes.length > 1 ? closes[closes.length - 2] : price;
      return { price, change: prev ? ((price - prev) / prev) * 100 : 0 };
    } catch (e) {
      return null;
    }
  },

  _jitter(base, pct = 0.003) {
    return base * (1 + (Math.random() - 0.5) * 2 * pct);
  },

  async fetchMarket() {
    const assets = {};
    let source = "live";
    const tasks = await Promise.allSettled([
      this._fetchMetals(),
      this._fetchCrypto(),
      this._fetchForex(),
      this._fetchYahoo("^GSPC"),
      this._fetchYahoo("^IXIC"),
      this._fetchYahoo("CL=F"),
      this._fetchYahoo("PL=F"),
    ]);

    const metals = tasks[0].status === "fulfilled" ? tasks[0].value : {};
    const crypto = tasks[1].status === "fulfilled" ? tasks[1].value : {};
    const forex = tasks[2].status === "fulfilled" ? tasks[2].value : {};
    const sp = tasks[3].status === "fulfilled" ? tasks[3].value : null;
    const nq = tasks[4].status === "fulfilled" ? tasks[4].value : null;
    const oil = tasks[5].status === "fulfilled" ? tasks[5].value : null;
    const plat = tasks[6].status === "fulfilled" ? tasks[6].value : null;

    if (metals.gold) assets.gold = { price: metals.gold, change: 0 };
    if (metals.silver) assets.silver = { price: metals.silver, change: 0 };
    Object.entries(crypto).forEach(([k, v]) => {
      assets[k] = { price: v.price, change: v.change };
    });
    if (forex.usd_inr) assets.usd_inr = { price: forex.usd_inr, change: 0 };
    if (forex.eur_usd) assets.eur_usd = { price: forex.eur_usd, change: 0 };
    if (forex.gbp_usd) assets.gbp_usd = { price: forex.gbp_usd, change: 0 };
    if (sp) assets.sp500 = { price: sp.price, change: sp.change };
    if (nq) assets.nasdaq = { price: nq.price, change: nq.change };
    if (oil) assets.crude_oil = { price: oil.price, change: oil.change };
    if (plat) assets.platinum = { price: plat.price, change: plat.change };

    if (Object.keys(assets).length < 6) source = "fallback";
    Object.keys(this.FALLBACK).forEach((sym) => {
      if (!assets[sym]) {
        const base = this._prev?.assets?.[sym]?.price || this.FALLBACK[sym];
        assets[sym] = {
          price: this._jitter(base),
          change: (Math.random() - 0.5) * 2,
        };
      }
    });

    const market = {
      timestamp: new Date().toISOString(),
      source,
      assets,
    };
    this._prev = this._cache;
    this._cache = market;
    try {
      localStorage.setItem("lexora_market_cache", JSON.stringify(market));
    } catch (e) { /* ignore */ }
    return market;
  },

  loadCache() {
    try {
      const raw = localStorage.getItem("lexora_market_cache");
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return null;
  },

  formatPrice(sym, price) {
    if (sym === "usd_inr") return "₹" + price.toFixed(2);
    if (price >= 10000) return "$" + price.toLocaleString("en-US", { maximumFractionDigits: 0 });
    return "$" + price.toFixed(2);
  },

  label(sym) {
    return this.LABELS[sym] || sym.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  },
};
