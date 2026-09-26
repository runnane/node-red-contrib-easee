/**
 * The configuration node's token-check cycle when fresh logins keep failing
 * (EASEE-38), in a real Node-RED runtime through node-red-node-test-helper.
 *
 * checkToken() used to count every failed login, network errors included, and
 * after maxLoginRetries it reported "check credentials" and stopped the cycle
 * for good. A failure the API did not answer with 400/401/403 must now back
 * off (capped at 5 minutes) and never stop; a credential rejection reports
 * "check credentials" and keeps retrying slowly.
 *
 * Every credential and token below is synthetic.
 */

import helper from "node-red-node-test-helper";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import easeeConfiguration from "../../easee-client/easee-configuration.js";
import { initHelperWithResolvedRuntime } from "../helpers/node-red-runtime.js";
import { fetchMock } from "../mocks/nodeRedMocks.js";

initHelperWithResolvedRuntime(helper);

const flow = [{ id: "cfg", type: "easee-configuration", name: "backoff test", username: "user@example.invalid" }];

const MINUTE = 60 * 1000;

function load(): Promise<any> {
  return new Promise((resolve) => {
    helper.load(easeeConfiguration as any, flow as any, { cfg: { password: "synthetic-pass-9c1e" } } as any, () => {
      const node: any = helper.getNode("cfg");
      // Drop the start timer: every check below is one the test drives.
      clearTimeout(node.checkTokenHandler);
      node.checkTokenHandler = null;
      resolve(node);
    });
  });
}

/**
 * Run one token check and report what it left behind: the delay of the next
 * check it scheduled (null if it scheduled none) and the last status text.
 */
async function cycle(node: any): Promise<{ nextCheckMs: number | null; status: string }> {
  const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
  const statusSpy = vi.spyOn(node, "status");
  let scheduledCall: unknown[] | undefined;
  let status = "";
  try {
    await node.checkToken();
    // Read before mockRestore(), which also clears the recorded calls.
    scheduledCall = setTimeoutSpy.mock.calls.at(-1);
    status = String((statusSpy.mock.calls.at(-1)?.[0] as { text?: string } | undefined)?.text ?? "");
  } finally {
    setTimeoutSpy.mockRestore();
    statusSpy.mockRestore();
  }
  const scheduled = node.checkTokenHandler !== null;
  if (scheduled) {
    clearTimeout(node.checkTokenHandler);
    node.checkTokenHandler = null;
  }
  return { nextCheckMs: scheduled && scheduledCall ? Number(scheduledCall[1]) : null, status };
}

function loginAnswers(status: number, body: unknown) {
  fetchMock().mockImplementation(() => globalThis.testHelpers.createFetchResponse(body, status));
}

describe("easee-configuration token-check cycle after failed logins (EASEE-38)", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(async () => {
    await helper.unload();
  });

  it("keeps the cycle going with a capped backoff when fetch rejects, and never blames the credentials", async () => {
    const node = await load();
    fetchMock().mockRejectedValue(new TypeError("fetch failed"));

    const results = [];
    for (let i = 0; i < node.maxLoginRetries + 3; i++) {
      results.push(await cycle(node));
    }

    expect(results.map((r) => r.nextCheckMs)).toEqual([
      1 * MINUTE,
      2 * MINUTE,
      4 * MINUTE,
      5 * MINUTE,
      5 * MINUTE,
      5 * MINUTE,
      5 * MINUTE,
      5 * MINUTE,
    ]);
    for (const { status } of results) {
      expect(status).not.toMatch(/credential/i);
      expect(status).toMatch(/^Cannot reach Easee - retrying in \d+s$/);
    }
    expect(node.loginRetryCount).toBe(0);
  });

  it("treats a 5xx from accounts/login as a transport failure, not a credential rejection", async () => {
    const node = await load();
    loginAnswers(503, { title: "Service Unavailable" });

    const results = [];
    for (let i = 0; i < node.maxLoginRetries + 1; i++) {
      results.push(await cycle(node));
    }

    expect(results.at(-1)).toEqual({ nextCheckMs: 5 * MINUTE, status: "Cannot reach Easee - retrying in 300s" });
    for (const { status } of results) {
      expect(status).not.toMatch(/credential/i);
    }
    expect(node.loginRetryCount).toBe(0);
  });

  it("reports check credentials after maxLoginRetries 401s, and still schedules a slow retry", async () => {
    const node = await load();
    loginAnswers(401, { title: "Unauthorized", errorCodeName: "InvalidUserPassword" });

    const results = [];
    for (let i = 0; i < node.maxLoginRetries + 2; i++) {
      results.push(await cycle(node));
    }

    const max = node.maxLoginRetries;
    expect(results.slice(0, max - 1)).toEqual(
      Array.from({ length: max - 1 }, (_, i) => ({ nextCheckMs: 1 * MINUTE, status: `Login retry ${i + 1}/${max}` })),
    );
    for (const result of results.slice(max - 1)) {
      expect(result).toEqual({ nextCheckMs: 30 * MINUTE, status: "Authentication failed - check credentials" });
    }
  });

  it("returns to the normal schedule after a successful login and resets the backoff", async () => {
    const node = await load();
    fetchMock().mockRejectedValue(new TypeError("fetch failed"));
    await cycle(node);
    await cycle(node);
    expect(node.transportRetryCount).toBe(2);

    loginAnswers(200, {
      accessToken: "synthetic-access-5d2f",
      refreshToken: "synthetic-refresh-8b4a",
      expiresIn: 3600,
      tokenType: "Bearer",
    });
    const result = await cycle(node);

    expect(node.transportRetryCount).toBe(0);
    expect(node.accessToken).toBe("synthetic-access-5d2f");
    // A fresh one-hour token: the next check lands between 30 s and 5 min.
    expect(result.nextCheckMs).toBeGreaterThanOrEqual(30 * 1000);
    expect(result.nextCheckMs).toBeLessThanOrEqual(5 * MINUTE);
  });
});
