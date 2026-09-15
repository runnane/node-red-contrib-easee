import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import EaseeConfiguration from "../../easee-client/easee-configuration.js";
import { createMockRED } from "../mocks/nodeRedMocks.js";

describe("Configuration Node Validation", () => {
  let RED: any;
  let createdNodes: any[] = []; // Track created nodes for cleanup

  beforeEach(() => {
    RED = createMockRED();
    createdNodes = [];
    // Use fake timers to prevent actual timeouts
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Cleanup all created nodes to prevent memory leaks
    createdNodes.forEach((node) => {
      if (node.checkTokenHandler) {
        clearTimeout(node.checkTokenHandler);
        node.checkTokenHandler = null;
      }
    });
    createdNodes = [];

    // Restore real timers
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  describe("validateCredentials", () => {
    test("should return valid for proper credentials", () => {
      // Setup the module
      EaseeConfiguration(RED);

      // Create a mock configuration with valid credentials
      const mockConfig = {
        username: "test@example.com", // Username is now a regular property
        credentials: {
          password: "testpassword", // Only password remains as credential
        },
      };

      // Mock RED.nodes.createNode to set up the node properly
      RED.nodes.createNode = vi.fn((node: any, _config: any) => {
        node.credentials = mockConfig.credentials;
        node.username = mockConfig.username; // Set username as regular property
        node.status = vi.fn();
        node.error = vi.fn();
        node.warn = vi.fn();
        node.on = vi.fn();
        node.emit = vi.fn();
      });

      // Get the registered constructor
      const configConstructor = RED.nodes.registerType.mock.calls[0][1];

      // Create a node instance using new
      const node = new configConstructor(mockConfig);
      createdNodes.push(node); // Track for cleanup

      // Test validation
      const result = node.validateCredentials();
      expect(result.valid).toBe(true);
      expect(result.message).toBe("Credentials are valid");
    });

    test("should return invalid for missing username", () => {
      // Setup the module
      EaseeConfiguration(RED);

      // Create a mock configuration with missing username
      const mockConfig = {
        username: "", // Empty username as regular property
        credentials: {
          password: "testpassword",
        },
      };

      RED.nodes.createNode = vi.fn((node: any, _config: any) => {
        node.credentials = mockConfig.credentials;
        node.username = mockConfig.username; // Set username as regular property
        node.status = vi.fn();
        node.error = vi.fn();
        node.warn = vi.fn();
        node.on = vi.fn();
        node.emit = vi.fn();
      });

      const configConstructor = RED.nodes.registerType.mock.calls[0][1];
      const node = new configConstructor(mockConfig);
      createdNodes.push(node); // Track for cleanup

      const result = node.validateCredentials();
      expect(result.valid).toBe(false);
      expect(result.message).toBe("Username is required");
    });

    test("should return invalid for missing password", () => {
      // Setup the module
      EaseeConfiguration(RED);

      // Create a mock configuration with missing password
      const mockConfig = {
        username: "test@example.com", // Username as regular property
        credentials: {
          password: "", // Empty password as credential
        },
      };

      RED.nodes.createNode = vi.fn((node: any, _config: any) => {
        node.credentials = mockConfig.credentials;
        node.username = mockConfig.username; // Set username as regular property
        node.status = vi.fn();
        node.error = vi.fn();
        node.warn = vi.fn();
        node.on = vi.fn();
        node.emit = vi.fn();
      });

      const configConstructor = RED.nodes.registerType.mock.calls[0][1];
      const node = new configConstructor(mockConfig);
      createdNodes.push(node); // Track for cleanup

      const result = node.validateCredentials();
      expect(result.valid).toBe(false);
      expect(result.message).toBe("Password is required");
    });

    test("should return invalid for missing credentials object", () => {
      // Setup the module
      EaseeConfiguration(RED);

      // Create a mock configuration with no credentials
      const mockConfig = {
        username: "", // Even with empty username, should fail on username first
      };

      RED.nodes.createNode = vi.fn((node: any, _config: any) => {
        node.credentials = null;
        node.username = mockConfig.username; // Set username as regular property
        node.status = vi.fn();
        node.error = vi.fn();
        node.warn = vi.fn();
        node.on = vi.fn();
        node.emit = vi.fn();
      });

      const configConstructor = RED.nodes.registerType.mock.calls[0][1];
      const node = new configConstructor(mockConfig);
      createdNodes.push(node); // Track for cleanup

      const result = node.validateCredentials();
      expect(result.valid).toBe(false);
      expect(result.message).toBe("Username is required");
    });
  });

  describe("isConfigurationValid", () => {
    test("should return true for valid configuration", () => {
      // Setup the module
      EaseeConfiguration(RED);

      const mockConfig = {
        username: "test@example.com", // Username as regular property
        credentials: {
          password: "testpassword", // Only password as credential
        },
      };

      RED.nodes.createNode = vi.fn((node: any, _config: any) => {
        node.credentials = mockConfig.credentials;
        node.username = mockConfig.username; // Set username as regular property
        node.status = vi.fn();
        node.error = vi.fn();
        node.warn = vi.fn();
        node.on = vi.fn();
        node.emit = vi.fn();
      });

      const configConstructor = RED.nodes.registerType.mock.calls[0][1];
      const node = new configConstructor(mockConfig);
      createdNodes.push(node); // Track for cleanup

      expect(node.isConfigurationValid()).toBe(true);
    });

    test("should return false for invalid configuration", () => {
      // Setup the module
      EaseeConfiguration(RED);

      const mockConfig = {
        username: "", // Empty username as regular property
        credentials: {
          password: "testpassword",
        },
      };

      RED.nodes.createNode = vi.fn((node: any, _config: any) => {
        node.credentials = mockConfig.credentials;
        node.username = mockConfig.username; // Set username as regular property
        node.status = vi.fn();
        node.error = vi.fn();
        node.warn = vi.fn();
        node.on = vi.fn();
        node.emit = vi.fn();
      });

      const configConstructor = RED.nodes.registerType.mock.calls[0][1];
      const node = new configConstructor(mockConfig);
      createdNodes.push(node); // Track for cleanup

      expect(node.isConfigurationValid()).toBe(false);
    });
  });
});
