/**
 * Authentication Module Entry Point
 * 
 * Provides a unified interface for all authentication-related functionality.
 * 
 * @module lib/auth
 */

const credentials = require('./credentials');
const token = require('./token');
const authentication = require('./authentication');

module.exports = {
  // Credential validation functions
  validateCredentials: credentials.validateCredentials,
  validateLoginCredentials: credentials.validateLoginCredentials,
  sanitizeCredentials: credentials.sanitizeCredentials,
  createCredentialValidator: credentials.createCredentialValidator,
  
  // Token management functions
  decodeToken: token.decodeToken,
  isTokenExpired: token.isTokenExpired,
  getTokenExpiration: token.getTokenExpiration,
  getSecondsUntilExpiration: token.getSecondsUntilExpiration,
  validateToken: token.validateToken,
  shouldRefreshToken: token.shouldRefreshToken,
  createTokenData: token.createTokenData,
  formatAuthorizationHeader: token.formatAuthorizationHeader,
  createTokenChecker: token.createTokenChecker,
  
  // Authentication functions
  doLogin: authentication.doLogin,
  doRefreshToken: authentication.doRefreshToken,
  checkAndRefreshToken: authentication.checkAndRefreshToken,
  createAuthManager: authentication.createAuthManager,
  
  // Module references for advanced usage
  credentials,
  token,
  authentication
};
