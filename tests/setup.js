/**
 * Jest setup file for Easee Node-RED contribution tests
 * This file is executed before each test file
 */

// Mock fetch globally for all tests
global.fetch = jest.fn();

// Global test helpers
global.testHelpers = {
  /**
   * Reset all mocks before each test
   */
  resetMocks: () => {
    jest.clearAllMocks();
    fetch.mockClear();
  },

  /**
   * Create a mock Node-RED node
   */
  createMockNode: (overrides = {}) => {
    return {
      credentials: {
        username: 'test@example.com',
        password: 'testpassword'
      },
      RestApipath: 'https://api.easee.cloud',
      accessToken: null,
      refreshToken: null,
      tokenExpires: new Date(),
      refreshRetryCount: 0,
      loginRetryCount: 0,
      maxRefreshRetries: 3,
      maxLoginRetries: 3,
      status: jest.fn(),
      emit: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      log: jest.fn(),
      ...overrides
    };
  },

  /**
   * Create mock authentication response
   */
  createAuthResponse: (overrides = {}) => {
    return {
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      expiresIn: 3600,
      tokenType: 'Bearer',
      ...overrides
    };
  },

  /**
   * Create mock fetch response
   */
  createFetchResponse: (data, status = 200, headers = {}) => {
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      headers: {
        get: (name) => headers[name] || (name === 'content-type' ? 'application/json' : null),
        ...headers
      },
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data))
    });
  }
};

// Setup console spy to track console outputs in tests
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn()
};

// Reset before each test
beforeEach(() => {
  global.testHelpers.resetMocks();
  jest.clearAllTimers();
});

// Cleanup after each test
afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  jest.useFakeTimers();
});
