/**
 * Mock data for testing
 */

// Import constants for consistent URLs
const { API_CONFIG } = require('../../lib/constants');

module.exports = {
  // Successful login response
  loginSuccess: {
    accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock-access-token",
    refreshToken: "mock-refresh-token-12345",
    expiresIn: 3600,
    tokenType: "Bearer"
  },

  // Successful token refresh response
  refreshSuccess: {
    accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.new-access-token",
    refreshToken: "new-refresh-token-67890",
    expiresIn: 3600,
    tokenType: "Bearer"
  },

  // Login error responses
  loginErrors: {
    invalidCredentials: {
      title: "Unauthorized",
      status: 401,
      detail: "Invalid username or password",
      errorCodeName: "INVALID_CREDENTIALS"
    },
    serverError: {
      title: "Internal Server Error", 
      status: 500,
      detail: "An unexpected error occurred"
    },
    badRequest: {
      title: "Bad Request",
      status: 400,
      detail: "Missing required fields"
    }
  },

  // Token refresh error responses
  refreshErrors: {
    invalidRefreshToken: {
      title: "Unauthorized",
      status: 401,
      detail: "Invalid refresh token",
      errorCodeName: "INVALID_REFRESH_TOKEN"
    },
    expiredRefreshToken: {
      title: "Unauthorized", 
      status: 401,
      detail: "Refresh token has expired",
      errorCodeName: "EXPIRED_REFRESH_TOKEN"
    }
  },

  // Network error simulations
  networkErrors: {
    timeout: new Error("fetch failed - timeout"),
    connectionRefused: new Error("fetch failed - connection refused"), 
    networkDown: new Error("fetch failed - network error")
  },

  // Mock Node-RED credentials
  validCredentials: {
    username: "test@easee.com",
    password: "SecurePassword123!"
  },

  invalidCredentials: {
    username: "invalid@easee.com", 
    password: "wrongpassword"
  },

  // Mock Easee API endpoints
  apiEndpoints: {
    baseUrl: API_CONFIG.BASE_URL,
    login: "/accounts/login",
    refresh: "/accounts/refresh_token"
  },

  // Mock observations data
  observations: {
    chargingState: {
      observationId: 96,
      value: 2,
      valueText: "Charging",
      valueUnit: "",
      timestamp: "2025-01-15T10:30:00Z"
    },
    power: {
      observationId: 120,
      value: 7200,
      valueText: "7.2",
      valueUnit: "kW", 
      timestamp: "2025-01-15T10:30:00Z"
    }
  }
};
