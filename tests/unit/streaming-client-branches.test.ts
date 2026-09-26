/**
 * charger-streaming-client's internal branches that do not need a real
 * SignalR connection: the logging fallbacks used when the configuration node
 * supplies none, the configuration node's "update" -> status forwarder, the
 * "input" topic (fullReconnect()), fullReconnect()'s three outcomes,
 * reconnect()'s outcomes and early-return guards, notifyOnError()'s no-op
 * guard, and startconn()'s charger/accessToken guards (EASEE-45) — all
 * through the real functions the constructor assigns, against a minimal stub
 * configuration node. Same construction pattern as
 * streaming-client-missing-config.test.ts (createMockRED + a hand-rolled
 * RED.nodes.createNode), extended to capture registered handlers so they can
 * be invoked directly.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import streamingClientNode from "../../easee-client/charger-streaming-client.js";
import { createMockRED } from "../mocks/nodeRedMocks.js";

// The constructor always schedules `setTimeout(() => node.fullReconnect(), 2000)`
// (a real connect-on-load delay). Fake timers keep that from firing for real,
// 2 wall-clock seconds into an unrelated later test — the same reason
// streaming-client-lifecycle.test.ts installs them. `ensureAuthentication`
// below always resolves (never undefined), so the stray call setup.ts's own
// afterEach flushes via runOnlyPendingTimers() is harmless.
beforeEach(() => {
  vi.useFakeTimers();
});

interface StubConnectionConfig {
  isConfigurationValid: () => boolean;
  on: (event: string, handler: (...args: any[]) => void) => void;
  ensureAuthentication: ReturnType<typeof vi.fn>;
  accessToken: string | false;
  signalRpath: string;
  debugLogging: boolean;
}

function createNode(): {
  node: any;
  connectionConfig: StubConnectionConfig;
  handlers: Record<string, (...args: any[]) => void>;
  configHandlers: Record<string, (...args: any[]) => void>;
} {
  const RED = createMockRED();
  const handlers: Record<string, (...args: any[]) => void> = {};
  const configHandlers: Record<string, (...args: any[]) => void> = {};

  // Deliberately missing logInfo/logDebug/logError/logWarn: the constructor's
  // fallbacks onto the node's own Node-RED logger (EASEE-29) are what several
  // tests below exercise. A resolvable,
  // valid config node so the constructor runs past its guards.
  const connectionConfig: StubConnectionConfig = {
    isConfigurationValid: () => true,
    on: (event, handler) => {
      configHandlers[event] = handler;
    },
    // Always resolves, never undefined: the constructor's own scheduled
    // 2-second fullReconnect() (see the file-level beforeEach above) calls
    // this once outside any test's control, and `.then()` on `undefined`
    // throws.
    ensureAuthentication: vi.fn().mockResolvedValue(false),
    accessToken: "token-1",
    signalRpath: "http://127.0.0.1:9/hubs/chargers",
    debugLogging: false,
  };

  RED.nodes.getNode = vi.fn(() => connectionConfig);
  RED.nodes.createNode = vi.fn((node: any) => {
    node.status = vi.fn();
    node.emit = vi.fn();
    node.error = vi.fn();
    node.warn = vi.fn();
    node.log = vi.fn();
    node.debug = vi.fn();
    node.on = vi.fn((event: string, handler: (...args: any[]) => void) => {
      handlers[event] = handler;
    });
    node.send = vi.fn();
  });

  streamingClientNode(RED);
  const StreamingClientConstructor = RED.nodes.registerType.mock.calls[0][1];
  const node = new StreamingClientConstructor({
    id: "streaming1",
    type: "charger-streaming-client",
    charger: "EH000000",
    configuration: "config1",
  });

  return { node, connectionConfig, handlers, configHandlers };
}

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe("charger-streaming-client — logging fallbacks", () => {
  it("falls back to the node's own Node-RED logger, never console, when the configuration node has none", () => {
    const { node, connectionConfig } = createNode();

    node.logInfo("info message", { a: 1 });
    expect(node.log).toHaveBeenCalledWith('[easee] info message {"a":1}');

    connectionConfig.debugLogging = false;
    node.logDebug("debug message", { skip: true });
    expect(node.debug).not.toHaveBeenCalled();

    connectionConfig.debugLogging = true;
    node.logDebug("debug message", { b: 2 });
    expect(node.debug).toHaveBeenCalledWith('[easee] DEBUG: debug message {"b":2}');

    node.logError("error message", new Error("boom"));
    expect(node.error).toHaveBeenCalledWith("[easee] ERROR: error message boom");

    node.logWarn("warn message");
    expect(node.warn).toHaveBeenCalledWith("[easee] WARN: warn message");

    expect(console.log).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });
});

describe("charger-streaming-client — configuration update forwarding", () => {
  it("forwards the configuration node's update event to its own status", () => {
    const { node, configHandlers } = createNode();

    configHandlers.update({ update: "Logged in" });

    expect(node.status).toHaveBeenCalledWith({ fill: "green", shape: "dot", text: "Logged in" });
  });
});

describe("charger-streaming-client — input topic", () => {
  it("reconnects and calls done() on input", () => {
    const { node, handlers } = createNode();
    node.fullReconnect = vi.fn();
    const done = vi.fn();

    handlers.input({ topic: "reconnect" }, vi.fn(), done);

    expect(node.fullReconnect).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledTimes(1);
  });
});

describe("charger-streaming-client — fullReconnect()", () => {
  it("starts the connection when authentication succeeds", async () => {
    const { node, connectionConfig } = createNode();
    node.startconn = vi.fn();
    connectionConfig.ensureAuthentication.mockResolvedValue(true);

    node.fullReconnect();
    await flushPromises();

    expect(node.startconn).toHaveBeenCalledTimes(1);
    expect(node.emit).not.toHaveBeenCalledWith("erro", expect.anything());
  });

  it("reports an erro when authentication fails", async () => {
    const { node, connectionConfig } = createNode();
    node.startconn = vi.fn();
    connectionConfig.ensureAuthentication.mockResolvedValue(false);

    node.fullReconnect();
    await flushPromises();

    expect(node.startconn).not.toHaveBeenCalled();
    // This mock config node has no authFailureCategory(), so the cause is unknown.
    expect(node.emit).toHaveBeenCalledWith("erro", {
      err: "Authentication failed during fullReconnect()",
      describe: { category: "unknown" },
    });
  });

  it("reports an erro when ensureAuthentication rejects", async () => {
    const { node, connectionConfig } = createNode();
    connectionConfig.ensureAuthentication.mockRejectedValue(new Error("network down"));

    node.fullReconnect();
    await flushPromises();

    expect(node.emit).toHaveBeenCalledWith("erro", {
      err: "Error during fullReconnect(): network down",
      describe: { category: "unknown" },
    });
  });
});

describe("charger-streaming-client — reconnect()", () => {
  it("does nothing while closing", async () => {
    const { node, connectionConfig } = createNode();
    node.closing = true;

    node.reconnect();
    await flushPromises();

    expect(connectionConfig.ensureAuthentication).not.toHaveBeenCalled();
  });

  it("clears a pending timer and schedules a fresh one when authentication succeeds", async () => {
    vi.useFakeTimers();
    try {
      const { node, connectionConfig } = createNode();
      connectionConfig.ensureAuthentication.mockResolvedValue(true);
      const staleHandle = setTimeout(() => {}, 60000);
      node.reconnectTimoutHandle = staleHandle;

      node.reconnect();
      await flushPromises();

      expect(node.reconnectTimoutHandle).not.toBe(staleHandle);
      expect(node.reconnectTimoutHandle).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("logs and does not schedule a retry when authentication fails", async () => {
    const { node, connectionConfig } = createNode();
    connectionConfig.ensureAuthentication.mockResolvedValue(false);

    node.reconnect();
    await flushPromises();

    expect(node.error).toHaveBeenCalledWith(
      "[easee] ERROR: Authentication failed during reconnect: not logged in to Easee",
    );
    // Unlike the isAuthenticated===true branch, the false branch never touches
    // reconnectTimoutHandle — it is left exactly as reconnect() found it.
    expect(node.reconnectTimoutHandle).toBeUndefined();
  });

  it("logs when ensureAuthentication rejects", async () => {
    const { node, connectionConfig } = createNode();
    connectionConfig.ensureAuthentication.mockRejectedValue(new Error("timeout"));

    node.reconnect();
    await flushPromises();

    expect(node.error).toHaveBeenCalledWith("[easee] ERROR: Error during reconnect: timeout");
  });
});

describe("charger-streaming-client — notifyOnError()", () => {
  it("does nothing when there is no error", () => {
    const { node } = createNode();

    node.notifyOnError(null, "conn-1");

    expect(node.emit).not.toHaveBeenCalledWith("erro", expect.anything());
  });

  it("emits erro with the id when there is an error", () => {
    const { node } = createNode();
    const err = new Error("boom");

    node.notifyOnError(err, "conn-1");

    // No HTTP status on it: the stream could not be reached.
    expect(node.emit).toHaveBeenCalledWith("erro", { err, id: "conn-1", describe: { category: "network" } });
  });
});

describe("charger-streaming-client — startconn() guards", () => {
  it("reports no charger and returns without building a connection", () => {
    const { node } = createNode();
    node.charger = undefined;

    node.startconn();

    expect(node.emit).toHaveBeenCalledWith("erro", {
      err: "No charger, exiting",
      describe: { category: "config", statusText: "No charger id", hint: "Set Charger in this node, then deploy." },
    });
    expect(node.connection).toBeUndefined();
  });

  it("waits for an access token and schedules a retry", () => {
    vi.useFakeTimers();
    try {
      const { node, connectionConfig } = createNode();
      connectionConfig.accessToken = false;

      node.startconn();

      expect(node.emit).toHaveBeenCalledWith("erro", {
        err: "No accessToken, waiting",
        describe: { category: "unknown", statusText: "Waiting for login" },
      });
      expect(node.reconnectTimoutHandle).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
