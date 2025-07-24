/**
 * API Module Entry Point
 * 
 * Provides a unified interface for all API-related functionality.
 * 
 * @module lib/api
 */

const client = require('./client');
const parser = require('./parser');

module.exports = {
  // API Client functions
  makeApiRequest: client.makeApiRequest,
  get: client.get,
  post: client.post,
  put: client.put,
  del: client.del,
  createApiClient: client.createApiClient,
  
  // Data parsing functions
  parseObservation: parser.parseObservation,
  parseObservations: parser.parseObservations,
  extractChargerStatus: parser.extractChargerStatus,
  parseChargerConfig: parser.parseChargerConfig,
  formatForNodeRed: parser.formatForNodeRed,
  createParser: parser.createParser,
  
  // Constants
  OBSERVATION_TYPES: parser.OBSERVATION_TYPES,
  CHARGER_STATES: parser.CHARGER_STATES,
  NO_CURRENT_REASONS: parser.NO_CURRENT_REASONS,
  
  // Module references for advanced usage
  client,
  parser
};
