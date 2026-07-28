"""
SQLite database layer for LexorA AI Market Predictor.
Handles schema creation, connections, and CRUD helpers.
"""

import sqlite3
import os
from datetime import datetime
from contextlib import contextmanager

# Database path — works locally and on Streamlit Cloud (/tmp)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.environ.get("LEXORA_DATA_DIR", os.path.join(BASE_DIR, "data"))
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.environ.get("LEXORA_DB_PATH", os.path.join(DATA_DIR, "lexora.db"))


@contextmanager
def get_db():
    """Context manager for database connections with row factory."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    """Create all tables if they do not exist."""
    with get_db() as conn:
        cursor = conn.cursor()

        # Users table for authentication
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT,
                phone TEXT UNIQUE,
                google_id TEXT UNIQUE,
                github_id TEXT UNIQUE,
                is_verified INTEGER DEFAULT 0,
                verification_token TEXT,
                verification_token_expiry TIMESTAMP,
                reset_token TEXT,
                reset_token_expiry TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP,
                login_count INTEGER DEFAULT 0,
                last_seen TIMESTAMP
            )
        """)

        # Historical price data
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS price_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                price REAL NOT NULL,
                change_pct REAL DEFAULT 0,
                volume REAL DEFAULT 0,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # AI prediction results
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS predictions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                signal TEXT NOT NULL,
                confidence REAL NOT NULL,
                trend TEXT,
                expected_price REAL,
                rsi REAL,
                volatility REAL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # User watchlist
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS watchlist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                symbol TEXT NOT NULL,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                UNIQUE(user_id, symbol)
            )
        """)

        # Activity logs
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                action TEXT NOT NULL,
                details TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)

        # Curated market data
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS curated_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol TEXT NOT NULL,
                open_price REAL,
                high_price REAL,
                low_price REAL,
                close_price REAL NOT NULL,
                volume REAL DEFAULT 0,
                normalized_value REAL,
                source TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Portfolio holdings
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS portfolio (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                symbol TEXT NOT NULL,
                quantity REAL NOT NULL,
                buy_price REAL NOT NULL,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)

        # Notifications
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                message TEXT NOT NULL,
                is_read INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)

        # User settings
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                currency TEXT DEFAULT 'INR',
                theme TEXT DEFAULT 'dark',
                notifications_enabled INTEGER DEFAULT 1,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(user_id)
            )
        """)

        # WebAuthn credentials for biometric authentication
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS webauthn_credentials (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                credential_id TEXT UNIQUE NOT NULL,
                public_key TEXT NOT NULL,
                sign_count INTEGER DEFAULT 0,
                device_type TEXT,
                device_name TEXT,
                last_used TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # Login history for security dashboard
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS login_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                login_method TEXT NOT NULL,
                ip_address TEXT,
                user_agent TEXT,
                success INTEGER DEFAULT 1,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # Active sessions for session management
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS active_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                session_id TEXT UNIQUE NOT NULL,
                device_info TEXT,
                ip_address TEXT,
                last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)

        # TOTP secrets for Two-Factor Authentication
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS totp_secrets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                secret TEXT UNIQUE NOT NULL,
                backup_codes TEXT,
                enabled INTEGER DEFAULT 0,
                verified INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(user_id)
            )
        """)

        conn.commit()


def save_price_history(symbol, price, change_pct=0, volume=0):
    """Insert a price snapshot into price_history."""
    with get_db() as conn:
        conn.execute(
            """INSERT INTO price_history (symbol, price, change_pct, volume)
               VALUES (?, ?, ?, ?)""",
            (symbol, price, change_pct, volume),
        )


def save_prediction(symbol, signal, confidence, trend, expected_price, rsi, volatility):
    """Store an AI prediction result."""
    with get_db() as conn:
        conn.execute(
            """INSERT INTO predictions
               (symbol, signal, confidence, trend, expected_price, rsi, volatility)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (symbol, signal, confidence, trend, expected_price, rsi, volatility),
        )


def save_curated_row(symbol, open_p, high, low, close, volume, normalized, source):
    """Insert curated OHLC data."""
    with get_db() as conn:
        conn.execute(
            """INSERT INTO curated_data
               (symbol, open_price, high_price, low_price, close_price, volume,
                normalized_value, source)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (symbol, open_p, high, low, close, volume, normalized, source),
        )


def get_price_history(symbol, limit=100):
    """Fetch recent price history for a symbol."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT price, change_pct, volume, timestamp
               FROM price_history WHERE symbol = ?
               ORDER BY timestamp DESC LIMIT ?""",
            (symbol, limit),
        ).fetchall()
    return [dict(r) for r in reversed(rows)]


def get_predictions(symbol=None, limit=50):
    """Fetch recent predictions, optionally filtered by symbol."""
    with get_db() as conn:
        if symbol:
            rows = conn.execute(
                """SELECT * FROM predictions WHERE symbol = ?
                   ORDER BY created_at DESC LIMIT ?""",
                (symbol, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT * FROM predictions
                   ORDER BY created_at DESC LIMIT ?""",
                (limit,),
            ).fetchall()
    return [dict(r) for r in rows]


def log_user_action(user_id, action, details=None):
    """Record user activity."""
    with get_db() as conn:
        conn.execute(
            "INSERT INTO user_logs (user_id, action, details) VALUES (?, ?, ?)",
            (user_id, action, details),
        )


def get_user_by_username(username):
    """Lookup user for login."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE username = ?", (username,)
        ).fetchone()
    return dict(row) if row else None


def get_user_by_email(email):
    """Lookup user by email."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE email = ?", (email,)
        ).fetchone()
    return dict(row) if row else None


def get_user_by_phone(phone):
    """Lookup user by phone."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE phone = ?", (phone,)
        ).fetchone()
    return dict(row) if row else None


def get_user_by_google_id(google_id):
    """Lookup user by Google ID."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE google_id = ?", (google_id,)
        ).fetchone()
    return dict(row) if row else None


def get_user_by_github_id(github_id):
    """Lookup user by GitHub ID."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE github_id = ?", (github_id,)
        ).fetchone()
    return dict(row) if row else None


def create_user(username, email, password_hash=None, phone=None, google_id=None, github_id=None):
    """Register a new user."""
    with get_db() as conn:
        conn.execute(
            """INSERT INTO users (username, email, password_hash, phone, google_id, github_id)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (username, email, password_hash, phone, google_id, github_id),
        )


def update_user_password(user_id, password_hash):
    """Update user password."""
    with get_db() as conn:
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (password_hash, user_id),
        )


def set_reset_token(user_id, token, expiry):
    """Set password reset token."""
    with get_db() as conn:
        conn.execute(
            """UPDATE users SET reset_token = ?, reset_token_expiry = ?
               WHERE id = ?""",
            (token, expiry, user_id),
        )


def clear_reset_token(user_id):
    """Clear password reset token."""
    with get_db() as conn:
        conn.execute(
            "UPDATE users SET reset_token = NULL, reset_token_expiry = NULL WHERE id = ?",
            (user_id,),
        )


def verify_user(user_id):
    """Mark user as verified."""
    with get_db() as conn:
        conn.execute(
            "UPDATE users SET is_verified = 1 WHERE id = ?",
            (user_id,),
        )


def update_last_login(user_id):
    """Update user's last login timestamp and increment login count."""
    with get_db() as conn:
        conn.execute(
            "UPDATE users SET last_login = CURRENT_TIMESTAMP, login_count = login_count + 1, last_seen = CURRENT_TIMESTAMP WHERE id = ?",
            (user_id,),
        )


def update_last_seen(user_id):
    """Update user's last seen timestamp for activity tracking."""
    with get_db() as conn:
        conn.execute(
            "UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?",
            (user_id,),
        )


def get_user_login_count(user_id):
    """Get user's total login count."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT login_count FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    return row['login_count'] if row else 0


def create_notification(user_id, message):
    """Create a notification for a user."""
    with get_db() as conn:
        conn.execute(
            "INSERT INTO notifications (user_id, message) VALUES (?, ?)",
            (user_id, message),
        )


def get_unread_notifications(user_id):
    """Get unread notifications for a user."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT * FROM notifications WHERE user_id = ? AND is_read = 0
               ORDER BY created_at DESC LIMIT 10""",
            (user_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def mark_notification_read(notification_id):
    """Mark a notification as read."""
    with get_db() as conn:
        conn.execute(
            "UPDATE notifications SET is_read = 1 WHERE id = ?",
            (notification_id,),
        )


def get_watchlist(user_id):
    """Get user's watchlist symbols."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT symbol, added_at FROM watchlist WHERE user_id = ?",
            (user_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def add_to_watchlist(user_id, symbol):
    """Add symbol to watchlist."""
    with get_db() as conn:
        try:
            conn.execute(
                "INSERT INTO watchlist (user_id, symbol) VALUES (?, ?)",
                (user_id, symbol),
            )
            return True
        except sqlite3.IntegrityError:
            return False


def remove_from_watchlist(user_id, symbol):
    """Remove symbol from watchlist."""
    with get_db() as conn:
        conn.execute(
            "DELETE FROM watchlist WHERE user_id = ? AND symbol = ?",
            (user_id, symbol),
        )


def get_portfolio(user_id):
    """Get user portfolio holdings."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM portfolio WHERE user_id = ?", (user_id,)
        ).fetchall()
    return [dict(r) for r in rows]


def add_portfolio_item(user_id, symbol, quantity, buy_price):
    """Add holding to portfolio."""
    with get_db() as conn:
        conn.execute(
            """INSERT INTO portfolio (user_id, symbol, quantity, buy_price)
               VALUES (?, ?, ?, ?)""",
            (user_id, symbol, quantity, buy_price),
        )


def get_notifications(user_id, unread_only=False):
    """Fetch user notifications."""
    with get_db() as conn:
        if unread_only:
            rows = conn.execute(
                """SELECT * FROM notifications
                   WHERE user_id = ? AND is_read = 0
                   ORDER BY created_at DESC""",
                (user_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT * FROM notifications WHERE user_id = ?
                   ORDER BY created_at DESC LIMIT 20""",
                (user_id,),
            ).fetchall()
    return [dict(r) for r in rows]


def add_notification(user_id, message):
    """Create a notification for user."""
    with get_db() as conn:
        conn.execute(
            "INSERT INTO notifications (user_id, message) VALUES (?, ?)",
            (user_id, message),
        )
