/**
 * The two Node-RED test doubles still in use: a typed accessor for the global
 * fetch mock, and a stub RED for the few tests that construct a real node
 * against it (configValidation, streaming-client-missing-config) or check what
 * a module registers. New behaviour tests load the real node through
 * node-red-node-test-helper instead (EASEE-31).
 */

import { type Mock, vi } from "vitest";

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
