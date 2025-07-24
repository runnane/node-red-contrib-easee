/**
 * Centralized Logging Module
 * 
 * Provides consistent logging functionality following Node-RED standards.
 * Supports both console output and Node-RED's built-in logging system.
 * 
 * @module lib/logging/logger
 */

/**
 * Logger configuration options
 * @typedef {Object} LoggerConfig
 * @property {boolean} debugLogging - Enable debug level logging
 * @property {boolean} debugToNodeWarn - Route debug messages to node.warn()
 * @property {Object} [nodeContext] - Node-RED node context for warn/error methods
 */

/**
 * Creates a logger instance with specified configuration
 * 
 * @param {LoggerConfig} config - Logger configuration
 * @returns {Object} Logger instance with logging methods
 * 
 * @example
 * const logger = createLogger({
 *   debugLogging: true,
 *   debugToNodeWarn: false,
 *   nodeContext: node
 * });
 * 
 * logger.info('Application started');
 * logger.debug('Processing data', { count: 42 });
 * logger.error('Failed to connect', error);
 */
function createLogger(config = {}) {
  const {
    debugLogging = false,
    debugToNodeWarn = false,
    nodeContext = null
  } = config;

  /**
   * Formats a message with the [easee] prefix
   * @param {string} level - Log level (INFO, DEBUG, ERROR, WARN)
   * @param {string} message - The message to format
   * @returns {string} Formatted message
   */
  function formatMessage(level, message) {
    const prefix = level ? `[easee] ${level}: ` : '[easee] ';
    return `${prefix}${message}`;
  }

  /**
   * Log info level messages (equivalent to console.log)
   * @param {string} message - The message to log
   * @param {*} [data] - Additional data to log
   */
  function logInfo(message, data = null) {
    const formattedMessage = formatMessage('', message);
    
    // Always log to console
    if (data !== null && typeof data === 'object') {
      console.log(formattedMessage, data);
    } else if (data !== null) {
      console.log(`${formattedMessage} ${data}`);
    } else {
      console.log(formattedMessage);
    }
    
    // Also log to node warn if configured
    if (debugToNodeWarn && nodeContext && nodeContext.warn) {
      const warningMessage = data !== null ? `${formattedMessage} ${JSON.stringify(data)}` : formattedMessage;
      nodeContext.warn(warningMessage);
    }
  }

  /**
   * Log debug level messages (only when debug logging is enabled)
   * @param {string} message - The message to log
   * @param {*} [data] - Additional data to log
   */
  function logDebug(message, data = null) {
    if (!debugLogging) return;
    
    const formattedMessage = formatMessage('DEBUG', message);
    
    // Log to console when debug is enabled
    if (data !== null && typeof data === 'object') {
      console.log(formattedMessage, data);
    } else if (data !== null) {
      console.log(`${formattedMessage} ${data}`);
    } else {
      console.log(formattedMessage);
    }
    
    // Also log to node warn if configured
    if (debugToNodeWarn && nodeContext && nodeContext.warn) {
      const warningMessage = data !== null ? `${formattedMessage} ${JSON.stringify(data)}` : formattedMessage;
      nodeContext.warn(warningMessage);
    }
  }

  /**
   * Log error level messages (equivalent to console.error)
   * @param {string} message - The error message to log
   * @param {Error|*} [error] - Error object or additional data
   */
  function logError(message, error = null) {
    const formattedMessage = formatMessage('ERROR', message);
    
    // Always log errors to console
    if (error !== null) {
      console.error(formattedMessage, error);
    } else {
      console.error(formattedMessage);
    }
    
    // Also log to node error for Node-RED error handling
    if (nodeContext && nodeContext.error) {
      if (error !== null) {
        nodeContext.error(`${formattedMessage} ${error.message || error}`);
      } else {
        nodeContext.error(formattedMessage);
      }
    }
  }

  /**
   * Log warning level messages
   * @param {string} message - The warning message to log
   * @param {*} [data] - Additional data to log
   */
  function logWarn(message, data = null) {
    const formattedMessage = formatMessage('WARN', message);
    
    // Log to console
    if (data !== null && typeof data === 'object') {
      console.warn(formattedMessage, data);
    } else if (data !== null) {
      console.warn(`${formattedMessage} ${data}`);
    } else {
      console.warn(formattedMessage);
    }
    
    // Always log warnings to node warn
    if (nodeContext && nodeContext.warn) {
      const warningMessage = data !== null ? `${formattedMessage} ${JSON.stringify(data)}` : formattedMessage;
      nodeContext.warn(warningMessage);
    }
  }

  return {
    info: logInfo,
    debug: logDebug,
    error: logError,
    warn: logWarn,
    
    // Configuration getters
    get debugLogging() { return debugLogging; },
    get debugToNodeWarn() { return debugToNodeWarn; },
    
    // Update configuration
    updateConfig(newConfig) {
      return createLogger({ ...config, ...newConfig });
    }
  };
}

module.exports = {
  createLogger
};
