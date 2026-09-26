/**
 * Drives charger-streaming-client's actual SignalR connection lifecycle —
 * startconn() -> handleConnection() -> reconnect() -- with @microsoft/signalr's
 * HubConnectionBuilder stubbed at the module boundary (EASEE-45).
 *
 * streaming-client-lifecycle.test.ts already covers the hub event handlers and
 * the subscribe-failure paths, but it does so by setting `streaming.connection`
 * directly and emitting "opened" by hand — handleConnection() itself (the
 * connection.start() call, the onclose registration, the catch branch) and
 * reconnect() were never actually invoked by anything. Neither was the
 * CommandResponse handler (output 6) or the "closed" event's two status
 * branches. This file drives all of those through the real functions.
 */

import { createRequire } from "node:module";
import { LogLevel } from "@microsoft/signalr";
import helper from "node-red-node-test-helper";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import configNode from "../../easee-client/easee-configuration.js";

const require = createRequire(import.meta.url);

helper.init(require.resolve("node-red"));

const mockState = vi.hoisted(() => {
  return {
    /** What the next `new HubConnectionBuilder().build()` call returns. */
    nextConnection: null as unknown,
    /** When set, the next `build()` call throws this instead. */
    nextBuildError: null as Error | null,
    /** The options object the most recent `withUrl()` call was given. */
    lastWithUrlOptions: null as { accessTokenFactory?: () => string } | null,
    /** What the most recent `configureLogging()` call was given (EASEE-29). */
    lastLogging: null as unknown,
  };
});

vi.mock("@microsoft/signalr", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@microsoft/signalr")>();
  return {
    ...actual,
    // A plain function, not an arrow: the source calls `new HubConnectionBuilder()`,
    // and an arrow function cannot be used as a constructor.
    HubConnectionBuilder: vi.fn().mockImplementation(function HubConnectionBuilderMock() {
      // Named via a local `builder` (not `this`/mockReturnThis): a plain
      // function's implicit `this` here is the discarded `new` target, not
      // the object literal actually returned below.
      const builder = {
        withUrl: vi.fn((_url: string, options: { accessTokenFactory?: () => string }) => {
          mockState.lastWithUrlOptions = options;
          return builder;
        }),
        configureLogging: vi.fn((logging: unknown) => {
          mockState.lastLogging = logging;
          return builder;
        }),
        build: vi.fn(() => {
          if (mockState.nextBuildError) {
            const err = mockState.nextBuildError;
            mockState.nextBuildError = null;
            throw err;
          }
          return mockState.nextConnection;
        }),
      };
      return builder;
    }),
  };
});

// Imported after the mock is registered (vi.mock is hoisted above this anyway,
// but the real node must only be loaded once @microsoft/signalr is stubbed).
const streamingClientNode = (await import("../../easee-client/charger-streaming-client.js")).default;

/** A hub connection double whose lifecycle the streaming node actually drives. */
class FakeHubConnection {
  handlers: Record<string, (data: unknown) => void> = {};
  onCloseHandlers: Array<(err?: unknown) => void> = [];
  connectionId: string | null;
  start: ReturnType<typeof vi.fn>;
  stop = vi.fn();
  invoke = vi.fn(async (..._args: unknown[]): Promise<unknown> => undefined);
  send = vi.fn();

  constructor(connectionId: string | null = "conn-1", startImpl?: () => Promise<void>) {
    this.connectionId = connectionId;
    this.start = vi.fn(startImpl ?? (async () => undefined));
  }

  on(name: string, handler: (data: unknown) => void): void {
    this.handlers[name] = handler;
  }

  onclose(handler: (err?: unknown) => void): void {
    this.onCloseHandlers.push(handler);
  }
}

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

const credentials = { config1: { password: "testpass" } };

function load(): Promise<{ streaming: any; config: any }> {
  return new Promise((resolve) => {
    helper.load([configNode, streamingClientNode] as any, flow as any, credentials, () => {
      resolve({ streaming: helper.getNode("streaming1"), config: helper.getNode("config1") });
    });
  });
}

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe("charger-streaming-client SignalR connection lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockState.nextConnection = null;
    mockState.nextBuildError = null;
    mockState.lastLogging = null;
  });

  afterEach(() => {
    helper.unload();
  });

  it("has 6 outputs (a compatibility surface — do not reduce it)", async () => {
    const { streaming } = await load();
    expect(streaming.wires.length).toBe(6);
  });

  it("connects through the real startconn()/handleConnection() flow, subscribes, and routes ProductUpdate/ChargerUpdate/CommandResponse to outputs 4/5/6", async () => {
    const { streaming, config } = await load();
    config.accessToken = "token-1";
    config.signalRpath = "http://127.0.0.1:9/hubs/chargers";
    config.parseObservation = (data: unknown) => data;
    const sent: unknown[] = [];
    streaming.send = (msg: unknown) => sent.push(msg);

    const connection = new FakeHubConnection("conn-1");
    mockState.nextConnection = connection;

    streaming.startconn();
    await flushPromises();

    expect(connection.start).toHaveBeenCalledTimes(1);
    expect(streaming.connection).toBe(connection);
    expect(sent).toContainEqual([{ _connectionId: "conn-1", payload: "Connected" }, null, null]);
    expect(connection.invoke).toHaveBeenCalledWith("SubscribeWithCurrentState", "EH000000", true);

    connection.handlers.ProductUpdate?.({ id: 1, value: "p" });
    connection.handlers.ChargerUpdate?.({ id: 2, value: "c" });
    connection.handlers.CommandResponse?.({ result: "ok" });

    // Output 4 (ProductUpdate) and 5 (ChargerUpdate) are pinned elsewhere too;
    // output 6 (CommandResponse) had no test driving it through a real connect.
    expect(sent).toContainEqual([null, null, null, { payload: { id: 1, value: "p" } }, null, null]);
    expect(sent).toContainEqual([null, null, null, null, { payload: { id: 2, value: "c" } }, null]);
    expect(sent).toContainEqual([null, null, null, null, null, { payload: { result: "ok" } }]);
  }, 15000);

  it("reports a hub-initiated close on output 3 and reconnects", async () => {
    const { streaming, config } = await load();
    config.accessToken = "token-1";
    config.signalRpath = "http://127.0.0.1:9/hubs/chargers";
    config.ensureAuthentication = vi.fn().mockResolvedValue(true);
    const sent: unknown[] = [];
    streaming.send = (msg: unknown) => sent.push(msg);

    const connection = new FakeHubConnection("conn-2");
    mockState.nextConnection = connection;
    streaming.startconn();
    await flushPromises();

    expect(connection.onCloseHandlers.length).toBe(1);
    connection.onCloseHandlers[0](new Error("transport closed"));
    await flushPromises();

    expect(sent).toContainEqual([null, null, { _connectionId: "conn-2", payload: "Disconnected" }]);
    expect(sent).toContainEqual([null, { payload: expect.any(Error), _connectionId: "conn-2" }, null]);

    // reconnect() should have scheduled a fresh startconn() after reconnectInterval.
    const nextConnection = new FakeHubConnection("conn-3");
    mockState.nextConnection = nextConnection;
    await vi.advanceTimersByTimeAsync(streaming.reconnectInterval);

    expect(nextConnection.start).toHaveBeenCalledTimes(1);
  }, 15000);

  it("passes an accessTokenFactory that reads the configuration node's current token", async () => {
    const { streaming, config } = await load();
    config.accessToken = "token-abc";
    config.signalRpath = "http://127.0.0.1:9/hubs/chargers";
    mockState.nextConnection = new FakeHubConnection("conn-token");

    streaming.startconn();

    expect(mockState.lastWithUrlOptions?.accessTokenFactory).toBeTypeOf("function");
    expect(mockState.lastWithUrlOptions?.accessTokenFactory?.()).toBe("token-abc");

    // SignalR calls this again on every (re)negotiation, so it must read the
    // token live rather than the value captured when startconn() ran.
    config.accessToken = "token-def";
    expect(mockState.lastWithUrlOptions?.accessTokenFactory?.()).toBe("token-def");
  }, 15000);

  it("retries when connection.start() rejects, instead of leaving the node looking connected", async () => {
    const { streaming, config } = await load();
    config.accessToken = "token-1";
    config.signalRpath = "http://127.0.0.1:9/hubs/chargers";
    config.ensureAuthentication = vi.fn().mockResolvedValue(true);
    const sent: unknown[] = [];
    streaming.send = (msg: unknown) => sent.push(msg);

    const failing = new FakeHubConnection("conn-x", () => Promise.reject(new Error("negotiation failed")));
    mockState.nextConnection = failing;
    streaming.startconn();
    await flushPromises();

    // id stays "" (falsy) in handleConnection's catch, since connection.start()
    // never resolved to set it — so no _connectionId reaches the error output.
    expect(sent).toContainEqual([null, { payload: expect.any(Error) }, null]);

    const nextConnection = new FakeHubConnection("conn-y");
    mockState.nextConnection = nextConnection;
    await vi.advanceTimersByTimeAsync(streaming.reconnectInterval);

    expect(nextConnection.start).toHaveBeenCalledTimes(1);
  }, 15000);

  it("surfaces a HubConnectionBuilder that fails to build, without attempting to connect", async () => {
    const { streaming, config } = await load();
    config.accessToken = "token-1";
    config.signalRpath = "http://127.0.0.1:9/hubs/chargers";
    mockState.nextBuildError = new Error("bad url");
    const sent: unknown[] = [];
    streaming.send = (msg: unknown) => sent.push(msg);
    const statuses: unknown[] = [];
    streaming.status = (s: unknown) => statuses.push(s);

    streaming.startconn();

    expect(sent).toContainEqual([null, { payload: "[easee] Error creating SignalR connection: bad url" }, null]);
    expect(statuses).toContainEqual({ fill: "red", shape: "ring", text: "SignalR connection error" });
    expect(streaming.connection).toBeUndefined();
  }, 15000);

  it("stops without connecting when there is no charger configured", async () => {
    const { streaming, config } = await load();
    streaming.charger = undefined;
    config.accessToken = "token-1";
    const sent: unknown[] = [];
    streaming.send = (msg: unknown) => sent.push(msg);

    streaming.startconn();

    expect(sent).toContainEqual([null, { payload: "No charger, exiting" }, null]);
    expect(streaming.connection).toBeUndefined();
  }, 15000);

  it("waits and schedules a retry when there is no access token yet", async () => {
    const { streaming, config } = await load();
    config.accessToken = false;
    const sent: unknown[] = [];
    streaming.send = (msg: unknown) => sent.push(msg);

    streaming.startconn();

    expect(sent).toContainEqual([null, { payload: "No accessToken, waiting" }, null]);
    expect(streaming.reconnectTimoutHandle).not.toBeNull();
    expect(streaming.connection).toBeUndefined();
  }, 15000);

  it("reports connected status when a hub-driven closed event's count is greater than zero", async () => {
    const { streaming } = await load();
    const statuses: unknown[] = [];
    streaming.status = (s: unknown) => statuses.push(s);
    const sent: unknown[] = [];
    streaming.send = (msg: unknown) => sent.push(msg);

    streaming.emit("closed", { count: "5", id: "conn-9" });

    expect(statuses).toContainEqual(expect.objectContaining({ fill: "green", shape: "dot", event: "disconnect" }));
    expect(sent).toContainEqual([null, null, { _connectionId: "conn-9", payload: "Disconnected" }]);
  }, 15000);

  it("reports disconnected status when a hub-driven closed event's count is not greater than zero", async () => {
    const { streaming } = await load();
    const statuses: unknown[] = [];
    streaming.status = (s: unknown) => statuses.push(s);
    const sent: unknown[] = [];
    streaming.send = (msg: unknown) => sent.push(msg);

    streaming.emit("closed", { count: "", id: "conn-10" });

    expect(statuses).toContainEqual(expect.objectContaining({ fill: "red", shape: "ring", event: "disconnect" }));
    expect(sent).toContainEqual([null, null, { _connectionId: "conn-10", payload: "Disconnected" }]);
  }, 15000);
});

/**
 * What startconn() hands HubConnectionBuilder.configureLogging() (EASEE-29).
 * It used to be LogLevel.Debug unconditionally; now it is an ILogger adapter
 * whose minimum is Debug only with the configuration node's debugLogging on,
 * else Warning, forwarding onto the configuration node's logging helpers.
 *
 * The flag-off case asserts on Information, not Debug, on purpose: a Debug line
 * would be dropped by logDebug's own debugLogging gate even if the adapter let
 * it through, so only a level the adapter alone filters can tell the two apart.
 */
describe("charger-streaming-client SignalR log level", () => {
  interface Adapter {
    minimumLevel: LogLevel;
    log(level: LogLevel, message: string): void;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    mockState.nextConnection = null;
    mockState.nextBuildError = null;
    mockState.lastLogging = null;
  });

  afterEach(() => {
    helper.unload();
  });

  async function connectWith(debugLogging: boolean): Promise<{ adapter: Adapter; config: any }> {
    const { streaming, config } = await load();
    config.debugLogging = debugLogging;
    config.accessToken = "token-1";
    config.signalRpath = "http://127.0.0.1:9/hubs/chargers";
    mockState.nextConnection = new FakeHubConnection("conn-log");
    streaming.startconn();
    return { adapter: mockState.lastLogging as Adapter, config };
  }

  it("with debugLogging off: a Warning-minimum adapter that drops SignalR's info and debug output", async () => {
    const { adapter, config } = await connectWith(false);
    const logSpy = vi.spyOn(config, "log");
    const debugSpy = vi.spyOn(config, "debug");
    const warnSpy = vi.spyOn(config, "warn");
    const errorSpy = vi.spyOn(config, "error");

    expect(adapter.minimumLevel).toBe(LogLevel.Warning);

    adapter.log(LogLevel.Information, "WebSocket connected.");
    adapter.log(LogLevel.Debug, "Starting connection.");
    expect(logSpy).not.toHaveBeenCalled();
    expect(debugSpy).not.toHaveBeenCalled();

    adapter.log(LogLevel.Warning, "retrying");
    adapter.log(LogLevel.Error, "connection lost");
    expect(warnSpy).toHaveBeenCalledWith("[easee] WARN: SignalR: retrying");
    expect(errorSpy).toHaveBeenCalledWith("[easee] ERROR: SignalR: connection lost");
  }, 15000);

  it("with debugLogging on: a Debug-minimum adapter that forwards to node.debug()/node.log(), never Trace", async () => {
    const { adapter, config } = await connectWith(true);
    const logSpy = vi.spyOn(config, "log");
    const debugSpy = vi.spyOn(config, "debug");

    expect(adapter.minimumLevel).toBe(LogLevel.Debug);

    adapter.log(LogLevel.Debug, "Starting connection.");
    adapter.log(LogLevel.Information, "WebSocket connected.");
    adapter.log(LogLevel.Trace, "(WebSockets transport) sending data.");
    adapter.log(LogLevel.None, "never");

    expect(debugSpy).toHaveBeenCalledWith("[easee] DEBUG: SignalR: Starting connection.");
    expect(logSpy).toHaveBeenCalledWith("[easee] SignalR: WebSocket connected.");
    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledTimes(1);
  }, 15000);

  it("redacts an access_token query value from anything SignalR logs", async () => {
    const { adapter, config } = await connectWith(true);
    const logSpy = vi.spyOn(config, "log");

    adapter.log(
      LogLevel.Information,
      "WebSocket connected to wss://127.0.0.1:9/hubs?id=1&access_token=synthetic-token-9.",
    );

    expect(logSpy).toHaveBeenCalledWith(
      "[easee] SignalR: WebSocket connected to wss://127.0.0.1:9/hubs?id=1&access_token=[redacted]",
    );
  }, 15000);
});
