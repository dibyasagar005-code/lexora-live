"""
LexorA AI Market Predictor - Main Flask Application
Real-time AI-powered investment prediction platform.
"""

import os
import sys
import threading
import time
from datetime import datetime
from functools import wraps

from flask import (
    Flask, render_template, request, redirect, url_for,
    session, jsonify, flash,
)
from werkzeug.security import generate_password_hash, check_password_hash

# Add project root to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from models.database import (
    init_db, get_user_by_username, create_user, log_user_action,
    get_watchlist, add_to_watchlist, remove_from_watchlist,
    get_portfolio, add_portfolio_item, get_notifications, add_notification,
    get_price_history, get_predictions, get_db,
)
from api.market_data import fetch_market_data
from data.curation import run_curation_cycle, get_curated_history, generate_prediction
from ai.predictor import run_prediction, predict_all_assets, sentiment_analysis
from api.market_data import get_historical_prices

# ---------------------------------------------------------------------------
# Flask app configuration
# ---------------------------------------------------------------------------
app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "lexora-ai-market-predictor-2024-secret")
app.config["SESSION_PERMANENT"] = True

# In-memory cache for live market data (refreshed by background thread)
_market_cache = {"data": None, "updated": None}
_cache_lock = threading.Lock()


def login_required(f):
    """Decorator to protect routes that require authentication."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            flash("Please log in to access this page.", "warning")
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated


def get_cached_market():
    """Return cached market data or fetch fresh."""
    with _cache_lock:
        if _market_cache["data"]:
            return _market_cache["data"]
    return fetch_market_data()


def refresh_market_background():
    """Background thread: refresh market data every 30 seconds."""
    while True:
        try:
            market = fetch_market_data()
            with _cache_lock:
                _market_cache["data"] = market
                _market_cache["updated"] = datetime.utcnow().isoformat()
            run_curation_cycle()
        except Exception as e:
            print(f"[Background] Refresh error: {e}")
        time.sleep(10)


# ---------------------------------------------------------------------------
# Page routes
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    """Home page with market overview."""
    market = get_cached_market()
    return render_template("index.html", market=market, user=session.get("username"))


@app.route("/login", methods=["GET", "POST"])
def login():
    """User login with session management."""
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        user = get_user_by_username(username)
        if user and check_password_hash(user["password_hash"], password):
            session["user_id"] = user["id"]
            session["username"] = user["username"]
            log_user_action(user["id"], "login", f"User {username} logged in")
            flash("Welcome back to LexorA!", "success")
            return redirect(url_for("dashboard"))
        flash("Invalid username or password.", "error")
    return render_template("login.html")


@app.route("/register", methods=["GET", "POST"])
def register():
    """User registration."""
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        email = request.form.get("email", "").strip()
        password = request.form.get("password", "")
        confirm = request.form.get("confirm_password", "")
        if not username or not email or not password:
            flash("All fields are required.", "error")
        elif password != confirm:
            flash("Passwords do not match.", "error")
        elif len(password) < 6:
            flash("Password must be at least 6 characters.", "error")
        else:
            try:
                create_user(username, email, generate_password_hash(password))
                flash("Registration successful! Please log in.", "success")
                return redirect(url_for("login"))
            except Exception:
                flash("Username or email already exists.", "error")
    return render_template("login.html", register=True)


@app.route("/logout")
def logout():
    """End user session."""
    if "user_id" in session:
        log_user_action(session["user_id"], "logout")
    session.clear()
    flash("You have been logged out.", "info")
    return redirect(url_for("index"))


@app.route("/markets")
def markets():
    """Live markets page."""
    market = get_cached_market()
    return render_template("markets.html", market=market, user=session.get("username"))


@app.route("/prediction")
@app.route("/prediction/<symbol>")
def prediction(symbol="bitcoin"):
    """AI prediction page for a specific asset."""
    pred = run_prediction(symbol)
    market = get_cached_market()
    return render_template(
        "prediction.html",
        prediction=pred,
        symbol=symbol,
        market=market,
        user=session.get("username"),
    )


@app.route("/dashboard")
@login_required
def dashboard():
    """User dashboard with portfolio and predictions."""
    predictions = get_predictions(limit=10)
    portfolio = get_portfolio(session["user_id"])
    watchlist = get_watchlist(session["user_id"])
    notifications = get_notifications(session["user_id"])
    market = get_cached_market()
    return render_template(
        "dashboard.html",
        predictions=predictions,
        portfolio=portfolio,
        watchlist=watchlist,
        notifications=notifications,
        market=market,
        user=session.get("username"),
    )


@app.route("/history")
def history():
    """Price and prediction history."""
    symbol = request.args.get("symbol", "bitcoin")
    prices = get_price_history(symbol, limit=100)
    predictions = get_predictions(symbol, limit=20)
    curated = get_curated_history(symbol, limit=50)
    return render_template(
        "history.html",
        prices=prices,
        predictions=predictions,
        curated=curated,
        symbol=symbol,
        user=session.get("username"),
    )


@app.route("/calculator")
def calculator():
    """Investment calculators page."""
    return render_template("calculator.html", user=session.get("username"))


@app.route("/watchlist")
@login_required
def watchlist_page():
    """User watchlist management."""
    watchlist = get_watchlist(session["user_id"])
    market = get_cached_market()
    return render_template(
        "watchlist.html",
        watchlist=watchlist,
        market=market,
        user=session.get("username"),
    )


@app.route("/settings")
@login_required
def settings():
    """User settings page."""
    return render_template("settings.html", user=session.get("username"))


# ---------------------------------------------------------------------------
# REST API endpoints
# ---------------------------------------------------------------------------
@app.route("/api/market")
def api_market():
    """Live market prices JSON. ?fresh=1 bypasses cache for instant refresh."""
    if request.args.get("fresh") == "1":
        market = fetch_market_data()
        with _cache_lock:
            _market_cache["data"] = market
            _market_cache["updated"] = datetime.utcnow().isoformat()
        return jsonify(market)
    market = get_cached_market()
    return jsonify(market)


@app.route("/api/predict/<symbol>")
def api_predict(symbol):
    """AI prediction for a symbol."""
    try:
        result = run_prediction(symbol)
        return jsonify({"success": True, "data": result})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/predictions/all")
def api_predictions_all():
    """All asset predictions."""
    try:
        results = predict_all_assets()
        return jsonify({"success": True, "data": results})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/history/<symbol>")
def api_history(symbol):
    """Price history for charts."""
    prices = get_price_history(symbol, limit=100)
    curated = get_curated_history(symbol, limit=50)
    hist = get_historical_prices(symbol, days=30)
    return jsonify({
        "prices": prices,
        "curated": curated,
        "historical": [round(p, 2) for p in hist],
    })


@app.route("/api/curate", methods=["POST"])
def api_curate():
    """Trigger data curation cycle."""
    try:
        result = run_curation_cycle()
        return jsonify({"success": True, "data": result})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/sentiment/<symbol>")
def api_sentiment(symbol):
    """Sentiment analysis for symbol."""
    prices = get_historical_prices(symbol, days=30)
    result = sentiment_analysis(symbol, prices)
    return jsonify(result)


@app.route("/api/watchlist", methods=["GET", "POST", "DELETE"])
@login_required
def api_watchlist():
    """Watchlist CRUD."""
    if request.method == "GET":
        return jsonify(get_watchlist(session["user_id"]))
    data = request.get_json() or {}
    symbol = data.get("symbol", "").lower()
    if request.method == "POST":
        ok = add_to_watchlist(session["user_id"], symbol)
        if ok:
            add_notification(session["user_id"], f"Added {symbol.upper()} to watchlist")
        return jsonify({"success": ok})
    if request.method == "DELETE":
        remove_from_watchlist(session["user_id"], symbol)
        return jsonify({"success": True})
    return jsonify({"error": "Method not allowed"}), 405


@app.route("/api/portfolio", methods=["GET", "POST"])
@login_required
def api_portfolio():
    """Portfolio tracker API."""
    if request.method == "GET":
        holdings = get_portfolio(session["user_id"])
        market = get_cached_market()
        total_value = 0
        for h in holdings:
            sym = h["symbol"]
            current = market.get("assets", {}).get(sym, {}).get("price", h["buy_price"])
            total_value += h["quantity"] * current
        return jsonify({"holdings": holdings, "total_value": round(total_value, 2)})
    data = request.get_json() or {}
    add_portfolio_item(
        session["user_id"],
        data.get("symbol", ""),
        float(data.get("quantity", 0)),
        float(data.get("buy_price", 0)),
    )
    return jsonify({"success": True})


@app.route("/api/news")
def api_news():
    """Simulated financial news ticker."""
    headlines = [
        "Gold hits new weekly high amid dollar weakness",
        "Bitcoin ETF inflows surge to record levels",
        "Fed signals cautious rate path for 2024",
        "Crude oil steady as OPEC+ maintains output cuts",
        "Ethereum network upgrade boosts DeFi activity",
        "USD/INR range-bound ahead of RBI policy meet",
        "S&P 500 reaches fresh all-time high on tech rally",
        "Silver demand rises from industrial sector",
        "Platinum supply constraints support prices",
        "Global mutual fund SIP collections hit new peak",
    ]
    return jsonify({"headlines": headlines, "updated": datetime.utcnow().isoformat()})


@app.route("/api/calculate", methods=["POST"])
def api_calculate():
    """Investment calculator endpoints."""
    data = request.get_json() or {}
    calc_type = data.get("type", "")

    if calc_type == "sip":
        monthly = float(data.get("monthly", 5000))
        rate = float(data.get("rate", 12)) / 100 / 12
        years = int(data.get("years", 10))
        months = years * 12
        if rate > 0:
            fv = monthly * (((1 + rate) ** months - 1) / rate) * (1 + rate)
        else:
            fv = monthly * months
        invested = monthly * months
        return jsonify({
            "future_value": round(fv, 2),
            "invested": round(invested, 2),
            "returns": round(fv - invested, 2),
        })

    if calc_type in ("gold", "silver"):
        grams = float(data.get("grams", 10))
        price_per_gram = float(data.get("price", 65))
        years = int(data.get("years", 5))
        appreciation = float(data.get("appreciation", 8)) / 100
        current_value = grams * price_per_gram
        future_value = current_value * ((1 + appreciation) ** years)
        return jsonify({
            "current_value": round(current_value, 2),
            "future_value": round(future_value, 2),
            "profit": round(future_value - current_value, 2),
        })

    if calc_type == "crypto":
        buy_price = float(data.get("buy_price", 50000))
        sell_price = float(data.get("sell_price", 60000))
        quantity = float(data.get("quantity", 1))
        profit = (sell_price - buy_price) * quantity
        roi = ((sell_price - buy_price) / buy_price) * 100 if buy_price else 0
        return jsonify({"profit": round(profit, 2), "roi": round(roi, 2)})

    if calc_type == "emi":
        principal = float(data.get("principal", 1000000))
        rate = float(data.get("rate", 8.5)) / 100 / 12
        tenure = int(data.get("tenure", 240))
        if rate > 0:
            emi = principal * rate * ((1 + rate) ** tenure) / (((1 + rate) ** tenure) - 1)
        else:
            emi = principal / tenure
        total = emi * tenure
        interest = round(total - principal, 2)
        return jsonify({
            "emi": round(emi, 2),
            "total_payment": round(total, 2),
            "total_interest": interest,
            "interest": interest,
        })

    if calc_type == "compound":
        principal = float(data.get("principal", 100000))
        rate = float(data.get("rate", 10)) / 100
        years = int(data.get("years", 10))
        frequency = int(data.get("frequency", 4))
        amount = principal * (1 + rate / frequency) ** (frequency * years)
        maturity = round(amount, 2)
        earned = round(amount - principal, 2)
        return jsonify({
            "maturity": maturity,
            "final_amount": maturity,
            "interest_earned": earned,
        })

    return jsonify({"error": "Unknown calculator type"}), 400


# ---------------------------------------------------------------------------
# Template context
# ---------------------------------------------------------------------------
@app.context_processor
def inject_globals():
    """Global template variables."""
    return {
        "app_name": "LexorA",
        "year": datetime.now().year,
        "cache_updated": _market_cache.get("updated"),
    }


# ---------------------------------------------------------------------------
# Application entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    init_db()
    # Start background market refresh thread
    refresh_thread = threading.Thread(target=refresh_market_background, daemon=True)
    refresh_thread.start()
    # Initial data load
    with _cache_lock:
        _market_cache["data"] = fetch_market_data()
        _market_cache["updated"] = datetime.utcnow().isoformat()
    run_curation_cycle()
    print("LexorA AI Market Predictor starting...")
    print("Open http://127.0.0.1:5000 in your browser")
    app.run(debug=True, host="0.0.0.0", port=5000, use_reloader=False)
