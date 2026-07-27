# LexorA Deployment Guide

This guide will help you deploy LexorA to a public URL with Google OAuth as the primary authentication method.

## Prerequisites

- Google Cloud Console account
- Hosting platform account (Render, Heroku, or similar)
- Git repository (GitHub, GitLab, or Bitbucket)

## Step 1: Set Up Google OAuth

1. **Go to Google Cloud Console**
   - Visit https://console.cloud.google.com/
   - Create a new project or select existing one

2. **Enable Google+ API**
   - Navigate to APIs & Services > Library
   - Search for "Google+ API" and enable it

3. **Create OAuth 2.0 Credentials**
   - Go to APIs & Services > Credentials
   - Click "Create Credentials" > "OAuth client ID"
   - Application type: Web application
   - Name: LexorA
   - Authorized redirect URIs:
     - `https://your-app-url.com/auth/google/callback` (replace with your actual URL)
     - `http://localhost:5000/auth/google/callback` (for local testing)
   - Click "Create"

4. **Save Credentials**
   - Copy the Client ID and Client Secret
   - These will be used in environment variables

## Step 2: Configure Environment Variables

Create a `.env` file in your project root:

```bash
# Flask Configuration
SECRET_KEY=your-secret-key-here-generate-a-long-random-string
FLASK_ENV=production
FLASK_DEBUG=False

# Database
DATABASE_URL=sqlite:///lexora.db

# Google OAuth (REQUIRED)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
APP_URL=https://your-app-url.com

# Session Configuration
SESSION_COOKIE_SECURE=True
SESSION_HTTPONLY=True
SESSION_SAMESITE=Lax
```

## Step 3: Deploy to Render (Recommended)

1. **Create GitHub Repository**
   - Push your code to GitHub
   - Ensure `.env` is in `.gitignore`

2. **Create Render Account**
   - Visit https://render.com/
   - Sign up and create a new account

3. **Create New Web Service**
   - Click "New" > "Web Service"
   - Connect your GitHub repository
   - Select the repository

4. **Configure Build Settings**
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `gunicorn app:app`
   - Python Version: 3.11+

5. **Add Environment Variables**
   - Add all variables from your `.env` file
   - Set `SECRET_KEY` to a random value (Render can generate this)
   - Add your Google OAuth credentials

6. **Deploy**
   - Click "Create Web Service"
   - Render will build and deploy your app
   - Wait for deployment to complete

7. **Update Google OAuth Redirect URI**
   - Go back to Google Cloud Console
   - Add your Render URL to authorized redirect URIs
   - Format: `https://your-app-name.onrender.com/auth/google/callback`

## Step 4: Alternative Deployment Options

### Heroku

1. Install Heroku CLI
2. Create Heroku app: `heroku create lexora-live`
3. Set environment variables:
   ```bash
   heroku config:set GOOGLE_CLIENT_ID=your-id
   heroku config:set GOOGLE_CLIENT_SECRET=your-secret
   heroku config:set APP_URL=https://your-app.herokuapp.com
   ```
4. Deploy: `git push heroku main`

### Railway

1. Connect GitHub repository to Railway
2. Add environment variables in Railway dashboard
3. Railway will auto-deploy on push

### Vercel

1. Install Vercel CLI
2. Run `vercel`
3. Configure environment variables in Vercel dashboard
4. Deploy with `vercel --prod`

## Step 5: Verify Deployment

1. **Test Google OAuth**
   - Visit your deployed URL
   - Click "Sign in with Google"
   - Grant permissions
   - Verify successful login

2. **Test Protected Routes**
   - Try accessing Dashboard, Watchlist, History
   - Should redirect to login if not authenticated

3. **Test Session Persistence**
   - Log in and close browser
   - Reopen and verify you're still logged in

## Step 6: Customize Your Public URL

### Custom Domain (Render)

1. Go to your web service settings
2. Click "Domains"
3. Add your custom domain
4. Update DNS records as instructed
5. Update Google OAuth redirect URI with new domain

### Custom Domain (Heroku)

1. Add domain: `heroku domains:add yourdomain.com`
2. Update DNS records
3. Update Google OAuth redirect URI

## Troubleshooting

### Google OAuth Fails

- **Error: redirect_uri_mismatch**
  - Ensure your APP_URL matches exactly in Google Console
  - Include both http and https versions for testing

- **Error: invalid_client**
  - Verify Client ID and Secret are correct
  - Check for extra spaces in environment variables

### Session Issues

- **Users not staying logged in**
  - Ensure SESSION_COOKIE_SECURE=True for HTTPS
  - Set SESSION_COOKIE_SECURE=False for HTTP (local only)
  - Check SECRET_KEY is set and consistent

### Database Issues

- **Database not persisting**
  - Render uses ephemeral filesystem by default
  - Consider using PostgreSQL for production
  - Update DATABASE_URL to PostgreSQL connection string

## Security Best Practices

1. **Never commit `.env` file**
   - Always use `.env.example` as template
   - Add `.env` to `.gitignore`

2. **Use strong SECRET_KEY**
   - Generate with: `python -c "import secrets; print(secrets.token_hex(32))"`

3. **Enable HTTPS**
   - Always use HTTPS in production
   - Set SESSION_COOKIE_SECURE=True

4. **Regular updates**
   - Keep dependencies updated
   - Monitor for security vulnerabilities

## Support

For issues with:
- **Google OAuth**: https://console.cloud.google.com/
- **Render**: https://render.com/docs
- **Heroku**: https://devcenter.heroku.com/
- **Flask**: https://flask.palletsprojects.com/

## Next Steps

After successful deployment:

1. Share your public URL with users
2. Monitor application logs for errors
3. Set up error tracking (Sentry, Rollbar)
4. Consider adding analytics
5. Implement backup strategy for database
