/**
 * The REST client's `update_credentials` topic (EASEE-34), driven through the
 * real easee-rest-client + easee-configuration nodes via
 * node-red-node-test-helper, with fetch stubbed.
 *
 * A flow can hand the configuration node a new username and/or password; the
 * configuration node logs in with them and keeps them — in memory only — when
 * Easee accepts them, and keeps the previous ones when it does not.
 *
 * Every credential and token below is synthetic.
 */

import helper from "node-red-node-test-helper";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import configNode from "../../easee-client/easee-configuration.js";
import restClientNode from "../../easee-client/easee-rest-client.js";
import { initHelperWithResolvedRuntime } from "../helpers/node-red-runtime.js";
import { fetchMock } from "../mocks/nodeRedMocks.js";

initHelperWithResolvedRuntime(helper);

const LOGIN_URL = "https://api.easee.com/api/accounts/login";

const OLD_USER = "stored-user@example.invalid";
const OLD_PASS = "synthetic-stored-pass-2c81";
const NEW_USER = "runtime-user@example.invalid";
const NEW_PASS = "synthetic-runtime-pass-9f3e";
const OLD_ACCESS = "synthetic-old-access-u1";
const NEW_ACCESS = "synthetic-new-access-u2";

const tokens = (accessToken: string) => ({
  accessToken,
  refreshToken: `${accessToken}-refresh`,
  expiresIn: 3600,
  tokenType: "Bearer",
});

function flow(extra: Record<string, unknown> = {}) {
  return [
    { id: "config1", type: "easee-configuration", name: "Test Config", username: OLD_USER, ...extra },
    { id: "rest1", type: "easee-rest-client", name: "Test Rest", configuration: "config1", wires: [["out1"]] },
    { id: "out1", type: "helper" },
  ];
}

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

/** The parsed body of every login request, in order. */
function loginBodies(): Array<{ userName: string; password: string }> {
  return fetchMock()
    .mock.calls.filter((call) => String(call[0]) === LOGIN_URL)
    .map((call) => JSON.parse(call[1].body));
}

/**
 * Load the nodes, holding tokens for the stored credentials. checkToken() is
 * stubbed: the start timer (and the restart updateCredentials() schedules)
 * would otherwise log in on its own and hide which login the topic caused.
 */
function load(
  options: { password?: string | null; config?: Record<string, unknown> } = {},
): Promise<{ rest: any; out: any; config: any }> {
  const password = options.password === undefined ? OLD_PASS : options.password;
  const credentials = password === null ? {} : { config1: { password } };
  return new Promise((resolve) => {
    helper.load([configNode, restClientNode] as any, flow(options.config) as any, credentials as any, () => {
      const config: any = helper.getNode("config1");
      clearTimeout(config.checkTokenHandler);
      config.checkTokenHandler = null;
      config.checkToken = vi.fn(() => Promise.resolve());
      if (password !== null) {
        config.accessToken = OLD_ACCESS;
        config.refreshToken = `${OLD_ACCESS}-refresh`;
        config.tokenExpires = new Date(Date.now() + 3600 * 1000);
      }
      resolve({ rest: helper.getNode("rest1"), out: helper.getNode("out1"), config });
    });
  });
}

function nextOutput(out: any): Promise<any> {
  return new Promise((resolve) => out.once("input", resolve));
}

describe("easee-rest-client update_credentials topic (EASEE-34)", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await helper.unload();
  });

  it("logs in once with the new credentials, then uses them for a later re-login", async () => {
    const { rest, out, config } = await load();
    logins(json(tokens(NEW_ACCESS)), json(tokens(`${NEW_ACCESS}-again`)));

    const received = nextOutput(out);
    rest.receive({ topic: "update_credentials", payload: { username: NEW_USER, password: NEW_PASS } });
    const msg = await received;

    expect(loginBodies()).toEqual([{ userName: NEW_USER, password: NEW_PASS }]);
    expect(msg.status).toBe("ok");
    expect(msg.topic).toBe("update_credentials");
    expect(msg.payload).toEqual({
      success: true,
      message: "Credentials updated and logged in",
      changed: { username: true, password: true },
    });
    expect(config.accessToken).toBe(NEW_ACCESS);

    // A later re-login (and so every later token-check login) uses them.
    await expect(config.relogin()).resolves.toEqual({ ok: true, status: 200 });
    expect(loginBodies()[1]).toEqual({ userName: NEW_USER, password: NEW_PASS });

    // In memory only: Node-RED's credential store, which the next deploy
    // writes to flows_cred.json, still holds the password saved in the editor.
    expect((helper as any)._RED.nodes.getCredentials("config1")).toEqual({ password: OLD_PASS });
  });

  it("keeps the stored username when only a password is sent", async () => {
    const { rest, out, config } = await load();
    logins(json(tokens(NEW_ACCESS)));

    const received = nextOutput(out);
    rest.receive({ topic: "update_credentials", payload: { password: NEW_PASS } });
    const msg = await received;

    expect(loginBodies()).toEqual([{ userName: OLD_USER, password: NEW_PASS }]);
    expect(msg.payload.changed).toEqual({ username: false, password: true });
    expect(config.username).toBe(OLD_USER);
  });

  it.each([
    ["no payload", undefined],
    ["a string payload", "not-an-object"],
    ["neither field", {}],
    ["an empty password", { password: "" }],
  ])("refuses %s, with no login and nothing changed", async (_label, payload) => {
    const { rest, out, config } = await load();
    logins();
    const error = vi.spyOn(rest, "error");

    const received = nextOutput(out);
    rest.receive({ topic: "update_credentials", payload });
    const msg = await received;

    expect(msg.status).toBe("error");
    expect(msg.topic).toBe("update_credentials");
    expect(error).toHaveBeenCalledTimes(1);
    expect(fetchMock()).not.toHaveBeenCalled();
    expect(config.username).toBe(OLD_USER);
    expect(config.credentials.password).toBe(OLD_PASS);
  });

  it("changes nothing on an unrelated topic that carries credentials", async () => {
    const { rest, out, config } = await load();
    logins();

    const received = nextOutput(out);
    // The spelling from the original request is not an alias.
    rest.receive({ topic: "change_credentals", payload: { username: NEW_USER, password: NEW_PASS } });
    const msg = await received;

    expect(msg.status).toBe("error");
    expect(fetchMock()).not.toHaveBeenCalled();
    expect(config.username).toBe(OLD_USER);
    expect(config.credentials.password).toBe(OLD_PASS);
  });

  it("keeps the previous credentials and tokens when Easee rejects the new ones, and reports it with the msg", async () => {
    const { rest, out, config } = await load();
    logins(json({ title: "Invalid credentials" }, 401), json(tokens(`${OLD_ACCESS}-again`)));
    const error = vi.spyOn(rest, "error");

    const received = nextOutput(out);
    const input = { _msgid: "m-34", topic: "update_credentials", payload: { username: NEW_USER, password: NEW_PASS } };
    rest.receive(input);
    const msg = await received;

    expect(loginBodies()).toEqual([{ userName: NEW_USER, password: NEW_PASS }]);
    expect(msg.status).toBe("error");
    expect(msg.error).toContain("Login failed (401)");
    // Reported through reportError() with the msg (so a Catch node sees it),
    // minus the credentials.
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toContain("previous ones are still in use");
    expect(error.mock.calls[0][1]).toMatchObject({ _msgid: "m-34", topic: "update_credentials" });
    expect((error.mock.calls[0][1] as any).payload).toEqual({});
    // A copy: the caller's own msg is left as it was.
    expect(input.payload).toEqual({ username: NEW_USER, password: NEW_PASS });

    // Rolled back: the old credentials and tokens are still the ones in use.
    expect(config.username).toBe(OLD_USER);
    expect(config.credentials.password).toBe(OLD_PASS);
    expect(config.accessToken).toBe(OLD_ACCESS);
    await expect(config.relogin()).resolves.toEqual({ ok: true, status: 200 });
    expect(loginBodies()[1]).toEqual({ userName: OLD_USER, password: OLD_PASS });
  });

  it("lets a REST node whose configuration has no password be given one at runtime", async () => {
    const { rest, out, config } = await load({ password: null });
    logins(json(tokens(NEW_ACCESS)));
    const error = vi.spyOn(rest, "error");

    // Every other topic is refused until credentials arrive, with the msg.
    rest.receive({ _msgid: "m-early", topic: "charger", charger: "EH000000" });
    await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1));
    expect(error.mock.calls[0][0]).toContain("no username or password");
    expect(error.mock.calls[0][1]).toMatchObject({ _msgid: "m-early" });
    expect(fetchMock()).not.toHaveBeenCalled();

    const received = nextOutput(out);
    rest.receive({ topic: "update_credentials", payload: { password: NEW_PASS } });
    const msg = await received;

    expect(msg.status).toBe("ok");
    expect(loginBodies()).toEqual([{ userName: OLD_USER, password: NEW_PASS }]);
    expect(config.isConfigurationValid()).toBe(true);
  });

  it("never puts the new username or password in a log, status, error or output message", async () => {
    // Every log sink live: debug logging on, and copied to node.warn().
    const { rest, out, config } = await load({ config: { debugLogging: true, debugToNodeWarn: true } });
    const sinks = [config, rest].flatMap((node) =>
      ["log", "debug", "warn", "error", "trace", "status"].map((method) => vi.spyOn(node, method)),
    );
    const outputs: unknown[] = [];
    out.on("input", (m: unknown) => outputs.push(m));

    // A success, then a failure from an API that echoes what it was sent.
    logins(
      json(tokens(NEW_ACCESS)),
      json({ title: "Invalid credentials", detail: `rejected ${NEW_USER} / ${NEW_PASS}-x (${NEW_PASS})` }, 401),
    );
    rest.receive({ topic: "update_credentials", payload: { username: NEW_USER, password: NEW_PASS } });
    await vi.waitFor(() => expect(outputs).toHaveLength(1));
    rest.receive({ topic: "update_credentials", payload: { username: `${NEW_USER}.x`, password: `${NEW_PASS}-x` } });
    await vi.waitFor(() => expect(outputs).toHaveLength(2));

    expect((outputs[0] as any).status).toBe("ok");
    expect((outputs[1] as any).status).toBe("error");
    // The sinks were really exercised, so their silence below means something.
    expect(sinks.reduce((n, spy) => n + spy.mock.calls.length, 0)).toBeGreaterThan(5);

    const seen = JSON.stringify([...sinks.flatMap((spy) => spy.mock.calls), outputs]);
    for (const secret of [NEW_USER, NEW_PASS, OLD_USER, OLD_PASS]) {
      expect(seen).not.toContain(secret);
    }
  });

  it("refuses a password with no username anywhere, without logging in", async () => {
    const { rest, out, config } = await load({ config: { username: "" } });
    logins();

    const received = nextOutput(out);
    rest.receive({ topic: "update_credentials", payload: { password: NEW_PASS } });
    const msg = await received;

    expect(msg.status).toBe("error");
    expect(msg.error).toContain("No username to log in with");
    expect(fetchMock()).not.toHaveBeenCalled();
    expect(config.credentials.password).toBe(OLD_PASS);
  });

  it("keeps the previous credentials when Easee cannot be reached, and says so", async () => {
    const { rest, out, config } = await load();
    fetchMock().mockImplementation(() => Promise.reject(new Error("synthetic connection refused")));

    const received = nextOutput(out);
    rest.receive({ topic: "update_credentials", payload: { username: NEW_USER, password: NEW_PASS } });
    const msg = await received;

    expect(msg.status).toBe("error");
    expect(msg.error).toBe("synthetic connection refused");
    expect(config.username).toBe(OLD_USER);
    expect(config.credentials.password).toBe(OLD_PASS);
    expect(config.accessToken).toBe(OLD_ACCESS);
  });
});

describe("easee-configuration updateCredentials() (EASEE-34)", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    await helper.unload();
  });

  it("waits for a login already in progress, then logs in with the new credentials", async () => {
    const { config } = await load();
    logins(json(tokens(NEW_ACCESS)));
    config.authenticationInProgress = true;

    const updating = config.updateCredentials({ password: NEW_PASS });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(fetchMock()).not.toHaveBeenCalled();
    config.authenticationInProgress = false;

    await expect(updating).resolves.toEqual({ username: false, password: true });
    expect(loginBodies()).toEqual([{ userName: OLD_USER, password: NEW_PASS }]);
  });

  it("gives up after 30 seconds of someone else's login, changing nothing", async () => {
    const { config } = await load();
    logins();
    config.authenticationInProgress = true;
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => {
      now += 20_000;
      return now;
    });

    await expect(config.updateCredentials({ password: NEW_PASS })).rejects.toThrow(
      "Another login is still in progress",
    );
    expect(fetchMock()).not.toHaveBeenCalled();
    expect(config.credentials.password).toBe(OLD_PASS);
  });

  it("does not restart the token-check timer when the node closed during the login", async () => {
    const { config } = await load();
    let answer!: () => void;
    fetchMock().mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = () => resolve(globalThis.testHelpers.createFetchResponse(tokens(NEW_ACCESS)));
        }),
    );

    const updating = config.updateCredentials({ password: NEW_PASS });
    await vi.waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(1));
    await config.close(false);
    answer();

    await expect(updating).resolves.toEqual({ username: false, password: true });
    expect(config.checkTokenHandler).toBeNull();
  });
});
