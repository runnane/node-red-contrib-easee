/**
 * REST Client Utilities
 * 
 * Provides utilities for processing Node-RED messages and converting them
 * to API requests. Includes parameter extraction, method determination,
 * and endpoint mapping.
 * 
 * @module lib/utils/rest-client
 */

/**
 * Extracts runtime parameters from a Node-RED message
 * 
 * @param {Object} msg - Node-RED message object
 * @param {Object} config - Node configuration with default values
 * @param {string} [config.charger] - Default charger ID
 * @param {string} [config.site] - Default site ID
 * @param {string} [config.circuit] - Default circuit ID
 * @returns {Object} Extracted parameters
 * 
 * @example
 * const params = extractMessageParameters(msg, { charger: 'default' });
 * console.log(params.charger); // From msg.charger or msg.payload.charger_id or 'default'
 */
function extractMessageParameters(msg, config = {}) {
  return {
    charger: msg?.charger ?? 
             msg?.payload?.charger_id ?? 
             msg?.payload?.charger ?? 
             config.charger ?? null,
             
    site: msg?.site ?? 
          msg?.payload?.site_id ?? 
          msg?.payload?.site ?? 
          config.site ?? null,
          
    circuit: msg?.circuit ?? 
             msg?.payload?.circuit_id ?? 
             msg?.payload?.circuit ?? 
             config.circuit ?? null
  };
}

/**
 * Determines HTTP method from message payload
 * 
 * @param {Object} msg - Node-RED message object
 * @returns {string} HTTP method (GET, POST, PUT, DELETE)
 * 
 * @example
 * const method = determineHttpMethod({ payload: { method: 'POST' } });
 * console.log(method); // 'POST'
 */
function determineHttpMethod(msg) {
  if (msg?.payload?.method) {
    return msg.payload.method.toUpperCase();
  }
  
  if (msg?.payload?.body) {
    return 'POST';
  }
  
  return 'GET';
}

/**
 * Extracts API path from message
 * 
 * @param {Object} msg - Node-RED message object
 * @returns {string|null} API path or null if not found
 * 
 * @example
 * const path = extractApiPath({ payload: { path: '/chargers/123' } });
 * console.log(path); // '/chargers/123'
 */
function extractApiPath(msg) {
  if (msg?.payload?.path) {
    return msg.payload.path;
  }
  
  if (msg?.command) {
    return msg.command;
  }
  
  return null;
}

/**
 * Extracts request body from message
 * 
 * @param {Object} msg - Node-RED message object
 * @returns {*} Request body or null
 * 
 * @example
 * const body = extractRequestBody({ payload: { body: { key: 'value' } } });
 * console.log(body); // { key: 'value' }
 */
function extractRequestBody(msg) {
  return msg?.payload?.body ?? null;
}

/**
 * Topic to endpoint mapping configuration
 */
const TOPIC_ENDPOINTS = {
  // Authentication endpoints
  login: {
    path: '/accounts/login',
    method: 'POST',
    requiresAuth: false
  },
  refresh_token: {
    path: '/accounts/refresh_token',
    method: 'POST',
    requiresAuth: false
  },
  
  // Dynamic current endpoints
  dynamic_current: {
    method: 'DYNAMIC', // Special case - method depends on payload
    pathTemplate: '/sites/{site}/circuits/{circuit}/dynamicCurrent',
    requiredParams: ['site', 'circuit']
  },
  
  // Charger endpoints
  charger: {
    path: '/chargers/{charger}?alwaysGetChargerAccessLevel=true',
    method: 'GET',
    requiredParams: ['charger']
  },
  charger_details: {
    path: '/chargers/{charger}/details',
    method: 'GET',
    requiredParams: ['charger']
  },
  charger_site: {
    path: '/chargers/{charger}/site',
    method: 'GET',
    requiredParams: ['charger']
  },
  charger_config: {
    path: '/chargers/{charger}/config',
    method: 'GET',
    requiredParams: ['charger']
  },
  charger_session_latest: {
    path: '/chargers/{charger}/sessions/latest',
    method: 'GET',
    requiredParams: ['charger']
  },
  charger_session_ongoing: {
    path: '/chargers/{charger}/sessions/ongoing',
    method: 'GET',
    requiredParams: ['charger']
  },
  charger_state: {
    path: '/chargers/{charger}/state',
    method: 'GET',
    requiredParams: ['charger'],
    specialHandling: 'parse_observations'
  },
  
  // Charger command endpoints
  start_charging: {
    path: '/chargers/{charger}/commands/start_charging',
    method: 'POST',
    requiredParams: ['charger']
  },
  stop_charging: {
    path: '/chargers/{charger}/commands/stop_charging',
    method: 'POST',
    requiredParams: ['charger']
  },
  pause_charging: {
    path: '/chargers/{charger}/commands/pause_charging',
    method: 'POST',
    requiredParams: ['charger']
  },
  resume_charging: {
    path: '/chargers/{charger}/commands/resume_charging',
    method: 'POST',
    requiredParams: ['charger']
  },
  toggle_charging: {
    path: '/chargers/{charger}/commands/toggle_charging',
    method: 'POST',
    requiredParams: ['charger']
  },
  reboot: {
    path: '/chargers/{charger}/commands/reboot',
    method: 'POST',
    requiredParams: ['charger']
  }
};

/**
 * Resolves a topic to an API endpoint configuration
 * 
 * @param {string} topic - Message topic
 * @param {Object} params - Runtime parameters (charger, site, circuit)
 * @param {Object} msg - Original message (for dynamic_current logic)
 * @returns {Object|null} Endpoint configuration or null if topic unknown
 * 
 * @example
 * const endpoint = resolveTopicToEndpoint('charger', { charger: '123' });
 * console.log(endpoint); 
 * // { path: '/chargers/123?alwaysGetChargerAccessLevel=true', method: 'GET' }
 */
function resolveTopicToEndpoint(topic, params, msg = null) {
  const config = TOPIC_ENDPOINTS[topic];
  if (!config) {
    return null;
  }
  
  // Check required parameters
  if (config.requiredParams) {
    for (const param of config.requiredParams) {
      if (!params[param]) {
        return {
          error: `${topic} failed: ${param} missing`,
          missingParam: param
        };
      }
    }
  }
  
  // Handle special cases
  if (topic === 'dynamic_current') {
    const method = (typeof msg?.payload === 'object') ? 'POST' : 'GET';
    const path = config.pathTemplate
      .replace('{site}', params.site)
      .replace('{circuit}', params.circuit);
    
    return {
      path,
      method,
      body: method === 'POST' ? msg.payload : null
    };
  }
  
  // Handle path templates
  let path = config.path || config.pathTemplate;
  if (path) {
    path = path
      .replace('{charger}', params.charger || '')
      .replace('{site}', params.site || '')
      .replace('{circuit}', params.circuit || '');
  }
  
  return {
    path,
    method: config.method,
    specialHandling: config.specialHandling
  };
}

/**
 * Validates that required parameters are present
 * 
 * @param {Array<string>} required - Required parameter names
 * @param {Object} params - Available parameters
 * @returns {Object} Validation result
 * 
 * @example
 * const result = validateRequiredParams(['charger'], { charger: '123' });
 * console.log(result.valid); // true
 */
function validateRequiredParams(required, params) {
  const missing = required.filter(param => !params[param]);
  
  return {
    valid: missing.length === 0,
    missing,
    message: missing.length > 0 ? `Missing required parameters: ${missing.join(', ')}` : null
  };
}

/**
 * Processes a Node-RED message for REST API requests
 * 
 * @param {Object} msg - Node-RED message
 * @param {Object} config - Node configuration
 * @returns {Object} Processed request information
 * 
 * @example
 * const request = processMessageForRestApi(msg, config);
 * if (request.success) {
 *   console.log(request.method, request.path, request.body);
 * } else {
 *   console.error(request.error);
 * }
 */
function processMessageForRestApi(msg, config = {}) {
  // Extract parameters
  const params = extractMessageParameters(msg, config);
  
  // Check for direct path specification
  const directPath = extractApiPath(msg);
  if (directPath) {
    return {
      success: true,
      method: determineHttpMethod(msg),
      path: directPath,
      body: extractRequestBody(msg),
      params
    };
  }
  
  // Check for topic-based endpoint
  if (msg?.topic) {
    const endpoint = resolveTopicToEndpoint(msg.topic, params, msg);
    
    if (!endpoint) {
      return {
        success: false,
        error: `Unknown topic: ${msg.topic}`,
        params
      };
    }
    
    if (endpoint.error) {
      return {
        success: false,
        error: endpoint.error,
        missingParam: endpoint.missingParam,
        params
      };
    }
    
    return {
      success: true,
      method: endpoint.method,
      path: endpoint.path,
      body: endpoint.body,
      specialHandling: endpoint.specialHandling,
      params
    };
  }
  
  // No valid request specification found
  return {
    success: false,
    error: 'Missing required payload.path or topic',
    params
  };
}

module.exports = {
  extractMessageParameters,
  determineHttpMethod,
  extractApiPath,
  extractRequestBody,
  resolveTopicToEndpoint,
  validateRequiredParams,
  processMessageForRestApi,
  TOPIC_ENDPOINTS
};
