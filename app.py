"""
LexorA AI Market Predictor - Main Flask Application
Real-time AI-powered investment prediction platform.
"""

import os
import sys
import threading
import time
from datetime import datetime, timedelta
from functools import wraps

from flask import (
    Flask, render_template, request, redirect, url_for,
    session, jsonify, flash,
)
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from dotenv import load_dotenv
import pyotp
import qrcode
import io
import base64

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
from auth.auth import AuthManager, hash_password, verify_password, generate_reset_token, GoogleOAuth, GitHubOAuth

# ---------------------------------------------------------------------------
# Flask app configuration
# ---------------------------------------------------------------------------
app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "lexora-ai-market-predictor-2024-secret")
app.config["SESSION_PERMANENT"] = True
app.config["SESSION_COOKIE_SECURE"] = True  # Required for HTTPS
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "None"  # None for cross-origin

# Enable CORS for cross-origin requests from GitHub Pages
CORS(app, resources={
    r"/*": {
        "origins": ["https://dibyasagar005-code.github.io", "https://lexora-live.onrender.com"],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "supports_credentials": True
    }
})

# Initialize Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'
login_manager.login_message = 'Please log in to access this page.'

# In-memory cache for live market data (refreshed by background thread)
_market_cache = {"data": None, "updated": None}
_cache_lock = threading.Lock()

# Rate limiting for login attempts (in-memory)
_login_attempts = {}
_lockout_threshold = 5
_lockout_duration = 300  # 5 minutes

# Initialize AuthManager
auth_manager = AuthManager(session)

# Initialize database
init_db()

# Initialize Google OAuth
google_oauth = None
if os.environ.get("GOOGLE_CLIENT_ID") and os.environ.get("GOOGLE_CLIENT_SECRET"):
    google_oauth = GoogleOAuth(
        client_id=os.environ.get("GOOGLE_CLIENT_ID"),
        client_secret=os.environ.get("GOOGLE_CLIENT_SECRET"),
        redirect_uri=os.environ.get("APP_URL", "https://lexora-live.onrender.com") + "/auth/google/callback"
    )

# Initialize GitHub OAuth
github_oauth = None
if os.environ.get("GITHUB_CLIENT_ID") and os.environ.get("GITHUB_CLIENT_SECRET"):
    github_oauth = GitHubOAuth(
        client_id=os.environ.get("GITHUB_CLIENT_ID"),
        client_secret=os.environ.get("GITHUB_CLIENT_SECRET"),
        redirect_uri=os.environ.get("APP_URL", "https://lexora-live.onrender.com") + "/auth/github/callback"
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


def check_rate_limit(identifier):
    """Check if identifier is rate limited for login attempts."""
    now = datetime.utcnow().timestamp()
    
    # Clean up old entries
    _login_attempts[identifier] = [
        attempt for attempt in _login_attempts.get(identifier, [])
        if now - attempt < _lockout_duration
    ]
    
    attempts = _login_attempts.get(identifier, [])
    
    if len(attempts) >= _lockout_threshold:
        return False, f"Account locked. Try again in {_lockout_duration // 60} minutes."
    
    return True, None


def record_login_attempt(identifier):
    """Record a failed login attempt for rate limiting."""
    now = datetime.utcnow().timestamp()
    if identifier not in _login_attempts:
        _login_attempts[identifier] = []
    _login_attempts[identifier].append(now)


def clear_login_attempts(identifier):
    """Clear login attempts after successful login."""
    if identifier in _login_attempts:
        del _login_attempts[identifier]


def generate_jwt_token(user_id, email):
    """Generate JWT token for cross-origin authentication."""
    secret = app.secret_key
    payload = {
        'user_id': user_id,
        'email': email,
        'exp': datetime.utcnow() + timedelta(days=30)
    }
    return jwt.encode(payload, secret, algorithm='HS256')


def verify_jwt_token(token):
    """Verify JWT token and return user_id if valid."""
    try:
        secret = app.secret_key
        payload = jwt.decode(token, secret, algorithms=['HS256'])
        return payload.get('user_id')
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


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
@app.route("/auth/login", methods=["POST", "OPTIONS"])
def auth_login():
    """Handle login request with persistent session support and returning user tracking."""
    if request.method == "OPTIONS":
        return jsonify({"success": True})
    
    email = request.form.get("email")
    password = request.form.get("password")
    remember = request.form.get("remember") == "on"
    
    if not email or not password:
        return jsonify({"success": False, "error": "Email and password are required"})
    
    # Check rate limiting
    allowed, error = check_rate_limit(email)
    if not allowed:
        return jsonify({"success": False, "error": error})
    
    result = auth_manager.authenticate_email_password(email, password)
    if result["success"]:
        clear_login_attempts(email)
        # Set persistent session if remember me is checked
        if remember:
            session.permanent = True
            app.permanent_session_lifetime = datetime.timedelta(days=30)
        else:
            session.permanent = False
        
        # Track returning user and create notification
        from models.database import get_user_by_email, get_user_login_count, create_notification
        user = get_user_by_email(email)
        if user:
            login_count = get_user_login_count(user['id'])
            if login_count > 1:
                create_notification(user['id'], f"Welcome back! This is your #{login_count} login to LexorA.")
        
        return jsonify({"success": True, "redirect": "/"})
    else:
        record_login_attempt(email)
        return jsonify(result)


@app.route("/auth/register", methods=["POST", "OPTIONS"])
def auth_register():
    """Handle registration request with enhanced validation."""
    if request.method == "OPTIONS":
        return jsonify({"success": True})
    
    username = request.form.get("username", "").strip()
    email = request.form.get("email", "").strip().lower()
    password = request.form.get("password", "")
    confirm_password = request.form.get("confirm_password", "")
    
    # Basic field validation
    if not all([username, email, password, confirm_password]):
        return jsonify({"success": False, "error": "All fields are required"})
    
    # Username validation
    if len(username) < 3:
        return jsonify({"success": False, "error": "Username must be at least 3 characters"})
    if len(username) > 30:
        return jsonify({"success": False, "error": "Username must be less than 30 characters"})
    if not username.isalnum() and not all(c.isalnum() or c in '_-' for c in username):
        return jsonify({"success": False, "error": "Username can only contain letters, numbers, hyphens, and underscores"})
    
    # Email validation
    if '@' not in email or '.' not in email.split('@')[-1]:
        return jsonify({"success": False, "error": "Please enter a valid email address"})
    
    # Password matching
    if password != confirm_password:
        return jsonify({"success": False, "error": "Passwords do not match"})
    
    # Password strength validation
    if len(password) < 8:
        return jsonify({"success": False, "error": "Password must be at least 8 characters"})
    
    # Check for at least one uppercase, one lowercase, one digit
    has_upper = any(c.isupper() for c in password)
    has_lower = any(c.islower() for c in password)
    has_digit = any(c.isdigit() for c in password)
    
    if not (has_upper and has_lower and has_digit):
        return jsonify({"success": False, "error": "Password must contain uppercase, lowercase, and digit"})
    
    # Check for common passwords
    common_passwords = ['password', '12345678', 'qwerty', 'abc123', 'password123']
    if password.lower() in common_passwords:
        return jsonify({"success": False, "error": "Please choose a stronger password"})
    
    result = auth_manager.register_user(username, email, password)
    if result["success"]:
        return jsonify({"success": True, "message": "Registration successful! You can now login.", "redirect": "/login"})
    return jsonify(result)


@app.route("/api/auth/status")
def api_auth_status():
    """Check authentication status."""
    if current_user.is_authenticated:
        return jsonify({"authenticated": True, "user": {"username": current_user.username, "email": current_user.email}})
    return jsonify({"authenticated": False})


@app.route("/auth/logout", methods=["POST", "OPTIONS"])
def auth_logout():
    """Handle logout request."""
    if request.method == "OPTIONS":
        return jsonify({"success": True})
    
    auth_manager.logout_user()
    return jsonify({"success": True, "message": "Logged out successfully"})


@app.route("/auth/forgot-password", methods=["POST", "OPTIONS"])
def forgot_password():
    """Handle forgot password request."""
    if request.method == "OPTIONS":
        return jsonify({"success": True})
    
    email = request.form.get("email")
    if not email:
        return jsonify({"success": False, "error": "Email is required"})
    
    result = auth_manager.initiate_password_reset(email)
    if result["success"]:
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
        return redirect("https://dibyasagar005-code.github.io/lexora-live/login.html")
    
    auth_url = google_oauth.get_authorization_url()
    return redirect(auth_url)


@app.route("/auth/google/callback")
def google_callback():
    """Google OAuth callback."""
    if not google_oauth:
        flash("Google OAuth is not configured.", "error")
        return redirect("/login")
    
    code = request.args.get("code")
    if not code:
        flash("Authorization failed. Please try again.", "error")
        return redirect("/login")
    
    try:
        # Exchange code for token
        token_response = google_oauth.exchange_code_for_token(code)
        
        if "error" in token_response:
            flash(f"OAuth error: {token_response.get('error_description', token_response['error'])}", "error")
            return redirect("/login")
        
        access_token = token_response.get("access_token")
        
        # Get user info
        user_info = google_oauth.get_user_info(access_token)
        
        google_id = user_info.get("sub")
        email = user_info.get("email")
        name = user_info.get("name")
        
        if not google_id or not email:
            flash("Failed to get user information from Google.", "error")
            return redirect("/login")
        
        # Authenticate or register user
        result = auth_manager.authenticate_google(google_id, email, name)
        
        if result["success"]:
            flash(f"Welcome, {name}!", "success")
            return redirect("/")
        else:
            flash(result.get("error", "Authentication failed"), "error")
            return redirect("/login")
            
    except Exception as e:
        flash(f"Authentication error: {str(e)}", "error")
        return redirect("/login")


@app.route("/auth/github")
def github_login():
    """Initiate GitHub OAuth login."""
    if not github_oauth:
        flash("GitHub OAuth is not configured.", "error")
        return redirect("/login")
    
    auth_url = github_oauth.get_auth_url()
    return redirect(auth_url)


@app.route("/auth/github/callback")
def github_callback():
    """GitHub OAuth callback handler."""
    if not github_oauth:
        flash("GitHub OAuth is not configured.", "error")
        return redirect("/login")
    
    code = request.args.get("code")
    state = request.args.get("state")
    error = request.args.get("error")
    
    if error:
        flash(f"GitHub OAuth error: {error}", "error")
        return redirect("/login")
    
    if not code:
        flash("Authorization failed. Please try again.", "error")
        return redirect("/login")
    
    try:
        # Exchange code for token
        access_token = github_oauth.get_access_token(code)
        if not access_token:
            flash("Failed to exchange authorization code for token.", "error")
            return redirect("/login")
        
        # Get user info
        user_info = github_oauth.get_user_info(access_token)
        
        # Check if user exists
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE github_id = ?", (user_info["id"],))
            user = cursor.fetchone()
            
            if user:
                # Existing user - log them in
                session["user_id"] = user["id"]
                session["auth_method"] = "github"
                
                # Log login history
                cursor.execute("""
                    INSERT INTO login_history (user_id, login_method, ip_address, user_agent, success)
                    VALUES (?, ?, ?, ?, ?)
                """, (
                    user["id"],
                    "github",
                    request.remote_addr,
                    request.headers.get("User-Agent"),
                    1
                ))
                conn.commit()
                
                flash(f"Welcome back, {username}!", "success")
                return redirect("/")
            else:
                # New user - create account
                username = user_info["username"] or user_info["email"].split("@")[0]
                email = user_info["email"]
                
                # Check if username exists
                cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
                if cursor.fetchone():
                    username = f"{username}_{user_info['id']}"
                
                # Check if email exists
                cursor.execute("SELECT id FROM users WHERE email = ?", (email,))
                if cursor.fetchone():
                    flash("Email already registered. Please login with your existing account.", "error")
                    return redirect("/login")
                
                # Create user
                cursor.execute("""
                    INSERT INTO users (username, email, github_id, is_verified)
                    VALUES (?, ?, ?, 1)
                """, (username, email, user_info["id"]))
                conn.commit()
                
                user_id = cursor.lastrowid
                session["user_id"] = user_id
                session["auth_method"] = "github"
                
                # Log login history
                cursor.execute("""
                    INSERT INTO login_history (user_id, login_method, ip_address, user_agent, success)
                    VALUES (?, ?, ?, ?, ?)
                """, (
                    user_id,
                    "github",
                    request.remote_addr,
                    request.headers.get("User-Agent"),
                    1
                ))
                conn.commit()
                
                flash(f"Welcome, {username}!", "success")
                return redirect("/")
    
    except Exception as e:
        flash(f"GitHub OAuth error: {str(e)}", "error")
        return redirect("/login")


@app.route("/auth/send-otp", methods=["POST", "OPTIONS"])
def send_otp():
    """Send OTP to phone number."""
    if request.method == "OPTIONS":
        return jsonify({"success": True})
    
    phone = request.form.get("phone")
    if not phone:
        return jsonify({"success": False, "error": "Phone number is required"})
    
    # Will be implemented with Twilio
    return jsonify({"success": False, "error": "OTP service not configured yet"})


@app.route("/auth/verify-otp", methods=["POST", "OPTIONS"])
def verify_otp():
    """Verify OTP code."""
    if request.method == "OPTIONS":
        return jsonify({"success": True})
    
    phone = request.form.get("phone")
    otp = request.form.get("otp")
    
    if not phone or not otp:
        return jsonify({"success": False, "error": "Phone and OTP are required"})
    
    # Will be implemented with pyotp
    return jsonify({"success": False, "error": "OTP verification not implemented yet"})


# WebAuthn biometric authentication routes (commented out due to library compatibility issues)
# Will be implemented with a different WebAuthn library
"""
@app.route("/auth/webauthn/register/begin", methods=["POST"])
@login_required
def webauthn_register_begin():
    # WebAuthn registration implementation
    pass

@app.route("/auth/webauthn/register/complete", methods=["POST"])
@login_required
def webauthn_register_complete():
    # WebAuthn registration completion
    pass

@app.route("/auth/webauthn/login/begin", methods=["POST"])
def webauthn_login_begin():
    # WebAuthn login initiation
    pass

@app.route("/auth/webauthn/login/complete", methods=["POST"])
def webauthn_login_complete():
    # WebAuthn login completion
    pass
"""


@app.route("/auth/2fa/setup", methods=["POST"])
@login_required
def setup_2fa():
    """Setup Two-Factor Authentication for user."""
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "Not authenticated"}), 401
    
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Check if 2FA is already setup
        cursor.execute("SELECT secret, enabled FROM totp_secrets WHERE user_id = ?", (user_id,))
        existing = cursor.fetchone()
        
        if existing and existing["enabled"]:
            return jsonify({"success": False, "error": "2FA is already enabled"})
        
        # Generate new TOTP secret
        secret = pyotp.random_base32()
        
        # Store or update the secret
        if existing:
            cursor.execute("""
                UPDATE totp_secrets 
                SET secret = ?, enabled = 0, verified = 0 
                WHERE user_id = ?
            """, (secret, user_id))
        else:
            cursor.execute("""
                INSERT INTO totp_secrets (user_id, secret, enabled, verified)
                VALUES (?, ?, 0, 0)
            """, (user_id, secret))
        
        conn.commit()
        
        # Generate QR code
        totp = pyotp.TOTP(secret)
        provisioning_uri = totp.provisioning_uri(
            name=f"lexora:{session.get('email', 'user')}",
            issuer_name="LexorA"
        )
        
        # Generate QR code image
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(provisioning_uri)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Convert to base64
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        qr_code_data = base64.b64encode(buffer.getvalue()).decode()
        
        return jsonify({
            "success": True,
            "secret": secret,
            "qr_code": f"data:image/png;base64,{qr_code_data}",
            "provisioning_uri": provisioning_uri
        })


@app.route("/auth/2fa/verify", methods=["POST"])
def verify_2fa():
    """Verify TOTP code during setup."""
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "Not authenticated"}), 401
    
    code = request.json.get("code")
    if not code or len(code) != 6:
        return jsonify({"success": False, "error": "Invalid code format"}), 400
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT secret FROM totp_secrets WHERE user_id = ?", (user_id,))
        result = cursor.fetchone()
        
        if not result:
            return jsonify({"success": False, "error": "2FA not setup"}), 400
        
        secret = result["secret"]
        totp = pyotp.TOTP(secret)
        
        if totp.verify(code):
            # Mark as verified and enabled
            cursor.execute("""
                UPDATE totp_secrets 
                SET verified = 1, enabled = 1 
                WHERE user_id = ?
            """, (user_id,))
            conn.commit()
            
            return jsonify({"success": True, "message": "2FA enabled successfully"})
        else:
            return jsonify({"success": False, "error": "Invalid code"}), 400


@app.route("/auth/2fa/disable", methods=["POST"])
def disable_2fa():
    """Disable Two-Factor Authentication."""
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "Not authenticated"}), 401
    
    password = request.json.get("password")
    if not password:
        return jsonify({"success": False, "error": "Password required"}), 400
    
    # Verify password
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,))
        result = cursor.fetchone()
        
        if not result or not check_password_hash(result["password_hash"], password):
            return jsonify({"success": False, "error": "Invalid password"}), 400
        
        # Disable 2FA
        cursor.execute("""
            UPDATE totp_secrets 
            SET enabled = 0, verified = 0 
            WHERE user_id = ?
        """, (user_id,))
        conn.commit()
        
        return jsonify({"success": True, "message": "2FA disabled successfully"})


@app.route("/auth/2fa/status", methods=["GET"])
def get_2fa_status():
    """Get 2FA status for user."""
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "Not authenticated"}), 401
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT enabled, verified FROM totp_secrets WHERE user_id = ?", (user_id,))
        result = cursor.fetchone()
        
        if result:
            return jsonify({
                "success": True,
                "enabled": bool(result["enabled"]),
                "verified": bool(result["verified"])
            })
        else:
            return jsonify({
                "success": True,
                "enabled": False,
                "verified": False
            })


@app.route("/api/security/login-history", methods=["GET"])
def get_login_history():
    """Get login history for security dashboard."""
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "Not authenticated"}), 401
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT login_method, ip_address, user_agent, success, timestamp
            FROM login_history
            WHERE user_id = ?
            ORDER BY timestamp DESC
            LIMIT 50
        """, (user_id,))
        history = cursor.fetchall()
        
        return jsonify({
            "success": True,
            "history": [dict(row) for row in history]
        })


@app.route("/api/security/sessions", methods=["GET"])
@login_required
def get_active_sessions():
    """Get active sessions for user."""
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "Not authenticated"}), 401
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT session_id, device_info, ip_address, last_activity, expires_at
            FROM active_sessions
            WHERE user_id = ?
            ORDER BY last_activity DESC
        """, (user_id,))
        sessions = cursor.fetchall()
        
        return jsonify({
            "success": True,
            "sessions": [dict(row) for row in sessions]
        })


@app.route("/api/security/sessions/<session_id>", methods=["DELETE"])
@login_required
def revoke_session(session_id):
    """Revoke a specific session."""
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "Not authenticated"}), 401
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            DELETE FROM active_sessions
            WHERE session_id = ? AND user_id = ?
        """, (session_id, user_id))
        conn.commit()
        
        return jsonify({"success": True, "message": "Session revoked"})


@app.route("/api/security/sessions/revoke-all", methods=["POST"])
def revoke_all_sessions():
    """Revoke all sessions except current."""
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "Not authenticated"}), 401
    
    current_session_id = session.get("session_id")
    
    with get_db() as conn:
        cursor = conn.cursor()
        if current_session_id:
            cursor.execute("""
                DELETE FROM active_sessions
                WHERE user_id = ? AND session_id != ?
            """, (user_id, current_session_id))
        else:
            cursor.execute("""
                DELETE FROM active_sessions
                WHERE user_id = ?
            """, (user_id,))
        conn.commit()
        
        return jsonify({"success": True, "message": "All sessions revoked"})


@app.route("/api/notifications", methods=["GET"])
def get_notifications():
    """Get unread notifications for the current user."""
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "Not authenticated"}), 401
    
    from models.database import get_unread_notifications
    notifications = get_unread_notifications(user_id)
    
    return jsonify({"success": True, "notifications": notifications})


@app.route("/api/notifications/<int:notification_id>/read", methods=["POST"])
def mark_notification_read_api(notification_id):
    """Mark a notification as read."""
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "error": "Not authenticated"}), 401
    
    from models.database import mark_notification_read
    mark_notification_read(notification_id)
    
    return jsonify({"success": True})


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


@app.route("/login")
def login():
    """Login page."""
    return render_template("login.html")


@app.route("/register")
def register():
    """Registration page."""
    return render_template("register.html")


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
def dashboard():
    """User dashboard with portfolio and predictions - accessible without login."""
    user_id = session.get("user_id")
    predictions = get_predictions(limit=10)
    portfolio = get_portfolio(user_id) if user_id else []
    watchlist = get_watchlist(user_id) if user_id else []
    notifications = get_notifications(user_id) if user_id else []
    market = get_cached_market()
    user = None
    if user_id:
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
def watchlist():
    """User watchlist page - accessible without login."""
    user_id = session.get("user_id")
    watchlist = get_watchlist(user_id) if user_id else []
    market = get_cached_market()
    user = None
    if user_id:
        from models.database import get_db
        with get_db() as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            user = dict(row) if row else None
    return render_template("watchlist.html", watchlist=watchlist, market=market, user=user)


@app.route("/history")
def history():
    """Price and prediction history - accessible without login."""
    user_id = session.get("user_id")
    symbol = request.args.get("symbol", "bitcoin")
    prices = get_price_history(symbol, limit=100)
    predictions = get_predictions(symbol, limit=20) if user_id else []
    curated = get_curated_history(symbol, limit=50)
    market = get_cached_market()
    user = None
    if user_id:
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
def settings():
    """User settings page - accessible without login."""
    user_id = session.get("user_id")
    market = get_cached_market()
    user = None
    if user_id:
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
    """AI prediction for a symbol using live market data."""
    try:
        # Get current market data to use live price
        market = get_cached_market()
        current_price = None
        if market and market.get("assets", {}).get(symbol):
            current_price = market["assets"][symbol].get("price")
        
        result = run_prediction(symbol, current_market_price=current_price)
        return jsonify({"success": True, "data": result})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/predictions/all")
def api_predictions_all():
    """All asset predictions using live market data."""
    try:
        market = get_cached_market()
        results = predict_all_assets(market_data=market)
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
