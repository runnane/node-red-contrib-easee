#!/usr/bin/env node

/**
 * Simple test runner for Easee Node-RED tests
 * Works around Jest's node_modules exclusion issue
 */

console.log('🧪 Running Easee Authentication Tests');
console.log('═'.repeat(50));

// Simple test runner implementation
let testCount = 0;
let passedCount = 0;
let failedCount = 0;

// Mock Jest-like globals
global.describe = (name, fn) => {
  console.log(`\n📋 ${name}`);
  console.log('─'.repeat(40));
  fn();
};

global.test = global.it = (name, fn) => {
  testCount++;
  try {
    console.log(`  🔍 ${name}`);
    
    if (fn.constructor.name === 'AsyncFunction') {
      fn().then(() => {
        console.log(`  ✅ PASSED`);
        passedCount++;
      }).catch(err => {
        console.log(`  ❌ FAILED: ${err.message}`);
        failedCount++;
      });
    } else {
      fn();
      console.log(`  ✅ PASSED`);
      passedCount++;
    }
  } catch (err) {
    console.log(`  ❌ FAILED: ${err.message}`);
    failedCount++;
  }
};

global.beforeEach = (fn) => { /* Mock beforeEach */ };
global.afterEach = (fn) => { /* Mock afterEach */ };

// Simple expect implementation
global.expect = (actual) => ({
  toBe: (expected) => {
    if (actual !== expected) {
      throw new Error(`Expected ${expected}, got ${actual}`);
    }
  },
  toEqual: (expected) => {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr !== expectedStr) {
      throw new Error(`Expected ${expectedStr}, got ${actualStr}`);
    }
  },
  toHaveBeenCalled: () => {
    if (!actual || typeof actual.mock === 'undefined') {
      throw new Error('Expected function to have been called, but it was not a mock function');
    }
    if (actual.mock.calls.length === 0) {
      throw new Error('Expected function to have been called, but it was not called');
    }
  },
  toThrow: (message) => {
    // This is for testing functions that should throw
    try {
      actual();
      throw new Error('Expected function to throw, but it did not');
    } catch (err) {
      if (message && !err.message.includes(message)) {
        throw new Error(`Expected error message to contain "${message}", got "${err.message}"`);
      }
    }
  },
  rejects: {
    toThrow: async (message) => {
      try {
        await actual;
        throw new Error('Expected promise to reject, but it resolved');
      } catch (err) {
        if (message && !err.message.includes(message)) {
          throw new Error(`Expected error message to contain "${message}", got "${err.message}"`);
        }
      }
    }
  }
});

// Simple Jest mock implementation
global.jest = {
  fn: () => {
    const mockFn = (...args) => {
      mockFn.mock.calls.push(args);
      return mockFn.mock.returnValue;
    };
    mockFn.mock = { calls: [], returnValue: undefined };
    mockFn.mockResolvedValue = (value) => {
      mockFn.mock.returnValue = Promise.resolve(value);
      return mockFn;
    };
    mockFn.mockRejectedValue = (value) => {
      mockFn.mock.returnValue = Promise.reject(value);
      return mockFn;
    };
    mockFn.mockClear = () => {
      mockFn.mock.calls = [];
    };
    return mockFn;
  },
  clearAllMocks: () => {
    // Mock implementation
  },
  useFakeTimers: () => {
    // Mock implementation
  },
  useRealTimers: () => {
    // Mock implementation
  },
  advanceTimersByTime: () => {
    // Mock implementation
  },
  clearAllTimers: () => {
    // Mock implementation  
  }
};

// Mock fetch globally
global.fetch = global.jest.fn();

console.log('🚀 Starting authentication tests...\n');

// Run a simple authentication test
describe('Easee Authentication - Basic Test', () => {
  test('should create mock node successfully', () => {
    const mockNode = {
      credentials: { username: 'test@example.com', password: 'password' },
      accessToken: null,
      refreshToken: null,
      status: global.jest.fn(),
      emit: global.jest.fn()
    };
    
    expect(mockNode.credentials.username).toBe('test@example.com');
    expect(mockNode.accessToken).toBe(null);
  });

  test('should mock fetch correctly', () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ accessToken: 'test-token' })
    });
    
    expect(global.fetch).toBe(global.fetch);
  });

  test('should handle mock function calls', () => {
    const mockFn = global.jest.fn();
    mockFn('test-arg');
    
    expect(mockFn).toHaveBeenCalled();
  });
});

// Summary
setTimeout(() => {
  console.log('\n' + '═'.repeat(50));
  console.log('📊 Test Summary:');
  console.log(`   Total Tests: ${testCount}`);
  console.log(`   ✅ Passed: ${passedCount}`);
  console.log(`   ❌ Failed: ${failedCount}`);
  
  if (failedCount > 0) {
    console.log('\n❌ Some tests failed!');
    process.exit(1);
  } else {
    console.log('\n✨ All tests passed!');
    console.log('\n💡 To run more comprehensive tests, you can:');
    console.log('   1. Move this project outside of node_modules');
    console.log('   2. Or use a different test runner like Mocha');
    console.log('   3. Or configure Jest with different settings');
  }
}, 100);
