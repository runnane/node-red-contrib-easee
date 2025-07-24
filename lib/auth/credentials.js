/**
 * Credential Validation Module
 * 
 * Provides functions for validating Easee API credentials and configuration.
 * Pure functions that can be easily tested and reused.
 * 
 * @module lib/auth/credentials
 */

/**
 * Validation result object
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether the validation passed
 * @property {string} message - Descriptive message about the validation result
 * @property {string} [field] - The field that failed validation (if applicable)
 */

/**
 * Credentials object
 * @typedef {Object} Credentials
 * @property {string} [username] - Easee username/email
 * @property {string} [password] - Easee password
 */

/**
 * Validates Easee credentials for completeness and basic format
 * 
 * @param {Credentials} credentials - The credentials to validate
 * @returns {ValidationResult} Validation result
 * 
 * @example
 * const result = validateCredentials({
 *   username: 'user@example.com',
 *   password: 'mypassword'
 * });
 * 
 * if (!result.valid) {
 *   console.error('Validation failed:', result.message);
 * }
 */
function validateCredentials(credentials) {
  if (!credentials) {
    return {
      valid: false,
      message: "No credentials object found",
      field: "credentials"
    };
  }
  
  const username = credentials.username?.trim?.();
  const password = credentials.password?.trim?.();
  
  if (!username || username.length === 0) {
    return {
      valid: false,
      message: "Username is required",
      field: "username"
    };
  }
  
  if (!password || password.length === 0) {
    return {
      valid: false,
      message: "Password is required",
      field: "password"
    };
  }
  
  // Basic email format validation for username
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(username)) {
    return {
      valid: false,
      message: "Username must be a valid email address",
      field: "username"
    };
  }
  
  // Password strength validation (basic)
  if (password.length < 6) {
    return {
      valid: false,
      message: "Password must be at least 6 characters long",
      field: "password"
    };
  }
  
  return {
    valid: true,
    message: "Credentials are valid"
  };
}

/**
 * Validates if credentials are provided for login operations
 * Less strict than validateCredentials - just checks presence
 * 
 * @param {string} username - Username to check
 * @param {string} password - Password to check
 * @returns {ValidationResult} Validation result
 */
function validateLoginCredentials(username, password) {
  if (!username) {
    return {
      valid: false,
      message: "No username provided for login",
      field: "username"
    };
  }
  
  if (!password) {
    return {
      valid: false,
      message: "No password provided for login",
      field: "password"
    };
  }
  
  return {
    valid: true,
    message: "Login credentials provided"
  };
}

/**
 * Sanitizes credentials by trimming whitespace and removing empty values
 * 
 * @param {Credentials} credentials - Credentials to sanitize
 * @returns {Credentials} Sanitized credentials
 */
function sanitizeCredentials(credentials) {
  if (!credentials) {
    return {};
  }
  
  const sanitized = {};
  
  if (credentials.username) {
    const trimmed = credentials.username.trim();
    if (trimmed.length > 0) {
      sanitized.username = trimmed;
    }
  }
  
  if (credentials.password) {
    const trimmed = credentials.password.trim();
    if (trimmed.length > 0) {
      sanitized.password = trimmed;
    }
  }
  
  return sanitized;
}

/**
 * Creates a credential validator function bound to specific credentials
 * Useful for Node-RED node instances
 * 
 * @param {Credentials} credentials - The credentials to bind
 * @returns {Function} Validation function
 * 
 * @example
 * const validator = createCredentialValidator(node.credentials);
 * const result = validator();
 */
function createCredentialValidator(credentials) {
  return () => validateCredentials(credentials);
}

module.exports = {
  validateCredentials,
  validateLoginCredentials,
  sanitizeCredentials,
  createCredentialValidator
};
