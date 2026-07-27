# LexorA Backend Deployment Guide

This guide explains how to deploy the Flask backend to Render with CORS and authentication configured for cross-origin requests from the GitHub Pages frontend.

## Architecture

- **Frontend**: GitHub Pages (https://dibyasagar005-code.github.io/lexora-live/)
- **Backend**: Render (https://lexora-live.onrender.com)
- **Authentication**: Google OAuth + Email/Password
- **CORS**: Enabled for cross-origin requests

## Prerequisites

- Google Cloud Console account
- Render account
- GitHub repository (already set up)

## Step 1: Set Up Google OAuth

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/
   - Create a new project or select existing one

2. **Enable Google+ API**
   - Navigate to APIs & Services > Library
   - Search for "Google+ API" and enable it

3. **Create OAuth 2.0 Credentials**
   - Go to APIs & Services > Credentials
   - Click "Create Credentials" > "OAuth client ID"
   - Application type: Web application
   - Name: LexorA
   - Authorized JavaScript origins:
     - `https://dibyasagar005-code.github.io`
   - Authorized redirect URIs:
     - `https://lexora-live.onrender.com/auth/google/callback`
     - `http://localhost:5000/auth/google/callback` (for local testing)
   - Click "Create"

4. **Save Credentials**
   - Copy the Client ID (looks like: `123456789-abc...apps.googleusercontent.com`)
   - Copy the Client Secret (looks like: `GOCSPX-...`)

## Step 2: Deploy to Render

1. **Create Render Account**
   - Visit: https://render.com/
   - Sign up with GitHub

2. **Create New Web Service**
   - Click "New" > "Web Service"
   - Connect your `lexora-live` repository
   - Click "Connect"

3. **Configure Build Settings**
   - Name: `lexora-live`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `gunicorn app:app`
   - Python Version: 3.11 or higher
   - Click "Advanced" > "Add Environment Variable"

4. **Add Environment Variables**
   ```
   SECRET_KEY = (click "Generate" button)
   FLASK_ENV = production
   FLASK_DEBUG = False
   SESSION_COOKIE_SECURE = True
   SESSION_HTTPONLY = True
   SESSION_SAMESITE = None
   FRONTEND_URL = https://dibyasagar005-code.github.io/lexora-live
   GOOGLE_CLIENT_ID = (paste your Google Client ID)
   GOOGLE_CLIENT_SECRET = (paste your Google Client Secret)
   APP_URL = https://lexora-live.onrender.com
   ```

5. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment (5-10 minutes)
   - Your backend URL will be: `https://lexora-live.onrender.com`

## Step 3: Update Google OAuth Redirect URI

1. Go back to Google Cloud Console
2. Edit your OAuth client
3. Add your Render URL to authorized redirect URIs:
   - `https://lexora-live.onrender.com/auth/google/callback`
4. Save changes

## Step 4: Update Frontend API URL

The frontend is already configured to use the Render backend URL. If you need to change it:

1. Edit `index.html`, `login.html`, and `register.html`
2. Find: `window.API_BASE_URL = 'https://lexora-live.onrender.com'`
3. Replace with your actual backend URL if different

## CORS Configuration

The backend is configured with CORS for cross-origin requests:

- **Origins**: All origins allowed (`*`)
- **Methods**: GET, POST, PUT, DELETE, OPTIONS
- **Headers**: Content-Type, Authorization
- **Credentials**: Supported

## Session Configuration

Sessions are configured for cross-origin requests:

- **SESSION_COOKIE_SECURE**: True (HTTPS only)
- **SESSION_COOKIE_HTTPONLY**: True (prevents XSS)
- **SESSION_SAMESITE**: None (required for cross-origin)

## Authentication Flow

### Email/Password Login
1. User fills login form on GitHub Pages
2. Frontend sends POST request to `/auth/login`
3. Backend validates credentials
4. Backend creates session
5. Frontend redirects to dashboard

### Google OAuth
1. User clicks "Sign in with Google" on GitHub Pages
2. Frontend redirects to `/auth/google` on backend
3. Backend redirects to Google OAuth
4. User authorizes on Google
5. Google redirects to `/auth/google/callback` on backend
6. Backend exchanges code for tokens
7. Backend creates session
8. Backend redirects to frontend

### Logout
1. User clicks logout on GitHub Pages
2. Frontend sends POST request to `/auth/logout`
3. Backend destroys session
4. Frontend redirects to home

## Testing

### Test Email/Password Login
1. Visit: https://dibyasagar005-code.github.io/lexora-live/login.html
2. Click "Email" tab
3. Enter email and password
4. Click "Login"
5. Should redirect to dashboard

### Test Google OAuth
1. Visit: https://dibyasagar005-code.github.io/lexora-live/login.html
2. Click "Sign in with Google"
3. Should redirect to Google OAuth
4. Authorize the app
5. Should redirect back to frontend

### Test Registration
1. Visit: https://dibyasagar005-code.github.io/lexora-live/register.html
2. Fill registration form
3. Click "Create Account"
4. Should redirect to login page

## Troubleshooting

### CORS Errors
- **Error**: "CORS policy: No 'Access-Control-Allow-Origin' header"
- **Solution**: Ensure Flask-CORS is installed and configured in app.py

### Session Issues
- **Error**: "Session not persisting"
- **Solution**: Ensure SESSION_SAMESITE is set to None for cross-origin

### Google OAuth Errors
- **Error**: "redirect_uri_mismatch"
- **Solution**: Ensure your Render URL is in Google OAuth redirect URIs

- **Error**: "invalid_client"
- **Solution**: Verify Client ID and Secret are correct

### 404 Errors
- **Error**: "404 Not Found" on login/register
- **Solution**: Ensure backend is deployed and accessible

## Security Best Practices

1. **Never commit .env file**
   - Always use .env.example as template
   - Add .env to .gitignore

2. **Use strong SECRET_KEY**
   - Generate with: `python -c "import secrets; print(secrets.token_hex(32))"`

3. **Enable HTTPS**
   - Always use HTTPS in production
   - Set SESSION_COOKIE_SECURE=True

4. **Regular updates**
   - Keep dependencies updated
   - Monitor for security vulnerabilities

## Next Steps

After successful deployment:

1. Test complete authentication flow
2. Set up error tracking (Sentry, Rollbar)
3. Implement backup strategy for database
4. Monitor application logs
5. Set up analytics

## Support

For issues with:
- **Google OAuth**: https://console.cloud.google.com/
- **Render**: https://render.com/docs
- **Flask**: https://flask.palletsprojects.com/
- **CORS**: https://flask-cors.readthedocs.io/
