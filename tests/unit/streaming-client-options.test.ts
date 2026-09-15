/**
 * Tests for the streaming client skipNegotiation option
 */

import { createRequire } from "node:module";
import helper from "node-red-node-test-helper";
import { afterEach, describe, expect, it } from "vitest";
import streamingClientNode from "../../easee-client/charger-streaming-client.js";
import configNode from "../../easee-client/easee-configuration.js";

const require = createRequire(import.meta.url);

helper.init(require.resolve("node-red"));

/**
 * Load a flow and run the assertions once it has started. helper.load's
 * three-argument form (no credentials) is what these tests have always used; the
 * @types signature only declares the four-argument one, hence the cast.
 */
function loadAndCheck(flow: unknown[], check: () => void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    helper.load(
      [configNode, streamingClientNode] as any,
      flow as any,
      (() => {
        try {
          check();
          resolve();
        } catch (err) {
          reject(err);
        }
      }) as any,
    );
  });
}

describe("Streaming Client Options", () => {
  afterEach(() => {
    helper.unload();
  });

  it("should have skipNegotiation property as true by default", () => {
    const flow = [
      {
        id: "config1",
        type: "easee-configuration",
        name: "Test Config",
        username: "test@example.com",
        password: "testpass",
      },
      {
        id: "streaming1",
        type: "charger-streaming-client",
        name: "Test Streaming",
        charger: "EH000000",
        configuration: "config1",
        wires: [[], [], [], [], [], []],
      },
    ];

    return loadAndCheck(flow, () => {
      const streamingNode: any = helper.getNode("streaming1");
      expect(streamingNode.skipNegotiation).toBe(true);
    });
  });

  it("should accept skipNegotiation as true when configured", () => {
    const flow = [
      {
        id: "config1",
        type: "easee-configuration",
        name: "Test Config",
        username: "test@example.com",
        password: "testpass",
      },
      {
        id: "streaming1",
        type: "charger-streaming-client",
        name: "Test Streaming",
        charger: "EH000000",
        configuration: "config1",
        skipNegotiation: true,
        wires: [[], [], [], [], [], []],
      },
    ];

    return loadAndCheck(flow, () => {
      const streamingNode: any = helper.getNode("streaming1");
      expect(streamingNode.skipNegotiation).toBe(true);
    });
  });

  it("should accept skipNegotiation as false when explicitly configured", () => {
    const flow = [
      {
        id: "config1",
        type: "easee-configuration",
        name: "Test Config",
        username: "test@example.com",
        password: "testpass",
      },
      {
        id: "streaming1",
        type: "charger-streaming-client",
        name: "Test Streaming",
        charger: "EH000000",
        configuration: "config1",
        skipNegotiation: false,
        wires: [[], [], [], [], [], []],
      },
    ];

    return loadAndCheck(flow, () => {
      const streamingNode: any = helper.getNode("streaming1");
      expect(streamingNode.skipNegotiation).toBe(false);
    });
  });

  it("should handle skipNegotiation property correctly when undefined", () => {
    const flow = [
      {
        id: "config1",
        type: "easee-configuration",
        name: "Test Config",
        username: "test@example.com",
        password: "testpass",
      },
      {
        id: "streaming1",
        type: "charger-streaming-client",
        name: "Test Streaming",
        charger: "EH000000",
        configuration: "config1",
        skipNegotiation: undefined,
        wires: [[], [], [], [], [], []],
      },
    ];

    return loadAndCheck(flow, () => {
      const streamingNode: any = helper.getNode("streaming1");
      // Should default to true when undefined
      expect(streamingNode.skipNegotiation).toBe(true);
    });
  });
});
