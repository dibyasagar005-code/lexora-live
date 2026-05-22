# LexorA AI Market Predictor

A real-time AI-powered investment prediction platform built with Python Flask, SQLite, Chart.js, and scikit-learn. Futuristic cyberpunk UI with live market data, data curation, and ML-based price forecasts.

## Quick Start

### 1. Prerequisites

- Python 3.10 or higher
- pip

### 2. Install Dependencies

```bash
cd lexora-live
pip install -r requirements.txt
```

### 3. Run the Application

```bash
python app.py
```

Open **http://127.0.0.1:5000** in your browser.

### 4. First Login

1. Go to **Register** and create an account
2. Log in to access Dashboard, Watchlist, and Settings

---

## Project Structure

```
lexora-live/
├── app.py                 # Flask routes, auth, REST APIs, background thread
├── requirements.txt       # Python dependencies
├── lexora.db              # SQLite database (auto-created)
├── api/
│   └── market_data.py     # External API integration + fallback
├── data/
│   └── curation.py        # Data curation pipeline
├── ai/
│   └── predictor.py       # RSI, MA, ML predictions
├── models/
│   └── database.py        # SQLite schema and CRUD
├── static/
│   ├── style.css          # Cyberpunk glassmorphism theme
│   ├── app.js             # Live refresh, AJAX, calculators
│   └── charts.js          # Chart.js visualizations
└── templates/             # Jinja2 HTML pages
```

---

## How Each Module Works

### 1. API Module (`api/market_data.py`)

**Purpose:** Fetch live prices from free public APIs.

| Source | Assets |
|--------|--------|
| metals.live | Gold, Silver |
| CoinGecko | Bitcoin, Ethereum |
| Frankfurter | USD/INR, EUR/USD |
| Yahoo Finance (yfinance) | S&P 500, NASDAQ, Crude Oil, Platinum |

**Flow:**
1. `fetch_market_data()` calls each API in sequence
2. Results merge into a unified `assets` dictionary
3. If APIs fail, **offline fallback** uses baseline prices with small random variation

**Connection:** Flask caches results in memory; a background thread refreshes every 30 seconds.

---

### 2. Data Curation System (`data/curation.py`)

**Purpose:** Collect, clean, normalize, and persist market data.

**Pipeline:**

```
fetch_market_data() → clean_data() → normalize_data() → save_to_database()
```

| Function | Action |
|----------|--------|
| `fetch_market_data()` | Pull live + historical OHLC |
| `clean_data()` | Remove nulls, duplicates, outliers (3σ) |
| `normalize_data()` | Min-max scale prices per symbol (0–1) |
| `save_to_database()` | Write to `curated_data` + `price_history` |
| `generate_prediction()` | Run curation then AI predict |

**Runs automatically** on each 30s background refresh and manually via **Curate Now** button or `POST /api/curate`.

---

### 3. AI Prediction Engine (`ai/predictor.py`)

**Purpose:** Generate UP / DOWN / HOLD signals with confidence.

**Indicators:**
- **RSI** (14-period) — oversold (<30) bullish, overbought (>70) bearish
- **Moving Averages** — 5 vs 20 period trend detection
- **Volatility** — annualized from daily returns
- **Linear Regression** (sklearn) — 5-period price forecast

**Signal Logic:**
- Combines RSI, trend, and forecast momentum into a score
- Score ≥ 2 → UP, ≤ -2 → DOWN, else HOLD
- Confidence adjusted by volatility penalty

**Output:** Stored in `predictions` table; exposed via `/api/predict/<symbol>`.

---

### 4. Database (`models/database.py`)

**SQLite tables:**

| Table | Stores |
|-------|--------|
| `users` | Login credentials (hashed passwords) |
| `price_history` | Timestamped price snapshots |
| `predictions` | AI signals, confidence, RSI, volatility |
| `watchlist` | User favorite symbols |
| `user_logs` | Activity audit trail |
| `curated_data` | Cleaned OHLC + normalized values |
| `portfolio` | User holdings |
| `notifications` | Alerts |

---

### 5. Flask Application (`app.py`)

- **Page routes:** Home, Markets, Prediction, Dashboard, History, Calculator, Watchlist, Settings
- **REST APIs:** `/api/market`, `/api/predict/<symbol>`, `/api/curate`, etc.
- **Auth:** Session-based login with werkzeug password hashing
- **Background thread:** Refreshes market cache + curation every 30s

---

### 6. Frontend (`static/`)

| File | Role |
|------|------|
| `style.css` | Dark cyberpunk theme, glassmorphism, neon cyan/gold |
| `app.js` | 30s AJAX refresh, news ticker, calculators, watchlist |
| `charts.js` | Chart.js line, bar, forecast, volatility charts |

**Live updates:** `fetch('/api/market')` every 30 seconds updates price cards without page reload.

---

## REST API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/market` | GET | Live market prices |
| `/api/predict/<symbol>` | GET | AI prediction for symbol |
| `/api/predictions/all` | GET | All asset predictions |
| `/api/history/<symbol>` | GET | Price + curated history |
| `/api/curate` | POST | Run curation cycle |
| `/api/calculate` | POST | Investment calculators |
| `/api/watchlist` | GET/POST/DELETE | Watchlist CRUD |
| `/api/portfolio` | GET/POST | Portfolio tracker |
| `/api/news` | GET | News ticker headlines |

---

## Supported Assets

Gold, Silver, Bitcoin, Ethereum, Platinum, Crude Oil, S&P 500, NASDAQ, USD/INR, EUR/USD, and more via fallback.

---

## Environment Variables (Optional)

```bash
set SECRET_KEY=your-production-secret-key
```

---

## Disclaimer

This application is for **educational and demonstration purposes only**. Predictions are not financial advice. Always consult a licensed financial advisor before investing.
