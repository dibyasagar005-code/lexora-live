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
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from dotenv import load_dotenv

# Add project root to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Load environment variables
load_dotenv()

from models.database import (
    init_db, get_user_by_username, get_user_by_email, create_user, log_user_action,
    get_watchlist, add_to_watchlist, remove_from_watchlist,
    get_portfolio, add_portfolio_item, get_notifications, add_notification,
    get_price_history, get_predictions, get_db,
)
from api.market_data import fetch_market_data
from data.curation import run_curation_cycle, get_curated_history, generate_prediction
from ai.predictor import run_prediction, predict_all_assets, sentiment_analysis
from api.market_data import get_historical_prices
from auth.auth import AuthManager, hash_password, verify_password, generate_reset_token, GoogleOAuth

# ---------------------------------------------------------------------------
# Flask app configuration
# ---------------------------------------------------------------------------
app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "lexora-ai-market-predictor-2024-secret")
app.config["SESSION_PERMANENT"] = True
app.config["SESSION_COOKIE_SECURE"] = os.environ.get("SESSION_COOKIE_SECURE", "False") == "True"
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

# Initialize Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'
login_manager.login_message = 'Please log in to access this page.'

# In-memory cache for live market data (refreshed by background thread)
_market_cache = {"data": None, "updated": None}
_cache_lock = threading.Lock()

# Initialize AuthManager
auth_manager = AuthManager(session)

# Initialize Google OAuth
google_oauth = None
if os.environ.get("GOOGLE_CLIENT_ID") and os.environ.get("GOOGLE_CLIENT_SECRET"):
    google_oauth = GoogleOAuth(
        client_id=os.environ.get("GOOGLE_CLIENT_ID"),
        client_secret=os.environ.get("GOOGLE_CLIENT_SECRET"),
        redirect_uri=os.environ.get("APP_URL", "http://localhost:5000") + "/auth/google/callback"
    )


# Flask-Login user loader
@login_manager.user_loader
def load_user(user_id):
    """Load user for Flask-Login."""
    from models.database import get_db
    with get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if row:
        return type('User', (object,), dict(row))()
    return None


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
# Authentication routes
# ---------------------------------------------------------------------------
@app.route("/login")
def login():
    """Login page."""
    return render_template("login.html")


@app.route("/register")
def register():
    """Registration page."""
    return render_template("register.html")


@app.route("/auth/login", methods=["POST"])
def auth_login():
    """Handle login request."""
    email = request.form.get("email")
    password = request.form.get("password")
    remember = request.form.get("remember") == "on"
    
    if not email or not password:
        return jsonify({"success": False, "error": "Email and password are required"})
    
    result = auth_manager.authenticate_email_password(email, password)
    if result["success"]:
        return jsonify({"success": True, "redirect": url_for("index")})
    return jsonify(result)


@app.route("/auth/register", methods=["POST"])
def auth_register():
    """Handle registration request."""
    username = request.form.get("username")
    email = request.form.get("email")
    password = request.form.get("password")
    confirm_password = request.form.get("confirm_password")
    
    if not all([username, email, password, confirm_password]):
        return jsonify({"success": False, "error": "All fields are required"})
    
    if password != confirm_password:
        return jsonify({"success": False, "error": "Passwords do not match"})
    
    if len(password) < 8:
        return jsonify({"success": False, "error": "Password must be at least 8 characters"})
    
    result = auth_manager.register_user(username, email, password)
    if result["success"]:
        return jsonify({"success": True, "message": "Registration successful", "redirect": url_for("login")})
    return jsonify(result)


@app.route("/auth/logout")
def auth_logout():
    """Handle logout request."""
    auth_manager.logout_user()
    return redirect(url_for("login"))


@app.route("/auth/forgot-password", methods=["POST"])
def forgot_password():
    """Handle forgot password request."""
    email = request.form.get("email")
    if not email:
        return jsonify({"success": False, "error": "Email is required"})
    
    result = auth_manager.initiate_password_reset(email)
    if result["success"]:
        # In production, send email with reset link
        return jsonify({"success": True, "message": "Password reset link sent to your email"})
    return jsonify(result)


@app.route("/auth/reset-password/<token>", methods=["GET", "POST"])
def reset_password(token):
    """Handle password reset with token."""
    if request.method == "GET":
        return render_template("reset_password.html", token=token)
    
    new_password = request.form.get("password")
    confirm_password = request.form.get("confirm_password")
    
    if not new_password or new_password != confirm_password:
        return jsonify({"success": False, "error": "Passwords do not match"})
    
    # Validate token and reset password
    return jsonify({"success": False, "error": "Token validation not implemented yet"})


@app.route("/auth/google")
def google_login():
    """Google OAuth login redirect."""
    if not google_oauth:
        flash("Google OAuth is not configured. Please contact administrator.", "error")
        return redirect(url_for("login"))
    
    auth_url = google_oauth.get_authorization_url()
    return redirect(auth_url)


@app.route("/auth/google/callback")
def google_callback():
    """Google OAuth callback."""
    if not google_oauth:
        flash("Google OAuth is not configured.", "error")
        return redirect(url_for("login"))
    
    code = request.args.get("code")
    if not code:
        flash("Authorization failed. Please try again.", "error")
        return redirect(url_for("login"))
    
    try:
        # Exchange code for token
        token_response = google_oauth.exchange_code_for_token(code)
        
        if "error" in token_response:
            flash(f"OAuth error: {token_response.get('error_description', token_response['error'])}", "error")
            return redirect(url_for("login"))
        
        access_token = token_response.get("access_token")
        
        # Get user info
        user_info = google_oauth.get_user_info(access_token)
        
        google_id = user_info.get("sub")
        email = user_info.get("email")
        name = user_info.get("name")
        
        if not google_id or not email:
            flash("Failed to get user information from Google.", "error")
            return redirect(url_for("login"))
        
        # Authenticate or register user
        result = auth_manager.authenticate_google(google_id, email, name)
        
        if result["success"]:
            if result.get("new_user"):
                flash(f"Welcome to LexorA, {name}!", "success")
            else:
                flash(f"Welcome back, {name}!", "success")
            return redirect(url_for("index"))
        else:
            flash(result.get("error", "Authentication failed"), "error")
            return redirect(url_for("login"))
            
    except Exception as e:
        flash(f"Authentication error: {str(e)}", "error")
        return redirect(url_for("login"))


@app.route("/auth/send-otp", methods=["POST"])
def send_otp():
    """Send OTP to phone number."""
    phone = request.form.get("phone")
    if not phone:
        return jsonify({"success": False, "error": "Phone number is required"})
    
    # Will be implemented with Twilio
    return jsonify({"success": False, "error": "OTP service not configured yet"})


@app.route("/auth/verify-otp", methods=["POST"])
def verify_otp():
    """Verify OTP code."""
    phone = request.form.get("phone")
    otp = request.form.get("otp")
    
    if not phone or not otp:
        return jsonify({"success": False, "error": "Phone and OTP are required"})
    
    # Will be implemented with pyotp
    return jsonify({"success": False, "error": "OTP verification not implemented yet"})


# ---------------------------------------------------------------------------
# Page routes
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    """Home page with market overview - accessible without login."""
    market = get_cached_market()
    user_id = session.get("user_id")
    user = None
    if user_id:
        from models.database import get_db
        with get_db() as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            if row:
                user = dict(row)
    return render_template("index.html", market=market, user=user)


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
    """Live markets page - accessible without login."""
    market = get_cached_market()
    user_id = session.get("user_id")
    user = None
    if user_id:
        from models.database import get_db
        with get_db() as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            if row:
                user = dict(row)
    return render_template("markets.html", market=market, user=user)


@app.route("/prediction")
@app.route("/prediction/<symbol>")
def prediction(symbol="bitcoin"):
    """AI prediction page for a specific asset - accessible without login."""
    pred = run_prediction(symbol)
    market = get_cached_market()
    user_id = session.get("user_id")
    user = None
    if user_id:
        from models.database import get_db
        with get_db() as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            if row:
                user = dict(row)
    return render_template(
        "prediction.html",
        prediction=pred,
        symbol=symbol,
        market=market,
        user=user,
    )


@app.route("/dashboard")
@login_required
def dashboard():
    """User dashboard with portfolio and predictions."""
    user_id = session.get("user_id")
    predictions = get_predictions(limit=10)
    portfolio = get_portfolio(user_id)
    watchlist = get_watchlist(user_id)
    notifications = get_notifications(user_id)
    market = get_cached_market()
    from models.database import get_db
    with get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        user = dict(row) if row else None
    return render_template(
        "dashboard.html",
        predictions=predictions,
        portfolio=portfolio,
        watchlist=watchlist,
        notifications=notifications,
        market=market,
        user=user,
    )


@app.route("/watchlist")
@login_required
def watchlist():
    """User watchlist page."""
    user_id = session.get("user_id")
    watchlist = get_watchlist(user_id)
    market = get_cached_market()
    from models.database import get_db
    with get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        user = dict(row) if row else None
    return render_template("watchlist.html", watchlist=watchlist, market=market, user=user)


@app.route("/history")
@login_required
def history():
    """Price and prediction history - requires login."""
    user_id = session.get("user_id")
    symbol = request.args.get("symbol", "bitcoin")
    prices = get_price_history(symbol, limit=100)
    predictions = get_predictions(symbol, limit=20)
    curated = get_curated_history(symbol, limit=50)
    market = get_cached_market()
    from models.database import get_db
    with get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        user = dict(row) if row else None
    return render_template(
        "history.html",
        prices=prices,
        predictions=predictions,
        curated=curated,
        symbol=symbol,
        market=market,
        user=user,
    )


@app.route("/settings")
@login_required
def settings():
    """User settings page."""
    user_id = session.get("user_id")
    market = get_cached_market()
    from models.database import get_db
    with get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        user = dict(row) if row else None
    return render_template("settings.html", market=market, user=user)


@app.route("/calculator")
def calculator():
    """Investment calculators page - accessible without login."""
    market = get_cached_market()
    user_id = session.get("user_id")
    user = None
    if user_id:
        from models.database import get_db
        with get_db() as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            if row:
                user = dict(row)
    return render_template("calculator.html", market=market, user=user)


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
