/**
 * The REST client's `refresh_token` message topic, driven through the real
 * easee-rest-client + easee-configuration nodes via node-red-node-test-helper.
 *
 * doRefreshToken() no longer logs in on its own when it holds no tokens
 * (EASEE-39): it resolves `undefined` and leaves the login to its caller.
 * checkToken() is one caller and is covered in configuration-auth.test.ts;
 * this file covers the other one. Before EASEE-39 this topic got a login for
 * free as a side effect of doRefreshToken(); it must now ask for one
 * explicitly so a `refresh_token` command with no tokens still authenticates
 * (and a failed login is still reported as a failure, not silently as ok).
 *
 * Every credential and token below is synthetic.
 */

import { createRequire } from "node:module";
import helper from "node-red-node-test-helper";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import configNode from "../../easee-client/easee-configuration.js";
import restClientNode from "../../easee-client/easee-rest-client.js";
import { fetchMock } from "../mocks/nodeRedMocks.js";

const require = createRequire(import.meta.url);

helper.init(require.resolve("node-red"));

const LOGIN_URL = "https://api.easee.com/api/accounts/login";
const REFRESH_URL = "https://api.easee.com/api/accounts/refresh_token";

const loginBody = {
  accessToken: "synthetic-login-access-r1",
  refreshToken: "synthetic-login-refresh-r2",
  expiresIn: 3600,
  tokenType: "Bearer",
};
const refreshBody = {
  accessToken: "synthetic-new-access-r3",
  refreshToken: "synthetic-new-refresh-r4",
  expiresIn: 7200,
  tokenType: "Bearer",
};

const flow = [
  { id: "config1", type: "easee-configuration", name: "Test Config", username: "user@example.invalid" },
  { id: "rest1", type: "easee-rest-client", name: "Test Rest", configuration: "config1", wires: [["out1"]] },
  { id: "out1", type: "helper" },
];
const credentials = { config1: { password: "synthetic-pass-9d4c" } };

type Answer = () => Promise<unknown>;

function json(body: unknown, status = 200): Answer {
  return () => globalThis.testHelpers.createFetchResponse(body, status);
}

function fetchedUrls(): string[] {
  return fetchMock().mock.calls.map((call) => String(call[0]));
}

/** Answer each endpoint with the next answer in its queue; anything else is a test bug. */
function api(routes: { login?: Answer[]; refresh?: Answer[] }) {
  fetchMock().mockImplementation((url: string) => {
    const queue = url === LOGIN_URL ? routes.login : url === REFRESH_URL ? routes.refresh : undefined;
    const next = queue?.shift();
    return next ? next() : Promise.reject(new Error(`unexpected fetch ${url}`));
  });
}

/** Load the config + rest-client nodes, with the config node's 2 s start timer dropped. */
function load(): Promise<{ rest: any; out: any; config: any }> {
  return new Promise((resolve) => {
    helper.load([configNode, restClientNode] as any, flow as any, credentials, () => {
      const config: any = helper.getNode("config1");
      clearTimeout(config.checkTokenHandler);
      config.checkTokenHandler = null;
      resolve({ rest: helper.getNode("rest1"), out: helper.getNode("out1"), config });
    });
  });
}

describe("easee-rest-client refresh_token topic (EASEE-39)", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await helper.unload();
  });

  it("logs in explicitly when the config node holds no tokens", async () => {
    const { rest, out, config } = await load();
    api({ login: [json(loginBody)] });

    const received = new Promise<any>((resolve) => out.on("input", resolve));
    rest.receive({ topic: "refresh_token" });
    const msg = await received;

    expect(msg.status).toBe("ok");
    expect(msg.payload).toEqual(loginBody);
    expect(fetchedUrls()).toEqual([LOGIN_URL]);
    expect(config.accessToken).toBe(loginBody.accessToken);
  });

  it("refreshes normally when the config node already holds tokens", async () => {
    const { rest, out, config } = await load();
    config.accessToken = "synthetic-old-access-r5";
    config.refreshToken = "synthetic-old-refresh-r6";
    config.tokenExpires = new Date(Date.now() + 100 * 1000);
    api({ refresh: [json(refreshBody)] });

    const received = new Promise<any>((resolve) => out.on("input", resolve));
    rest.receive({ topic: "refresh_token" });
    const msg = await received;

    expect(msg.status).toBe("ok");
    expect(msg.payload).toEqual(refreshBody);
    expect(fetchedUrls()).toEqual([REFRESH_URL]);
  });

  it("reports failure, not success, when the explicit login fails", async () => {
    const { rest, out } = await load();
    api({ login: [json({ title: "Unauthorized", errorCodeName: "InvalidUserPassword" }, 401)] });

    const received = new Promise<any>((resolve) => out.on("input", resolve));
    rest.receive({ topic: "refresh_token" });
    const msg = await received;

    expect(msg.status).toBe("error");
    expect(fetchedUrls()).toEqual([LOGIN_URL]);
  });
});
