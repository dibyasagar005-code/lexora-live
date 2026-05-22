/**
 * LexorA Browser — works on GitHub Pages AND connects to local Flask when running.
 * Local server: http://127.0.0.1:5000 (python lexora_browser.py)
 */
(function () {
  const LOCAL = "http://127.0.0.1:5000";
  const OZ = 31.1034768;
  const METALS = {
    gold: { label: "Gold", emoji: "💰", color: "#ffd700" },
    silver: { label: "Silver", emoji: "🪙", color: "#c0c0c0" },
    platinum: { label: "Platinum", emoji: "⚪", color: "#e5e4e2" },
    palladium: { label: "Palladium", emoji: "🔘", color: "#b4c7dc" },
    copper: { label: "Copper", emoji: "🟤", color: "#b87333" },
    aluminum: { label: "Aluminum", emoji: "📦", color: "#a8b4c4" },
  };
  const FALLBACK_OZ = {
    gold: 2650, silver: 31, platinum: 980, palladium: 1050, copper: 4.2, aluminum: 1.05,
  };

  const VIEWS = {
    home: { title: "Home", url: "lexora://home" },
    markets: { title: "Markets", url: "lexora://markets" },
    dashboard: { title: "Dashboard", url: "lexora://dashboard" },
    watchlist: { title: "Watchlist", url: "lexora://watchlist" },
    calculator: { title: "Calculator", url: "lexora://calculator" },
    history: { title: "History", url: "lexora://history" },
    settings: { title: "Settings", url: "lexora://settings" },
  };

  let useLocal = false;
  const userName = localStorage.getItem("lexora_user") || "Guest";

  const S = {
    prices: {}, usdOz: {}, usdInr: null, prev: {},
    tabs: [{ id: 1, view: "home", title: "Home" }],
    tabId: 1, nextId: 2, stack: ["home"], idx: 0,
    timer: null, highlight: true, hist: [],
  };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  function inr(n) {
    return n == null || isNaN(n) ? "—" : "₹ " + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }
  function usd(n) {
    return n == null || isNaN(n) ? "—" : "$ " + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  function time() { return new Date().toLocaleTimeString("en-IN"); }
  function toGram(usdOz, rate) {
    return usdOz == null || rate == null ? null : (usdOz * rate) / OZ;
  }

  async function detectLocal() {
    try {
      const r = await fetch(LOCAL + "/api/state", { credentials: "include", mode: "cors" });
      if (r.ok) {
        useLocal = true;
        showMode("Local server · " + LOCAL);
        return true;
      }
    } catch (e) { /* not running */ }
    useLocal = false;
    showMode("Cloud · " + location.hostname);
    return false;
  }

  function showMode(text) {
    let el = $("#connectionMode");
    if (!el) {
      el = document.createElement("div");
      el.id = "connectionMode";
      el.style.cssText = "font-size:11px;color:#22d3ee;padding:4px 12px;text-align:center";
      $(".statusbar")?.prepend(el);
    }
    el.textContent = text;
  }

  async function fetchCloudPrices() {
    let usdInr = 83.5;
    try {
      const r = await fetch("https://api.frankfurter.app/latest?from=USD&to=INR");
      const j = await r.json();
      usdInr = j.rates.INR;
    } catch (e) { /* fallback */ }

    let spot = { ...FALLBACK_OZ };
    try {
      const r = await fetch("https://api.metals.live/v1/spot");
      const data = await r.json();
      if (Array.isArray(data)) {
        data.forEach((row) => {
          if (row.metal && row.price != null) spot[row.metal] = row.price;
        });
      }
    } catch (e) { /* fallback */ }

    const prices = {};
    Object.keys(METALS).forEach((k) => {
      prices[k] = toGram(spot[k], usdInr);
    });
    return { usd_inr: usdInr, usd_oz: spot, prices, offline: false, error: null };
  }

  async function apiGet(path) {
    if (useLocal) {
      return fetch(LOCAL + path, { credentials: "include", mode: "cors" });
    }
    return null;
  }

  async function apiPost(path, body) {
    if (useLocal) {
      return fetch(LOCAL + path, {
        method: "POST",
        credentials: "include",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    return null;
  }

  function pClass(m) {
    if (!S.highlight) return "price";
    const c = S.prices[m], p = S.prev[m];
    if (p == null) return "price";
    if (c > p) return "price flash-up";
    if (c < p) return "price flash-down";
    return "price";
  }

  function card(key) {
    const m = METALS[key];
    return `<div class="box"><h2>${m.emoji} ${m.label}</h2>
      <div class="${pClass(key)}">${inr(S.prices[key])} / gram</div>
      <p class="meta">${usd(S.usdOz[key])} / oz</p></div>`;
  }

  function render() {
    const keys = Object.keys(METALS);
    $("#homeCards").innerHTML = keys.slice(0, 4).map(card).join("");
    $("#marketGrid").innerHTML = keys.map(card).join("");
    const g = S.prices.gold, s = S.prices.silver;
    const ratio = g && s ? (g / s).toFixed(1) : "—";
    $("#detailPanel").innerHTML = `
      <h3 style="color:#00ffff;margin-bottom:12px">Details</h3>
      <div class="detail-row"><span>USD/INR</span><span>${S.usdInr?.toFixed(2) ?? "—"}</span></div>
      <div class="detail-row"><span>Gold/Silver</span><span>${ratio}x</span></div>
      <div class="detail-row"><span>10g Gold</span><span>${inr(g * 10)}</span></div>
      <div class="detail-row"><span>100g Silver</span><span>${inr(s * 100)}</span></div>`;
    $("#dashStats").innerHTML = keys.map((k) =>
      `<div class="stat-tile"><div class="label">${METALS[k].label}</div>
       <div class="value">${inr(S.prices[k])}</div></div>`).join("") +
      `<div class="stat-tile"><div class="label">USD/INR</div>
       <div class="value">${S.usdInr?.toFixed(2) ?? "—"}</div></div>`;
    $("#usdInrRate").textContent = S.usdInr ? "₹ " + S.usdInr.toFixed(2) : "—";
    $("#watchlistBody").innerHTML = keys.map((k) =>
      `<tr><td>${METALS[k].emoji} ${METALS[k].label}</td>
       <td>${inr(S.prices[k])}</td><td>${usd(S.usdOz[k])}</td><td>${time()}</td></tr>`).join("");
    drawCompare();
  }

  async function loadHistory() {
    const metal = $("#histMetal").value;
    let rows = [];
    const r = await apiGet("/api/history?metal=" + metal + "&limit=50");
    if (r && r.ok) rows = await r.json();
    else {
      rows = JSON.parse(localStorage.getItem("lexora_hist_" + metal) || "[]");
    }
    S.hist = rows;
    $("#historyLog").innerHTML = rows.slice().reverse().slice(0, 15).map((h) =>
      `<div>${h.recorded_at || h.t} — ${inr(h.inr_per_gram ?? h.inr)}</div>`
    ).join("") || "<div>No history yet</div>";
    drawHistoryChart();
  }

  function drawCompare() {
    const c = $("#chartCompare");
    if (!c) return;
    const ctx = c.getContext("2d");
    const w = (c.width = c.offsetWidth || 500);
    const h = c.height;
    ctx.clearRect(0, 0, w, h);
    const keys = ["gold", "silver", "platinum", "copper"];
    const vals = keys.map((k) => S.prices[k] || 0);
    const max = Math.max(...vals, 1) * 1.2;
    const by = h - 30;
    const bw = 50, gap = 20;
    keys.forEach((k, i) => {
      const barH = (vals[i] / max) * (h - 50);
      ctx.fillStyle = METALS[k].color;
      ctx.fillRect(40 + i * (bw + gap), by - barH, bw, barH);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px Segoe UI";
      ctx.fillText(k.slice(0, 3), 45 + i * (bw + gap), h - 8);
    });
  }

  function drawHistoryChart() {
    const c = $("#chartHistory");
    if (!c || S.hist.length < 2) return;
    const ctx = c.getContext("2d");
    const w = (c.width = c.offsetWidth || 500);
    const h = c.height;
    ctx.clearRect(0, 0, w, h);
    const pts = S.hist.map((p) => ({ v: p.inr_per_gram ?? p.inr }));
    const mx = Math.max(...pts.map((p) => p.v));
    const mn = Math.min(...pts.map((p) => p.v));
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = 30 + (i / (pts.length - 1)) * (w - 60);
      const y = h - 25 - ((p.v - mn) / (mx - mn || 1)) * (h - 50);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  }

  function saveLocalHistory() {
    Object.keys(METALS).forEach((metal) => {
      const key = "lexora_hist_" + metal;
      let arr = JSON.parse(localStorage.getItem(key) || "[]");
      arr.push({
        inr: S.prices[metal],
        inr_per_gram: S.prices[metal],
        usd_per_oz: S.usdOz[metal],
        recorded_at: new Date().toISOString(),
        t: time(),
      });
      if (arr.length > 100) arr = arr.slice(-100);
      localStorage.setItem(key, JSON.stringify(arr));
    });
  }

  async function refresh() {
    $("#statusLeft").textContent = "Loading...";
    try {
      let d;
      const r = await apiGet("/api/state");
      if (r && r.ok) d = await r.json();
      else d = await fetchCloudPrices();

      Object.keys(METALS).forEach((k) => { S.prev[k] = S.prices[k]; });
      S.prices = d.prices || {};
      S.usdOz = d.usd_oz || {};
      S.usdInr = d.usd_inr;
      if (!useLocal) saveLocalHistory();

      const st = $("#marketStatus");
      const badge = $("#liveBadge");
      if (d.offline) {
        st.textContent = "Offline: " + (d.error || "API error");
        st.className = "status-line error";
        badge.textContent = "OFFLINE";
        badge.classList.add("offline");
      } else {
        st.textContent = "Live · " + time();
        st.className = "status-line ok";
        badge.textContent = "LIVE";
        badge.classList.remove("offline");
        $("#statusLeft").textContent = useLocal ? "Local + DB" : "Cloud";
      }
      $("#statusRight").textContent = "Last update: " + time();
      render();
      if ($("#view-history")?.classList.contains("active")) loadHistory();
    } catch (e) {
      $("#statusLeft").textContent = "Error: " + e.message;
    }
  }

  function go(view, hist) {
    if (!VIEWS[view]) return;
    if (hist !== false) {
      S.stack = S.stack.slice(0, S.idx + 1);
      S.stack.push(view);
      S.idx = S.stack.length - 1;
    }
    $$(".view").forEach((v) => v.classList.remove("active"));
    $$(".nav-item").forEach((n) => n.classList.remove("active"));
    $("#view-" + view).classList.add("active");
    const nav = document.querySelector('[data-view="' + view + '"]');
    if (nav) nav.classList.add("active");
    const tab = S.tabs.find((t) => t.id === S.tabId);
    if (tab) { tab.view = view; tab.title = VIEWS[view].title; }
    $("#addressBar").value = VIEWS[view].url;
    document.title = VIEWS[view].title + " — LexorA";
    apiPost("/api/log_view", { view });
    renderTabs();
    $("#btnBack").disabled = S.idx <= 0;
    $("#btnForward").disabled = S.idx >= S.stack.length - 1;
    if (view === "history") loadHistory();
  }

  function renderTabs() {
    const bar = $("#tabbar");
    bar.innerHTML = "";
    S.tabs.forEach((tab) => {
      const el = document.createElement("div");
      el.className = "tab" + (tab.id === S.tabId ? " active" : "");
      el.innerHTML = tab.title + ' <button class="tab-close">×</button>';
      el.onclick = (e) => {
        if (e.target.classList.contains("tab-close")) { closeTab(tab.id); return; }
        S.tabId = tab.id;
        go(tab.view, false);
      };
      bar.appendChild(el);
    });
    const add = document.createElement("button");
    add.className = "tab-add";
    add.textContent = "+";
    add.onclick = () => {
      const t = { id: S.nextId++, view: "home", title: "Home" };
      S.tabs.push(t);
      S.tabId = t.id;
      go("home");
    };
    bar.appendChild(add);
  }

  function closeTab(id) {
    if (S.tabs.length < 2) return;
    const i = S.tabs.findIndex((t) => t.id === id);
    S.tabs = S.tabs.filter((t) => t.id !== id);
    if (S.tabId === id) {
      const n = S.tabs[Math.max(0, i - 1)];
      S.tabId = n.id;
      go(n.view, false);
    }
    renderTabs();
  }

  function schedule() {
    if (S.timer) clearInterval(S.timer);
    const sec = +localStorage.getItem("lexora_sec") || 30;
    S.timer = setInterval(refresh, sec * 1000);
  }

  function initUI() {
    document.querySelectorAll(".user-name").forEach((el) => { el.textContent = userName; });
    const logout = $("#logoutBtn");
    if (logout) {
      logout.onclick = () => {
        localStorage.removeItem("lexora_user");
        if (useLocal) fetch(LOCAL + "/logout", { credentials: "include" }).finally(() => {
          location.href = "index.html";
        });
        else location.href = "index.html";
      };
    }
    $$(".nav-item").forEach((b) => { b.onclick = () => go(b.dataset.view); });
    $("#btnBack").onclick = () => { if (S.idx > 0) { S.idx--; go(S.stack[S.idx], false); } };
    $("#btnForward").onclick = () => { if (S.idx < S.stack.length - 1) { S.idx++; go(S.stack[S.idx], false); } };
    $("#btnRefresh").onclick = refresh;
    $("#histMetal").onchange = loadHistory;
    $("#calcBtn").onclick = async () => {
      const metal = $("#calcMetal").value;
      const grams = parseFloat($("#calcGrams").value);
      if (!grams || grams <= 0) { $("#calcResult").textContent = "Invalid grams"; return; }
      const r = await apiPost("/api/calc", { metal, grams });
      if (r && r.ok) {
        const d = await r.json();
        $("#calcResult").textContent = d.error ? "Error" : grams + "g " + metal + " = " + inr(d.total);
      } else {
        const price = S.prices[metal];
        $("#calcResult").textContent = price ? grams + "g " + metal + " = " + inr(grams * price) : "No price";
      }
    };
    $("#saveSettings").onclick = () => {
      localStorage.setItem("lexora_sec", Math.max(10, Math.min(300, +$("#refreshInterval").value || 30)));
      localStorage.setItem("lexora_hl", $("#highlightPrices").checked ? "1" : "0");
      S.highlight = $("#highlightPrices").checked;
      schedule();
      alert("Saved!");
    };
    const sec = localStorage.getItem("lexora_sec");
    if (sec) $("#refreshInterval").value = sec;
    S.highlight = localStorage.getItem("lexora_hl") !== "0";
    renderTabs();
    go("home", false);
    refresh();
    schedule();
    window.onresize = () => { drawCompare(); drawHistoryChart(); };
  }

  if (!localStorage.getItem("lexora_user")) {
    location.href = "index.html";
    return;
  }
  detectLocal().then(initUI);
})();
