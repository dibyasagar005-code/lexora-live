/**
 * LexorA Configuration
 * Centralized configuration for API URLs and app settings
 */

// Backend API URL - Use relative path for same-origin
const BACKEND_URL = '';  // Empty string for same-origin requests

// Frontend URL (for OAuth redirects) - Use same origin
const FRONTEND_URL = window.location.origin;

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
