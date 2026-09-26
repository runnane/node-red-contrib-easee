/**
 * The configuration node's "Re-login" admin route (EASEE-28), driven through
 * node-red-node-test-helper's real admin app with supertest.
 *
 * Every credential and token below is synthetic.
 */

import { createRequire } from "node:module";
import helper from "node-red-node-test-helper";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import easeeConfiguration from "../../easee-client/easee-configuration.js";
import { createMockRED, fetchMock } from "../mocks/nodeRedMocks.js";

const require = createRequire(import.meta.url);

helper.init(require.resolve("node-red"));

const PASSWORD = "synthetic-pass-7f3a";
const OLD_ACCESS = "synthetic-old-access-11aa";
const OLD_REFRESH = "synthetic-old-refresh-22bb";
const NEW_ACCESS = "synthetic-new-access-33cc";
const NEW_REFRESH = "synthetic-new-refresh-44dd";

const flow = [
  { id: "cfg", type: "easee-configuration", name: "relogin test", username: "user@example.invalid" },
  { id: "other", type: "helper" },
];

function load(password = PASSWORD): Promise<any> {
  return new Promise((resolve) => {
    helper.load(easeeConfiguration as any, flow as any, { cfg: { password } } as any, () => {
      const node: any = helper.getNode("cfg");
      node.accessToken = OLD_ACCESS;
      node.refreshToken = OLD_REFRESH;
      // The token-check cycle would log in on its own (the start timer, and the
      // restart relogin() schedules), which hides whether relogin() itself did.
      // Stubbed, so every login these tests see is the route's own.
      node.checkToken = vi.fn(() => Promise.resolve());
      vi.spyOn(node, "status");
      vi.spyOn(node, "emit");
      resolve(node);
    });
  });
}

function jsonResponse(body: unknown, status = 200) {
  return globalThis.testHelpers.createFetchResponse(body, status);
}

function loginSucceeds() {
  fetchMock().mockImplementation((url: string) =>
    String(url).endsWith("/accounts/login")
      ? jsonResponse({ accessToken: NEW_ACCESS, refreshToken: NEW_REFRESH, expiresIn: 3600, tokenType: "Bearer" })
      : Promise.reject(new Error(`unexpected fetch ${url}`)),
  );
}

function relogin(id: string) {
  return helper.request().post(`/easee-configuration/${id}/relogin`);
}

describe("easee-configuration re-login admin route", () => {
  beforeEach(() => {
    // supertest needs real timers; the setup file leaves fake ones installed.
    vi.useRealTimers();
  });

  afterEach(async () => {
    await helper.unload();
  });

  it("calls doLogin with fresh tokens and answers 200 { ok: true }", async () => {
    const node = await load();
    loginSucceeds();
    const doLogin = vi.spyOn(node, "doLogin");

    const res = await relogin("cfg");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(doLogin).toHaveBeenCalledTimes(1);
    expect(fetchMock().mock.calls.map((call) => String(call[0]))).toEqual(["https://api.easee.com/api/accounts/login"]);
    expect(node.accessToken).toBe(NEW_ACCESS);
    expect(node.refreshToken).toBe(NEW_REFRESH);
    // ...and the token-check cycle, which checkToken() stops after too many
    // failed logins, is running again.
    await vi.waitFor(() => expect(node.checkToken).toHaveBeenCalled());
  }, 15000);

  it("resets refreshRetryCount, transportRetryCount and refreshToken through the shared resetAuthenticationState() (EASEE-42)", async () => {
    const node = await load();
    node.refreshRetryCount = 3;
    node.transportRetryCount = 2;
    // node.refreshToken is already OLD_REFRESH from load(); that non-default
    // value is what's under test. Make the login itself fail, so doLogin()
    // cannot reset these fields on its own (it only does that on success) —
    // any reset seen here can only have come from resetAuthenticationState().
    fetchMock().mockImplementation(() => jsonResponse({ title: "Invalid credentials" }, 401));

    const res = await relogin("cfg");

    expect(res.status).toBe(401);
    expect(node.refreshRetryCount).toBe(0);
    expect(node.transportRetryCount).toBe(0);
    expect(node.refreshToken).toBe(false);

    // Negative control: resetAuthenticationState() must not itself report a
    // failure. relogin() calls it before it knows whether the login that
    // follows will succeed, so a status/update here would be a false
    // "authentication failed" report on every Re-login click, succeeding or
    // not — which is exactly the regression this guards against.
    expect(node.status).not.toHaveBeenCalledWith({
      fill: "red",
      shape: "ring",
      text: "Authentication reset - reconfiguration required",
    });
    expect(node.emit).not.toHaveBeenCalledWith("update", {
      update: "Authentication failed - node requires reconfiguration",
    });
  }, 15000);

  it("never puts the password or a token in a successful response", async () => {
    await load();
    loginSucceeds();

    const res = await relogin("cfg");

    expect(res.status).toBe(200);
    for (const secret of [PASSWORD, OLD_ACCESS, OLD_REFRESH, NEW_ACCESS, NEW_REFRESH]) {
      expect(res.text).not.toContain(secret);
    }
  }, 15000);

  it("redacts the password and tokens from a failed login's error text", async () => {
    await load();
    // An API that echoes what it was sent: the error text doLogin() builds embeds it.
    fetchMock().mockImplementation(() =>
      jsonResponse({ title: "Invalid credentials", detail: `rejected ${PASSWORD} (was ${OLD_ACCESS})` }, 401),
    );

    const res = await relogin("cfg");

    expect(res.status).toBe(401);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toContain("Login failed (401): Invalid credentials");
    expect(res.body.error).toContain("[redacted]");
    for (const secret of [PASSWORD, OLD_ACCESS, OLD_REFRESH]) {
      expect(res.text).not.toContain(secret);
    }
  }, 15000);

  it("answers 500 when the login fails for a reason other than the credentials", async () => {
    await load();
    fetchMock().mockImplementation(() => Promise.reject(new Error("fetch failed")));

    const res = await relogin("cfg");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ ok: false, error: "fetch failed" });
  }, 15000);

  it("answers 401 without calling the API when no password is configured", async () => {
    await load("");

    const res = await relogin("cfg");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ ok: false, error: "Cannot login: Password is required" });
    expect(fetchMock()).not.toHaveBeenCalled();
  }, 15000);

  it("answers 409 while another authentication is in progress", async () => {
    const node = await load();
    node.authenticationInProgress = true;

    const res = await relogin("cfg");

    expect(res.status).toBe(409);
    expect(res.body.ok).toBe(false);
    expect(fetchMock()).not.toHaveBeenCalled();
    node.authenticationInProgress = false;
  }, 15000);

  it("answers 500 with a fixed message if relogin itself throws", async () => {
    const node = await load();
    node.relogin = () => Promise.reject(new Error(`boom ${PASSWORD}`));

    const res = await relogin("cfg");

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ ok: false, error: "Re-login failed unexpectedly; see the Node-RED log" });
  }, 15000);

  it("answers 404 for an unknown id", async () => {
    await load();

    const res = await relogin("no-such-node");

    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  }, 15000);

  it("answers 404 for a deployed node that is not an easee-configuration", async () => {
    await load();

    const res = await relogin("other");

    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  }, 15000);
});

describe("easee-configuration re-login route registration", () => {
  it("registers the route once per runtime, behind easee-configuration.write", () => {
    const RED = createMockRED();

    (easeeConfiguration as any)(RED);

    expect(RED.httpAdmin.post).toHaveBeenCalledTimes(1);
    expect(RED.httpAdmin.post.mock.calls[0][0]).toBe("/easee-configuration/:id/relogin");
    expect(RED.auth.needsPermission).toHaveBeenCalledWith("easee-configuration.write");
  });
});
