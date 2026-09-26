/**
 * Mock utilities for Node-RED and Easee API testing
 */

import { expect, type Mock, vi } from "vitest";
import mockData from "../fixtures/mockData.js";

type ErrorKey<T> = keyof T & string;

/**
 * The global fetch, typed as the mock tests/setup.ts installs. A typed accessor
 * rather than a re-declared global, because `fetch` is already declared by
 * @types/node and a global cannot be declared twice with different types.
 */
export function fetchMock(): Mock<(...args: any[]) => any> {
  return globalThis.fetch as unknown as Mock<(...args: any[]) => any>;
}

/**
 * Create a mock Node-RED runtime environment
 */
export function createMockRED(): any {
  return {
    nodes: {
      createNode: vi.fn(),
      registerType: vi.fn(),
    },
    util: {
      log: vi.fn(),
      error: vi.fn(),
    },
    settings: {
      httpNodeRoot: "/red",
      userDir: "/tmp",
    },
    events: {
      on: vi.fn(),
      emit: vi.fn(),
    },
    // The configuration node registers its re-login admin route at load (EASEE-28).
    httpAdmin: {
      post: vi.fn(),
    },
    auth: {
      needsPermission: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
    },
  };
}

/**
 * Create a comprehensive mock Easee configuration node
 */
export function createMockEaseeNode(overrides: Record<string, unknown> = {}): any {
  const defaultNode = {
    // Node-RED standard properties
    id: "test-node-id",
    type: "easee-configuration",
    name: "Test Easee Config",
    username: mockData.validCredentials.username,
    // Easee-specific properties
    credentials: {
      password: mockData.validCredentials.password,
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
    status: vi.fn(),
    emit: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
    send: vi.fn(),

    // Mock implementations of key methods (will be overridden by real implementation)
    doLogin: vi.fn(),
    doRefreshToken: vi.fn(),
    checkToken: vi.fn(),
    resetAuthenticationState: vi.fn(),
    parseObservation: vi.fn(),

    ...overrides,
  };

  return defaultNode;
}

/**
 * Mock successful fetch responses for different scenarios
 */
export const mockFetchResponses = {
  /**
   * Mock successful login
   */
  loginSuccess: () => {
    fetchMock().mockResolvedValueOnce(globalThis.testHelpers.createFetchResponse(mockData.loginSuccess, 200));
  },

  /**
   * Mock login failure
   */
  loginFailure: (errorType: ErrorKey<typeof mockData.loginErrors> = "invalidCredentials") => {
    const errorData = mockData.loginErrors[errorType];
    fetchMock().mockResolvedValueOnce(globalThis.testHelpers.createFetchResponse(errorData, errorData.status));
  },

  /**
   * Mock successful token refresh
   */
  refreshSuccess: () => {
    fetchMock().mockResolvedValueOnce(globalThis.testHelpers.createFetchResponse(mockData.refreshSuccess, 200));
  },

  /**
   * Mock refresh token failure
   */
  refreshFailure: (errorType: ErrorKey<typeof mockData.refreshErrors> = "invalidRefreshToken") => {
    const errorData = mockData.refreshErrors[errorType];
    fetchMock().mockResolvedValueOnce(globalThis.testHelpers.createFetchResponse(errorData, errorData.status));
  },

  /**
   * Mock network error
   */
  networkError: (errorType: ErrorKey<typeof mockData.networkErrors> = "timeout") => {
    fetchMock().mockRejectedValueOnce(mockData.networkErrors[errorType]);
  },

  /**
   * Mock non-JSON response
   */
  nonJsonResponse: () => {
    fetchMock().mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: {
        get: () => "text/html",
      },
      text: () => Promise.resolve("<html>Internal Server Error</html>"),
    });
  },
};

/**
 * Verify that fetch was called with correct parameters
 */
export function verifyFetchCall(expectedUrl: string, expectedOptions: Record<string, unknown> = {}) {
  expect(globalThis.fetch).toHaveBeenCalledWith(expectedUrl, expect.objectContaining(expectedOptions));
}

/**
 * Verify node status was set correctly
 */
export function verifyNodeStatus(node: any, expectedStatus: Record<string, unknown>) {
  expect(node.status).toHaveBeenCalledWith(expect.objectContaining(expectedStatus));
}

/**
 * Verify node emitted correct event
 */
export function verifyNodeEmit(node: any, eventName: string, eventData: Record<string, unknown> = {}) {
  expect(node.emit).toHaveBeenCalledWith(eventName, expect.objectContaining(eventData));
}

/**
 * Simulate time passage for token expiration tests
 */
export function simulateTimePassage(minutes: number) {
  const milliseconds = minutes * 60 * 1000;
  vi.advanceTimersByTime(milliseconds);
}

export { mockData };
