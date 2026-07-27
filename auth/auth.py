"""
Authentication module for LexorA.
Handles password hashing, session management, OAuth, OTP, and email verification.
"""

import bcrypt
import secrets
import pyotp
import requests
from datetime import datetime, timedelta
from models.database import (
    get_user_by_username,
    get_user_by_email,
    get_user_by_phone,
    get_user_by_google_id,
    create_user,
    update_user_password,
    set_reset_token,
    clear_reset_token,
    verify_user,
    update_last_login,
)


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its hash."""
    return bcrypt.checkpw(password.encode('utf-8'), password_hash.encode('utf-8'))


def generate_reset_token() -> str:
    """Generate a secure password reset token."""
    return secrets.token_urlsafe(32)


def generate_otp_secret() -> str:
    """Generate a secret for OTP."""
    return pyotp.random_base32()


def generate_otp(secret: str) -> str:
    """Generate a time-based OTP."""
    totp = pyotp.TOTP(secret)
    return totp.now()


def verify_otp(secret: str, otp: str) -> bool:
    """Verify a time-based OTP."""
    totp = pyotp.TOTP(secret)
    return totp.verify(otp, valid_window=1)


def is_reset_token_valid(user, token: str) -> bool:
    """Check if a password reset token is valid."""
    if not user or not user.get('reset_token'):
        return False
    if user['reset_token'] != token:
        return False
    if not user.get('reset_token_expiry'):
        return False
    expiry = datetime.fromisoformat(user['reset_token_expiry'])
    return datetime.utcnow() < expiry


class GoogleOAuth:
    """Google OAuth 2.0 handler."""
    
    def __init__(self, client_id, client_secret, redirect_uri):
        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri
        self.discovery_url = "https://accounts.google.com/.well-known/openid-configuration"
    
    def get_authorization_url(self):
        """Generate Google OAuth authorization URL."""
        discovery = requests.get(self.discovery_url).json()
        auth_endpoint = discovery.get('authorization_endpoint', 'https://accounts.google.com/o/oauth2/v2/auth')
        
        params = {
            'client_id': self.client_id,
            'redirect_uri': self.redirect_uri,
            'response_type': 'code',
            'scope': 'openid email profile',
            'access_type': 'offline',
            'prompt': 'consent',
        }
        
        import urllib.parse
        return f"{auth_endpoint}?{urllib.parse.urlencode(params)}"
    
    def exchange_code_for_token(self, code):
        """Exchange authorization code for access token."""
        discovery = requests.get(self.discovery_url).json()
        token_endpoint = discovery.get('token_endpoint', 'https://oauth2.googleapis.com/token')
        
        data = {
            'code': code,
            'client_id': self.client_id,
            'client_secret': self.client_secret,
            'redirect_uri': self.redirect_uri,
            'grant_type': 'authorization_code',
        }
        
        response = requests.post(token_endpoint, data=data)
        return response.json()
    
    def get_user_info(self, access_token):
        """Get user info from Google using access token."""
        discovery = requests.get(self.discovery_url).json()
        userinfo_endpoint = discovery.get('userinfo_endpoint', 'https://www.googleapis.com/oauth2/v3/userinfo')
        
        headers = {'Authorization': f'Bearer {access_token}'}
        response = requests.get(userinfo_endpoint, headers=headers)
        return response.json()


class AuthManager:
    """Main authentication manager."""
    
    def __init__(self, session):
        self.session = session
    
    def login_user(self, user_id: int, remember: bool = False):
        """Log in a user by setting session."""
        self.session['user_id'] = user_id
        self.session['logged_in'] = True
        if remember:
            self.session.permanent = True
        update_last_login(user_id)
    
    def logout_user(self):
        """Log out the current user."""
        self.session.clear()
    
    def get_current_user_id(self) -> int:
        """Get the current logged-in user ID."""
        return self.session.get('user_id')
    
    def is_logged_in(self) -> bool:
        """Check if a user is logged in."""
        return self.session.get('logged_in', False)
    
    def register_user(self, username: str, email: str, password: str = None, 
                      phone: str = None, google_id: str = None) -> dict:
        """Register a new user."""
        # Check if user already exists
        if get_user_by_username(username):
            return {'success': False, 'error': 'Username already exists'}
        if get_user_by_email(email):
            return {'success': False, 'error': 'Email already registered'}
        if phone and get_user_by_phone(phone):
            return {'success': False, 'error': 'Phone number already registered'}
        if google_id and get_user_by_google_id(google_id):
            return {'success': False, 'error': 'Google account already linked'}
        
        # Hash password if provided
        password_hash = hash_password(password) if password else None
        
        # Create user
        create_user(username, email, password_hash, phone, google_id)
        
        return {'success': True, 'message': 'User registered successfully'}
    
    def authenticate_email_password(self, email: str, password: str) -> dict:
        """Authenticate user with email and password."""
        user = get_user_by_email(email)
        if not user:
            return {'success': False, 'error': 'Invalid email or password'}
        
        if not user.get('password_hash'):
            return {'success': False, 'error': 'This account uses a different login method'}
        
        if not verify_password(password, user['password_hash']):
            return {'success': False, 'error': 'Invalid email or password'}
        
        self.login_user(user['id'])
        return {'success': True, 'user': user}
    
    def authenticate_google(self, google_id: str, email: str, name: str) -> dict:
        """Authenticate or register user via Google OAuth."""
        user = get_user_by_google_id(google_id)
        
        if user:
            # Existing user
            self.login_user(user['id'])
            return {'success': True, 'user': user, 'new_user': False}
        else:
            # New user - register
            username = name.replace(' ', '').lower() or f"user_{secrets.token_hex(4)}"
            result = self.register_user(username, email, google_id=google_id)
            if result['success']:
                user = get_user_by_email(email)
                verify_user(user['id'])
                self.login_user(user['id'])
                return {'success': True, 'user': user, 'new_user': True}
            return result
    
    def initiate_password_reset(self, email: str) -> dict:
        """Initiate password reset process."""
        user = get_user_by_email(email)
        if not user:
            return {'success': False, 'error': 'Email not found'}
        
        token = generate_reset_token()
        expiry = (datetime.utcnow() + timedelta(hours=1)).isoformat()
        set_reset_token(user['id'], token, expiry)
        
        return {'success': True, 'token': token, 'email': email}
    
    def reset_password(self, token: str, new_password: str) -> dict:
        """Reset password using token."""
        # Find user with this token (need to add this query to database)
        # For now, we'll implement a simpler version
        return {'success': False, 'error': 'Token validation not implemented yet'}
