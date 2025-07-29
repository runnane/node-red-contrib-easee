const EaseeConfiguration = require("../../easee-client/easee-configuration.js");
const nodeRedMocks = require("../mocks/nodeRedMocks");

describe("Configuration Node Validation", () => {
  let RED;
  let createdNodes = []; // Track created nodes for cleanup

  beforeEach(() => {
    RED = nodeRedMocks.createMockRED();
    createdNodes = [];
    // Use fake timers to prevent actual timeouts
    jest.useFakeTimers();
  });

  afterEach(() => {
    // Cleanup all created nodes to prevent memory leaks
    createdNodes.forEach(node => {
      if (node.checkTokenHandler) {
        clearTimeout(node.checkTokenHandler);
        node.checkTokenHandler = null;
      }
    });
    createdNodes = [];

    // Restore real timers
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe("validateCredentials", () => {
    test("should return valid for proper credentials", () => {
      // Setup the module
      const _moduleExports = EaseeConfiguration(RED);

      // Create a mock configuration with valid credentials
      const mockConfig = {
        username: "test@example.com", // Username is now a regular property
        credentials: {
          password: "testpassword"     // Only password remains as credential
        }
      };

      // Mock RED.nodes.createNode to set up the node properly
      RED.nodes.createNode = jest.fn((node, _config) => {
        node.credentials = mockConfig.credentials;
        node.username = mockConfig.username; // Set username as regular property
        node.status = jest.fn();
        node.error = jest.fn();
        node.warn = jest.fn();
        node.on = jest.fn();
        node.emit = jest.fn();
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
      const _moduleExports = EaseeConfiguration(RED);

      // Create a mock configuration with missing username
      const mockConfig = {
        username: "", // Empty username as regular property
        credentials: {
          password: "testpassword"
        }
      };

      RED.nodes.createNode = jest.fn((node, _config) => {
        node.credentials = mockConfig.credentials;
        node.username = mockConfig.username; // Set username as regular property
        node.status = jest.fn();
        node.error = jest.fn();
        node.warn = jest.fn();
        node.on = jest.fn();
        node.emit = jest.fn();
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
      const _moduleExports = EaseeConfiguration(RED);

      // Create a mock configuration with missing password
      const mockConfig = {
        username: "test@example.com", // Username as regular property
        credentials: {
          password: ""                // Empty password as credential
        }
      };

      RED.nodes.createNode = jest.fn((node, _config) => {
        node.credentials = mockConfig.credentials;
        node.username = mockConfig.username; // Set username as regular property
        node.status = jest.fn();
        node.error = jest.fn();
        node.warn = jest.fn();
        node.on = jest.fn();
        node.emit = jest.fn();
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
      const _moduleExports = EaseeConfiguration(RED);

      // Create a mock configuration with no credentials
      const mockConfig = {
        username: "" // Even with empty username, should fail on username first
      };

      RED.nodes.createNode = jest.fn((node, _config) => {
        node.credentials = null;
        node.username = mockConfig.username; // Set username as regular property
        node.status = jest.fn();
        node.error = jest.fn();
        node.warn = jest.fn();
        node.on = jest.fn();
        node.emit = jest.fn();
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
      const _moduleExports = EaseeConfiguration(RED);

      const mockConfig = {
        username: "test@example.com", // Username as regular property
        credentials: {
          password: "testpassword"     // Only password as credential
        }
      };

      RED.nodes.createNode = jest.fn((node, _config) => {
        node.credentials = mockConfig.credentials;
        node.username = mockConfig.username; // Set username as regular property
        node.status = jest.fn();
        node.error = jest.fn();
        node.warn = jest.fn();
        node.on = jest.fn();
        node.emit = jest.fn();
      });

      const configConstructor = RED.nodes.registerType.mock.calls[0][1];
      const node = new configConstructor(mockConfig);
      createdNodes.push(node); // Track for cleanup

      expect(node.isConfigurationValid()).toBe(true);
    });

    test("should return false for invalid configuration", () => {
      // Setup the module
      const _moduleExports = EaseeConfiguration(RED);

      const mockConfig = {
        username: "", // Empty username as regular property
        credentials: {
          password: "testpassword"
        }
      };

      RED.nodes.createNode = jest.fn((node, _config) => {
        node.credentials = mockConfig.credentials;
        node.username = mockConfig.username; // Set username as regular property
        node.status = jest.fn();
        node.error = jest.fn();
        node.warn = jest.fn();
        node.on = jest.fn();
        node.emit = jest.fn();
      });

      const configConstructor = RED.nodes.registerType.mock.calls[0][1];
      const node = new configConstructor(mockConfig);
      createdNodes.push(node); // Track for cleanup

      expect(node.isConfigurationValid()).toBe(false);
    });
  });
});
