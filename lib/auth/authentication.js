/**
 * Authentication Module
 * 
 * Handles Easee API authentication including login, token refresh, and session management.
 * Provides a clean interface for authentication operations.
 * 
 * @module lib/auth/authentication
 */

const https = require('https');
const { validateLoginCredentials } = require('./credentials');
const { validateToken, shouldRefreshToken, createTokenData, formatAuthorizationHeader } = require('./token');
const { API_CONFIG, API_ENDPOINTS } = require('../constants');

/**
 * Authentication result object
 * @typedef {Object} AuthResult
 * @property {boolean} success - Whether the operation succeeded
 * @property {string} message - Descriptive message
 * @property {Object} [data] - Response data (if successful)
 * @property {string} [error] - Error details (if failed)
 * @property {number} [statusCode] - HTTP status code
 */

/**
 * Login credentials
 * @typedef {Object} LoginCredentials
 * @property {string} username - Easee username/email
 * @property {string} password - Easee password
 */

/**
 * Authentication options
 * @typedef {Object} AuthOptions
 * @property {string} [baseUrl='https://api.easee.com/api'] - Base API URL
 * @property {number} [timeout=10000] - Request timeout in milliseconds
 * @property {Function} [logger] - Logger function for debug output
 */

/**
 * Default authentication options
 */
const DEFAULT_OPTIONS = {
  baseUrl: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.DEFAULT_TIMEOUT,
  logger: () => {} // No-op logger by default
};

/**
 * Makes an HTTPS request with proper error handling
 * 
 * @param {Object} options - Request options
 * @param {string} [postData] - POST data for request body
 * @returns {Promise<Object>} Request result
 * @private
 */
function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const result = {
            statusCode: res.statusCode,
            headers: res.headers,
            data: data
          };
          
          // Try to parse JSON response
          if (data) {
            try {
              result.json = JSON.parse(data);
            } catch (e) {
              // Not JSON, keep as string
            }
          }
          
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (postData) {
      req.write(postData);
    }
    
    req.end();
  });
}

/**
 * Performs login to Easee API
 * 
 * @param {LoginCredentials} credentials - Login credentials
 * @param {AuthOptions} [options={}] - Authentication options
 * @returns {Promise<AuthResult>} Login result
 * 
 * @example
 * const result = await doLogin({
 *   username: 'user@example.com',
 *   password: 'password'
 * });
 * 
 * if (result.success) {
 *   console.log('Access token:', result.data.accessToken);
 * } else {
 *   console.error('Login failed:', result.message);
 * }
 */
async function doLogin(credentials, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Validate credentials
  const validation = validateLoginCredentials(credentials.username, credentials.password);
  if (!validation.valid) {
    return {
      success: false,
      message: validation.message,
      error: 'VALIDATION_ERROR'
    };
  }
  
  opts.logger('Attempting login to Easee API...');
  
  const postData = JSON.stringify({
    userName: credentials.username,
    password: credentials.password
  });
  
  const requestOptions = {
    hostname: new URL(opts.baseUrl).hostname,
    port: 443,
    path: new URL(opts.baseUrl).pathname + API_ENDPOINTS.LOGIN,
    method: 'POST',
    timeout: opts.timeout,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'Accept': 'application/json'
    }
  };
  
  try {
    const response = await makeRequest(requestOptions, postData);
    
    if (response.statusCode === 200 && response.json) {
      opts.logger('Login successful');
      
      const tokenData = createTokenData(response.json);
      
      return {
        success: true,
        message: 'Login successful',
        data: tokenData,
        statusCode: response.statusCode
      };
    } else {
      const errorMessage = response.json?.title || 
                          response.json?.message || 
                          `HTTP ${response.statusCode}`;
      
      opts.logger(`Login failed: ${errorMessage}`);
      
      return {
        success: false,
        message: `Login failed: ${errorMessage}`,
        error: 'LOGIN_ERROR',
        statusCode: response.statusCode
      };
    }
  } catch (error) {
    opts.logger(`Login error: ${error.message}`);
    
    return {
      success: false,
      message: `Login error: ${error.message}`,
      error: 'NETWORK_ERROR'
    };
  }
}

/**
 * Refreshes an access token using a refresh token
 * 
 * @param {string} refreshToken - The refresh token
 * @param {AuthOptions} [options={}] - Authentication options
 * @returns {Promise<AuthResult>} Refresh result
 * 
 * @example
 * const result = await doRefreshToken(currentRefreshToken);
 * if (result.success) {
 *   // Update stored tokens
 *   accessToken = result.data.accessToken;
 *   refreshToken = result.data.refreshToken;
 * }
 */
async function doRefreshToken(refreshToken, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  if (!refreshToken) {
    return {
      success: false,
      message: 'No refresh token provided',
      error: 'MISSING_REFRESH_TOKEN'
    };
  }
  
  opts.logger('Attempting token refresh...');
  
  const postData = JSON.stringify({
    accessToken: '',
    refreshToken: refreshToken
  });
  
  const requestOptions = {
    hostname: new URL(opts.baseUrl).hostname,
    port: 443,
    path: new URL(opts.baseUrl).pathname + API_ENDPOINTS.REFRESH_TOKEN,
    method: 'POST',
    timeout: opts.timeout,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'Accept': 'application/json'
    }
  };
  
  try {
    const response = await makeRequest(requestOptions, postData);
    
    if (response.statusCode === 200 && response.json) {
      opts.logger('Token refresh successful');
      
      const tokenData = createTokenData(response.json);
      
      return {
        success: true,
        message: 'Token refresh successful',
        data: tokenData,
        statusCode: response.statusCode
      };
    } else {
      const errorMessage = response.json?.title || 
                          response.json?.message || 
                          `HTTP ${response.statusCode}`;
      
      opts.logger(`Token refresh failed: ${errorMessage}`);
      
      return {
        success: false,
        message: `Token refresh failed: ${errorMessage}`,
        error: 'REFRESH_ERROR',
        statusCode: response.statusCode
      };
    }
  } catch (error) {
    opts.logger(`Token refresh error: ${error.message}`);
    
    return {
      success: false,
      message: `Token refresh error: ${error.message}`,
      error: 'NETWORK_ERROR'
    };
  }
}

/**
 * Checks if current token is valid and refreshes if needed
 * 
 * @param {string} accessToken - Current access token
 * @param {string} refreshToken - Current refresh token
 * @param {AuthOptions} [options={}] - Authentication options
 * @returns {Promise<AuthResult>} Check result with potentially refreshed token
 * 
 * @example
 * const result = await checkAndRefreshToken(accessToken, refreshToken);
 * if (result.success) {
 *   // Use result.data.accessToken (may be refreshed)
 *   makeApiCall(result.data.accessToken);
 * }
 */
async function checkAndRefreshToken(accessToken, refreshToken, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // First check if current token is valid
  const tokenStatus = validateToken(accessToken);
  
  if (tokenStatus.valid && !tokenStatus.expired) {
    // Token is still good
    if (shouldRefreshToken(accessToken)) {
      opts.logger('Token valid but nearing expiration, refreshing...');
      return await doRefreshToken(refreshToken, options);
    } else {
      return {
        success: true,
        message: 'Token is valid',
        data: { accessToken, refreshToken }
      };
    }
  } else {
    // Token is expired or invalid, try to refresh
    opts.logger('Token expired or invalid, attempting refresh...');
    return await doRefreshToken(refreshToken, options);
  }
}

/**
 * Creates an authentication manager for a specific set of credentials
 * Useful for Node-RED nodes to manage their authentication state
 * 
 * @param {LoginCredentials} credentials - Login credentials
 * @param {AuthOptions} [options={}] - Authentication options
 * @returns {Object} Authentication manager object
 * 
 * @example
 * const auth = createAuthManager({
 *   username: 'user@example.com',
 *   password: 'password'
 * }, { logger: node.log });
 * 
 * const result = await auth.ensureAuthenticated();
 * if (result.success) {
 *   const authHeader = auth.getAuthHeader();
 * }
 */
function createAuthManager(credentials, options = {}) {
  let accessToken = null;
  let refreshToken = null;
  
  return {
    /**
     * Performs initial login
     */
    async login() {
      const result = await doLogin(credentials, options);
      if (result.success) {
        accessToken = result.data.accessToken;
        refreshToken = result.data.refreshToken;
      }
      return result;
    },
    
    /**
     * Ensures authentication is valid, refreshing if needed
     */
    async ensureAuthenticated() {
      if (!accessToken) {
        return await this.login();
      }
      
      const result = await checkAndRefreshToken(accessToken, refreshToken, options);
      if (result.success) {
        accessToken = result.data.accessToken;
        refreshToken = result.data.refreshToken;
      }
      return result;
    },
    
    /**
     * Gets current access token
     */
    getAccessToken() {
      return accessToken;
    },
    
    /**
     * Gets current refresh token
     */
    getRefreshToken() {
      return refreshToken;
    },
    
    /**
     * Gets formatted authorization header
     */
    getAuthHeader() {
      return accessToken ? formatAuthorizationHeader(accessToken) : null;
    },
    
    /**
     * Checks if currently authenticated
     */
    isAuthenticated() {
      if (!accessToken) return false;
      const status = validateToken(accessToken);
      return status.valid && !status.expired;
    },
    
    /**
     * Clears authentication state
     */
    logout() {
      accessToken = null;
      refreshToken = null;
    }
  };
}

module.exports = {
  doLogin,
  doRefreshToken,
  checkAndRefreshToken,
  createAuthManager
};
