/**
 * charger-streaming-client waiting for credentials that arrive at runtime
 * (EASEE-46), driven through the real configuration + streaming + REST nodes
 * via node-red-node-test-helper, with @microsoft/signalr's HubConnectionBuilder
 * stubbed at the module boundary (imitating streaming-client-signalr-connection.test.ts)
 * and `fetch` stubbed for the login (imitating
 * tests/integration/rest-client-update-credentials.test.ts).
 *
 * Before EASEE-34, a configuration node with no username/password was a hard
 * stop for every node using it. EASEE-34 taught the REST node's
 * `update_credentials` topic to accept them at runtime instead. The streaming
 * node did not follow: its constructor checked once, at deploy, and never
 * looked again — so credentials arriving later never started it. This file
 * pins that it now does, exactly once, and cleans up on close.
 *
 * Every credential and token below is synthetic.
 */

import helper from "node-red-node-test-helper";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initHelperWithResolvedRuntime } from "../helpers/node-red-runtime.js";
import { fetchMock } from "../mocks/nodeRedMocks.js";

initHelperWithResolvedRuntime(helper);

const LOGIN_URL = "https://api.easee.com/api/accounts/login";
const NEW_USER = "runtime-only-user@example.invalid";
const NEW_PASS = "synthetic-runtime-only-pass-7b1d";
const NEW_ACCESS = "synthetic-runtime-only-access-1";

const mockState = vi.hoisted(() => {
  return {
    /** What the next `new HubConnectionBuilder().build()` call returns. */
    nextConnection: null as unknown,
  };
});

vi.mock("@microsoft/signalr", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@microsoft/signalr")>();
  return {
    ...actual,
    // A plain function, not an arrow: the source calls `new HubConnectionBuilder()`,
    // and an arrow function cannot be used as a constructor.
    HubConnectionBuilder: vi.fn().mockImplementation(function HubConnectionBuilderMock() {
      const builder = {
        withUrl: vi.fn(() => builder),
        configureLogging: vi.fn(() => builder),
        build: vi.fn(() => mockState.nextConnection),
      };
      return builder;
    }),
  };
});

// Imported after the mock is registered, and only once @microsoft/signalr is stubbed.
const { HubConnectionBuilder } = await import("@microsoft/signalr");
const streamingClientNode = (await import("../../easee-client/charger-streaming-client.js")).default;
const configNode = (await import("../../easee-client/easee-configuration.js")).default;
const restClientNode = (await import("../../easee-client/easee-rest-client.js")).default;

/** A hub connection double whose lifecycle the streaming node actually drives. */
class FakeHubConnection {
  handlers: Record<string, (data: unknown) => void> = {};
  onCloseHandlers: Array<(err?: unknown) => void> = [];
  connectionId: string | null;
  start = vi.fn(async () => undefined);
  stop = vi.fn();
  invoke = vi.fn(async (..._args: unknown[]): Promise<unknown> => undefined);
  send = vi.fn();

  constructor(connectionId: string | null = "conn-rt") {
    this.connectionId = connectionId;
  }

  on(name: string, handler: (data: unknown) => void): void {
    this.handlers[name] = handler;
  }

  onclose(handler: (err?: unknown) => void): void {
    this.onCloseHandlers.push(handler);
  }
}

// No username, no password: the exact "config exists but has no credentials"
// shape EASEE-46 is about.
const flow = [
  { id: "config1", type: "easee-configuration", name: "Test Config" },
  {
    id: "streaming1",
    type: "charger-streaming-client",
    name: "Test Streaming",
    charger: "EH000000",
    configuration: "config1",
    wires: [[], [], [], [], [], []],
  },
  { id: "rest1", type: "easee-rest-client", name: "Test Rest", configuration: "config1", wires: [["out1"]] },
  { id: "out1", type: "helper" },
];

// No config1 key at all: node-red-node-test-helper then gives the node no
// credentials object, the same shape `password: null` produces in
// rest-client-update-credentials.test.ts.
const credentials = {};

type Answer = () => Promise<unknown>;

function json(body: unknown, status = 200): Answer {
  return () => globalThis.testHelpers.createFetchResponse(body, status);
}

/** Answer each login with the next answer in the queue; any other request is a test bug. */
function logins(...answers: Answer[]) {
  fetchMock().mockImplementation((url: string) => {
    const next = String(url) === LOGIN_URL ? answers.shift() : undefined;
    return next ? next() : Promise.reject(new Error(`unexpected fetch ${url}`));
  });
}

function load(): Promise<{ streaming: any; rest: any; out: any; config: any }> {
  return new Promise((resolve) => {
    helper.load([configNode, streamingClientNode, restClientNode] as any, flow as any, credentials as any, () => {
      const config: any = helper.getNode("config1");
      // Stop the periodic token-check cycle: with no stored credentials it
      // would only ever fail, but keep it out of the fetch call count these
      // tests assert on.
      clearTimeout(config.checkTokenHandler);
      config.checkTokenHandler = null;
      config.checkToken = vi.fn(() => Promise.resolve());
      resolve({
        streaming: helper.getNode("streaming1"),
        rest: helper.getNode("rest1"),
        out: helper.getNode("out1"),
        config,
      });
    });
  });
}

function nextOutput(out: any): Promise<any> {
  return new Promise((resolve) => out.once("input", resolve));
}

async function flushPromises(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe("charger-streaming-client starts after update_credentials (EASEE-46)", () => {
  beforeEach(() => {
    vi.useRealTimers();
    mockState.nextConnection = null;
  });

  afterEach(async () => {
    vi.useRealTimers();
    await helper.unload();
  });

  it("builds no connection at deploy, then builds and starts exactly one after a successful runtime login", async () => {
    const { streaming, rest, out, config } = await load();
    expect(HubConnectionBuilder).not.toHaveBeenCalled();
    expect(streaming.connection).toBeUndefined();

    config.signalRpath = "http://127.0.0.1:9/hubs/chargers";
    const connection = new FakeHubConnection("conn-rt");
    mockState.nextConnection = connection;
    logins(json({ accessToken: NEW_ACCESS, refreshToken: `${NEW_ACCESS}-refresh`, expiresIn: 3600 }));

    const received = nextOutput(out);
    rest.receive({ topic: "update_credentials", payload: { username: NEW_USER, password: NEW_PASS } });
    const msg = await received;
    expect(msg.status).toBe("ok");

    await flushPromises();

    expect(HubConnectionBuilder).toHaveBeenCalledTimes(1);
    expect(connection.start).toHaveBeenCalledTimes(1);
    expect(streaming.connection).toBe(connection);
  }, 15000);

  it("leaves the streaming node unconnected when the runtime login fails", async () => {
    const { streaming, rest, out, config } = await load();
    config.signalRpath = "http://127.0.0.1:9/hubs/chargers";
    mockState.nextConnection = new FakeHubConnection("conn-should-not-be-used");
    logins(json({ title: "Invalid credentials" }, 401));

    const received = nextOutput(out);
    rest.receive({ topic: "update_credentials", payload: { username: NEW_USER, password: NEW_PASS } });
    const msg = await received;
    expect(msg.status).toBe("error");

    await flushPromises();

    expect(HubConnectionBuilder).not.toHaveBeenCalled();
    expect(streaming.connection).toBeUndefined();
  }, 15000);

  it("does not open a second connection on a later successful update_credentials", async () => {
    const { streaming, rest, out, config } = await load();
    config.signalRpath = "http://127.0.0.1:9/hubs/chargers";
    const first = new FakeHubConnection("conn-first");
    mockState.nextConnection = first;
    logins(
      json({ accessToken: NEW_ACCESS, refreshToken: `${NEW_ACCESS}-refresh`, expiresIn: 3600 }),
      json({ accessToken: `${NEW_ACCESS}-2`, refreshToken: `${NEW_ACCESS}-2-refresh`, expiresIn: 3600 }),
    );

    let received = nextOutput(out);
    rest.receive({ topic: "update_credentials", payload: { username: NEW_USER, password: NEW_PASS } });
    await received;
    await flushPromises();
    expect(HubConnectionBuilder).toHaveBeenCalledTimes(1);
    expect(streaming.connection).toBe(first);

    // A second connection object, so a fresh build() would be distinguishable
    // from the first one still being reused.
    const second = new FakeHubConnection("conn-second");
    mockState.nextConnection = second;
    received = nextOutput(out);
    rest.receive({ topic: "update_credentials", payload: { password: `${NEW_PASS}-2` } });
    await received;
    await flushPromises();

    expect(HubConnectionBuilder).toHaveBeenCalledTimes(1);
    expect(streaming.connection).toBe(first);
  }, 15000);

  it("removes its update listener on close, so a later event does not start a connection", async () => {
    const { streaming, config } = await load();
    config.signalRpath = "http://127.0.0.1:9/hubs/chargers";
    mockState.nextConnection = new FakeHubConnection("conn-after-close");

    await streaming.close(false);

    // A login succeeding after the node closed (the config node outlives it,
    // shared by other nodes) must not start anything on the closed node.
    config.accessToken = "late-token";
    config.emit("update", { update: "Login successful, token retrieved" });
    await flushPromises();

    expect(HubConnectionBuilder).not.toHaveBeenCalled();
    expect(streaming.connection).toBeUndefined();
  }, 15000);

  it("behaves exactly as before when the configuration is valid at deploy: it connects without waiting for any event", async () => {
    const validFlow = [
      { id: "config1", type: "easee-configuration", name: "Test Config", username: "deploy-user@example.invalid" },
      {
        id: "streaming1",
        type: "charger-streaming-client",
        name: "Test Streaming",
        charger: "EH000000",
        configuration: "config1",
        wires: [[], [], [], [], [], []],
      },
    ];
    const validCredentials = { config1: { password: "synthetic-deploy-pass-4e2a" } };
    vi.useFakeTimers();

    const { streaming, config } = await new Promise<{ streaming: any; config: any }>((resolve) => {
      helper.load([configNode, streamingClientNode] as any, validFlow as any, validCredentials, () => {
        resolve({ streaming: helper.getNode("streaming1"), config: helper.getNode("config1") });
      });
    });
    // Stop the config node's own token-check cycle so advancing the timers
    // below only drives the streaming node's start timer, not a real fetch.
    clearTimeout(config.checkTokenHandler);
    config.checkTokenHandler = null;
    config.checkToken = vi.fn(() => Promise.resolve());
    config.accessToken = "token-at-deploy";
    config.signalRpath = "http://127.0.0.1:9/hubs/chargers";
    const connection = new FakeHubConnection("conn-deploy");
    mockState.nextConnection = connection;

    // The valid-at-deploy path starts on its own 2s timer (fullReconnect()),
    // not on an "update" event.
    await vi.advanceTimersByTimeAsync(2000);

    expect(HubConnectionBuilder).toHaveBeenCalledTimes(1);
    expect(streaming.connection).toBe(connection);
    vi.useRealTimers();
  }, 15000);
});
