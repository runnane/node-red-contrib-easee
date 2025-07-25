/**
 * Node.js Version Compatibility Tests
 * Tests features that might behave differently across Node.js versions
 */

const helper = require('node-red-node-test-helper');
const configNode = require('../../easee-client/easee-configuration.js');

helper.init(require.resolve('node-red'));

describe('Node.js Version Compatibility', function () {
  afterEach(function (done) {
    helper.unload();
    done();
  });

  it('should report Node.js version and features', function () {
    console.log('Node.js version:', process.version);
    console.log('Node.js features:');
    console.log('  - ES modules support:', process.versions.modules >= 72);
    console.log('  - fetch() built-in:', typeof globalThis.fetch === 'function');
    console.log('  - AbortController:', typeof globalThis.AbortController === 'function');
    console.log('  - crypto.webcrypto:', !!process.versions.openssl);
    
    expect(process.version).toMatch(/^v(18|20|22|24)\./);
  });

  it('should handle async/await properly across versions', function (done) {
    const testAsync = async () => {
      return 'async-result';
    };

    testAsync().then(result => {
      expect(result).toBe('async-result');
      done();
    }).catch(done);
  });

  it('should handle Promises correctly', function (done) {
    Promise.resolve('promise-result')
      .then(result => {
        expect(result).toBe('promise-result');
        done();
      })
      .catch(done);
  });

  it('should support modern JavaScript features', function () {
    // Template literals
    const template = `Node.js ${process.version}`;
    expect(template).toContain('Node.js');

    // Arrow functions
    const arrow = (x) => x * 2;
    expect(arrow(5)).toBe(10);

    // Destructuring
    const { version } = process;
    expect(version).toBeDefined();

    // Spread operator
    const arr1 = [1, 2, 3];
    const arr2 = [...arr1, 4, 5];
    expect(arr2).toEqual([1, 2, 3, 4, 5]);

    // Object shorthand
    const obj = { version, arrow };
    expect(obj.version).toBe(version);
    expect(typeof obj.arrow).toBe('function');
  });

  it('should handle Buffer operations consistently', function () {
    const buffer = Buffer.from('test-string', 'utf8');
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.toString()).toBe('test-string');
    
    // Test Buffer methods that might vary
    const json = JSON.stringify(buffer);
    const parsed = JSON.parse(json);
    expect(parsed.type).toBe('Buffer');
  });

  it('should support required Node.js modules', function () {
    // Core modules that should be available
    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');
    const util = require('util');
    
    expect(typeof fs.readFileSync).toBe('function');
    expect(typeof path.join).toBe('function');
    expect(typeof crypto.createHash).toBe('function');
    expect(typeof util.promisify).toBe('function');
  });

  it('should handle SignalR compatibility', function () {
    const signalR = require('@microsoft/signalr');
    
    expect(signalR.HubConnectionBuilder).toBeDefined();
    expect(signalR.LogLevel).toBeDefined();
    expect(signalR.HttpTransportType).toBeDefined();
    
    // Test creating a connection builder (without connecting)
    const builder = new signalR.HubConnectionBuilder();
    expect(builder).toBeDefined();
    expect(typeof builder.withUrl).toBe('function');
  });

  it('should support Node-RED test helper across versions', function (done) {
    const flow = [
      {
        id: 'test1',
        type: 'easee-configuration',
        name: 'Test Config'
      }
    ];

    const credentials = {
      test1: {
        username: 'test@example.com',
        password: 'testpass'
      }
    };

    helper.load(configNode, flow, credentials, function () {
      try {
        const node = helper.getNode('test1');
        expect(node).toBeDefined();
        expect(node.name).toBe('Test Config');
        done();
      } catch (error) {
        done(error);
      }
    });
  });

  it('should handle error reporting consistently', function () {
    const error = new Error('Test error');
    error.code = 'TEST_ERROR';
    error.details = { test: true };

    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.details.test).toBe(true);
    expect(error.stack).toBeDefined();
  });
});
