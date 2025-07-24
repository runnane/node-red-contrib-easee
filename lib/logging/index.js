/**
 * Logging Module Entry Point
 * 
 * Provides a unified interface for logging functionality.
 * 
 * @module lib/logging
 */

const logger = require('./logger');

module.exports = {
  // Export the main factory function
  createLogger: logger.createLogger,
  
  // Module reference for advanced usage
  logger
};
