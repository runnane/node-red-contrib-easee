/**
 * The streaming client's close and "opened" handlers (EASEE-19).
 *
 * The TypeScript conversion refused three things in charger-streaming-client
 * that had been failing at runtime: `node.connection.stop()` on a node that never
 * connected, `node.removeInputNode(node)` (a method of the signalrcore node this
 * package was forked from, absent here), and `easeeClient.logger.error(...)` (an
 * undefined name) in three catch blocks. These drive the real node through a real
 * Node-RED runtime and pin the fixed behaviour.
 *
 * The close tests assert what the handler DOES after the old throw point, not
 * that close() resolves: Node-RED's Node.close() swallows an error thrown by a
 * close listener and resolves anyway (@node-red/runtime lib/nodes/Node.js), so
 * "close() resolved" passes with the bug in place — measured by reverting each fix.
 * What the throw really cost was the rest of the handler: the pending reconnect
 * timer was never cleared, and "Disconnected" was never reported.
 */

import { createRequire } from "node:module";
import { HubConnectionBuilder } from "@microsoft/signalr";
import helper from "node-red-node-test-helper";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import streamingClientNode from "../../easee-client/charger-streaming-client.js";
import configNode from "../../easee-client/easee-configuration.js";
import { EaseeSignalRHttpClient } from "../../easee-client/signalr-http-client.js";

const require = createRequire(import.meta.url);

helper.init(require.resolve("node-red"));

const flow = [
  {
    id: "config1",
    type: "easee-configuration",
    name: "Test Config",
    username: "test@example.com",
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

// Valid credentials, so the constructor gets past its validation and registers
// its event handlers — without them it returns early and there is nothing to test.
const credentials = { config1: { password: "testpass" } };

/** What the "erro" handler sends on output 2 when the node closes. */
const DISCONNECTED = [null, { payload: "Disconnected" }, null];

function load(): Promise<{ streaming: any; config: any }> {
  return new Promise((resolve) => {
    helper.load([configNode, streamingClientNode] as any, flow as any, credentials, () => {
      resolve({ streaming: helper.getNode("streaming1"), config: helper.getNode("config1") });
    });
  });
}

/** A stand-in hub connection that records the handlers the node registers. */
function fakeConnection() {
  const handlers: Record<string, (data: unknown) => void> = {};
  return {
    handlers,
    send: vi.fn(),
    invoke: vi.fn(async (..._args: unknown[]): Promise<unknown> => undefined),
    stop: vi.fn(),
    on: (name: string, handler: (data: unknown) => void) => {
      handlers[name] = handler;
    },
  };
}

describe("charger-streaming-client lifecycle", () => {
  beforeEach(() => {
    // Both constructors schedule a connect/login 2s out. Fake timers keep those
    // from firing against an unloaded runtime after the test has finished.
    vi.useFakeTimers();
  });

  afterEach(() => {
    helper.unload();
  });

  it("clears its reconnect timer and reports Disconnected when closed before it ever connected", async () => {
    const { streaming } = await load();
    expect(streaming.connection).toBeUndefined();
    // A reconnect waiting to fire, as startconn() leaves one while there is no token.
    const reconnect = vi.fn();
    streaming.reconnectTimoutHandle = setTimeout(reconnect, 3000);
    const sent: unknown[] = [];
    streaming.send = (msg: unknown) => sent.push(msg);

    await streaming.close(false);

    // Both used to be skipped: `node.connection.stop()` threw first.
    expect(streaming.reconnectTimoutHandle).toBeNull();
    expect(sent).toContainEqual(DISCONNECTED);
    vi.advanceTimersByTime(3000);
    expect(reconnect).not.toHaveBeenCalled();
  }, 15000);

  it("stops the connection and reports Disconnected when removed from the flow", async () => {
    const { streaming } = await load();
    const connection = fakeConnection();
    streaming.connection = connection;
    const sent: unknown[] = [];
    streaming.send = (msg: unknown) => sent.push(msg);

    await streaming.close(true);

    expect(connection.stop).toHaveBeenCalledTimes(1);
    // Used to be skipped when removed=true: node.removeInputNode(node) threw first.
    expect(sent).toContainEqual(DISCONNECTED);
  }, 15000);

  it("reports a failed subscribe on the error output instead of throwing", async () => {
    const { streaming } = await load();
    const connection = fakeConnection();
    connection.invoke.mockImplementation(() => {
      throw new Error("hub unavailable");
    });
    streaming.connection = connection;
    const sent: unknown[] = [];
    streaming.send = (msg: unknown) => sent.push(msg);

    expect(() => streaming.emit("opened", { count: "", id: "conn-1" })).not.toThrow();
    await flushPromises();

    expect(sent).toContainEqual([
      null,
      { payload: "Failed to subscribe to charger updates: hub unavailable", _connectionId: "conn-1" },
      null,
    ]);
  }, 15000);

  it("reports a subscription the hub refuses, instead of looking connected and emitting nothing (GitHub #62)", async () => {
    const { streaming } = await load();
    const connection = fakeConnection();
    // What SignalR's invoke() does when the hub method throws: the promise rejects.
    connection.invoke.mockRejectedValue(
      new Error("An unexpected error occurred invoking 'SubscribeWithCurrentState' on the server."),
    );
    streaming.connection = connection;
    const sent: unknown[] = [];
    streaming.send = (msg: unknown) => sent.push(msg);

    streaming.emit("opened", { count: "", id: "conn-1" });
    await flushPromises();

    expect(sent).toContainEqual([
      null,
      {
        payload:
          "Failed to subscribe to charger updates: An unexpected error occurred invoking 'SubscribeWithCurrentState' on the server.",
        _connectionId: "conn-1",
      },
      null,
    ]);
    expect(connection.invoke).toHaveBeenCalledWith("SubscribeWithCurrentState", "EH000000", true);
  }, 15000);

  it("reports a refusal that is not an Error by its text", async () => {
    const { streaming } = await load();
    const connection = fakeConnection();
    connection.invoke.mockRejectedValue("refused");
    streaming.connection = connection;
    const sent: unknown[] = [];
    streaming.send = (msg: unknown) => sent.push(msg);

    streaming.emit("opened", { count: "", id: "conn-1" });
    await flushPromises();

    expect(sent).toContainEqual([
      null,
      { payload: "Failed to subscribe to charger updates: refused", _connectionId: "conn-1" },
      null,
    ]);
  }, 15000);

  it("registers the update handlers before subscribing, so the current state is not dropped", async () => {
    const { streaming, config } = await load();
    const connection = fakeConnection();
    config.parseObservation = (data: unknown) => data;
    // SubscribeWithCurrentState pushes the current state before its completion.
    connection.invoke.mockImplementation(() => {
      connection.handlers.ProductUpdate?.({ id: 109, value: "current-state" });
      return Promise.resolve();
    });
    streaming.connection = connection;
    const sent: unknown[] = [];
    streaming.send = (msg: unknown) => sent.push(msg);

    streaming.emit("opened", { count: "", id: "conn-1" });
    await flushPromises();

    expect(sent).toContainEqual([null, null, null, { payload: { id: 109, value: "current-state" } }, null, null]);
  }, 15000);

  it("still forwards raw ProductUpdate and ChargerUpdate data when parsing fails", async () => {
    const { streaming, config } = await load();
    const connection = fakeConnection();
    streaming.connection = connection;
    config.parseObservation = () => {
      throw new Error("unparseable");
    };
    const sent: unknown[] = [];
    streaming.send = (msg: unknown) => sent.push(msg);

    streaming.emit("opened", { count: "", id: "conn-1" });

    const product = { id: 999, value: "raw-product" };
    const charger = { id: 998, value: "raw-charger" };
    expect(() => connection.handlers.ProductUpdate(product)).not.toThrow();
    expect(() => connection.handlers.ChargerUpdate(charger)).not.toThrow();

    // Output 4 is ProductUpdate, output 5 is ChargerUpdate — positions are a
    // compatibility surface (see .agents/compatibility.md), so pinned literally.
    expect(sent).toContainEqual([null, null, null, { payload: { id: 999, value: "raw-product" } }, null, null]);
    expect(sent).toContainEqual([null, null, null, null, { payload: { id: 998, value: "raw-charger" } }, null]);
  }, 15000);

  // EASEE-35: SignalR's default Node client requires whichever tough-cookie npm
  // hoisted, and 2.x/3.x fail negotiation with "reading 'secure'". Both paths need
  // the package's own client: negotiation POSTs through it, and the WebSocket reads
  // its cookies from it.
  it.each([false, true])(
    "hands SignalR the package's own HTTP client (skipNegotiation=%s)",
    async (skipNegotiation) => {
      const { streaming, config } = await load();
      const withUrl = vi.spyOn(HubConnectionBuilder.prototype, "withUrl");
      config.accessToken = "token-1";
      config.signalRpath = "http://127.0.0.1:9/hubs/chargers";
      streaming.skipNegotiation = skipNegotiation;
      streaming.handleConnection = vi.fn();

      try {
        streaming.startconn();

        expect(withUrl).toHaveBeenCalledTimes(1);
        const options = withUrl.mock.calls[0][1] as { httpClient?: unknown; skipNegotiation?: boolean };
        expect(options.httpClient).toBeInstanceOf(EaseeSignalRHttpClient);
        expect(options.skipNegotiation).toBe(skipNegotiation ? true : undefined);
        expect(streaming.handleConnection).toHaveBeenCalledTimes(1);
      } finally {
        withUrl.mockRestore();
      }
    },
    15000,
  );

  // EASEE-27: identifies this package to Easee on the SignalR connection too,
  // not just the REST calls. HttpConnection merges `options.headers` on top of
  // its own default headers for both the negotiate request (through the
  // package's own httpClient) and the Node `ws` transport (see
  // node_modules/@microsoft/signalr/src/HttpConnection.ts's
  // `_getNegotiationResponse()`/`_constructTransport()` and
  // WebSocketTransport.ts's `connect()`), so a later key wins over SignalR's own
  // default User-Agent — this only has to prove the option reaches withUrl().
  it("passes a User-Agent header naming this package to withUrl()", async () => {
    const { streaming, config } = await load();
    const withUrl = vi.spyOn(HubConnectionBuilder.prototype, "withUrl");
    config.accessToken = "token-1";
    config.signalRpath = "http://127.0.0.1:9/hubs/chargers";
    streaming.handleConnection = vi.fn();

    try {
      streaming.startconn();

      expect(withUrl).toHaveBeenCalledTimes(1);
      const options = withUrl.mock.calls[0][1] as { headers?: Record<string, string> };
      expect(options.headers?.["User-Agent"]).toMatch(/^node-red-contrib-easee\/\S+ \(Node-RED\/\S+; Node\/\S+\)$/);
      expect(options.headers?.["User-Agent"]).not.toContain("test@example.com");
    } finally {
      withUrl.mockRestore();
    }
  }, 15000);
});

/** Let the node's async subscription settle; fake timers do not hold microtasks. */
async function flushPromises(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}
