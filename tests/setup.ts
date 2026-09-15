/**
 * Vitest setup file for Easee Node-RED contribution tests
 * This file is executed before each test file
 */

import { afterEach, beforeEach, vi } from "vitest";

interface MockNodeOverrides {
  [key: string]: unknown;
}

interface TestHelpers {
  resetMocks: () => void;
  createMockNode: (overrides?: MockNodeOverrides) => any;
  createAuthResponse: (overrides?: MockNodeOverrides) => any;
  createFetchResponse: (data: unknown, status?: number, headers?: Record<string, string>) => Promise<any>;
  /** Node's own fetch, before the mock below replaced it. */
  realFetch: typeof fetch;
}

declare global {
  var testHelpers: TestHelpers;
}

// Kept for the tests that talk to a real local HTTP server (EASEE-35).
const realFetch = globalThis.fetch;

// Mock fetch globally for all tests
globalThis.fetch = vi.fn();

// Global test helpers
globalThis.testHelpers = {
  realFetch,

  /**
   * Reset all mocks before each test
   */
  resetMocks: () => {
    vi.clearAllMocks();
    (globalThis.fetch as any).mockClear();
  },

  /**
   * Create a mock Node-RED node
   */
  createMockNode: (overrides = {}) => {
    return {
      credentials: {
        username: "test@example.com",
        password: "testpassword",
      },
      RestApipath: "https://api.easee.cloud",
      accessToken: null,
      refreshToken: null,
      tokenExpires: new Date(),
      refreshRetryCount: 0,
      loginRetryCount: 0,
      maxRefreshRetries: 3,
      maxLoginRetries: 3,
      status: vi.fn(),
      emit: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      log: vi.fn(),
      ...overrides,
    };
  },

  /**
   * Create mock authentication response
   */
  createAuthResponse: (overrides = {}) => {
    return {
      accessToken: "mock-access-token",
      refreshToken: "mock-refresh-token",
      expiresIn: 3600,
      tokenType: "Bearer",
      ...overrides,
    };
  },

  /**
   * Create mock fetch response
   */
  createFetchResponse: (data, status = 200, headers = {}) => {
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? "OK" : "Error",
      headers: {
        get: (name: string) => headers[name] || (name === "content-type" ? "application/json" : null),
        ...headers,
      },
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(typeof data === "string" ? data : JSON.stringify(data)),
    });
  },
};

// Setup console spy to track console outputs in tests
globalThis.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
} as Console;

// Reset before each test.
//
// Jest's clearAllTimers/runOnlyPendingTimers only warn when fake timers are not
// installed; Vitest's throw. So each is guarded rather than called blind — the
// behaviour when fake timers ARE installed is unchanged.
beforeEach(() => {
  globalThis.testHelpers.resetMocks();
  if (vi.isFakeTimers()) {
    vi.clearAllTimers();
  }
});

// Cleanup after each test. As under Jest, this leaves fake timers installed for
// the next test in the file; suites that need real ones opt out explicitly.
afterEach(() => {
  if (vi.isFakeTimers()) {
    vi.runOnlyPendingTimers();
  }
  vi.useRealTimers();
  vi.useFakeTimers();
});
