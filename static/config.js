// Backend API URL (Render deployment for public access)
const BACKEND_URL = 'https://lexora-live.onrender.com';

// Frontend URL (for OAuth redirects)
const FRONTEND_URL = 'https://lexora-live.onrender.com';

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

// JWT token helpers
function getAuthToken() {
  return localStorage.getItem('lexora_token');
}

function removeAuthToken() {
  localStorage.removeItem('lexora_token');
}
