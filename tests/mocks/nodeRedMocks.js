/**
 * Mock utilities for Node-RED and Easee API testing
 */

const mockData = require("../fixtures/mockData");

/**
 * Create a mock Node-RED runtime environment
 */
function createMockRED() {
  return {
    nodes: {
      createNode: jest.fn(),
      registerType: jest.fn()
    },
    util: {
      log: jest.fn(),
      error: jest.fn()
    },
    settings: {
      httpNodeRoot: "/red",
      userDir: "/tmp"
    },
    events: {
      on: jest.fn(),
      emit: jest.fn()
    }
  };
}

/**
 * Create a comprehensive mock Easee configuration node
 */
function createMockEaseeNode(overrides = {}) {
  const defaultNode = {
    // Node-RED standard properties
    id: "test-node-id",
    type: "easee-configuration",
    name: "Test Easee Config",
    username: mockData.validCredentials.username,
    // Easee-specific properties
    credentials: {
      password: mockData.validCredentials.password
    },
    RestApipath: mockData.apiEndpoints.baseUrl,

    // Authentication state
    accessToken: null,
    refreshToken: null,
    tokenExpires: new Date(),

    // Retry counters
    refreshRetryCount: 0,
    loginRetryCount: 0,
    maxRefreshRetries: 3,
    maxLoginRetries: 3,

    // Timer handlers
    checkTokenHandler: null,

    // Node-RED methods
    status: jest.fn(),
    emit: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    log: jest.fn(),
    send: jest.fn(),

    // Mock implementations of key methods (will be overridden by real implementation)
    doLogin: jest.fn(),
    doRefreshToken: jest.fn(),
    checkToken: jest.fn(),
    resetAuthenticationState: jest.fn(),
    parseObservation: jest.fn(),

    ...overrides
  };

  return defaultNode;
}

/**
 * Mock successful fetch responses for different scenarios
 */
const mockFetchResponses = {
  /**
   * Mock successful login
   */
  loginSuccess: () => {
    global.fetch.mockResolvedValueOnce(
      global.testHelpers.createFetchResponse(mockData.loginSuccess, 200)
    );
  },

  /**
   * Mock login failure
   */
  loginFailure: (errorType = "invalidCredentials") => {
    const errorData = mockData.loginErrors[errorType];
    global.fetch.mockResolvedValueOnce(
      global.testHelpers.createFetchResponse(errorData, errorData.status)
    );
  },

  /**
   * Mock successful token refresh
   */
  refreshSuccess: () => {
    global.fetch.mockResolvedValueOnce(
      global.testHelpers.createFetchResponse(mockData.refreshSuccess, 200)
    );
  },

  /**
   * Mock refresh token failure
   */
  refreshFailure: (errorType = "invalidRefreshToken") => {
    const errorData = mockData.refreshErrors[errorType];
    global.fetch.mockResolvedValueOnce(
      global.testHelpers.createFetchResponse(errorData, errorData.status)
    );
  },

  /**
   * Mock network error
   */
  networkError: (errorType = "timeout") => {
    global.fetch.mockRejectedValueOnce(mockData.networkErrors[errorType]);
  },

  /**
   * Mock non-JSON response
   */
  nonJsonResponse: () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: {
        get: () => "text/html"
      },
      text: () => Promise.resolve("<html>Internal Server Error</html>")
    });
  }
};

/**
 * Verify that fetch was called with correct parameters
 */
function verifyFetchCall(expectedUrl, expectedOptions = {}) {
  expect(global.fetch).toHaveBeenCalledWith(expectedUrl, expect.objectContaining(expectedOptions));
}

/**
 * Verify node status was set correctly
 */
function verifyNodeStatus(node, expectedStatus) {
  expect(node.status).toHaveBeenCalledWith(expect.objectContaining(expectedStatus));
}

/**
 * Verify node emitted correct event
 */
function verifyNodeEmit(node, eventName, eventData = {}) {
  expect(node.emit).toHaveBeenCalledWith(eventName, expect.objectContaining(eventData));
}

/**
 * Simulate time passage for token expiration tests
 */
function simulateTimePassage(minutes) {
  const milliseconds = minutes * 60 * 1000;
  jest.advanceTimersByTime(milliseconds);
}

module.exports = {
  createMockRED,
  createMockEaseeNode,
  mockFetchResponses,
  verifyFetchCall,
  verifyNodeStatus,
  verifyNodeEmit,
  simulateTimePassage,
  mockData
};
