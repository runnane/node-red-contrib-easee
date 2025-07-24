/**
 * Centralized constants for the Easee Node-RED library
 * 
 * This file contains all configuration constants to avoid duplication
 * and ensure consistency across the entire application.
 */

/**
 * API Configuration
 */
const API_CONFIG = {
  /**
   * Base URL for Easee REST API (includes /api path)
   */
  BASE_URL: 'https://api.easee.com/api',
  
  /**
   * SignalR streaming endpoint
   */
  SIGNALR_URL: 'https://streams.easee.com/hubs/chargers',
  
  /**
   * Default request timeout in milliseconds
   */
  DEFAULT_TIMEOUT: 10000
};

/**
 * Authentication Configuration
 */
const AUTH_CONFIG = {
  /**
   * Token refresh threshold (refresh when less than this many seconds remain)
   */
  REFRESH_THRESHOLD: 300,
  
  /**
   * Maximum retry attempts for authentication
   */
  MAX_AUTH_RETRIES: 3,
  
  /**
   * Maximum retry attempts for token refresh
   */
  MAX_REFRESH_RETRIES: 3
};

/**
 * API Endpoints (relative to BASE_URL)
 */
const API_ENDPOINTS = {
  LOGIN: '/accounts/login',
  REFRESH_TOKEN: '/accounts/refresh_token',
  CHARGERS: '/chargers',
  SITES: '/sites',
  CIRCUITS: '/circuits'
};

module.exports = {
  API_CONFIG,
  AUTH_CONFIG,
  API_ENDPOINTS
};
