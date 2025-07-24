/**
 * Unit tests for REST client utilities
 */

const {
  extractMessageParameters,
  determineHttpMethod,
  extractApiPath,
  extractRequestBody,
  resolveTopicToEndpoint,
  validateRequiredParams,
  processMessageForRestApi,
  TOPIC_ENDPOINTS
} = require('../../lib/utils/rest-client');

describe('REST Client Utilities', () => {
  
  describe('extractMessageParameters', () => {
    test('should extract parameters from message properties', () => {
      const msg = {
        charger: 'EH123',
        site: '456',
        circuit: '789'
      };
      
      const result = extractMessageParameters(msg);
      
      expect(result).toEqual({
        charger: 'EH123',
        site: '456',
        circuit: '789'
      });
    });
    
    test('should extract parameters from payload with _id suffix', () => {
      const msg = {
        payload: {
          charger_id: 'EH123',
          site_id: '456',
          circuit_id: '789'
        }
      };
      
      const result = extractMessageParameters(msg);
      
      expect(result).toEqual({
        charger: 'EH123',
        site: '456',
        circuit: '789'
      });
    });
    
    test('should extract parameters from payload without suffix', () => {
      const msg = {
        payload: {
          charger: 'EH123',
          site: '456',
          circuit: '789'
        }
      };
      
      const result = extractMessageParameters(msg);
      
      expect(result).toEqual({
        charger: 'EH123',
        site: '456',
        circuit: '789'
      });
    });
    
    test('should fall back to config defaults', () => {
      const msg = {};
      const config = {
        charger: 'default_charger',
        site: 'default_site',
        circuit: 'default_circuit'
      };
      
      const result = extractMessageParameters(msg, config);
      
      expect(result).toEqual({
        charger: 'default_charger',
        site: 'default_site',
        circuit: 'default_circuit'
      });
    });
    
    test('should prioritize message over payload over config', () => {
      const msg = {
        charger: 'msg_charger',
        payload: {
          charger_id: 'payload_charger',
          site_id: 'payload_site'
        }
      };
      const config = {
        charger: 'config_charger',
        site: 'config_site',
        circuit: 'config_circuit'
      };
      
      const result = extractMessageParameters(msg, config);
      
      expect(result).toEqual({
        charger: 'msg_charger',     // Message property wins
        site: 'payload_site',       // Payload wins over config
        circuit: 'config_circuit'   // Config fallback
      });
    });
  });
  
  describe('determineHttpMethod', () => {
    test('should return method from payload.method', () => {
      const msg = { payload: { method: 'PUT' } };
      expect(determineHttpMethod(msg)).toBe('PUT');
    });
    
    test('should uppercase method from payload', () => {
      const msg = { payload: { method: 'post' } };
      expect(determineHttpMethod(msg)).toBe('POST');
    });
    
    test('should return POST when payload.body exists', () => {
      const msg = { payload: { body: { key: 'value' } } };
      expect(determineHttpMethod(msg)).toBe('POST');
    });
    
    test('should return GET as default', () => {
      const msg = {};
      expect(determineHttpMethod(msg)).toBe('GET');
    });
    
    test('should prioritize method over body', () => {
      const msg = { 
        payload: { 
          method: 'DELETE',
          body: { key: 'value' }
        }
      };
      expect(determineHttpMethod(msg)).toBe('DELETE');
    });
  });
  
  describe('extractApiPath', () => {
    test('should extract path from payload.path', () => {
      const msg = { payload: { path: '/api/chargers/123' } };
      expect(extractApiPath(msg)).toBe('/api/chargers/123');
    });
    
    test('should extract path from command', () => {
      const msg = { command: '/api/sites/456' };
      expect(extractApiPath(msg)).toBe('/api/sites/456');
    });
    
    test('should prioritize payload.path over command', () => {
      const msg = { 
        payload: { path: '/api/chargers/123' },
        command: '/api/sites/456'
      };
      expect(extractApiPath(msg)).toBe('/api/chargers/123');
    });
    
    test('should return null when no path found', () => {
      const msg = {};
      expect(extractApiPath(msg)).toBeNull();
    });
  });
  
  describe('extractRequestBody', () => {
    test('should extract body from payload.body', () => {
      const body = { key: 'value', nested: { data: 123 } };
      const msg = { payload: { body } };
      expect(extractRequestBody(msg)).toEqual(body);
    });
    
    test('should return null when no body found', () => {
      const msg = {};
      expect(extractRequestBody(msg)).toBeNull();
    });
    
    test('should handle string body', () => {
      const msg = { payload: { body: 'string body' } };
      expect(extractRequestBody(msg)).toBe('string body');
    });
  });
  
  describe('validateRequiredParams', () => {
    test('should return valid when all params present', () => {
      const required = ['charger', 'site'];
      const params = { charger: 'EH123', site: '456', extra: 'ignored' };
      
      const result = validateRequiredParams(required, params);
      
      expect(result).toEqual({
        valid: true,
        missing: [],
        message: null
      });
    });
    
    test('should return invalid when params missing', () => {
      const required = ['charger', 'site', 'circuit'];
      const params = { charger: 'EH123' };
      
      const result = validateRequiredParams(required, params);
      
      expect(result).toEqual({
        valid: false,
        missing: ['site', 'circuit'],
        message: 'Missing required parameters: site, circuit'
      });
    });
    
    test('should handle empty requirements', () => {
      const result = validateRequiredParams([], {});
      
      expect(result).toEqual({
        valid: true,
        missing: [],
        message: null
      });
    });
  });
  
  describe('resolveTopicToEndpoint', () => {
    test('should resolve charger topic', () => {
      const params = { charger: 'EH123' };
      const result = resolveTopicToEndpoint('charger', params);
      
      expect(result).toEqual({
        path: '/chargers/EH123?alwaysGetChargerAccessLevel=true',
        method: 'GET',
        specialHandling: undefined
      });
    });
    
    test('should resolve dynamic_current with GET', () => {
      const params = { site: '456', circuit: '789' };
      const msg = { payload: 'not an object' };
      
      const result = resolveTopicToEndpoint('dynamic_current', params, msg);
      
      expect(result).toEqual({
        path: '/sites/456/circuits/789/dynamicCurrent',
        method: 'GET',
        body: null
      });
    });
    
    test('should resolve dynamic_current with POST', () => {
      const params = { site: '456', circuit: '789' };
      const msg = { payload: { currentLimit: 16 } };
      
      const result = resolveTopicToEndpoint('dynamic_current', params, msg);
      
      expect(result).toEqual({
        path: '/sites/456/circuits/789/dynamicCurrent',
        method: 'POST',
        body: { currentLimit: 16 }
      });
    });
    
    test('should return error for missing required params', () => {
      const params = { charger: 'EH123' }; // Missing site and circuit
      const result = resolveTopicToEndpoint('dynamic_current', params);
      
      expect(result).toEqual({
        error: 'dynamic_current failed: site missing',
        missingParam: 'site'
      });
    });
    
    test('should return null for unknown topic', () => {
      const result = resolveTopicToEndpoint('unknown_topic', {});
      expect(result).toBeNull();
    });
    
    test('should resolve charger command topics', () => {
      const params = { charger: 'EH123' };
      
      const commands = ['start_charging', 'stop_charging', 'pause_charging', 'resume_charging'];
      
      commands.forEach(command => {
        const result = resolveTopicToEndpoint(command, params);
        expect(result).toEqual({
          path: `/chargers/EH123/commands/${command}`,
          method: 'POST',
          specialHandling: undefined
        });
      });
    });
    
    test('should resolve charger_state with special handling', () => {
      const params = { charger: 'EH123' };
      const result = resolveTopicToEndpoint('charger_state', params);
      
      expect(result).toEqual({
        path: '/chargers/EH123/state',
        method: 'GET',
        specialHandling: 'parse_observations'
      });
    });
  });
  
  describe('processMessageForRestApi', () => {
    test('should process direct path message', () => {
      const msg = {
        payload: {
          path: '/custom/endpoint',
          method: 'POST',
          body: { data: 'test' }
        }
      };
      
      const result = processMessageForRestApi(msg);
      
      expect(result).toEqual({
        success: true,
        method: 'POST',
        path: '/custom/endpoint',
        body: { data: 'test' },
        params: {
          charger: null,
          site: null,
          circuit: null
        }
      });
    });
    
    test('should process topic-based message', () => {
      const msg = {
        topic: 'charger',
        charger: 'EH123'
      };
      
      const result = processMessageForRestApi(msg);
      
      expect(result).toEqual({
        success: true,
        method: 'GET',
        path: '/chargers/EH123?alwaysGetChargerAccessLevel=true',
        body: undefined,
        specialHandling: undefined,
        params: {
          charger: 'EH123',
          site: null,
          circuit: null
        }
      });
    });
    
    test('should return error for unknown topic', () => {
      const msg = { topic: 'unknown_topic' };
      
      const result = processMessageForRestApi(msg);
      
      expect(result).toEqual({
        success: false,
        error: 'Unknown topic: unknown_topic',
        params: {
          charger: null,
          site: null,
          circuit: null
        }
      });
    });
    
    test('should return error for missing required params', () => {
      const msg = { topic: 'charger' }; // Missing charger parameter
      
      const result = processMessageForRestApi(msg);
      
      expect(result).toEqual({
        success: false,
        error: 'charger failed: charger missing',
        missingParam: 'charger',
        params: {
          charger: null,
          site: null,
          circuit: null
        }
      });
    });
    
    test('should return error for missing path and topic', () => {
      const msg = { payload: { someData: 'value' } };
      
      const result = processMessageForRestApi(msg);
      
      expect(result).toEqual({
        success: false,
        error: 'Missing required payload.path or topic',
        params: {
          charger: null,
          site: null,
          circuit: null
        }
      });
    });
    
    test('should process complex dynamic_current message', () => {
      const msg = {
        topic: 'dynamic_current',
        payload: {
          site_id: 1726,
          circuit_id: 4715,
          currentLimit: 16
        }
      };
      
      const result = processMessageForRestApi(msg);
      
      expect(result).toEqual({
        success: true,
        method: 'POST',
        path: '/sites/1726/circuits/4715/dynamicCurrent',
        body: {
          site_id: 1726,
          circuit_id: 4715,
          currentLimit: 16
        },
        specialHandling: undefined,
        params: {
          charger: null,
          site: 1726,
          circuit: 4715
        }
      });
    });
  });
  
  describe('TOPIC_ENDPOINTS configuration', () => {
    test('should have all expected endpoints', () => {
      const expectedTopics = [
        'login', 'refresh_token', 'dynamic_current',
        'charger', 'charger_details', 'charger_site', 'charger_config',
        'charger_session_latest', 'charger_session_ongoing', 'charger_state',
        'start_charging', 'stop_charging', 'pause_charging', 'resume_charging',
        'toggle_charging', 'reboot'
      ];
      
      expectedTopics.forEach(topic => {
        expect(TOPIC_ENDPOINTS).toHaveProperty(topic);
        expect(TOPIC_ENDPOINTS[topic]).toHaveProperty('method');
      });
    });
    
    test('should have correct required params for charger endpoints', () => {
      const chargerEndpoints = [
        'charger', 'charger_details', 'charger_site', 'charger_config',
        'charger_session_latest', 'charger_session_ongoing', 'charger_state',
        'start_charging', 'stop_charging', 'pause_charging', 'resume_charging',
        'toggle_charging', 'reboot'
      ];
      
      chargerEndpoints.forEach(endpoint => {
        expect(TOPIC_ENDPOINTS[endpoint].requiredParams).toEqual(['charger']);
      });
    });
    
    test('should have correct required params for dynamic_current', () => {
      expect(TOPIC_ENDPOINTS.dynamic_current.requiredParams).toEqual(['site', 'circuit']);
    });
  });
});
