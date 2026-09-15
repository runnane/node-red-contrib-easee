/**
 * Integration tests using node-red-node-test-helper
 * This demonstrates how to test Node-RED nodes with the official test helper
 */

import { createRequire } from "node:module";
import helper from "node-red-node-test-helper";
import { afterEach, describe, expect, it } from "vitest";
import easeeConfiguration from "../../easee-client/easee-configuration.js";

const require = createRequire(import.meta.url);

helper.init(require.resolve("node-red"));

/**
 * Load a flow with credentials and run the assertions once it has started,
 * resolving or rejecting where the Jest version called done() / done(error).
 */
function loadAndCheck(flow: unknown[], credentials: Record<string, unknown>, check: () => void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    helper.load(easeeConfiguration as any, flow as any, credentials as any, () => {
      try {
        check();
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

describe("Easee Configuration - Test Helper Integration", () => {
  afterEach(() => {
    helper.unload();
  });

  it("should load the configuration node correctly", () => {
    const flow = [
      {
        id: "n1",
        type: "easee-configuration",
        name: "test config",
        username: "test@example.com", // Username as regular property
      },
    ];

    const credentials = {
      n1: {
        password: "testpass", // Only password as credential
      },
    };

    return loadAndCheck(flow, credentials, () => {
      const n1: any = helper.getNode("n1");

      // Test that the node was loaded correctly
      expect(n1).toBeDefined();
      expect(n1.name).toBe("test config");
      expect(n1.type).toBe("easee-configuration");

      // Test that logging functions are available
      expect(typeof n1.logInfo).toBe("function");
      expect(typeof n1.logDebug).toBe("function");
      expect(typeof n1.logError).toBe("function");
      expect(typeof n1.logWarn).toBe("function");
    });
  }, 15000);

  it("should validate credentials correctly", () => {
    const flow = [
      {
        id: "n2",
        type: "easee-configuration",
        name: "test config 2",
        username: "test@example.com", // Username as regular property
      },
    ];

    const credentials = {
      n2: {
        password: "testpass", // Only password as credential
      },
    };

    return loadAndCheck(flow, credentials, () => {
      const n2: any = helper.getNode("n2");

      // Test credential validation
      const validation = n2.validateCredentials();
      expect(validation.valid).toBe(true);
      expect(validation.message).toBe("Credentials are valid");
    });
  }, 15000);

  it("should fail validation with missing credentials", () => {
    const flow = [
      {
        id: "n3",
        type: "easee-configuration",
        name: "test config 3",
        username: "", // Empty username as regular property
      },
    ];

    const credentials = {
      n3: {
        password: "", // Empty password as credential
      },
    };

    return loadAndCheck(flow, credentials, () => {
      const n3: any = helper.getNode("n3");

      // Test credential validation failure
      const validation = n3.validateCredentials();
      expect(validation.valid).toBe(false);
      expect(validation.message).toBe("Username is required");
    });
  }, 15000);
});
