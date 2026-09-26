/**
 * Integration tests using node-red-node-test-helper
 * This demonstrates how to test Node-RED nodes with the official test helper
 */

import { createRequire } from "node:module";
import helper from "node-red-node-test-helper";
import { afterEach, describe, expect, it, vi } from "vitest";
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

/**
 * The configuration node's logging helpers write to Node-RED's own per-node
 * logger, never to console, and logDebug is silent unless debugLogging is on
 * (EASEE-29). Asserted twice over: on the node's log()/debug()/warn()/error()
 * methods, and on the runtime logger itself (helper.log(), a spy on
 * @node-red/util's log.log), where each entry carries the node's id and a level.
 */
describe("Easee Configuration - logging helpers follow Node-RED's logger (EASEE-29)", () => {
  // @node-red/util's numeric levels, pinned rather than imported: the package is
  // not a direct dependency, and a changed value should fail here loudly.
  const INFO = 40;
  const DEBUG = 50;

  afterEach(() => {
    helper.unload();
  });

  function loadConfig(options: { debugLogging?: boolean; debugToNodeWarn?: boolean }): Promise<any> {
    const flow = [
      {
        id: "log1",
        type: "easee-configuration",
        name: "logging config",
        username: "test@example.com",
        debugLogging: options.debugLogging ?? false,
        debugToNodeWarn: options.debugToNodeWarn ?? false,
      },
    ];
    const credentials = { log1: { password: "testpass" } };
    return new Promise((resolve) => {
      helper.load(easeeConfiguration as any, flow as any, credentials as any, () => {
        resolve(helper.getNode("log1"));
      });
    });
  }

  /** Runtime log entries this node wrote whose message is exactly `msg`. */
  function runtimeEntries(msg: string): Array<{ level: number; id: string; msg: string }> {
    return (helper.log() as any).args
      .map((args: unknown[]) => args[0] as { level: number; id: string; msg: string })
      .filter((entry: { id: string; msg: unknown }) => entry.id === "log1" && entry.msg === msg);
  }

  /** console calls whose first argument is one of this package's own lines. */
  function easeeConsoleCalls(sink: unknown): unknown[][] {
    return (sink as { mock: { calls: unknown[][] } }).mock.calls.filter(
      (call) => typeof call[0] === "string" && call[0].startsWith("[easee]"),
    );
  }

  it("logInfo goes to node.log() at INFO level, not console.log", async () => {
    const n: any = await loadConfig({});
    const logSpy = vi.spyOn(n, "log");

    n.logInfo("info line", { a: 1 });

    expect(logSpy).toHaveBeenCalledWith('[easee] info line {"a":1}');
    expect(runtimeEntries('[easee] info line {"a":1}').map((e) => e.level)).toEqual([INFO]);
    expect(easeeConsoleCalls(console.log)).toEqual([]);
  }, 15000);

  it("logDebug is silent with debugLogging off: neither node.debug() nor console receives anything", async () => {
    // debugToNodeWarn on as well, to prove the debugLogging gate comes first.
    const n: any = await loadConfig({ debugLogging: false, debugToNodeWarn: true });
    const debugSpy = vi.spyOn(n, "debug");
    const warnSpy = vi.spyOn(n, "warn");

    n.logDebug("quiet line", { b: 2 });

    expect(debugSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(runtimeEntries('[easee] DEBUG: quiet line {"b":2}')).toEqual([]);
    expect(easeeConsoleCalls(console.log)).toEqual([]);
  }, 15000);

  it("logDebug reaches the Node-RED logger at DEBUG level with debugLogging on", async () => {
    const n: any = await loadConfig({ debugLogging: true });
    const debugSpy = vi.spyOn(n, "debug");
    const warnSpy = vi.spyOn(n, "warn");

    n.logDebug("loud line", { c: 3 });

    expect(debugSpy).toHaveBeenCalledWith('[easee] DEBUG: loud line {"c":3}');
    expect(runtimeEntries('[easee] DEBUG: loud line {"c":3}').map((e) => e.level)).toEqual([DEBUG]);
    // debugToNodeWarn is off, so nothing is copied to the debug sidebar.
    expect(warnSpy).not.toHaveBeenCalled();
    expect(easeeConsoleCalls(console.log)).toEqual([]);
  }, 15000);

  it("debugToNodeWarn still copies info and debug lines to node.warn(), unchanged", async () => {
    const n: any = await loadConfig({ debugLogging: true, debugToNodeWarn: true });
    const warnSpy = vi.spyOn(n, "warn");

    n.logInfo("info copy", { d: 4 });
    n.logDebug("debug copy");

    expect(warnSpy).toHaveBeenCalledWith('[easee] info copy {"d":4}');
    expect(warnSpy).toHaveBeenCalledWith("[easee] DEBUG: debug copy");
  }, 15000);

  it("logError and logWarn go to node.error()/node.warn() only, not console", async () => {
    const n: any = await loadConfig({});
    const errorSpy = vi.spyOn(n, "error");
    const warnSpy = vi.spyOn(n, "warn");

    n.logError("bad thing:", new Error("boom"));
    n.logWarn("odd thing", { e: 5 });

    expect(errorSpy).toHaveBeenCalledWith("[easee] ERROR: bad thing: boom");
    expect(warnSpy).toHaveBeenCalledWith('[easee] WARN: odd thing {"e":5}');
    expect(easeeConsoleCalls(console.error)).toEqual([]);
    expect(easeeConsoleCalls(console.warn)).toEqual([]);
  }, 15000);
});
