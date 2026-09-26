/**
 * `easee-rest-client` driven through a real Node-RED runtime via
 * node-red-node-test-helper (the same pattern as configuration-auth.test.ts
 * and charger-state-observations.test.ts), with a real `easee-configuration`
 * node holding synthetic, pre-authenticated tokens and `fetch` stubbed.
 *
 * Covers the predefined topics, the custom-path/method path, and the error
 * paths (non-2xx surfacing the API's JSON message, a network error, an
 * unrecognised topic/method, and a missing or unconfigured configuration
 * node) that charger-state-observations.test.ts and rest-call-errors.test.ts
 * do not reach — those two already cover the `charger_state` topic and
 * `doAuthRestCall`'s own error formatting in isolation.
 *
 * Every credential and token below is synthetic.
 */

import helper from "node-red-node-test-helper";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import easeeConfiguration from "../../easee-client/easee-configuration.js";
import easeeRestClient from "../../easee-client/easee-rest-client.js";
import { initHelperWithResolvedRuntime } from "../helpers/node-red-runtime.js";
import { fetchMock } from "../mocks/nodeRedMocks.js";

initHelperWithResolvedRuntime(helper);

const USERNAME = "user@example.invalid";
const PASSWORD = "synthetic-pass-r3c1";
const ACCESS_TOKEN = "synthetic-access-r1";
const CHARGER = "EH000001";
const SITE = "1234";
const CIRCUIT = "1";
const API_BASE = "https://api.easee.com/api";

const flow = [
  { id: "cfg", type: "easee-configuration", name: "rest client test", username: USERNAME },
  {
    id: "rest1",
    type: "easee-rest-client",
    name: "rest under test",
    charger: CHARGER,
    configuration: "cfg",
    wires: [["out1"]],
  },
  { id: "out1", type: "helper" },
];

type Answer = () => Promise<unknown>;

function json(body: unknown, status = 200): Answer {
  return () => globalThis.testHelpers.createFetchResponse(body, status);
}

function rejects(message: string): Answer {
  return () => Promise.reject(new Error(message));
}

/** Load the config + rest-client + helper-output flow, pre-authenticated so ensureAuthentication() short-circuits. */
function load(): Promise<{ rest: any; out: any; config: any }> {
  return new Promise((resolve) => {
    helper.load(
      [easeeConfiguration, easeeRestClient] as any,
      flow as any,
      { cfg: { password: PASSWORD } } as any,
      () => {
        const config: any = helper.getNode("cfg");
        // Drop the start timer: nothing here drives the token-check cycle.
        clearTimeout(config.checkTokenHandler);
        config.checkTokenHandler = null;
        config.accessToken = ACCESS_TOKEN;
        config.tokenExpires = new Date(Date.now() + 3600 * 1000);
        resolve({ rest: helper.getNode("rest1"), out: helper.getNode("out1"), config });
      },
    );
  });
}

/** Resolve with the next message the output helper node receives. */
function received(out: any): Promise<any> {
  return new Promise((resolve) => out.once("input", resolve));
}

/** The fetch call's (url, init) pair, typed loosely like the rest of this suite. */
function lastCall(): [string, Record<string, any>] {
  const call = fetchMock().mock.calls.at(-1) as [string, Record<string, any>];
  return call;
}

describe("easee-rest-client, through the real node", () => {
  beforeEach(() => {
    // The node's REQUEST() awaits a real 50ms status delay; the doAuthRestCall
    // absolute-URL tests and charger-state-observations.test.ts use real timers
    // for the same reason.
    vi.useRealTimers();
  });

  afterEach(async () => {
    await helper.unload();
    vi.useRealTimers();
  });

  describe("predefined GET topics", () => {
    const GET_TOPICS: Array<[string, string]> = [
      ["charger", `/chargers/${CHARGER}?alwaysGetChargerAccessLevel=true`],
      ["charger_details", `/chargers/${CHARGER}/details`],
      ["charger_site", `/chargers/${CHARGER}/site`],
      ["charger_config", `/chargers/${CHARGER}/config`],
      ["charger_session_latest", `/chargers/${CHARGER}/sessions/latest`],
      ["charger_session_ongoing", `/chargers/${CHARGER}/sessions/ongoing`],
    ];

    it.each(GET_TOPICS)("topic %s issues a GET to %s and emits the response", async (topic, path) => {
      const { rest, out } = await load();
      const responseBody = { some: "payload", topic };
      fetchMock().mockImplementation(json(responseBody));
      const promise = received(out);

      rest.receive({ topic });
      const msg = await promise;

      expect(fetchMock()).toHaveBeenCalledTimes(1);
      const [url, init] = lastCall();
      expect(url).toBe(`${API_BASE}${path}`);
      expect(init.method).toBe("GET");
      expect(init.headers.Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
      expect(init.headers["User-Agent"]).toContain("node-red-contrib-easee/");
      expect(init.headers.Accept).toBe("application/json");
      expect(msg.status).toBe("ok");
      expect(msg.topic).toBe(path);
      expect(msg.payload).toEqual(responseBody);
    });
  });

  describe("predefined POST command topics", () => {
    const COMMAND_TOPICS = [
      "start_charging",
      "stop_charging",
      "pause_charging",
      "resume_charging",
      "toggle_charging",
      "reboot",
    ];

    it.each(COMMAND_TOPICS)("topic %s POSTs to the commands endpoint with an empty body", async (topic) => {
      const { rest, out } = await load();
      fetchMock().mockImplementation(json({ result: "ok" }));
      const promise = received(out);

      rest.receive({ topic });
      const msg = await promise;

      const [url, init] = lastCall();
      expect(url).toBe(`${API_BASE}/chargers/${CHARGER}/commands/${topic}`);
      expect(init.method).toBe("POST");
      // node.POST()'s default body is `{}`, not undefined - it is still JSON-stringified.
      expect(init.body).toBe("{}");
      expect(msg.status).toBe("ok");
    });
  });

  describe("topic login", () => {
    it("authenticates and emits the verified-login payload", async () => {
      const { rest, out, config } = await load();
      config.ensureAuthentication = vi.fn().mockResolvedValue(true);
      const promise = received(out);

      rest.receive({ topic: "login" });
      const msg = await promise;

      expect(config.ensureAuthentication).toHaveBeenCalledTimes(1);
      expect(msg.status).toBe("ok");
      expect(msg.topic).toBe("/accounts/login/");
      expect(msg.payload).toEqual({ success: true, message: "Authentication verified" });
    });

    it("emits an error when ensureAuthentication resolves false", async () => {
      const { rest, out, config } = await load();
      config.ensureAuthentication = vi.fn().mockResolvedValue(false);
      const promise = received(out);

      rest.receive({ topic: "login" });
      const msg = await promise;

      expect(msg.status).toBe("error");
      expect(msg.url).toBe("/accounts/login/");
      expect(msg.error).toBeInstanceOf(Error);
      expect((msg.error as Error).message).toBe("Authentication failed");
    });

    it("emits an error when ensureAuthentication rejects", async () => {
      const { rest, out, config } = await load();
      config.ensureAuthentication = vi.fn().mockRejectedValue(new Error("auth blew up"));
      const promise = received(out);

      rest.receive({ topic: "login" });
      const msg = await promise;

      expect(msg.status).toBe("error");
      expect((msg.error as Error).message).toBe("auth blew up");
    });
  });

  // The refresh_token topic itself is covered by
  // tests/integration/rest-client-refresh-token.test.ts (EASEE-39), which
  // drives it through real fetch, including the explicit-login-on-no-tokens
  // path this file's stub-based approach could not distinguish from the old
  // behaviour. Not duplicated here.

  describe("topic dynamic_current", () => {
    it("errors without calling fetch when site is missing", async () => {
      const { rest, out } = await load();
      const errors: string[] = [];
      rest.error = (m: string) => errors.push(m);
      let gotOutput = false;
      out.on("input", () => {
        gotOutput = true;
      });

      rest.receive({ topic: "dynamic_current" });

      expect(errors).toContain(
        "[easee] dynamic_current failed: site missing. Set Site in this node, or send msg.site or msg.payload.site_id.",
      );
      expect(fetchMock()).not.toHaveBeenCalled();
      expect(gotOutput).toBe(false);
    });

    it("errors without calling fetch when circuit is missing but site is present", async () => {
      const { rest } = await load();
      const errors: string[] = [];
      rest.error = (m: string) => errors.push(m);

      rest.receive({ topic: "dynamic_current", site: SITE });

      expect(errors).toContain(
        "[easee] dynamic_current failed: circuit missing. Set Circuit in this node, or send msg.circuit or msg.payload.circuit_id.",
      );
      expect(fetchMock()).not.toHaveBeenCalled();
    });

    it("POSTs the new current, stripping site_id/circuit_id from the body", async () => {
      const { rest, out } = await load();
      fetchMock().mockImplementation(json({ ok: true }));
      const promise = received(out);

      rest.receive({
        topic: "dynamic_current",
        site: SITE,
        circuit: CIRCUIT,
        payload: { site_id: SITE, circuit_id: CIRCUIT, dynamicChargerCurrent: 16 },
      });
      const msg = await promise;

      const [url, init] = lastCall();
      expect(url).toBe(`${API_BASE}/sites/${SITE}/circuits/${CIRCUIT}/dynamicCurrent`);
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toEqual({ dynamicChargerCurrent: 16 });
      expect(msg.status).toBe("ok");
    });

    it("GETs circuit information when no current fields are given", async () => {
      const { rest, out } = await load();
      fetchMock().mockImplementation(json({ ok: true }));
      const promise = received(out);

      rest.receive({ topic: "dynamic_current", site: SITE, circuit: CIRCUIT, payload: {} });
      const msg = await promise;

      const [url, init] = lastCall();
      expect(url).toBe(`${API_BASE}/sites/${SITE}/circuits/${CIRCUIT}/dynamicCurrent`);
      expect(init.method).toBe("GET");
      expect(msg.status).toBe("ok");
    });
  });

  describe("custom URL path (payload.path / msg.command)", () => {
    it("GETs a custom path with the default method", async () => {
      const { rest, out } = await load();
      fetchMock().mockImplementation(json({ hello: "world" }));
      const promise = received(out);

      rest.receive({ payload: { path: "/custom/get-path" } });
      const msg = await promise;

      const [url, init] = lastCall();
      expect(url).toBe(`${API_BASE}/custom/get-path`);
      expect(init.method).toBe("GET");
      expect(msg.topic).toBe("/custom/get-path");
      expect(msg.payload).toEqual({ hello: "world" });
    });

    it("POSTs a custom path with an explicit method and JSON body", async () => {
      const { rest, out } = await load();
      fetchMock().mockImplementation(json({ accepted: true }));
      const promise = received(out);

      rest.receive({ payload: { path: "/custom/post-path", method: "post", body: { foo: "bar" } } });
      const msg = await promise;

      const [url, init] = lastCall();
      expect(url).toBe(`${API_BASE}/custom/post-path`);
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toEqual({ foo: "bar" });
      expect(msg.payload).toEqual({ accepted: true });
    });

    it("sends a body with no explicit method as a POST", async () => {
      const { rest, out } = await load();
      fetchMock().mockImplementation(json({ ok: true }));
      const promise = received(out);

      rest.receive({ payload: { path: "/custom/implicit-post", body: { a: 1 } } });
      await promise;

      const [, init] = lastCall();
      expect(init.method).toBe("POST");
    });

    it("uses msg.command as the path when payload.path is absent", async () => {
      const { rest, out } = await load();
      fetchMock().mockImplementation(json({ ok: true }));
      const promise = received(out);

      rest.receive({ command: "/from-command" });
      await promise;

      const [url, init] = lastCall();
      expect(url).toBe(`${API_BASE}/from-command`);
      expect(init.method).toBe("GET");
    });

    it("fails an unrecognised HTTP method without calling fetch", async () => {
      const { rest, out } = await load();
      const promise = received(out);

      rest.receive({ payload: { method: "delete" } });
      const msg = await promise;

      expect(fetchMock()).not.toHaveBeenCalled();
      expect(msg.status).toBe("error");
      expect(msg.error).toBe("Invalid HTTP method: DELETE");
    });
  });

  describe("missing path/topic and unknown topic", () => {
    it("fails when the message has neither payload.path nor a topic", async () => {
      const { rest, out } = await load();
      const promise = received(out);

      rest.receive({});
      const msg = await promise;

      expect(fetchMock()).not.toHaveBeenCalled();
      expect(msg.status).toBe("error");
      expect(msg.error).toBe("Missing required payload.path or topic");
    });

    it("fails an unknown topic, naming it", async () => {
      const { rest, out } = await load();
      const promise = received(out);

      rest.receive({ topic: "not-a-real-topic" });
      const msg = await promise;

      expect(fetchMock()).not.toHaveBeenCalled();
      expect(msg.status).toBe("error");
      expect(msg.error).toBe("Unknown topic not-a-real-topic");
    });
  });

  describe("REST error paths", () => {
    it("surfaces the API's JSON error message for a non-2xx response (EASEE-20)", async () => {
      const { rest, out } = await load();
      const body = { title: "Forbidden", detail: "The charger does not belong to this account" };
      fetchMock().mockImplementation(json(body, 403));
      const promise = received(out);

      rest.receive({ topic: "charger" });
      const msg = await promise;

      expect(msg.status).toBe("error");
      expect((msg.error as Error).message).toBe(
        "REST Command failed (403: Error) Forbidden - The charger does not belong to this account",
      );
    });

    it("reports a network error without a response to parse", async () => {
      const { rest, out } = await load();
      fetchMock().mockImplementation(rejects("network down"));
      const promise = received(out);

      rest.receive({ topic: "charger" });
      const msg = await promise;

      expect(msg.status).toBe("error");
      expect((msg.error as Error).message).toBe("REST Command failed: the request did not complete");
    });
  });

  describe("missing or unconfigured configuration node", () => {
    it("reports a missing configuration node and never calls fetch", async () => {
      const noConfigFlow = [
        {
          id: "rest-no-cfg",
          type: "easee-rest-client",
          name: "no config",
          charger: CHARGER,
          configuration: "does-not-exist",
          wires: [[]],
        },
      ];
      const events: string[] = [];
      await new Promise<void>((resolve) => {
        helper.load([easeeConfiguration, easeeRestClient] as any, noConfigFlow as any, {}, () => {
          const rest: any = helper.getNode("rest-no-cfg");
          // Attached here, not before: the constructor's own error/status calls
          // are proxied via process.nextTick, which has not fired yet by the
          // time this load callback runs (measured directly).
          rest.on("call:error", (call: any) => events.push(String(call.args[0])));
          rest.on("call:status", (call: any) => events.push(JSON.stringify(call.args[0])));
          // The listeners above are attached in time (measured directly), but the
          // proxied call is emitted on a later process.nextTick, so give it a
          // beat to actually fire before reading `events`.
          setTimeout(resolve, 20);
        });
      });

      expect(events).toContain(
        "[easee] Cannot start: No easee-configuration node is selected. Open this node, select or add an easee-configuration node, then deploy.",
      );
      expect(events).toContain(JSON.stringify({ fill: "red", shape: "ring", text: "No configuration node" }));
      expect(fetchMock()).not.toHaveBeenCalled();
    });

    it("reports invalid credentials and never calls fetch when the config node has no password", async () => {
      const invalidCredFlow = [
        { id: "cfg-invalid", type: "easee-configuration", name: "invalid", username: USERNAME },
        {
          id: "rest-invalid-cfg",
          type: "easee-rest-client",
          name: "invalid config",
          charger: CHARGER,
          configuration: "cfg-invalid",
          wires: [[]],
        },
      ];
      const events: string[] = [];
      await new Promise<void>((resolve) => {
        helper.load(
          [easeeConfiguration, easeeRestClient] as any,
          invalidCredFlow as any,
          { "cfg-invalid": { password: "" } } as any,
          () => {
            const rest: any = helper.getNode("rest-invalid-cfg");
            rest.on("call:error", (call: any) => events.push(String(call.args[0])));
            rest.on("call:status", (call: any) => events.push(JSON.stringify(call.args[0])));
            setTimeout(resolve, 20);
          },
        );
      });

      expect(events).toContain(
        "[easee] Cannot start: The easee-configuration node has no username or password. Open the easee-configuration node, enter both username and password, then deploy.",
      );
      expect(events).toContain(JSON.stringify({ fill: "red", shape: "ring", text: "Configuration incomplete" }));
      expect(fetchMock()).not.toHaveBeenCalled();
    });
  });
});
