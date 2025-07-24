/**
 * API Utilities Module
 * 
 * Provides utilities for making HTTP requests to the Easee API and parsing responses.
 * Includes helper functions for common API operations and data transformations.
 * 
 * @module lib/api/client
 */

const https = require('https');
const { formatAuthorizationHeader } = require('../auth/token');

/**
 * API request options
 * @typedef {Object} ApiRequestOptions
 * @property {string} [method='GET'] - HTTP method
 * @property {string} [baseUrl='https://api.easee.com/api'] - Base API URL
 * @property {string} path - API endpoint path
 * @property {Object} [headers={}] - Additional headers
 * @property {string} [accessToken] - Access token for authorization
 * @property {Object|string} [body] - Request body (will be JSON stringified if object)
 * @property {number} [timeout=10000] - Request timeout in milliseconds
 * @property {Function} [logger] - Logger function
 */

/**
 * API response object
 * @typedef {Object} ApiResponse
 * @property {boolean} success - Whether the request succeeded
 * @property {number} statusCode - HTTP status code
 * @property {Object} [data] - Parsed response data
 * @property {string} [rawData] - Raw response string
 * @property {Object} headers - Response headers
 * @property {string} [error] - Error message (if failed)
 * @property {string} [errorType] - Error category
 */

/**
 * Default API options
 */
const DEFAULT_API_OPTIONS = {
  method: 'GET',
  baseUrl: 'https://api.easee.com/api',
  headers: {},
  timeout: 10000,
  logger: () => {} // No-op logger
};

/**
 * Makes an HTTP request with comprehensive error handling
 * 
 * @param {Object} options - Node.js HTTPS request options
 * @param {string} [postData] - Request body data
 * @param {number} [timeout=10000] - Request timeout
 * @returns {Promise<Object>} Raw response object
 * @private
 */
function makeHttpRequest(options, postData = null, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    req.setTimeout(timeout);
    
    if (postData) {
      req.write(postData);
    }
    
    req.end();
  });
}

/**
 * Makes an API request to the Easee API with automatic JSON parsing
 * 
 * @param {ApiRequestOptions} options - Request options
 * @returns {Promise<ApiResponse>} API response
 * 
 * @example
 * const response = await makeApiRequest({
 *   path: '/api/chargers',
 *   accessToken: 'your-token',
 *   logger: console.log
 * });
 * 
 * if (response.success) {
 *   console.log('Chargers:', response.data);
 * }
 */
async function makeApiRequest(options) {
  const opts = { ...DEFAULT_API_OPTIONS, ...options };
  
  opts.logger(`Making ${opts.method} request to ${opts.path}`);
  
  // Prepare headers
  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'Node-RED Easee Client',
    ...opts.headers
  };
  
  // Add authorization header if token provided
  if (opts.accessToken) {
    headers['Authorization'] = formatAuthorizationHeader(opts.accessToken);
    opts.logger(`Added authorization header for API request`);
  } else {
    opts.logger(`WARNING: No access token provided for API request`);
  }
  
  // Prepare request body
  let postData = null;
  if (opts.body) {
    if (typeof opts.body === 'object') {
      postData = JSON.stringify(opts.body);
      headers['Content-Type'] = 'application/json';
    } else {
      postData = opts.body;
    }
    headers['Content-Length'] = Buffer.byteLength(postData);
  }
  
  // Prepare request options
  const url = new URL(opts.baseUrl);
  const fullPath = url.pathname + (opts.path.startsWith('/') ? opts.path : '/' + opts.path);
  const requestOptions = {
    hostname: url.hostname,
    port: url.port || 443,
    path: fullPath,
    method: opts.method,
    headers: headers
  };
  
  opts.logger(`Full request URL: https://${url.hostname}${fullPath}`);
  
  try {
    const response = await makeHttpRequest(requestOptions, postData, opts.timeout);
    
    // Parse response
    let parsedData = null;
    let parseError = null;
    
    if (response.data) {
      try {
        parsedData = JSON.parse(response.data);
      } catch (error) {
        parseError = error;
        opts.logger(`Failed to parse JSON response: ${error.message}`);
      }
    }
    
    // Determine success based on status code
    const success = response.statusCode >= 200 && response.statusCode < 300;
    
    if (success) {
      opts.logger(`Request successful (${response.statusCode})`);
      return {
        success: true,
        statusCode: response.statusCode,
        data: parsedData,
        rawData: response.data,
        headers: response.headers
      };
    } else {
      const errorMessage = parsedData?.title || 
                          parsedData?.message || 
                          parsedData?.error ||
                          `HTTP ${response.statusCode}`;
      
      opts.logger(`Request failed: ${errorMessage}`);
      
      return {
        success: false,
        statusCode: response.statusCode,
        data: parsedData,
        rawData: response.data,
        headers: response.headers,
        error: errorMessage,
        errorType: 'HTTP_ERROR'
      };
    }
  } catch (error) {
    opts.logger(`Network error: ${error.message}`);
    
    return {
      success: false,
      statusCode: 0,
      error: error.message,
      errorType: 'NETWORK_ERROR'
    };
  }
}

/**
 * Makes a GET request to the Easee API
 * 
 * @param {string} path - API endpoint path
 * @param {string} accessToken - Access token
 * @param {Object} [options={}] - Additional options
 * @returns {Promise<ApiResponse>} API response
 */
async function get(path, accessToken, options = {}) {
  return await makeApiRequest({
    method: 'GET',
    path: path,
    accessToken: accessToken,
    ...options
  });
}

/**
 * Makes a POST request to the Easee API
 * 
 * @param {string} path - API endpoint path
 * @param {Object} body - Request body
 * @param {string} accessToken - Access token
 * @param {Object} [options={}] - Additional options
 * @returns {Promise<ApiResponse>} API response
 */
async function post(path, body, accessToken, options = {}) {
  return await makeApiRequest({
    method: 'POST',
    path: path,
    body: body,
    accessToken: accessToken,
    ...options
  });
}

/**
 * Makes a PUT request to the Easee API
 * 
 * @param {string} path - API endpoint path
 * @param {Object} body - Request body
 * @param {string} accessToken - Access token
 * @param {Object} [options={}] - Additional options
 * @returns {Promise<ApiResponse>} API response
 */
async function put(path, body, accessToken, options = {}) {
  return await makeApiRequest({
    method: 'PUT',
    path: path,
    body: body,
    accessToken: accessToken,
    ...options
  });
}

/**
 * Makes a DELETE request to the Easee API
 * 
 * @param {string} path - API endpoint path
 * @param {string} accessToken - Access token
 * @param {Object} [options={}] - Additional options
 * @returns {Promise<ApiResponse>} API response
 */
async function del(path, accessToken, options = {}) {
  return await makeApiRequest({
    method: 'DELETE',
    path: path,
    accessToken: accessToken,
    ...options
  });
}

/**
 * Creates an API client bound to specific authentication
 * 
 * @param {string} accessToken - Access token
 * @param {Object} [defaultOptions={}] - Default options for all requests
 * @returns {Object} API client object
 * 
 * @example
 * const client = createApiClient(accessToken, { logger: console.log });
 * 
 * const chargers = await client.get('/api/chargers');
 * const result = await client.post('/api/chargers/123/commands/start_charging', {
 *   current: 16
 * });
 */
function createApiClient(accessToken, defaultOptions = {}) {
  const clientOptions = { ...DEFAULT_API_OPTIONS, ...defaultOptions };
  
  return {
    /**
     * Makes a GET request
     */
    async get(path, options = {}) {
      return await makeApiRequest({
        ...clientOptions,
        ...options,
        method: 'GET',
        path: path,
        accessToken: accessToken
      });
    },
    
    /**
     * Makes a POST request
     */
    async post(path, body, options = {}) {
      return await makeApiRequest({
        ...clientOptions,
        ...options,
        method: 'POST',
        path: path,
        body: body,
        accessToken: accessToken
      });
    },
    
    /**
     * Makes a PUT request
     */
    async put(path, body, options = {}) {
      return await makeApiRequest({
        ...clientOptions,
        ...options,
        method: 'PUT',
        path: path,
        body: body,
        accessToken: accessToken
      });
    },
    
    /**
     * Makes a DELETE request
     */
    async delete(path, options = {}) {
      return await makeApiRequest({
        ...clientOptions,
        ...options,
        method: 'DELETE',
        path: path,
        accessToken: accessToken
      });
    }
  };
}

module.exports = {
  makeApiRequest,
  get,
  post,
  put,
  del,
  createApiClient
};
