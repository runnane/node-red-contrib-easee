/**
 * Actionable error messages (EASEE-26), through the real nodes in a real
 * Node-RED runtime via node-red-node-test-helper, with `fetch` stubbed.
 *
 * For each failure category — bad credentials, Easee unreachable, an Easee API
 * rejection, and a missing configuration node or charger id — a failure is
 * driven through the real node, and both the node.error() text (with the hint
 * saying what to do) and the status text are asserted. The input msg must reach
 * node.error() as its second argument, and so a Catch node; and during a
 * credential failure the password, the tokens and the username must never
 * appear in any error, warning or status.
 *
 * Every credential, token and serial below is synthetic.
 */

import helper from "node-red-node-test-helper";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import chargerStreamingClient from "../../easee-client/charger-streaming-client.js";
import easeeConfiguration from "../../easee-client/easee-configuration.js";
import easeeRestClient from "../../easee-client/easee-rest-client.js";
import { initHelperWithResolvedRuntime } from "../helpers/node-red-runtime.js";
import { fetchMock } from "../mocks/nodeRedMocks.js";

// The helper loads Node-RED's own Catch node, from whichever runtime it booted,
// for any "catch" node in a flow.
initHelperWithResolvedRuntime(helper);

const USERNAME = "user-7f3a@example.invalid";
const PASSWORD = "synthetic-pass-e26x";
const ACCESS_TOKEN = "synthetic-access-e26a";
const REFRESH_TOKEN = "synthetic-refresh-e26r";
const CHARGER = "EH0E2601";

const CREDENTIALS_HINT = "Check the username and password in the easee-configuration node, then press Re-login there.";

type Answer = () => Promise<unknown>;

function json(body: unknown, status = 200): Answer {
  return () => globalThis.testHelpers.createFetchResponse(body, status);
}

/** Answer fetch by URL: login, refresh_token, or anything else (the REST call). */
function api(answers: { login?: Answer; refresh?: Answer; rest?: Answer }) {
  fetchMock().mockImplementation((url: string) => {
    if (url.endsWith("/accounts/login") && answers.login) {
      return answers.login();
    }
    if (url.endsWith("/accounts/refresh_token") && answers.refresh) {
      return answers.refresh();
    }
    if (answers.rest) {
      return answers.rest();
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
}

/** Every error/warn/status call on a helper node, recorded as text. */
interface Recorded {
  errors: Array<{ text: string; msg: any }>;
  warnings: string[];
  statuses: any[];
}

function record(node: any): Recorded {
  const recorded: Recorded = { errors: [], warnings: [], statuses: [] };
  node.on("call:error", (call: any) => recorded.errors.push({ text: String(call.args[0]), msg: call.args[1] }));
  node.on("call:warn", (call: any) => recorded.warnings.push(String(call.args[0])));
  node.on("call:status", (call: any) => recorded.statuses.push(call.args[0]));
  return recorded;
}

/** Proxied calls are emitted on a later tick; give them a beat. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

function received(out: any): Promise<any> {
  return new Promise((resolve) => out.once("input", resolve));
}

/**
 * What the Catch node's output received, or null if nothing arrived within
 * `ms` — so a missing msg fails at an assertion, not as a test timeout.
 */
function caughtWithin(caught: any, ms = 500): Promise<any> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    caught.once("input", (msg: any) => {
      clearTimeout(timer);
      resolve(msg);
    });
  });
}

interface Loaded {
  config: any;
  node: any;
  out: any;
  caught: any;
}

/**
 * Load a config node, one node under test (wired to `out`) and a Catch node
 * scoped to everything (wired to `caught`). `authenticated` pre-sets a valid
 * token so ensureAuthentication() short-circuits; otherwise the next call logs
 * in through the stubbed fetch.
 */
function load(
  under: Record<string, unknown>,
  options: { authenticated?: boolean; expiredTokens?: boolean } = {},
): Promise<Loaded> {
  // A Catch node only sees errors from nodes on its own tab, so everything but
  // the config node sits on one. Its id must not be "catch": with that id the
  // helper never creates the node, and nothing says so (measured).
  const flow = [
    { id: "tab", type: "tab", label: "errors" },
    { id: "cfg", type: "easee-configuration", name: "errors test", username: USERNAME },
    { id: "under", z: "tab", name: "under test", configuration: "cfg", wires: [["out"]], ...under },
    { id: "out", z: "tab", type: "helper" },
    { id: "catcher", z: "tab", type: "catch", scope: null, uncaught: false, wires: [["caught"]] },
    { id: "caught", z: "tab", type: "helper" },
  ];
  return new Promise((resolve) => {
    helper.load(
      [easeeConfiguration, easeeRestClient, chargerStreamingClient] as any,
      flow as any,
      { cfg: { password: PASSWORD } } as any,
      () => {
        const config: any = helper.getNode("cfg");
        clearTimeout(config.checkTokenHandler);
        config.checkTokenHandler = null;
        if (options.authenticated) {
          config.accessToken = ACCESS_TOKEN;
          config.refreshToken = REFRESH_TOKEN;
          config.tokenExpires = new Date(Date.now() + 3600 * 1000);
        } else if (options.expiredTokens) {
          config.accessToken = ACCESS_TOKEN;
          config.refreshToken = REFRESH_TOKEN;
          config.tokenExpires = new Date(Date.now() - 1000);
        }
        resolve({
          config,
          node: helper.getNode("under"),
          out: helper.getNode("out"),
          caught: helper.getNode("caught"),
        });
      },
    );
  });
}

const REST = { type: "easee-rest-client", charger: CHARGER };

describe("actionable error messages (EASEE-26)", () => {
  beforeEach(() => {
    // REQUEST() awaits a real 50ms status delay.
    vi.useRealTimers();
  });

  afterEach(async () => {
    await helper.unload();
    vi.useRealTimers();
  });

  describe("easee-rest-client", () => {
    it("bad credentials: says to check the username/password and Re-login, and leaks no secret", async () => {
      const { config, node, out } = await load(REST, { expiredTokens: true });
      const onRest = record(node);
      const onConfig = record(config);
      // Hostile answers: each echoes back every secret it was sent.
      api({
        refresh: json({ title: "Unauthorized", detail: `refresh rejected for ${ACCESS_TOKEN} ${REFRESH_TOKEN}` }, 401),
        login: json({ title: "Unauthorized", detail: `login rejected for ${USERNAME} ${PASSWORD}` }, 401),
      });
      const output = received(out);

      node.receive({ topic: "charger" });
      const msg = await output;
      await settle();

      // Output payload unchanged in shape and message.
      expect(msg.status).toBe("error");
      expect((msg.error as Error).message).toBe("Authentication not available");

      expect(onRest.errors.map((e) => e.text)).toEqual([
        `[easee] GET request failed: Authentication not available. ${CREDENTIALS_HINT}`,
      ]);
      expect(onRest.statuses.at(-1)).toEqual({
        fill: "red",
        shape: "ring",
        text: "Login rejected – check credentials",
      });
      expect(onConfig.statuses.at(-1)).toEqual({
        fill: "red",
        shape: "ring",
        text: "Login rejected – check credentials",
      });
      expect(onConfig.errors.map((e) => e.text)).toContainEqual(
        `[easee] Login failed: Login failed (401): Unauthorized - login rejected for [redacted] [redacted]. ${CREDENTIALS_HINT}`,
      );

      const everything = JSON.stringify([onRest, onConfig]);
      for (const secret of [PASSWORD, ACCESS_TOKEN, REFRESH_TOKEN, USERNAME]) {
        expect(everything).not.toContain(secret);
      }
    });

    it("network: says Easee could not be reached and it will retry", async () => {
      const { node, out } = await load(REST, { authenticated: true });
      const onRest = record(node);
      api({ rest: () => Promise.reject(new TypeError("fetch failed")) });
      const output = received(out);

      node.receive({ topic: "charger" });
      const msg = await output;
      await settle();

      expect((msg.error as Error).message).toBe("REST Command failed: the request did not complete");
      expect(onRest.errors.map((e) => e.text)).toEqual([
        "[easee] GET request failed: REST Command failed: the request did not complete (fetch failed). Easee could not be reached; check this machine's network connection. It will retry.",
      ]);
      expect(onRest.statuses.at(-1)).toEqual({ fill: "red", shape: "ring", text: "Easee unreachable – retrying" });
    });

    it("API rejection: names the status and the API's message, and does not blame the login for a 403", async () => {
      const { node, out } = await load(REST, { authenticated: true });
      const onRest = record(node);
      api({ rest: json({ title: "Forbidden", detail: `No access to ${CHARGER}` }, 403) });
      const output = received(out);

      node.receive({ topic: "charger" });
      await output;
      await settle();

      expect(onRest.errors.map((e) => e.text)).toEqual([
        "[easee] GET request failed: REST Command failed (403: Error) Forbidden - No access to [redacted]. The Easee account has no access to this charger, site or circuit; check the id.",
      ]);
      expect(onRest.statuses.at(-1)).toEqual({ fill: "red", shape: "ring", text: "API error 403" });
    });

    it("API rejection: a 404 says to check the ids", async () => {
      const { node, out } = await load(REST, { authenticated: true });
      const onRest = record(node);
      api({ rest: json({ title: "Not Found" }, 404) });
      const output = received(out);

      node.receive({ payload: { path: "/sites/0/circuits/0/dynamicCurrent" } });
      await output;
      await settle();

      expect(onRest.errors[0].text).toBe(
        "[easee] GET request failed: REST Command failed (404: Error) Not Found. Easee does not know this resource; check the charger, site or circuit id and the path.",
      );
      expect(onRest.statuses.at(-1)).toEqual({ fill: "red", shape: "ring", text: "API error 404" });
    });

    it("missing charger id: says where to set it, and never calls Easee", async () => {
      const { node, out } = await load({ type: "easee-rest-client" }, { authenticated: true });
      const onRest = record(node);
      const output = received(out);

      node.receive({ topic: "charger_details" });
      const msg = await output;
      await settle();

      expect(fetchMock()).not.toHaveBeenCalled();
      expect(msg.status).toBe("error");
      expect(onRest.errors.map((e) => e.text)).toEqual([
        "[easee] GET request failed: No charger id. Set Charger in this node, or send msg.charger.",
      ]);
      expect(onRest.statuses.at(-1)).toEqual({ fill: "red", shape: "ring", text: "No charger id" });
    });

    it("passes the input msg to node.error(), so a Catch node receives it", async () => {
      const { node, out, caught } = await load(REST, { authenticated: true });
      const onRest = record(node);
      api({ rest: json({ title: "Not Found" }, 404) });
      const output = received(out);
      const catchOutput = caughtWithin(caught);

      node.receive({ topic: "charger", correlation: "e26-corr" });
      const sent = await output;
      await settle();

      expect(onRest.errors).toHaveLength(1);
      expect(onRest.errors[0].msg?.correlation).toBe("e26-corr");

      const fromCatch = await catchOutput;
      expect(fromCatch).not.toBeNull();
      expect(fromCatch.correlation).toBe("e26-corr");
      expect(fromCatch.topic).toBe("charger");
      expect(fromCatch.error.source.id).toBe("under");
      expect(fromCatch.error.message).toContain("check the charger, site or circuit id");
      // The regular output is a separate, unchanged message.
      expect(sent.status).toBe("error");
    });
  });

  describe("charger-streaming-client", () => {
    it("bad credentials on an input msg: node.error() gets the msg and the hint, status says check credentials", async () => {
      const { node, out, caught } = await load(
        // Output 2 (errors) to the helper node.
        { type: "charger-streaming-client", charger: CHARGER, wires: [[], ["out"], [], [], [], []] },
      );
      const onStream = record(node);
      api({ login: json({ title: "Unauthorized", detail: `bad password ${PASSWORD}` }, 401) });
      const output = received(out);
      const catchOutput = caughtWithin(caught);

      node.receive({ topic: "reconnect", correlation: "e26-stream" });
      const sent = await output;
      await settle();
      const fromCatch = await catchOutput;

      // Output 2's payload is unchanged.
      expect(sent.payload).toBe("Authentication failed during fullReconnect()");

      expect(onStream.errors.map((e) => e.text)).toEqual([
        `[easee] Charger stream: Authentication failed during fullReconnect(). ${CREDENTIALS_HINT}`,
      ]);
      expect(onStream.errors[0].msg?.correlation).toBe("e26-stream");
      expect(fromCatch?.correlation).toBe("e26-stream");
      expect(onStream.statuses.at(-1)).toMatchObject({
        fill: "red",
        shape: "ring",
        text: "Login rejected – check credentials",
        event: "error",
      });
      expect(JSON.stringify(onStream)).not.toContain(PASSWORD);
    });

    it("missing charger id: status says so and the error says where to set it", async () => {
      const { config, node } = await load({ type: "charger-streaming-client" }, { authenticated: true });
      const onStream = record(node);
      expect(config.accessToken).toBe(ACCESS_TOKEN);

      node.startconn();
      await settle();

      expect(onStream.errors.map((e) => e.text)).toEqual([
        "[easee] Charger stream: No charger, exiting. Set Charger in this node, then deploy.",
      ]);
      expect(onStream.statuses.at(-1)).toMatchObject({ text: "No charger id" });
    });

    it("closing is not reported as an error", async () => {
      const { node } = await load({ type: "charger-streaming-client", charger: CHARGER }, { authenticated: true });
      const onStream = record(node);

      await node.close(false);
      await settle();

      expect(onStream.errors).toEqual([]);
      expect(onStream.statuses.at(-1)).toMatchObject({ text: "Disconnected" });
    });
  });
});
