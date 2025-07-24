/**
 * Utilities Module
 * 
 * Provides common utility functions used across the Easee library.
 * Includes validation helpers, data transformation utilities, and error handling.
 * 
 * @module lib/utils
 */

/**
 * Checks if a value is a non-empty string
 * 
 * @param {*} value - Value to check
 * @returns {boolean} True if value is a non-empty string
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Checks if a value is a valid number (not NaN or Infinity)
 * 
 * @param {*} value - Value to check
 * @returns {boolean} True if value is a valid number
 */
function isValidNumber(value) {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

/**
 * Safely converts a value to a number
 * 
 * @param {*} value - Value to convert
 * @param {number} [defaultValue=0] - Default value if conversion fails
 * @returns {number} Converted number or default value
 */
function toNumber(value, defaultValue = 0) {
  if (isValidNumber(value)) {
    return value;
  }
  
  // Handle null and undefined explicitly
  if (value == null) {
    return defaultValue;
  }
  
  const parsed = Number(value);
  return isValidNumber(parsed) ? parsed : defaultValue;
}

/**
 * Safely converts a value to a boolean
 * 
 * @param {*} value - Value to convert
 * @returns {boolean} Converted boolean value
 */
function toBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    return lower === 'true' || lower === '1' || lower === 'yes' || lower === 'on';
  }
  
  if (typeof value === 'number') {
    return value !== 0;
  }
  
  return Boolean(value);
}

/**
 * Safely gets a nested property from an object
 * 
 * @param {Object} obj - Object to get property from
 * @param {string} path - Dot-notation path to property
 * @param {*} [defaultValue] - Default value if property doesn't exist
 * @returns {*} Property value or default value
 * 
 * @example
 * const value = safeGet(data, 'user.profile.name', 'Unknown');
 */
function safeGet(obj, path, defaultValue = undefined) {
  if (!obj || typeof obj !== 'object' || !path) {
    return defaultValue;
  }
  
  try {
    const keys = path.split('.');
    let current = obj;
    
    for (const key of keys) {
      if (current == null || typeof current !== 'object') {
        return defaultValue;
      }
      current = current[key];
    }
    
    return current !== undefined ? current : defaultValue;
  } catch (error) {
    return defaultValue;
  }
}

/**
 * Creates a deep copy of an object
 * 
 * @param {*} obj - Object to clone
 * @returns {*} Deep copy of the object
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  
  if (obj instanceof Array) {
    return obj.map(item => deepClone(item));
  }
  
  if (typeof obj === 'object') {
    const cloned = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }
  
  return obj;
}

/**
 * Merges multiple objects deeply
 * 
 * @param {...Object} objects - Objects to merge
 * @returns {Object} Merged object
 */
function deepMerge(...objects) {
  if (objects.length === 0) return {};
  if (objects.length === 1) return deepClone(objects[0]);
  
  const result = {};
  
  for (const obj of objects) {
    if (obj && typeof obj === 'object') {
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
            result[key] = deepMerge(result[key] || {}, obj[key]);
          } else {
            result[key] = deepClone(obj[key]);
          }
        }
      }
    }
  }
  
  return result;
}

/**
 * Debounces a function call
 * 
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, delay) {
  let timeoutId;
  
  return function debounced(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

/**
 * Throttles a function call
 * 
 * @param {Function} func - Function to throttle
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Throttled function
 */
function throttle(func, delay) {
  let lastCall = 0;
  
  return function throttled(...args) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      return func.apply(this, args);
    }
  };
}

/**
 * Creates a retry function with exponential backoff
 * 
 * @param {Function} func - Function to retry
 * @param {Object} [options={}] - Retry options
 * @param {number} [options.maxRetries=3] - Maximum number of retries
 * @param {number} [options.baseDelay=1000] - Base delay in milliseconds
 * @param {number} [options.maxDelay=10000] - Maximum delay in milliseconds
 * @param {Function} [options.shouldRetry] - Function to determine if error should trigger retry
 * @returns {Function} Function with retry logic
 */
function withRetry(func, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    shouldRetry = () => true
  } = options;
  
  return async function retryWrapper(...args) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await func.apply(this, args);
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries || !shouldRetry(error)) {
          throw error;
        }
        
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  };
}

/**
 * Formats a timestamp for display
 * 
 * @param {string|number|Date} timestamp - Timestamp to format
 * @param {Object} [options={}] - Formatting options
 * @param {boolean} [options.includeDate=true] - Include date in output
 * @param {boolean} [options.includeTime=true] - Include time in output
 * @param {boolean} [options.includeSeconds=false] - Include seconds in time
 * @returns {string} Formatted timestamp
 */
function formatTimestamp(timestamp, options = {}) {
  const {
    includeDate = true,
    includeTime = true,
    includeSeconds = false
  } = options;
  
  let date;
  if (timestamp instanceof Date) {
    date = timestamp;
  } else if (typeof timestamp === 'number') {
    date = new Date(timestamp);
  } else if (typeof timestamp === 'string') {
    date = new Date(timestamp);
  } else {
    return 'Invalid Date';
  }
  
  if (isNaN(date.getTime())) {
    return 'Invalid Date';
  }
  
  const parts = [];
  
  if (includeDate) {
    parts.push(date.toISOString().split('T')[0]);
  }
  
  if (includeTime) {
    const timeStr = includeSeconds 
      ? date.toTimeString().split(' ')[0]
      : date.toTimeString().split(' ')[0].substring(0, 5);
    parts.push(timeStr);
  }
  
  return parts.join(' ');
}

/**
 * Validates an email address format
 * 
 * @param {string} email - Email to validate
 * @returns {boolean} True if email format is valid
 */
function isValidEmail(email) {
  if (!isNonEmptyString(email)) {
    return false;
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Sanitizes a string for safe usage
 * 
 * @param {string} str - String to sanitize
 * @param {Object} [options={}] - Sanitization options
 * @param {boolean} [options.trim=true] - Trim whitespace
 * @param {boolean} [options.removeNewlines=false] - Remove newline characters
 * @param {string} [options.maxLength] - Maximum length (truncates if longer)
 * @returns {string} Sanitized string
 */
function sanitizeString(str, options = {}) {
  const {
    trim = true,
    removeNewlines = false,
    maxLength
  } = options;
  
  if (typeof str !== 'string') {
    return '';
  }
  
  let result = str;
  
  if (trim) {
    result = result.trim();
  }
  
  if (removeNewlines) {
    result = result.replace(/[\r\n]/g, ' ');
  }
  
  if (maxLength && result.length > maxLength) {
    result = result.substring(0, maxLength);
  }
  
  return result;
}

/**
 * Creates a simple event emitter
 * 
 * @returns {Object} Event emitter object
 */
function createEventEmitter() {
  const listeners = {};
  
  return {
    on(event, callback) {
      if (!listeners[event]) {
        listeners[event] = [];
      }
      listeners[event].push(callback);
    },
    
    off(event, callback) {
      if (listeners[event]) {
        const index = listeners[event].indexOf(callback);
        if (index > -1) {
          listeners[event].splice(index, 1);
        }
      }
    },
    
    emit(event, ...args) {
      if (listeners[event]) {
        listeners[event].forEach(callback => {
          try {
            callback(...args);
          } catch (error) {
            console.error('Event listener error:', error);
          }
        });
      }
    },
    
    removeAllListeners(event) {
      if (event) {
        delete listeners[event];
      } else {
        Object.keys(listeners).forEach(key => delete listeners[key]);
      }
    }
  };
}

const restClient = require('./rest-client');

module.exports = {
  isNonEmptyString,
  isValidNumber,
  toNumber,
  toBoolean,
  safeGet,
  deepClone,
  deepMerge,
  debounce,
  throttle,
  withRetry,
  formatTimestamp,
  isValidEmail,
  sanitizeString,
  createEventEmitter,
  
  // REST client utilities
  restClient
};
