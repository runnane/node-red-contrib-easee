/**
 * doAuthRestCall when fetch itself rejects (EASEE-19).
 *
 * The rejection was caught, logged, and turned into `undefined` — and the code
 * then called `response.text()` on it, so every caller received "Cannot read
 * properties of undefined (reading 'text')" instead of anything about the
 * request. The TypeScript conversion refused that, and this pins the fix.
 */

import { createRequire } from "node:module";
import helper from "node-red-node-test-helper";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import configNode from "../../easee-client/easee-configuration.js";

const require = createRequire(import.meta.url);

helper.init(require.resolve("node-red"));

const flow = [{ id: "config1", type: "easee-configuration", name: "Test Config", username: "test@example.com" }];
const credentials = { config1: { password: "testpass" } };

describe("doAuthRestCall when the request does not complete", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    // The config node schedules its first token check 2s out; fake timers keep it
    // from firing against an unloaded runtime.
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    helper.unload();
  });

  it("rejects with an error that says the request failed", async () => {
    const config: any = await new Promise((resolve) => {
      helper.load(configNode as any, flow as any, credentials, () => resolve(helper.getNode("config1")));
    });
    // Pre-authenticated, so ensureAuthentication() short-circuits and the only
    // fetch is the one under test.
    config.accessToken = "test-access-token";
    config.tokenExpires = new Date(Date.now() + 3600 * 1000);
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("fetch failed - connection refused"));

    await expect(config.doAuthRestCall("/chargers/EH000000/config")).rejects.toThrow(
      "REST Command failed: the request did not complete",
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  }, 15000);
});
