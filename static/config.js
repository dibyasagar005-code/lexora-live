/**
 * LexorA Configuration
 * Centralized configuration for API URLs and app settings
 */

// Backend API URL - Change this based on environment
// Local development: 'http://127.0.0.1:5000'
// Production: 'https://lexora-live.onrender.com'
const BACKEND_URL = 'http://127.0.0.1:5000';

// Frontend URL (for OAuth redirects)
const FRONTEND_URL = 'https://dibyasagar005-code.github.io/lexora-live';

// App configuration
const CONFIG = {
  API_BASE_URL: BACKEND_URL,
  FRONTEND_URL: FRONTEND_URL,
  REFRESH_INTERVAL: 30000, // 30 seconds
  API_TIMEOUT: 8000,
  FETCH_TIMEOUT: 6000,
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}

// Make available globally
window.LEXORA_CONFIG = CONFIG;
