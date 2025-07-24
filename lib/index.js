/**
 * Easee Node-RED Library
 * 
 * A comprehensive library for interacting with the Easee API in Node-RED environments.
 * Provides modular, testable, and well-documented functions for authentication,
 * API communication, data parsing, and utility operations.
 * 
 * @module easee-lib
 * @version 1.0.0
 * @author Node-RED Easee Contributor
 * 
 * @example
 * // Import the entire library
 * const easee = require('./lib');
 * 
 * // Or import specific modules
 * const { auth, api, logging, utils } = require('./lib');
 * 
 * // Use authentication
 * const authManager = auth.createAuthManager(credentials);
 * await authManager.login();
 * 
 * // Make API requests
 * const apiClient = api.createApiClient(authManager.getAccessToken());
 * const chargers = await apiClient.get('/api/chargers');
 * 
 * // Parse observation data
 * const parsed = api.parseObservation(rawObservation);
 * 
 * // Use logging
 * const logger = logging.createLogger({ debugLogging: true });
 * logger.info('Library initialized');
 */

// Import all modules
const auth = require('./auth');
const api = require('./api');
const logging = require('./logging');
const utils = require('./utils');
const { API_CONFIG } = require('./constants');

/**
 * Library version information
 */
const VERSION = '1.0.0';

/**
 * Creates a complete Easee client with all functionality
 * 
 * @param {Object} config - Configuration object
 * @param {Object} config.credentials - Login credentials
 * @param {string} config.credentials.username - Easee username
 * @param {string} config.credentials.password - Easee password
 * @param {Object} [config.options={}] - Additional options
 * @param {boolean} [config.options.debugLogging=false] - Enable debug logging
 * @param {boolean} [config.options.debugToNodeWarn=false] - Send debug to node.warn()
 * @param {string} [config.options.baseUrl='https://api.easee.com/api'] - API base URL
 * @param {number} [config.options.timeout=10000] - Request timeout
 * @param {Function} [config.options.nodeContext] - Node-RED node context for logging
 * @returns {Object} Complete Easee client
 * 
 * @example
 * const client = easee.createClient({
 *   credentials: {
 *     username: 'user@example.com',
 *     password: 'password'
 *   },
 *   options: {
 *     debugLogging: true,
 *     nodeContext: node
 *   }
 * });
 * 
 * // Login and get chargers
 * await client.auth.login();
 * const chargers = await client.api.get('/api/chargers');
 * 
 * // Parse streaming data
 * const parsed = client.parser.parseObservation(observationData);
 */
function createClient(config) {
  const { credentials, options = {} } = config;
  
  // Store config for later use
  const clientConfig = { credentials, options };
  
  // Create logger first so we can log warnings
  const logger = logging.createLogger({
    debugLogging: options.debugLogging || false,
    nodeRedLogging: options.nodeRedLogging || false,
    RED: options.RED,
    node: options.node
  });

  // Validate credentials but don't fail construction - just warn
  const credentialValidation = auth.validateCredentials(credentials);
  if (!credentialValidation.valid) {
    logger.warn(`Client created with invalid credentials: ${credentialValidation.message}`);
  }
  
  // Create authentication manager
  const authOptions = {
    logger: logger.debug
  };
  
  // Only pass baseUrl if it's defined to avoid overriding defaults
  if (options.baseUrl) {
    authOptions.baseUrl = options.baseUrl;
  }
  
  // Only pass timeout if it's defined
  if (options.timeout) {
    authOptions.timeout = options.timeout;
  }
  
  const authManager = auth.createAuthManager(credentials, authOptions);
  
  // Create API client (will be updated with token after login)
  let apiClient = null;
  
  // Create parser
  const parser = api.createParser({
    logger: logger.debug
  });
  
  return {
    // Version info
    version: VERSION,
    
    // Module references
    auth: {
      ...authManager,
      // Add credential validation method
      validateCredentials: (credentials) => {
        return auth.validateCredentials(credentials);
      }
    },
    api: {
      // Dynamic API client that uses current token
      get: async (path, options = {}) => {
        await authManager.ensureAuthenticated();
        if (!apiClient) {
          apiClient = api.createApiClient(authManager.getAccessToken(), {
            baseUrl: options.baseUrl || clientConfig.options?.baseUrl || API_CONFIG.BASE_URL,
            timeout: options.timeout || clientConfig.options?.timeout,
            logger: logger.debug
          });
        }
        return apiClient.get(path, options);
      },
      
      post: async (path, body, options = {}) => {
        await authManager.ensureAuthenticated();
        if (!apiClient) {
          apiClient = api.createApiClient(authManager.getAccessToken(), {
            baseUrl: options.baseUrl || clientConfig.options?.baseUrl || API_CONFIG.BASE_URL,
            timeout: options.timeout || clientConfig.options?.timeout,
            logger: logger.debug
          });
        }
        return apiClient.post(path, body, options);
      },
      
      put: async (path, body, options = {}) => {
        await authManager.ensureAuthenticated();
        if (!apiClient) {
          apiClient = api.createApiClient(authManager.getAccessToken(), {
            baseUrl: options.baseUrl || clientConfig.options?.baseUrl || API_CONFIG.BASE_URL,
            timeout: options.timeout || clientConfig.options?.timeout,
            logger: logger.debug
          });
        }
        return apiClient.put(path, body, options);
      },
      
      delete: async (path, options = {}) => {
        await authManager.ensureAuthenticated();
        if (!apiClient) {
          apiClient = api.createApiClient(authManager.getAccessToken(), {
            baseUrl: options.baseUrl || clientConfig.options?.baseUrl || API_CONFIG.BASE_URL,
            timeout: options.timeout || clientConfig.options?.timeout,
            logger: logger.debug
          });
        }
        return apiClient.delete(path, options);
      }
    },
    
    parser: parser,
    logger: logger,
    utils: utils,
    
    // Convenience methods
    async login() {
      const result = await authManager.login();
      if (result.success) {
        logger.info('Successfully logged in to Easee API');
        // Reset API client to pick up new token
        apiClient = null;
      } else {
        logger.error(`Login failed: ${result.message}`);
      }
      return result;
    },
    
    async getChargers() {
      const response = await this.api.get('/api/chargers');
      if (response.success) {
        logger.debug(`Retrieved ${response.data?.length || 0} chargers`);
        return response.data;
      } else {
        logger.error(`Failed to get chargers: ${response.error}`);
        throw new Error(response.error);
      }
    },
    
    async getChargerStatus(chargerId) {
      const response = await this.api.get(`/api/chargers/${chargerId}/state`);
      if (response.success) {
        logger.debug(`Retrieved status for charger ${chargerId}`);
        return response.data;
      } else {
        logger.error(`Failed to get charger status: ${response.error}`);
        throw new Error(response.error);
      }
    },
    
    isAuthenticated() {
      return authManager.isAuthenticated();
    },
    
    logout() {
      authManager.logout();
      apiClient = null;
      logger.info('Logged out from Easee API');
    }
  };
}

/**
 * Creates a Node-RED compatible client with proper error handling
 * 
 * @param {Object} node - Node-RED node instance
 * @param {Object} credentials - Node credentials
 * @param {Object} [config={}] - Node configuration
 * @returns {Object} Node-RED compatible client
 */
function createNodeRedClient(node, credentials, config = {}) {
  try {
    return createClient({
      credentials: credentials,
      options: {
        debugLogging: config.debugLogging || false,
        debugToNodeWarn: config.debugToNodeWarn || false,
        nodeContext: node,
        ...config
      }
    });
  } catch (error) {
    if (node && typeof node.error === 'function') {
      node.error(`Failed to create Easee client: ${error.message}`);
    }
    throw error;
  }
}

// Export everything
module.exports = {
  // Main factory functions
  createClient,
  createNodeRedClient,
  
  // Module exports
  auth,
  api,
  logging,
  utils,
  
  // Configuration constants
  constants: require('./constants'),
  
  // Version info
  VERSION,
  
  // Direct access to commonly used functions
  validateCredentials: auth.validateCredentials,
  createLogger: logging.createLogger,
  parseObservation: api.parseObservation,
  createAuthManager: auth.createAuthManager,
  createApiClient: api.createApiClient
};
