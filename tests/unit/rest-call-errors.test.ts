/**
 * doAuthRestCall's error handling.
 *
 * Two things pinned here:
 *
 * - fetch itself rejecting (EASEE-19): the rejection was caught, logged, and
 *   turned into `undefined` — and the code then called `response.text()` on it, so
 *   every caller received "Cannot read properties of undefined (reading 'text')"
 *   instead of anything about the request. The TypeScript conversion refused that,
 *   and this pins the fix.
 * - the API's own JSON error message never reaching the thrown error (EASEE-20):
 *   `is_json` was a boolean, so `is_json?.message` was always undefined and every
 *   failure reported the raw response body regardless of its shape.
 *   extractApiErrorDetail() (in easee-configuration.ts) is the fix; these tests
 *   drive it through doAuthRestCall rather than testing it in isolation, since it
 *   is not exported.
 */

import { createRequire } from "node:module";
import helper from "node-red-node-test-helper";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import configNode from "../../easee-client/easee-configuration.js";

const require = createRequire(import.meta.url);

helper.init(require.resolve("node-red"));

const flow = [{ id: "config1", type: "easee-configuration", name: "Test Config", username: "test@example.com" }];
const credentials = { config1: { password: "testpass" } };

/**
 * A fetch Response stand-in that only implements what doAuthRestCall() reads:
 * text(), status, statusText and ok. `rawText` is exactly what response.text()
 * resolves to, so a caller can hand it something that is not valid JSON (or the
 * literal string "null") without it being re-encoded.
 */
function fakeResponse(rawText: string, status: number, statusText = "Error") {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: () => Promise.resolve(rawText),
  };
}

async function loadAuthenticatedConfig(): Promise<any> {
  const config: any = await new Promise((resolve) => {
    helper.load(configNode as any, flow as any, credentials, () => resolve(helper.getNode("config1")));
  });
  // Pre-authenticated, so ensureAuthentication() short-circuits and the only
  // fetch is the one under test.
  config.accessToken = "test-access-token";
  config.tokenExpires = new Date(Date.now() + 3600 * 1000);
  return config;
}

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
    const config = await loadAuthenticatedConfig();
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("fetch failed - connection refused"));

    await expect(config.doAuthRestCall("/chargers/EH000000/config")).rejects.toThrow(
      "REST Command failed: the request did not complete",
    );
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  }, 15000);
});

describe("doAuthRestCall surfacing the API's JSON error message (EASEE-20)", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    helper.unload();
  });

  it("surfaces title and detail from a problem-details error body", async () => {
    const config = await loadAuthenticatedConfig();
    const body = {
      title: "Unauthorized",
      detail: "The charger does not belong to this account",
      errorCodeName: "CHARGER_NOT_OWNED",
    };
    globalThis.fetch = vi.fn().mockResolvedValue(fakeResponse(JSON.stringify(body), 403, "Forbidden"));

    // The full, contiguous formatted message — not just the detail text — because
    // the detail string is also a substring of the raw JSON body this falls back
    // to, so asserting on the detail alone could not tell the two apart.
    await expect(config.doAuthRestCall("/chargers/EH000000/config")).rejects.toThrow(
      "REST Command failed (403: Forbidden) Unauthorized - The charger does not belong to this account",
    );
  }, 15000);

  it("keeps the REST Command failed (status) prefix unchanged", async () => {
    const config = await loadAuthenticatedConfig();
    const body = { title: "Unauthorized", detail: "nope" };
    globalThis.fetch = vi.fn().mockResolvedValue(fakeResponse(JSON.stringify(body), 403, "Forbidden"));

    await expect(config.doAuthRestCall("/chargers/EH000000/config")).rejects.toThrow(
      "REST Command failed (403: Forbidden)",
    );
  }, 15000);

  it("falls back to a message field when there is no title or detail", async () => {
    const config = await loadAuthenticatedConfig();
    const body = { message: "Rate limit exceeded, try again later" };
    globalThis.fetch = vi.fn().mockResolvedValue(fakeResponse(JSON.stringify(body), 429, "Too Many Requests"));

    // Same reasoning as the problem-details test: the message text alone is also a
    // substring of the raw JSON fallback, so assert the full contiguous message.
    await expect(config.doAuthRestCall("/chargers/EH000000/config")).rejects.toThrow(
      "REST Command failed (429: Too Many Requests) Rate limit exceeded, try again later",
    );
  }, 15000);

  it("falls back to the raw body for a non-JSON error response", async () => {
    const config = await loadAuthenticatedConfig();
    const rawText = "<html>Internal Server Error</html>";
    globalThis.fetch = vi.fn().mockResolvedValue(fakeResponse(rawText, 500, "Internal Server Error"));

    await expect(config.doAuthRestCall("/chargers/EH000000/config")).rejects.toThrow(rawText);
  }, 15000);

  it("falls back to the raw body for a JSON body that parses to null", async () => {
    const config = await loadAuthenticatedConfig();
    globalThis.fetch = vi.fn().mockResolvedValue(fakeResponse("null", 500, "Internal Server Error"));

    await expect(config.doAuthRestCall("/chargers/EH000000/config")).rejects.toThrow(
      "REST Command failed (500: Internal Server Error) null",
    );
  }, 15000);
});
