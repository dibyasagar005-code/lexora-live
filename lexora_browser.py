"""
LexorA Browser — Live Metals Market (Python + SQLite)
Run: pip install flask requests
     python lexora_browser.py
Open: http://127.0.0.1:5000
"""

import json
import sqlite3
import threading
import time
from datetime import datetime
from pathlib import Path

import requests
from flask import Flask, jsonify, redirect, render_template_string, request, session, url_for

# ─── Config ───────────────────────────────────────────────────────────────────
APP_DIR = Path(__file__).resolve().parent
DB_PATH = APP_DIR / "lexora.db"
OZ = 31.1034768

METALS = {
    "gold":     {"label": "Gold",     "emoji": "💰", "color": "#ffd700"},
    "silver":   {"label": "Silver",   "emoji": "🪙", "color": "#c0c0c0"},
    "platinum": {"label": "Platinum", "emoji": "⚪", "color": "#e5e4e2"},
    "palladium":{"label": "Palladium","emoji": "🔘", "color": "#b4c7dc"},
    "copper":   {"label": "Copper",   "emoji": "🟤", "color": "#b87333"},
    "aluminum": {"label": "Aluminum", "emoji": "📦", "color": "#a8b4c4"},
}

VIEWS = {
    "home": "Home", "markets": "Markets", "dashboard": "Dashboard",
    "watchlist": "Watchlist", "calculator": "Calculator",
    "history": "History", "settings": "Settings",
}

# Live state (updated by background thread)
STATE = {
    "usd_inr": None,
    "prices": {},      # metal -> inr per gram
    "usd_oz": {},      # metal -> usd per oz
    "last_ok": None,
    "offline": True,
    "error": None,
}
STATE_LOCK = threading.Lock()

app = Flask(__name__)
app.secret_key = "lexora-change-this-in-production-2026"

# Allow GitHub Pages site to use local Flask API when you run python lexora_browser.py
CORS_ORIGINS = [
    "https://dibyasagar005-code.github.io",
    "http://127.0.0.1:5000",
    "http://localhost:5000",
]


@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin", "")
    if origin in CORS_ORIGINS or origin.startswith("http://127.0.0.1"):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response


@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        r = app.make_default_options_response()
        origin = request.headers.get("Origin", "")
        if origin in CORS_ORIGINS or origin.startswith("http://127.0.0.1"):
            r.headers["Access-Control-Allow-Origin"] = origin
            r.headers["Access-Control-Allow-Credentials"] = "true"
            r.headers["Access-Control-Allow-Headers"] = "Content-Type"
            r.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        return r


# ─── Database ─────────────────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS price_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                metal TEXT NOT NULL,
                inr_per_gram REAL,
                usd_per_oz REAL,
                usd_inr REAL,
                recorded_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS user_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                action TEXT,
                detail TEXT,
                recorded_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
            CREATE INDEX IF NOT EXISTS idx_ph_metal ON price_history(metal, recorded_at);
            CREATE INDEX IF NOT EXISTS idx_ul_user ON user_logs(user_id, recorded_at);
        """)


def log_user(user_id, action, detail=""):
    if not user_id:
        return
    with get_db() as conn:
        conn.execute(
            "INSERT INTO user_logs (user_id, action, detail) VALUES (?, ?, ?)",
            (user_id, action, detail),
        )


def save_prices_to_db(usd_inr, usd_oz, inr_gram):
    with get_db() as conn:
        for metal, inr in inr_gram.items():
            if inr is None:
                continue
            conn.execute(
                """INSERT INTO price_history (metal, inr_per_gram, usd_per_oz, usd_inr)
                   VALUES (?, ?, ?, ?)""",
                (metal, inr, usd_oz.get(metal), usd_inr),
            )
        # keep last 5000 rows
        conn.execute(
            """DELETE FROM price_history WHERE id NOT IN (
                SELECT id FROM price_history ORDER BY id DESC LIMIT 5000
            )"""
        )


# ─── Price fetching ───────────────────────────────────────────────────────────
def to_gram(usd_oz, rate):
    if usd_oz is None or rate is None:
        return None
    return (usd_oz * rate) / OZ


def fetch_usd_inr():
    r = requests.get(
        "https://api.frankfurter.app/latest?from=USD&to=INR",
        timeout=12,
    )
    r.raise_for_status()
    return float(r.json()["rates"]["INR"])


def fetch_metals_spot():
    """Fetch spot USD/oz from metals.live; fallback values if API fails."""
    fallback = {
        "gold": 2650.0, "silver": 31.0, "platinum": 980.0,
        "palladium": 1050.0, "copper": 4.2, "aluminum": 1.05,
    }
    try:
        r = requests.get("https://api.metals.live/v1/spot", timeout=15)
        r.raise_for_status()
        data = r.json()
        out = {}
        rows = data if isinstance(data, list) else [data]
        for row in rows:
            if not isinstance(row, dict):
                continue
            for key in METALS:
                if key in row and row[key] is not None:
                    out[key] = float(row[key])
        # metals.live often only has gold/silver — fill rest from fallback ratios
        if "gold" in out and "silver" not in out:
            out["silver"] = out["gold"] / 85
        for k, v in fallback.items():
            if k not in out:
                if "gold" in out and k != "gold":
                    out[k] = fallback[k] * (out["gold"] / fallback["gold"])
                else:
                    out[k] = v
        return out
    except Exception:
        return dict(fallback)


def refresh_prices():
    global STATE
    try:
        usd_inr = fetch_usd_inr()
        spot = fetch_metals_spot()
        inr_gram = {m: to_gram(spot.get(m), usd_inr) for m in METALS}
        with STATE_LOCK:
            STATE["usd_inr"] = usd_inr
            STATE["usd_oz"] = spot
            STATE["prices"] = inr_gram
            STATE["last_ok"] = datetime.now().isoformat()
            STATE["offline"] = False
            STATE["error"] = None
        save_prices_to_db(usd_inr, spot, inr_gram)
        return True
    except Exception as e:
        with STATE_LOCK:
            STATE["offline"] = True
            STATE["error"] = str(e)
            if not STATE["prices"]:
                fb_inr = 83.5
                fb = fetch_metals_spot()
                STATE["usd_inr"] = fb_inr
                STATE["usd_oz"] = fb
                STATE["prices"] = {m: to_gram(fb.get(m), fb_inr) for m in METALS}
        return False


def background_worker():
    while True:
        refresh_prices()
        try:
            sec = 60
            with get_db() as conn:
                # global refresh from any user's saved setting (last write wins)
                pass
        except Exception:
            pass
        time.sleep(60)


# ─── Helpers ──────────────────────────────────────────────────────────────────
def current_user():
    uid = session.get("user_id")
    name = session.get("user_name")
    if uid and name:
        return {"id": uid, "name": name}
    return None


def state_snapshot():
    with STATE_LOCK:
        return {
            "usd_inr": STATE["usd_inr"],
            "prices": dict(STATE["prices"]),
            "usd_oz": dict(STATE["usd_oz"]),
            "offline": STATE["offline"],
            "error": STATE["error"],
            "last_ok": STATE["last_ok"],
            "metals": METALS,
        }


# ─── Routes ───────────────────────────────────────────────────────────────────
@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        name = (request.form.get("name") or "").strip()
        if not name or len(name) < 2:
            return render_template_string(

LOGIN_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login — LexorA</title>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Segoe+UI&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Segoe UI", Arial, sans-serif;
      background: #0a0f1a; color: #e2e8f0;
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
    }
    .card {
      background: linear-gradient(160deg, #050816, #0b1220);
      border: 1px solid #1e293b;
      box-shadow: 0 0 60px rgba(0, 255, 255, 0.12);
      border-radius: 20px; padding: 40px; width: 100%; max-width: 420px; text-align: center;
    }
    .lx-logo { display: inline-flex; margin-bottom: 16px; }
    .lx-mark {
      width: 72px; height: 72px; display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, #1e293b, #0f172a);
      border-radius: 16px; font-family: Orbitron, sans-serif; font-weight: 900; font-size: 28px;
      background: linear-gradient(120deg, #fde047, #f8fafc, #22d3ee);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      box-shadow: 0 0 20px rgba(34, 211, 238, 0.35);
    }
    h1 {
      font-family: Orbitron, sans-serif; font-size: 2rem; margin-bottom: 8px;
      background: linear-gradient(120deg, #fde047, #f8fafc, #67e8f9);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    .sub { color: #94a3b8; margin-bottom: 28px; font-size: 14px; }
    input {
      width: 100%; padding: 14px; border-radius: 8px; border: 1px solid #334155;
      background: #0f172a; color: #00ffff; font-size: 16px; margin-bottom: 16px; outline: none;
    }
    .btn {
      width: 100%; padding: 14px;
      background: linear-gradient(135deg, #0891b2, #06b6d4);
      border: none; border-radius: 8px; color: white; font-weight: bold;
      cursor: pointer; font-size: 16px;
    }
    .err { color: #f87171; font-size: 13px; margin-bottom: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="lx-logo"><div class="lx-mark">LX</div></div>
    <h1>Lexor<span style="color:#22d3ee">A</span></h1>
    <p class="sub">Enter your name to access live metals market</p>
    {% if error %}<p class="err">{{ error }}</p>{% endif %}
    <form method="post">
      <input type="text" name="name" placeholder="Your name" required autofocus maxlength="50">
      <button type="submit" class="btn">Enter Browser</button>
    </form>
  </div>
</body>
</html>"""

MAIN_HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LexorA Browser</title>
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Segoe+UI&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Segoe UI", Arial, sans-serif;
      background: #0a0f1a; color: #e2e8f0;
      height: 100vh; overflow: hidden;
    }
    .browser {
      display: flex; flex-direction: column; height: 100vh;
      max-width: 1400px; margin: 0 auto;
      background: linear-gradient(160deg, #050816, #0b1220);
      border: 1px solid #1e293b;
      box-shadow: 0 0 60px rgba(0, 255, 255, 0.12);
    }
    .titlebar {
      display: flex; align-items: center; padding: 8px 14px;
      background: #020617; border-bottom: 1px solid #1e293b;
    }
    .window-controls { display: flex; gap: 8px; }
    .dot { width: 12px; height: 12px; border-radius: 50%; }
    .dot.red { background: #ef4444; }
    .dot.yellow { background: #eab308; }
    .dot.green { background: #22c55e; }
    .titlebar-name { flex: 1; display: flex; justify-content: center; align-items: center; gap: 10px; }
    .titlebar-spacer { width: 52px; }
    .lx-logo { display: inline-flex; align-items: center; font-family: Orbitron, sans-serif; font-weight: 900; }
    .lx-mark {
      display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, #1e293b, #0f172a);
      border-radius: 12px; position: relative;
      box-shadow: 0 0 20px rgba(34, 211, 238, 0.35), inset 0 0 20px rgba(255, 215, 0, 0.08);
    }
    .lx-mark::before {
      content: ""; position: absolute; inset: -2px; border-radius: 14px;
      background: linear-gradient(135deg, #fde047, #22d3ee, #a78bfa); z-index: -1;
    }
    .lx-letters {
      background: linear-gradient(120deg, #fde047, #f8fafc, #22d3ee);
      -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
    }
    .lx-logo--sm .lx-mark { width: 32px; height: 32px; border-radius: 8px; }
    .lx-logo--sm .lx-letters { font-size: 14px; }
    .lx-logo--md .lx-mark { width: 56px; height: 56px; }
    .lx-logo--md .lx-letters { font-size: 22px; }
    .lx-logo--lg .lx-mark { width: 100px; height: 100px; border-radius: 22px; }
    .lx-logo--lg .lx-letters { font-size: 42px; }
    .lexora-name { font-family: Orbitron, sans-serif; font-weight: 900; display: inline-flex; letter-spacing: 0.06em; }
    .name-lexor {
      background: linear-gradient(120deg, #fde047, #f8fafc, #67e8f9);
      background-size: 200% auto; -webkit-background-clip: text; background-clip: text;
      -webkit-text-fill-color: transparent; animation: shine 4s ease-in-out infinite;
    }
    .name-a { color: #22d3ee; text-shadow: 0 0 20px rgba(34, 211, 238, 0.8); }
    @keyframes shine { 0%,100%{background-position:0%} 50%{background-position:100%} }
    .brand-block { display: flex; align-items: center; gap: 16px; }
    .brand-block--hero { flex-direction: column; gap: 20px; margin: 30px auto 10px; }
    .lexora-name--bar { font-size: 1rem; }
    .lexora-name--side { font-size: 1.2rem; }
    .lexora-name--hero { font-size: clamp(2.5rem, 10vw, 4.5rem); }
    .user-pill {
      font-size: 12px; color: #22d3ee; margin-left: 12px;
      padding: 4px 10px; border: 1px solid #334155; border-radius: 20px;
    }
    .hero-wrap { text-align: center; padding: 20px 16px 10px; }
    .hero-sub { color: #94a3b8; font-size: 17px; margin-top: 12px; }
    .hero-line {
      width: 200px; height: 3px; margin: 16px auto 0;
      background: linear-gradient(90deg, transparent, #22d3ee, #fde047, #22d3ee, transparent);
    }
    .tabbar { display: flex; gap: 2px; padding: 6px 8px 0; background: #0f172a; overflow-x: auto; }
    .tab {
      display: flex; align-items: center; gap: 8px; padding: 8px 14px;
      background: #1e293b; border-radius: 8px 8px 0 0; font-size: 13px;
      cursor: pointer; color: #94a3b8; white-space: nowrap;
    }
    .tab.active { background: #111827; color: #00ffff; }
    .tab-close { background: none; border: none; color: #64748b; cursor: pointer; }
    .tab-add { padding: 8px 12px; background: transparent; border: none; color: #64748b; cursor: pointer; font-size: 18px; }
    .toolbar {
      display: flex; align-items: center; gap: 6px; padding: 8px 12px;
      background: #111827; border-bottom: 1px solid #1e293b;
    }
    .tool-btn {
      width: 32px; height: 32px; border: 1px solid #334155; background: #1e293b;
      color: #e2e8f0; border-radius: 6px; cursor: pointer; font-size: 16px;
    }
    .tool-btn:hover { background: #334155; }
    .tool-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .address-wrap {
      flex: 1; display: flex; align-items: center;
      background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 0 10px;
    }
    .address-bar {
      flex: 1; background: transparent; border: none; color: #00ffff;
      font-size: 13px; padding: 8px 0; outline: none;
    }
    .live-badge { width: auto; padding: 0 12px; font-size: 11px; font-weight: bold; color: #22c55e; }
    .live-badge.offline { color: #f87171; }
    .main-layout { display: flex; flex: 1; min-height: 0; }
    .sidebar {
      width: 210px; background: #020617; border-right: 1px solid #1e293b;
      padding: 12px 8px; display: flex; flex-direction: column; gap: 4px; overflow-y: auto;
    }
    .sidebar-brand {
      display: flex; flex-direction: column; align-items: center; gap: 10px;
      padding: 8px 4px 18px; border-bottom: 1px solid #1e293b; margin-bottom: 8px;
    }
    .nav-item {
      display: flex; align-items: center; gap: 10px; padding: 10px 12px;
      background: transparent; border: none; color: #94a3b8; border-radius: 8px;
      cursor: pointer; font-size: 14px; text-align: left; width: 100%;
    }
    .nav-item:hover { background: #1e293b; color: #e2e8f0; }
    .nav-item.active { background: #1e293b; color: #00ffff; box-shadow: inset 3px 0 0 #00ffff; }
    .logout-btn {
      margin-top: auto; padding: 10px; background: #1e293b; border: 1px solid #334155;
      color: #f87171; border-radius: 8px; cursor: pointer; font-size: 13px; width: 100%;
    }
    .content { flex: 1; overflow-y: auto; padding: 24px; }
    .view { display: none; }
    .view.active { display: block; }
    .view-title {
      font-size: 26px; margin-bottom: 8px; font-family: Orbitron, sans-serif;
      background: linear-gradient(to right, gold, cyan);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    .view-desc { color: #94a3b8; margin-bottom: 20px; font-size: 14px; }
    .status-line {
      padding: 10px 14px; background: #0f172a; border-radius: 8px;
      margin-bottom: 20px; font-size: 14px; color: #94a3b8;
    }
    .status-line.ok { color: #22c55e; border: 1px solid #166534; }
    .status-line.error { color: #f87171; border: 1px solid #991b1b; }
    .cards-row, .market-grid {
      display: flex; flex-wrap: wrap; justify-content: center; gap: 24px; margin-bottom: 24px;
    }
    .market-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
    .box {
      background: #1e293b; width: 100%; max-width: 300px; padding: 24px;
      border-radius: 20px; box-shadow: 0 0 25px rgba(0, 255, 255, 0.2);
    }
    .box h2 { font-size: 22px; margin-bottom: 12px; }
    .price { font-size: 28px; font-weight: bold; color: #00ffff; }
    .price.flash-up { animation: up 0.8s; }
    .price.flash-down { animation: down 0.8s; }
    @keyframes up { 0%{color:#22c55e;transform:scale(1.05)} 100%{color:#00ffff;transform:scale(1)} }
    @keyframes down { 0%{color:#f87171;transform:scale(1.05)} 100%{color:#00ffff;transform:scale(1)} }
    .meta { font-size: 13px; color: #94a3b8; margin-top: 8px; }
    .hint { text-align: center; color: #64748b; font-size: 14px; margin-top: 10px; }
    .detail-panel { background: #0f172a; border-radius: 12px; padding: 20px; border: 1px solid #334155; }
    .detail-row {
      display: flex; justify-content: space-between; padding: 8px 0;
      border-bottom: 1px solid #1e293b; font-size: 14px;
    }
    .dash-stats {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 16px; margin-bottom: 24px;
    }
    .stat-tile { background: #1e293b; padding: 18px; border-radius: 12px; text-align: center; }
    .stat-tile .label { font-size: 11px; color: #94a3b8; text-transform: uppercase; }
    .stat-tile .value { font-size: 18px; font-weight: bold; color: #00ffff; margin-top: 8px; }
    .watch-table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 12px; overflow: hidden; }
    .watch-table th, .watch-table td { padding: 14px 16px; text-align: left; border-bottom: 1px solid #334155; }
    .watch-table th { background: #0f172a; color: #94a3b8; font-size: 12px; }
    .calc-box, .settings-box {
      max-width: 400px; background: #1e293b; padding: 28px; border-radius: 16px;
      display: flex; flex-direction: column; gap: 12px;
    }
    .calc-box label, .settings-box label { font-size: 13px; color: #94a3b8; }
    .calc-box select, .calc-box input, .settings-box input[type="number"] {
      padding: 12px; border-radius: 8px; border: 1px solid #334155;
      background: #0f172a; color: #e2e8f0; font-size: 16px;
    }
    .btn-primary {
      padding: 12px; background: linear-gradient(135deg, #0891b2, #06b6d4);
      border: none; border-radius: 8px; color: white; font-weight: bold; cursor: pointer;
    }
    .calc-result {
      padding: 16px; background: #0f172a; border-radius: 8px;
      font-size: 18px; color: #00ffff; font-weight: bold;
    }
    #chartHistory, #chartCompare { width: 100%; background: #1e293b; border-radius: 12px; margin-bottom: 16px; }
    .rate-big {
      font-size: 40px; font-weight: bold; color: gold; text-align: center;
      padding: 30px; background: #1e293b; border-radius: 12px;
    }
    .history-log { font-size: 13px; color: #94a3b8; max-height: 220px; overflow-y: auto; }
    .history-log div { padding: 6px 0; border-bottom: 1px solid #1e293b; }
    .settings-note { font-size: 12px; color: #64748b; }
    .statusbar {
      display: flex; justify-content: space-between; padding: 6px 14px;
      background: #020617; border-top: 1px solid #1e293b; font-size: 12px; color: #64748b;
    }
    @media (max-width: 700px) {
      .sidebar { width: 64px; }
      .nav-item span.lbl { display: none; }
      .lexora-name--side { display: none; }
    }
  </style>
</head>
<body>
<div class="browser">
  <div class="titlebar">
    <div class="window-controls">
      <span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span>
    </div>
    <div class="titlebar-name">
      <div class="brand-block">
        <div class="lx-logo lx-logo--sm"><div class="lx-mark"><span class="lx-letters">LX</span></div></div>
        <div class="lexora-name lexora-name--bar">
          <span class="name-lexor">Lexor</span><span class="name-a">A</span>
        </div>
        <span class="user-pill">👤 {{ user.name }}</span>
      </div>
    </div>
    <div class="titlebar-spacer"></div>
  </div>

  <div class="tabbar" id="tabbar"></div>

  <div class="toolbar">
    <button class="tool-btn" id="btnBack">&#8592;</button>
    <button class="tool-btn" id="btnForward">&#8594;</button>
    <button class="tool-btn" id="btnRefresh">&#8635;</button>
    <div class="address-wrap">
      <input type="text" class="address-bar" id="addressBar" readonly>
    </div>
    <button class="tool-btn live-badge" id="liveBadge">LIVE</button>
  </div>

  <div class="main-layout">
    <nav class="sidebar">
      <div class="sidebar-brand">
        <div class="lx-logo lx-logo--md"><div class="lx-mark"><span class="lx-letters">LX</span></div></div>
        <div class="lexora-name lexora-name--side">
          <span class="name-lexor">Lexor</span><span class="name-a">A</span>
        </div>
      </div>
      <button class="nav-item active" data-view="home"><span>&#127968;</span> <span class="lbl">Home</span></button>
      <button class="nav-item" data-view="markets"><span>&#128200;</span> <span class="lbl">Markets</span></button>
      <button class="nav-item" data-view="dashboard"><span>&#128202;</span> <span class="lbl">Dashboard</span></button>
      <button class="nav-item" data-view="watchlist"><span>&#11088;</span> <span class="lbl">Watchlist</span></button>
      <button class="nav-item" data-view="calculator"><span>&#129518;</span> <span class="lbl">Calculator</span></button>
      <button class="nav-item" data-view="history"><span>&#128337;</span> <span class="lbl">History</span></button>
      <button class="nav-item" data-view="settings"><span>&#9881;</span> <span class="lbl">Settings</span></button>
      <a href="/logout" style="text-decoration:none"><button type="button" class="logout-btn">Logout</button></a>
    </nav>

    <main class="content">
      <section class="view active" id="view-home">
        <div class="hero-wrap">
          <div class="brand-block brand-block--hero">
            <div class="lx-logo lx-logo--lg"><div class="lx-mark"><span class="lx-letters">LX</span></div></div>
            <div class="lexora-name lexora-name--hero">
              <span class="name-lexor">Lexor</span><span class="name-a">A</span>
            </div>
          </div>
          <div class="hero-line"></div>
          <p class="hero-sub">Welcome {{ user.name }} — Live Multi-Metal Market (Python + SQLite)</p>
        </div>
        <div class="cards-row" id="homeCards"></div>
        <p class="hint">6 metals · prices saved to database every refresh</p>
      </section>

      <section class="view" id="view-markets">
        <h2 class="view-title">Live Markets</h2>
        <p class="view-desc">Gold, Silver, Platinum, Palladium, Copper, Aluminum — INR per gram</p>
        <p class="status-line" id="marketStatus">Loading...</p>
        <div class="market-grid" id="marketGrid"></div>
        <div class="detail-panel" id="detailPanel"></div>
      </section>

      <section class="view" id="view-dashboard">
        <h2 class="view-title">Dashboard</h2>
        <div class="dash-stats" id="dashStats"></div>
        <canvas id="chartCompare" height="200"></canvas>
        <div class="rate-big" id="usdInrRate">—</div>
      </section>

      <section class="view" id="view-watchlist">
        <h2 class="view-title">Watchlist</h2>
        <table class="watch-table">
          <thead><tr><th>Asset</th><th>INR/g</th><th>USD/oz</th><th>Time</th></tr></thead>
          <tbody id="watchlistBody"></tbody>
        </table>
      </section>

      <section class="view" id="view-calculator">
        <h2 class="view-title">Calculator</h2>
        <div class="calc-box">
          <label>Metal</label>
          <select id="calcMetal">
            <option value="gold">Gold</option>
            <option value="silver">Silver</option>
            <option value="platinum">Platinum</option>
            <option value="palladium">Palladium</option>
            <option value="copper">Copper</option>
            <option value="aluminum">Aluminum</option>
          </select>
          <label>Grams</label>
          <input type="number" id="calcGrams" value="10" min="0.01" step="0.01">
          <button class="btn-primary" id="calcBtn">Calculate</button>
          <div class="calc-result" id="calcResult">Enter grams and calculate</div>
        </div>
      </section>

      <section class="view" id="view-history">
        <h2 class="view-title">Price History (Database)</h2>
        <label style="color:#94a3b8;font-size:13px">Chart metal: </label>
        <select id="histMetal" style="margin:8px 0;padding:8px;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:6px">
          <option value="gold">Gold</option>
          <option value="silver">Silver</option>
          <option value="platinum">Platinum</option>
          <option value="palladium">Palladium</option>
          <option value="copper">Copper</option>
          <option value="aluminum">Aluminum</option>
        </select>
        <canvas id="chartHistory" height="220"></canvas>
        <div class="history-log" id="historyLog"></div>
      </section>

      <section class="view" id="view-settings">
        <h2 class="view-title">Settings</h2>
        <div class="settings-box">
          <label>UI refresh every (seconds)</label>
          <input type="number" id="refreshInterval" value="30" min="10" max="300">
          <label><input type="checkbox" id="highlightPrices" checked> Highlight price changes</label>
          <button class="btn-primary" id="saveSettings">Save</button>
          <p class="settings-note">Server saves all metals to SQLite in background. Internet required for live API.</p>
        </div>
      </section>
    </main>
  </div>

  <div class="statusbar">
    <span id="statusLeft">Ready</span>
    <span id="statusRight">Last update: —</span>
  </div>
</div>

<script>
(function () {
  const METALS = {{ metals | tojson }};
  const VIEWS = {
    home: { title: "Home", url: "lexora://home" },
    markets: { title: "Markets", url: "lexora://markets" },
    dashboard: { title: "Dashboard", url: "lexora://dashboard" },
    watchlist: { title: "Watchlist", url: "lexora://watchlist" },
    calculator: { title: "Calculator", url: "lexora://calculator" },
    history: { title: "History", url: "lexora://history" },
    settings: { title: "Settings", url: "lexora://settings" }
  };

  const S = {
    prices: {}, usdOz: {}, usdInr: null, prev: {},
    tabs: [{ id: 1, view: "home", title: "Home" }],
    tabId: 1, nextId: 2, stack: ["home"], idx: 0,
    timer: null, highlight: true, hist: []
  };

  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  function inr(n) {
    return n == null || isNaN(n) ? "—" : "₹ " + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }
  function usd(n) {
    return n == null || isNaN(n) ? "—" : "$ " + n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  function time() { return new Date().toLocaleTimeString("en-IN"); }

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
    const inrG = S.prices[key];
    const oz = S.usdOz[key];
    return `<div class="box"><h2>${m.emoji} ${m.label}</h2>
      <div class="${pClass(key)}">${inr(inrG)} / gram</div>
      <p class="meta">${usd(oz)} / oz</p></div>`;
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

    $("#dashStats").innerHTML = keys.map(k =>
      `<div class="stat-tile"><div class="label">${METALS[k].label}</div>
       <div class="value">${inr(S.prices[k])}</div></div>`).join("") +
      `<div class="stat-tile"><div class="label">USD/INR</div>
       <div class="value">${S.usdInr?.toFixed(2) ?? "—"}</div></div>`;

    $("#usdInrRate").textContent = S.usdInr ? "₹ " + S.usdInr.toFixed(2) : "—";
    $("#watchlistBody").innerHTML = keys.map(k =>
      `<tr><td>${METALS[k].emoji} ${METALS[k].label}</td>
       <td>${inr(S.prices[k])}</td><td>${usd(S.usdOz[k])}</td><td>${time()}</td></tr>`).join("");

    drawCompare();
  }

  async function loadHistory() {
    const metal = $("#histMetal").value;
    const r = await fetch("/api/history?metal=" + metal + "&limit=50");
    const rows = await r.json();
    S.hist = rows;
    const log = $("#historyLog");
    log.innerHTML = rows.slice().reverse().slice(0, 15).map(h =>
      `<div>${h.recorded_at} — ${inr(h.inr_per_gram)} (${usd(h.usd_per_oz)}/oz)</div>`
    ).join("") || "<div>No history yet</div>";
    drawHistoryChart();
  }

  function drawCompare() {
    const c = $("#chartCompare");
    if (!c) return;
    const ctx = c.getContext("2d");
    const w = c.width = c.offsetWidth || 500;
    const h = c.height;
    ctx.clearRect(0, 0, w, h);
    const keys = ["gold", "silver", "platinum", "copper"];
    const vals = keys.map(k => S.prices[k] || 0);
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
    const w = c.width = c.offsetWidth || 500;
    const h = c.height;
    ctx.clearRect(0, 0, w, h);
    const pts = S.hist;
    const mx = Math.max(...pts.map(p => p.inr_per_gram));
    const mn = Math.min(...pts.map(p => p.inr_per_gram));
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = 30 + (i / (pts.length - 1)) * (w - 60);
      const y = h - 25 - ((p.inr_per_gram - mn) / (mx - mn || 1)) * (h - 50);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  }

  async function refresh() {
    $("#statusLeft").textContent = "Loading...";
    try {
      const r = await fetch("/api/state");
      const d = await r.json();
      Object.keys(METALS).forEach(k => { S.prev[k] = S.prices[k]; });
      S.prices = d.prices || {};
      S.usdOz = d.usd_oz || {};
      S.usdInr = d.usd_inr;
      const st = $("#marketStatus");
      const badge = $("#liveBadge");
      if (d.offline) {
        st.textContent = "Offline: " + (d.error || "API error") + " (using cache/fallback)";
        st.className = "status-line error";
        badge.textContent = "OFFLINE";
        badge.classList.add("offline");
        $("#statusLeft").textContent = "Offline";
      } else {
        st.textContent = "Live · " + time();
        st.className = "status-line ok";
        badge.textContent = "LIVE";
        badge.classList.remove("offline");
        $("#statusLeft").textContent = "Connected";
      }
      $("#statusRight").textContent = "Last update: " + time();
      render();
      if ($("#view-history").classList.contains("active")) loadHistory();
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
    $$(".view").forEach(v => v.classList.remove("active"));
    $$(".nav-item").forEach(n => n.classList.remove("active"));
    $("#view-" + view).classList.add("active");
    const nav = document.querySelector('[data-view="' + view + '"]');
    if (nav) nav.classList.add("active");
    const tab = S.tabs.find(t => t.id === S.tabId);
    if (tab) { tab.view = view; tab.title = VIEWS[view].title; }
    $("#addressBar").value = VIEWS[view].url;
    document.title = VIEWS[view].title + " — LexorA";
    fetch("/api/log_view", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({view}) });
    renderTabs();
    $("#btnBack").disabled = S.idx <= 0;
    $("#btnForward").disabled = S.idx >= S.stack.length - 1;
    if (view === "history") loadHistory();
  }

  function renderTabs() {
    const bar = $("#tabbar");
    bar.innerHTML = "";
    S.tabs.forEach(tab => {
      const el = document.createElement("div");
      el.className = "tab" + (tab.id === S.tabId ? " active" : "");
      el.innerHTML = tab.title + ' <button class="tab-close">×</button>';
      el.onclick = e => {
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
    const i = S.tabs.findIndex(t => t.id === id);
    S.tabs = S.tabs.filter(t => t.id !== id);
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

  $$(".nav-item").forEach(b => { b.onclick = () => go(b.dataset.view); });
  $("#btnBack").onclick = () => { if (S.idx > 0) { S.idx--; go(S.stack[S.idx], false); } };
  $("#btnForward").onclick = () => { if (S.idx < S.stack.length - 1) { S.idx++; go(S.stack[S.idx], false); } };
  $("#btnRefresh").onclick = refresh;
  $("#histMetal").onchange = loadHistory;

  $("#calcBtn").onclick = async () => {
    const metal = $("#calcMetal").value;
    const grams = parseFloat($("#calcGrams").value);
    if (!grams || grams <= 0) { $("#calcResult").textContent = "Invalid grams"; return; }
    const r = await fetch("/api/calc", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ metal, grams })
    });
    const d = await r.json();
    $("#calcResult").textContent = d.error ? "Error" :
      grams + "g " + metal + " = " + inr(d.total);
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
})();
</script>
</body>
</html>"""

if __name__ == "__main__":
    init_db()
    refresh_prices()
    t = threading.Thread(target=background_worker, daemon=True)
    t.start()
    print("LexorA Browser running at http://127.0.0.1:5000")
    print("Database:", DB_PATH)
    app.run(host="127.0.0.1", port=5000, debug=False)
