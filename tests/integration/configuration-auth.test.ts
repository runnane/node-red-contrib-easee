/**
 * The configuration node's login, token refresh and token-check logic, driven
 * through the REAL easee-configuration node in a real Node-RED runtime via
 * node-red-node-test-helper (EASEE-31). Only `fetch` is stubbed.
 *
 * This replaces authentication.test.ts, tokenRefresh.test.ts,
 * tokenChecking.test.ts and integration/authFlow.test.ts, which copied
 * doLogin / doRefreshToken / checkToken into the test file and tested the copy:
 * they stayed green whatever easee-client/ did, and had drifted from it (a
 * "12 hour" refresh threshold the node never had, a doRefreshToken that threw
 * where the node returns null, a "No credentials configured" status the node
 * never sets).
 *
 * What happens after a fresh login fails inside checkToken() (the retry count,
 * "check credentials", whether the cycle stops) is deliberately NOT pinned
 * here: EASEE-38 changes it and brings its own test,
 * token-check-backoff.test.ts. Likewise the status doLogin() sets for a 5xx.
 *
 * Every credential and token below is synthetic.
 */

import { createRequire } from "node:module";
import helper from "node-red-node-test-helper";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import easeeConfiguration from "../../easee-client/easee-configuration.js";
import mockData from "../fixtures/mockData.js";
import { fetchMock } from "../mocks/nodeRedMocks.js";

const require = createRequire(import.meta.url);

helper.init(require.resolve("node-red"));

const USERNAME = "user@example.invalid";
const PASSWORD = "synthetic-pass-5d2b";
const OLD_ACCESS = "synthetic-old-access-a1";
const OLD_REFRESH = "synthetic-old-refresh-b2";
const LOGIN_ACCESS = "synthetic-login-access-c3";
const LOGIN_REFRESH = "synthetic-login-refresh-d4";
const NEW_ACCESS = "synthetic-new-access-e5";
const NEW_REFRESH = "synthetic-new-refresh-f6";

const LOGIN_URL = "https://api.easee.com/api/accounts/login";
const REFRESH_URL = "https://api.easee.com/api/accounts/refresh_token";

const loginBody = { accessToken: LOGIN_ACCESS, refreshToken: LOGIN_REFRESH, expiresIn: 3600, tokenType: "Bearer" };
const refreshBody = { accessToken: NEW_ACCESS, refreshToken: NEW_REFRESH, expiresIn: 7200, tokenType: "Bearer" };

type Answer = () => Promise<unknown>;

function json(body: unknown, status = 200): Answer {
  return () => globalThis.testHelpers.createFetchResponse(body, status);
}

const notJson: Answer = () =>
  Promise.resolve({
    ok: false,
    status: 500,
    headers: { get: () => "text/html" },
    text: () => Promise.resolve("<html>Internal Server Error</html>"),
  });

function rejects(message: string): Answer {
  return () => Promise.reject(new Error(message));
}

/** Answer each endpoint with the next answer in its queue; anything else is a test bug. */
function api(routes: { login?: Answer[]; refresh?: Answer[] }) {
  fetchMock().mockImplementation((url: string) => {
    const queue = url === LOGIN_URL ? routes.login : url === REFRESH_URL ? routes.refresh : undefined;
    const next = queue?.shift();
    return next ? next() : Promise.reject(new Error(`unexpected fetch ${url}`));
  });
}

function fetchedUrls(): string[] {
  return fetchMock().mock.calls.map((call) => String(call[0]));
}

function fetchBody(index = 0): Record<string, unknown> {
  return JSON.parse(fetchMock().mock.calls[index][1].body);
}

/** Load one configuration node, with the constructor's 2 s start timer dropped. */
function load({ username = USERNAME, password = PASSWORD } = {}): Promise<any> {
  const flow = [{ id: "cfg", type: "easee-configuration", name: "auth test", username }];
  return new Promise((resolve) => {
    helper.load(easeeConfiguration as any, flow as any, { cfg: { password } } as any, () => {
      const node: any = helper.getNode("cfg");
      clearTimeout(node.checkTokenHandler);
      node.checkTokenHandler = null;
      vi.spyOn(node, "status");
      vi.spyOn(node, "emit");
      vi.spyOn(node, "error");
      resolve(node);
    });
  });
}

/** Give the node tokens as if a login had happened `ageS` seconds ago. */
function holdTokens(
  node: any,
  { expiresInS, lifetimeS, ageS = 0 }: { expiresInS: number; lifetimeS: number; ageS?: number },
) {
  node.accessToken = OLD_ACCESS;
  node.refreshToken = OLD_REFRESH;
  node.tokenExpires = new Date(Date.now() + expiresInS * 1000);
  node.tokenIssuedAt = new Date(Date.now() - ageS * 1000);
  node.tokenLifetime = lifetimeS;
}

function lastStatusText(node: any): string | undefined {
  return node.status.mock.calls.at(-1)?.[0]?.text;
}

function expectExpiresInAbout(node: any, seconds: number) {
  const delta = Number(node.tokenExpires) - (Date.now() + seconds * 1000);
  expect(Math.abs(delta)).toBeLessThan(2000);
}

describe("easee-configuration auth, through the real node", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await helper.unload();
  });

  describe("doLogin()", () => {
    it("posts the configured credentials and stores the tokens it gets back", async () => {
      const node = await load();
      api({ login: [json(loginBody)] });

      const result = await node.doLogin();

      expect(result).toEqual(loginBody);
      expect(fetchedUrls()).toEqual([LOGIN_URL]);
      expect(fetchMock().mock.calls[0][1]).toMatchObject({
        method: "post",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
      });
      expect(fetchBody()).toEqual({ userName: USERNAME, password: PASSWORD });
      expect(node.accessToken).toBe(LOGIN_ACCESS);
      expect(node.refreshToken).toBe(LOGIN_REFRESH);
      expect(node.tokenLifetime).toBe(3600);
      expectExpiresInAbout(node, 3600);
      expect(node.status).toHaveBeenLastCalledWith({ fill: "green", shape: "dot", text: "Authenticated successfully" });
      expect(node.emit).toHaveBeenCalledWith("update", { update: "Login successful, token retrieved" });
    });

    it("sends explicit credentials over the configured ones", async () => {
      const node = await load();
      api({ login: [json(loginBody)] });

      await node.doLogin("other@example.invalid", "synthetic-other-pass");

      expect(fetchBody()).toEqual({ userName: "other@example.invalid", password: "synthetic-other-pass" });
    });

    it("rejects a 401 with the API's message, reports invalid credentials, and stores nothing", async () => {
      const node = await load();
      api({ login: [json(mockData.loginErrors.invalidCredentials, 401)] });

      await expect(node.doLogin()).rejects.toThrow("Login failed (401): Unauthorized - Invalid username or password");

      expect(node.status).toHaveBeenLastCalledWith({ fill: "red", shape: "ring", text: "Invalid credentials" });
      expect(node.error).toHaveBeenCalled();
      expect(node.accessToken).toBe(false);
    });

    it("rejects a 5xx with the API's message and stores nothing", async () => {
      const node = await load();
      api({ login: [json(mockData.loginErrors.serverError, 500)] });

      await expect(node.doLogin()).rejects.toThrow(
        "Login failed (500): Internal Server Error - An unexpected error occurred",
      );

      expect(node.accessToken).toBe(false);
    });

    it("reports a login error, not bad credentials, when fetch itself fails", async () => {
      const node = await load();
      api({ login: [rejects("fetch failed")] });

      await expect(node.doLogin()).rejects.toThrow("fetch failed");

      expect(node.status).toHaveBeenLastCalledWith({ fill: "red", shape: "ring", text: "Login error" });
    });

    it("rejects a response that is not JSON, quoting it", async () => {
      const node = await load();
      api({ login: [notJson] });

      await expect(node.doLogin()).rejects.toThrow(
        "Unable to login, response not JSON: <html>Internal Server Error</html>",
      );
    });

    it("rejects a 200 without an access token", async () => {
      const node = await load();
      api({ login: [json({ someOtherField: "value" })] });

      await expect(node.doLogin()).rejects.toThrow("Login response did not contain access token");

      expect(node.accessToken).toBe(false);
    });

    it("refuses without calling the API when no password is configured", async () => {
      const node = await load({ password: "" });

      await expect(node.doLogin()).rejects.toThrow("Cannot login: Password is required");

      expect(fetchMock()).not.toHaveBeenCalled();
      expect(node.status).toHaveBeenLastCalledWith({
        fill: "red",
        shape: "ring",
        text: "Invalid configuration - missing credentials",
      });
    });

    it("refuses without calling the API when no username is configured", async () => {
      const node = await load({ username: "" });

      await expect(node.doLogin()).rejects.toThrow("Cannot login: Username is required");

      expect(fetchMock()).not.toHaveBeenCalled();
    });
  });

  describe("doRefreshToken()", () => {
    it("posts both current tokens and stores the new ones", async () => {
      const node = await load();
      holdTokens(node, { expiresInS: 100, lifetimeS: 3600, ageS: 3500 });
      node.refreshRetryCount = 2;
      api({ refresh: [json(refreshBody)] });

      const result = await node.doRefreshToken();

      expect(result).toEqual(refreshBody);
      expect(fetchedUrls()).toEqual([REFRESH_URL]);
      expect(fetchMock().mock.calls[0][1]).toMatchObject({
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/*+json" },
      });
      expect(fetchBody()).toEqual({ accessToken: OLD_ACCESS, refreshToken: OLD_REFRESH });
      expect(node.accessToken).toBe(NEW_ACCESS);
      expect(node.refreshToken).toBe(NEW_REFRESH);
      expect(node.tokenLifetime).toBe(7200);
      expectExpiresInAbout(node, 7200);
      expect(node.refreshRetryCount).toBe(0);
      expect(node.emit).toHaveBeenCalledWith("update", { update: "Token refreshed successfully" });
    });

    it("drops the tokens and answers null when the refresh token is rejected", async () => {
      const node = await load();
      holdTokens(node, { expiresInS: 100, lifetimeS: 3600 });
      api({ refresh: [json(mockData.refreshErrors.invalidRefreshToken, 401)] });

      const result = await node.doRefreshToken();

      expect(result).toBeNull();
      expect(node.accessToken).toBe(false);
      expect(node.refreshToken).toBe(false);
      expect(node.tokenLifetime).toBe(0);
      expect(node.emit).toHaveBeenCalledWith("update", { update: "Token refresh failed, will attempt fresh login" });
    });

    it("logs in instead when it holds no tokens", async () => {
      const node = await load();
      api({ login: [json(loginBody)] });

      const result = await node.doRefreshToken();

      expect(result).toBeUndefined();
      expect(fetchedUrls()).toEqual([LOGIN_URL]);
      expect(node.accessToken).toBe(LOGIN_ACCESS);
    });

    it("answers null and reports it when it holds no tokens and the login fails", async () => {
      const node = await load();
      api({ login: [json(mockData.loginErrors.invalidCredentials, 401)] });

      const result = await node.doRefreshToken();

      expect(result).toBeNull();
      expect(node.status).toHaveBeenLastCalledWith({ fill: "red", shape: "ring", text: "Authentication failed" });
    });

    it("answers null and keeps the old tokens when a 200 carries no access token", async () => {
      const node = await load();
      holdTokens(node, { expiresInS: 100, lifetimeS: 3600 });
      api({ refresh: [json({ someOtherField: "value" })] });

      const result = await node.doRefreshToken();

      expect(result).toBeNull();
      expect(node.error).toHaveBeenCalled();
      expect(node.accessToken).toBe(OLD_ACCESS);
    });

    it("answers null, counts a retry and keeps the tokens when the response is not JSON", async () => {
      const node = await load();
      holdTokens(node, { expiresInS: 100, lifetimeS: 3600 });
      api({ refresh: [notJson] });

      const result = await node.doRefreshToken();

      expect(result).toBeNull();
      expect(node.refreshRetryCount).toBe(1);
      expect(node.accessToken).toBe(OLD_ACCESS);
      expect(node.error).toHaveBeenCalled();
    });

    it("retries a network error after 2 s and answers with the retry's result", async () => {
      const node = await load();
      holdTokens(node, { expiresInS: 100, lifetimeS: 3600 });
      api({ refresh: [rejects("fetch failed - timeout"), json(refreshBody)] });
      vi.useFakeTimers();

      const pending = node.doRefreshToken();
      await vi.advanceTimersByTimeAsync(1999);
      expect(fetchedUrls()).toEqual([REFRESH_URL]);
      await vi.advanceTimersByTimeAsync(1);

      await expect(pending).resolves.toEqual(refreshBody);
      expect(fetchedUrls()).toEqual([REFRESH_URL, REFRESH_URL]);
      expect(node.accessToken).toBe(NEW_ACCESS);
      expect(node.emit).toHaveBeenCalledWith("update", { update: "Token refresh retry 1/5" });
    });

    it("drops the tokens once network errors have used up the refresh retries", async () => {
      const node = await load();
      holdTokens(node, { expiresInS: 100, lifetimeS: 3600 });
      node.refreshRetryCount = node.maxRefreshRetries;
      api({ refresh: [rejects("fetch failed - connection refused")] });

      const result = await node.doRefreshToken();

      expect(result).toBeNull();
      expect(node.accessToken).toBe(false);
      expect(node.refreshToken).toBe(false);
      expect(node.refreshRetryCount).toBe(0);
      expect(node.emit).toHaveBeenCalledWith("update", {
        update: "Token refresh failed after retries, attempting fresh login",
      });
    });
  });

  describe("resetAuthenticationState()", () => {
    it("clears tokens and counters, and says the node needs reconfiguring", async () => {
      const node = await load();
      holdTokens(node, { expiresInS: 3600, lifetimeS: 3600 });
      node.refreshRetryCount = 2;
      node.loginRetryCount = 1;

      node.resetAuthenticationState();

      expect(node.accessToken).toBe(false);
      expect(node.refreshToken).toBe(false);
      expect(node.tokenLifetime).toBe(0);
      expect(node.refreshRetryCount).toBe(0);
      expect(node.loginRetryCount).toBe(0);
      expect(node.status).toHaveBeenLastCalledWith({
        fill: "red",
        shape: "ring",
        text: "Authentication reset - reconfiguration required",
      });
      expect(node.emit).toHaveBeenCalledWith("update", {
        update: "Authentication failed - node requires reconfiguration",
      });
    });
  });

  describe("checkToken()", () => {
    /** Run one check; report the delay of the next check it scheduled (null if none). */
    async function check(node: any): Promise<number | null> {
      const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
      try {
        await node.checkToken();
        const scheduled = setTimeoutSpy.mock.calls.at(-1);
        return node.checkTokenHandler === null || !scheduled ? null : Number(scheduled[1]);
      } finally {
        setTimeoutSpy.mockRestore();
        clearTimeout(node.checkTokenHandler);
        node.checkTokenHandler = null;
      }
    }

    it("does nothing and schedules nothing when the configuration has no password", async () => {
      const node = await load({ password: "" });

      expect(await check(node)).toBeNull();

      expect(fetchMock()).not.toHaveBeenCalled();
      expect(lastStatusText(node)).toBe("Invalid configuration - edit to add credentials");
    });

    it("skips a check while another authentication is in progress", async () => {
      const node = await load();
      node.authenticationInProgress = true;

      expect(await check(node)).toBeNull();

      expect(fetchMock()).not.toHaveBeenCalled();
      node.authenticationInProgress = false;
    });

    it("logs in when it holds no token, then checks again in 5 minutes", async () => {
      const node = await load();
      api({ login: [json(loginBody)] });

      const next = await check(node);

      expect(fetchedUrls()).toEqual([LOGIN_URL]);
      expect(node.accessToken).toBe(LOGIN_ACCESS);
      expect(lastStatusText(node)).toBe("Authenticated successfully");
      // 3600 s lifetime: renewal at 75% = 2700 s, a quarter of that capped at 5 min.
      expect(next).toBe(5 * 60 * 1000);
    });

    it("leaves a fresh token alone", async () => {
      const node = await load();
      holdTokens(node, { expiresInS: 3600, lifetimeS: 3600 });

      const next = await check(node);

      expect(fetchMock()).not.toHaveBeenCalled();
      expect(node.accessToken).toBe(OLD_ACCESS);
      expect(next).toBe(5 * 60 * 1000);
    });

    it("refreshes an expired token", async () => {
      const node = await load();
      holdTokens(node, { expiresInS: -60, lifetimeS: 3600, ageS: 3660 });
      api({ refresh: [json(refreshBody)] });

      await check(node);

      expect(fetchedUrls()).toEqual([REFRESH_URL]);
      expect(node.accessToken).toBe(NEW_ACCESS);
    });

    it("refreshes a token inside the 5-minute buffer", async () => {
      const node = await load();
      holdTokens(node, { expiresInS: 200, lifetimeS: 0 });
      api({ refresh: [json(refreshBody)] });

      await check(node);

      expect(fetchedUrls()).toEqual([REFRESH_URL]);
    });

    it("refreshes a token past 75% of its known lifetime", async () => {
      const node = await load();
      holdTokens(node, { expiresInS: 800, lifetimeS: 3600, ageS: 2800 });
      api({ refresh: [json(refreshBody)] });

      await check(node);

      expect(fetchedUrls()).toEqual([REFRESH_URL]);
    });

    it("does not refresh a token short of 75% of its known lifetime", async () => {
      const node = await load();
      holdTokens(node, { expiresInS: 1000, lifetimeS: 3600, ageS: 2600 });

      await check(node);

      expect(fetchMock()).not.toHaveBeenCalled();
    });

    it("refreshes a token of unknown lifetime inside the 10-minute early-renewal window", async () => {
      const node = await load();
      holdTokens(node, { expiresInS: 500, lifetimeS: 0 });
      api({ refresh: [json(refreshBody)] });

      await check(node);

      expect(fetchedUrls()).toEqual([REFRESH_URL]);
    });

    it("does not refresh a token of unknown lifetime outside the early-renewal window", async () => {
      const node = await load();
      holdTokens(node, { expiresInS: 700, lifetimeS: 0 });

      await check(node);

      expect(fetchMock()).not.toHaveBeenCalled();
    });

    it("falls back to a fresh login when the refresh token is rejected", async () => {
      const node = await load();
      holdTokens(node, { expiresInS: -60, lifetimeS: 3600, ageS: 3660 });
      api({ refresh: [json(mockData.refreshErrors.invalidRefreshToken, 401)], login: [json(loginBody)] });

      await check(node);

      expect(fetchedUrls()).toEqual([REFRESH_URL, LOGIN_URL]);
      expect(node.accessToken).toBe(LOGIN_ACCESS);
      expect(node.refreshToken).toBe(LOGIN_REFRESH);
      expect(node.loginRetryCount).toBe(0);
      expect(lastStatusText(node)).toBe("Authenticated successfully");
    });
  });
});
