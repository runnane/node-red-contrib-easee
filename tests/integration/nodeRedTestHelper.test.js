/**
 * Integration tests using node-red-node-test-helper
 * This demonstrates how to test Node-RED nodes with the official test helper
 */

const helper = require("node-red-node-test-helper");
const easeeConfiguration = require("../../easee-client/easee-configuration.js");

helper.init(require.resolve("node-red"));

describe("Easee Configuration - Test Helper Integration", function() {
  afterEach(function(done) {
    helper.unload();
    done();
  });

  it("should load the configuration node correctly", function(done) {
    const flow = [
      {
        id: "n1",
        type: "easee-configuration",
        name: "test config"
      }
    ];

    const credentials = {
      n1: {
        username: "test@example.com",
        password: "testpass"
      }
    };

    helper.load(easeeConfiguration, flow, credentials, function() {
      try {
        const n1 = helper.getNode("n1");

        // Test that the node was loaded correctly
        expect(n1).toBeDefined();
        expect(n1.name).toBe("test config");
        expect(n1.type).toBe("easee-configuration");

        // Test that logging functions are available
        expect(typeof n1.logInfo).toBe("function");
        expect(typeof n1.logDebug).toBe("function");
        expect(typeof n1.logError).toBe("function");
        expect(typeof n1.logWarn).toBe("function");

        done();
      } catch (error) {
        done(error);
      }
    });
  }, 15000);

  it("should validate credentials correctly", function(done) {
    const flow = [
      {
        id: "n2",
        type: "easee-configuration",
        name: "test config 2"
      }
    ];

    const credentials = {
      n2: {
        username: "test@example.com",
        password: "testpass"
      }
    };

    helper.load(easeeConfiguration, flow, credentials, function() {
      try {
        const n2 = helper.getNode("n2");

        // Test credential validation
        const validation = n2.validateCredentials();
        expect(validation.valid).toBe(true);
        expect(validation.message).toBe("Credentials are valid");

        done();
      } catch (error) {
        done(error);
      }
    });
  }, 15000);

  it("should fail validation with missing credentials", function(done) {
    const flow = [
      {
        id: "n3",
        type: "easee-configuration",
        name: "test config 3"
      }
    ];

    const credentials = {
      n3: {
        username: "",
        password: ""
      }
    };

    helper.load(easeeConfiguration, flow, credentials, function() {
      try {
        const n3 = helper.getNode("n3");

        // Test credential validation failure
        const validation = n3.validateCredentials();
        expect(validation.valid).toBe(false);
        expect(validation.message).toBe("Username is required");

        done();
      } catch (error) {
        done(error);
      }
    });
  }, 15000);
});
