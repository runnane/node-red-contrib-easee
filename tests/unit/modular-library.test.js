/**
 * Unit Tests for Modular Easee Library
 * 
 * Demonstrates how the modular architecture makes testing much easier
 * by allowing focused testing of individual components.
 */

const { auth, api, logging, utils } = require('../../lib');

describe('Easee Library Modules', () => {
  describe('Authentication Module', () => {
    describe('validateCredentials', () => {
      it('should validate correct credentials', () => {
        const result = auth.validateCredentials({
          username: 'test@example.com',
          password: 'password123'
        });
        
        expect(result.valid).toBe(true);
        expect(result.message).toBe('Credentials are valid');
      });
      
      it('should reject missing username', () => {
        const result = auth.validateCredentials({
          password: 'password123'
        });
        
        expect(result.valid).toBe(false);
        expect(result.field).toBe('username');
      });
      
      it('should reject invalid email format', () => {
        const result = auth.validateCredentials({
          username: 'invalid-email',
          password: 'password123'
        });
        
        expect(result.valid).toBe(false);
        expect(result.message).toContain('valid email');
      });
      
      it('should reject short passwords', () => {
        const result = auth.validateCredentials({
          username: 'test@example.com',
          password: '123'
        });
        
        expect(result.valid).toBe(false);
        expect(result.message).toContain('at least 6 characters');
      });
    });
    
    describe('Token Management', () => {
      const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjk5OTk5OTk5OTl9.Lhm_7RnmVFu4Kd5oNbDurJdvYqX6cGWrOy8eR5GttTs';
      
      it('should decode valid JWT tokens', () => {
        const payload = auth.decodeToken(mockToken);
        
        expect(payload).not.toBeNull();
        expect(payload.sub).toBe('1234567890');
        expect(payload.name).toBe('John Doe');
      });
      
      it('should return null for invalid tokens', () => {
        const payload = auth.decodeToken('invalid.token.here');
        expect(payload).toBeNull();
      });
      
      it('should validate token expiration', () => {
        const validation = auth.validateToken(mockToken);
        
        expect(validation.valid).toBe(true);
        expect(validation.expired).toBe(false);
        expect(validation.payload).toBeDefined();
      });
    });
  });
  
  describe('API Module', () => {
    describe('Data Parser', () => {
      it('should parse observation data correctly', () => {
        const observation = {
          id: 120, // TotalPower observation ID
          timestamp: '2021-12-31T23:00:00Z',
          value: 7200 // Value in watts
        };
        
        const parsed = api.parseObservation(observation);
        
        expect(parsed).not.toBeNull();
        expect(parsed.dataName).toBe('TotalPower');
        expect(parsed.observationId).toBe(120);
        expect(parsed.value).toBe(7200);
        expect(parsed.valueUnit).toBe('W');
        expect(parsed.unit).toBe('W');
        expect(parsed.timestampMs).toBeGreaterThan(0);
      });
      
      it('should handle boolean observation types', () => {
        const observation = {
          id: 103, // CableLocked observation ID
          timestamp: '2021-12-31T23:00:00Z',
          value: 'true'
        };
        
        const parsed = api.parseObservation(observation);
        
        expect(parsed.dataName).toBe('CableLocked');
        expect(parsed.dataTypeName).toBe('Boolean');
        expect(parsed.value).toBe('true'); // Boolean values remain as-is per original implementation
        expect(parsed.valueUnit).toBe('');
      });
      
      it('should handle enum observation types with value mapping', () => {
        const observation = {
          id: 109, // ChargerOpMode observation ID
          timestamp: '2021-12-31T23:00:00Z',
          value: 3
        };
        
        const parsed = api.parseObservation(observation);
        
        expect(parsed.dataName).toBe('ChargerOpMode');
        expect(parsed.dataTypeName).toBe('Integer');
        expect(parsed.value).toBe(3);
        expect(parsed.valueText).toBe('Charging - 	Charging.');
      });
      
      it('should group observations by charger ID', () => {
        const observations = [
          {
            id: 'EHXXXX01_1_1640995200_8',
            dataType: 8,
            value: 7.2
          },
          {
            id: 'EHXXXX02_1_1640995200_8',
            dataType: 8,
            value: 11.0
          },
          {
            id: 'EHXXXX01_1_1640995200_3',
            dataType: 3,
            value: 1
          }
        ];
        
        const grouped = api.parseObservations(observations);
        
        expect(Object.keys(grouped)).toHaveLength(2);
        expect(grouped['EHXXXX01']).toHaveLength(2);
        expect(grouped['EHXXXX02']).toHaveLength(1);
      });
    });
  });
  
  describe('Logging Module', () => {
    it('should create logger with default settings', () => {
      const logger = logging.createLogger();
      
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });
    
    it('should respect debug logging setting', () => {
      const debugLogger = logging.createLogger({ debugLogging: true });
      const normalLogger = logging.createLogger({ debugLogging: false });
      
      // Both should have the same interface
      expect(typeof debugLogger.debug).toBe('function');
      expect(typeof normalLogger.debug).toBe('function');
    });
    
    it('should handle Node-RED context', () => {
      const mockNode = {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      };
      
      const logger = logging.createLogger({
        nodeContext: mockNode,
        debugToNodeWarn: true
      });
      
      logger.info('Test message');
      expect(mockNode.warn).toHaveBeenCalledWith('[easee] Test message');
    });
  });
  
  describe('Utils Module', () => {
    describe('Type checking utilities', () => {
      it('should validate non-empty strings', () => {
        expect(utils.isNonEmptyString('hello')).toBe(true);
        expect(utils.isNonEmptyString('  hello  ')).toBe(true);
        expect(utils.isNonEmptyString('')).toBe(false);
        expect(utils.isNonEmptyString('   ')).toBe(false);
        expect(utils.isNonEmptyString(null)).toBe(false);
        expect(utils.isNonEmptyString(123)).toBe(false);
      });
      
      it('should validate numbers', () => {
        expect(utils.isValidNumber(42)).toBe(true);
        expect(utils.isValidNumber(3.14)).toBe(true);
        expect(utils.isValidNumber(0)).toBe(true);
        expect(utils.isValidNumber(NaN)).toBe(false);
        expect(utils.isValidNumber(Infinity)).toBe(false);
        expect(utils.isValidNumber('42')).toBe(false);
      });
      
      it('should convert values to numbers safely', () => {
        expect(utils.toNumber(42)).toBe(42);
        expect(utils.toNumber('42')).toBe(42);
        expect(utils.toNumber('3.14')).toBe(3.14);
        expect(utils.toNumber('invalid', 0)).toBe(0);
        expect(utils.toNumber(null, -1)).toBe(-1);
      });
      
      it('should convert values to booleans', () => {
        expect(utils.toBoolean(true)).toBe(true);
        expect(utils.toBoolean('true')).toBe(true);
        expect(utils.toBoolean('1')).toBe(true);
        expect(utils.toBoolean('yes')).toBe(true);
        expect(utils.toBoolean(1)).toBe(true);
        
        expect(utils.toBoolean(false)).toBe(false);
        expect(utils.toBoolean('false')).toBe(false);
        expect(utils.toBoolean('0')).toBe(false);
        expect(utils.toBoolean(0)).toBe(false);
        expect(utils.toBoolean('')).toBe(false);
      });
    });
    
    describe('Object utilities', () => {
      it('should safely get nested properties', () => {
        const obj = {
          user: {
            profile: {
              name: 'John Doe',
              age: 30
            }
          }
        };
        
        expect(utils.safeGet(obj, 'user.profile.name')).toBe('John Doe');
        expect(utils.safeGet(obj, 'user.profile.age')).toBe(30);
        expect(utils.safeGet(obj, 'user.profile.invalid', 'default')).toBe('default');
        expect(utils.safeGet(obj, 'invalid.path')).toBeUndefined();
        expect(utils.safeGet(null, 'path', 'default')).toBe('default');
      });
      
      it('should deep clone objects', () => {
        const original = {
          name: 'Test',
          nested: {
            value: 42,
            array: [1, 2, 3]
          }
        };
        
        const cloned = utils.deepClone(original);
        
        expect(cloned).toEqual(original);
        expect(cloned).not.toBe(original);
        expect(cloned.nested).not.toBe(original.nested);
        expect(cloned.nested.array).not.toBe(original.nested.array);
      });
      
      it('should deep merge objects', () => {
        const obj1 = { a: 1, b: { x: 1, y: 2 } };
        const obj2 = { b: { y: 3, z: 4 }, c: 3 };
        
        const merged = utils.deepMerge(obj1, obj2);
        
        expect(merged).toEqual({
          a: 1,
          b: { x: 1, y: 3, z: 4 },
          c: 3
        });
      });
    });
    
    describe('Email validation', () => {
      it('should validate email addresses', () => {
        expect(utils.isValidEmail('test@example.com')).toBe(true);
        expect(utils.isValidEmail('user.name+tag@domain.co.uk')).toBe(true);
        expect(utils.isValidEmail('invalid-email')).toBe(false);
        expect(utils.isValidEmail('test@')).toBe(false);
        expect(utils.isValidEmail('@example.com')).toBe(false);
        expect(utils.isValidEmail('')).toBe(false);
        expect(utils.isValidEmail(null)).toBe(false);
      });
    });
  });
  
  describe('Library Integration', () => {
    it('should create client with valid configuration', () => {
      const easee = require('../../lib');
      
      expect(() => {
        easee.createClient({
          credentials: {
            username: 'test@example.com',
            password: 'password123'
          },
          options: {
            debugLogging: true
          }
        });
      }).not.toThrow();
    });
    
    it('should create client with invalid credentials but log warning', () => {
      const easee = require('../../lib');
      
      // Should not throw anymore since we made it more lenient
      let client;
      expect(() => {
        client = easee.createClient({
          credentials: {
            username: 'invalid-email',
            password: '123'
          }
        });
      }).not.toThrow();
      
      // But validation should still fail
      const validation = client.auth.validateCredentials({
        username: 'invalid-email',
        password: '123'
      });
      expect(validation.valid).toBe(false);
    });
  });
});
