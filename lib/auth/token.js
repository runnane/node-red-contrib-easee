/**
 * Token Management Module
 * 
 * Handles JWT token lifecycle including validation, refresh, and expiration checking.
 * Pure functions for token operations that can be easily tested.
 * 
 * @module lib/auth/token
 */

/**
 * Token validation result
 * @typedef {Object} TokenValidationResult
 * @property {boolean} valid - Whether the token is valid
 * @property {boolean} expired - Whether the token is expired
 * @property {number} [expiresIn] - Seconds until expiration (if valid)
 * @property {string} message - Descriptive message
 * @property {Object} [payload] - Decoded token payload (if valid)
 */

/**
 * Token object structure
 * @typedef {Object} TokenData
 * @property {string} accessToken - The JWT access token
 * @property {string} [refreshToken] - The refresh token
 * @property {number} [expiresAt] - Timestamp when token expires
 * @property {string} [tokenType] - Token type (usually 'Bearer')
 */

/**
 * Decodes a JWT token without verification (for inspection only)
 * 
 * @param {string} token - The JWT token to decode
 * @returns {Object|null} Decoded token payload or null if invalid
 * 
 * @example
 * const payload = decodeToken(accessToken);
 * if (payload) {
 *   console.log('Token expires at:', new Date(payload.exp * 1000));
 * }
 */
function decodeToken(token) {
  try {
    if (!token || typeof token !== 'string') {
      return null;
    }
    
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    
    // Decode the payload (middle part)
    const payload = parts[1];
    // Add padding if needed for base64 decoding
    const padded = payload + '='.repeat((4 - payload.length % 4) % 4);
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    
    return JSON.parse(decoded);
  } catch (error) {
    return null;
  }
}

/**
 * Checks if a token is expired based on its exp claim
 * 
 * @param {string} token - The JWT token to check
 * @param {number} [bufferSeconds=60] - Buffer time in seconds before considering expired
 * @returns {boolean} True if token is expired or invalid
 */
function isTokenExpired(token, bufferSeconds = 60) {
  const payload = decodeToken(token);
  if (!payload || !payload.exp) {
    return true; // Invalid token is considered expired
  }
  
  const now = Math.floor(Date.now() / 1000);
  const expiration = payload.exp - bufferSeconds;
  
  return now >= expiration;
}

/**
 * Gets the expiration time for a token
 * 
 * @param {string} token - The JWT token
 * @returns {number|null} Expiration timestamp (seconds) or null if invalid
 */
function getTokenExpiration(token) {
  const payload = decodeToken(token);
  return payload?.exp || null;
}

/**
 * Calculates seconds until token expiration
 * 
 * @param {string} token - The JWT token
 * @returns {number} Seconds until expiration (negative if expired)
 */
function getSecondsUntilExpiration(token) {
  const expiration = getTokenExpiration(token);
  if (!expiration) {
    return -1; // Invalid token
  }
  
  const now = Math.floor(Date.now() / 1000);
  return expiration - now;
}

/**
 * Validates a token and returns comprehensive status
 * 
 * @param {string} token - The JWT token to validate
 * @param {number} [bufferSeconds=60] - Buffer time before considering expired
 * @returns {TokenValidationResult} Validation result
 * 
 * @example
 * const result = validateToken(accessToken);
 * if (result.valid && !result.expired) {
 *   console.log(`Token valid for ${result.expiresIn} more seconds`);
 * } else {
 *   console.log('Token needs refresh:', result.message);
 * }
 */
function validateToken(token, bufferSeconds = 60) {
  if (!token || typeof token !== 'string') {
    return {
      valid: false,
      expired: true,
      message: "No token provided or invalid format"
    };
  }
  
  const payload = decodeToken(token);
  if (!payload) {
    return {
      valid: false,
      expired: true,
      message: "Invalid token format - cannot decode"
    };
  }
  
  if (!payload.exp) {
    return {
      valid: false,
      expired: true,
      message: "Token missing expiration claim"
    };
  }
  
  const secondsUntilExp = getSecondsUntilExpiration(token);
  const expired = secondsUntilExp <= bufferSeconds;
  
  return {
    valid: true,
    expired: expired,
    expiresIn: Math.max(0, secondsUntilExp),
    message: expired ? "Token is expired or near expiration" : "Token is valid",
    payload: payload
  };
}

/**
 * Determines if a token needs refresh based on expiration
 * 
 * @param {string} token - The JWT token
 * @param {number} [refreshThreshold=300] - Refresh when less than this many seconds remain
 * @returns {boolean} True if token should be refreshed
 */
function shouldRefreshToken(token, refreshThreshold = 300) {
  const secondsUntilExp = getSecondsUntilExpiration(token);
  return secondsUntilExp <= refreshThreshold;
}

/**
 * Creates token data object from login response
 * 
 * @param {Object} loginResponse - Response from login API
 * @param {string} loginResponse.accessToken - Access token from response
 * @param {string} [loginResponse.refreshToken] - Refresh token from response
 * @param {number} [loginResponse.expiresIn] - Seconds until expiration
 * @param {string} [loginResponse.tokenType] - Token type
 * @returns {TokenData} Formatted token data
 */
function createTokenData(loginResponse) {
  const tokenData = {
    accessToken: loginResponse.accessToken,
    tokenType: loginResponse.tokenType || 'Bearer'
  };
  
  if (loginResponse.refreshToken) {
    tokenData.refreshToken = loginResponse.refreshToken;
  }
  
  if (loginResponse.expiresIn) {
    tokenData.expiresAt = Math.floor(Date.now() / 1000) + loginResponse.expiresIn;
  } else {
    // Try to get expiration from token itself
    const expiration = getTokenExpiration(loginResponse.accessToken);
    if (expiration) {
      tokenData.expiresAt = expiration;
    }
  }
  
  return tokenData;
}

/**
 * Formats token for Authorization header
 * 
 * @param {string} token - The access token
 * @param {string} [tokenType='Bearer'] - Token type prefix
 * @returns {string} Formatted authorization header value
 */
function formatAuthorizationHeader(token, tokenType = 'Bearer') {
  return `${tokenType} ${token}`;
}

/**
 * Creates a token checker function for a specific token
 * Useful for Node-RED node instances to check their token status
 * 
 * @param {string} token - Token to bind to checker
 * @returns {Function} Token checking function
 * 
 * @example
 * const checker = createTokenChecker(node.accessToken);
 * const status = checker();
 * if (status.expired) {
 *   // Handle token refresh
 * }
 */
function createTokenChecker(token) {
  return (bufferSeconds = 60) => validateToken(token, bufferSeconds);
}

module.exports = {
  decodeToken,
  isTokenExpired,
  getTokenExpiration,
  getSecondsUntilExpiration,
  validateToken,
  shouldRefreshToken,
  createTokenData,
  formatAuthorizationHeader,
  createTokenChecker
};
