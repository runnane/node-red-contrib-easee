/**
 * Asserts the User-Agent header (EASEE-27) is actually sent by the REAL
 * doAuthRestCall() and doLogin() implementations, driven through a real
 * Node-RED runtime via node-red-node-test-helper — the same pattern as
 * rest-call-errors.test.ts and charger-state-observations.test.ts. (It was
 * written when other tests re-implemented these methods inline and so could not
 * notice a header dropped from the real easee-client/easee-configuration.ts;
 * EASEE-31 removed those.)
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import helper from "node-red-node-test-helper";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import configNode from "../../easee-client/easee-configuration.js";

const require = createRequire(import.meta.url);
helper.init(require.resolve("node-red"));

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const REAL_VERSION = (JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as { version: string }).version;

/**
 * `node-red-contrib-easee/<real version> (Node-RED/<redVersion>; Node/<node version>)`.
 *
 * The Node-RED segment is deliberately NOT asserted to be a real version here:
 * node-red-node-test-helper boots node modules against a fabricated
 * `mockRuntime` (its own index.js) that never sets `version` at all, so
 * `RED.version` is legitimately absent in this harness and the string reads
 * "Node-RED/unknown" — measured directly, not assumed. That readRedVersion()
 * correctly reads a real, function-shaped `RED.version()` (as the actual
 * Node-RED runtime exposes it — see user-agent.ts's own comment and
 * node_modules/@node-red/registry/lib/util.js's createNodeApi, which sets
 * `version: runtime.version` to the runtime's `getVersion` function
 * reference) is covered directly in user-agent.test.ts.
 */
const USER_AGENT_PATTERN = new RegExp(
  `^node-red-contrib-easee/${REAL_VERSION.replace(/\./g, "\\.")} \\(Node-RED/\\S+; Node/\\S+\\)$`,
);

const flow = [{ id: "config1", type: "easee-configuration", name: "Test Config", username: "test@example.com" }];
const credentials = { config1: { password: "testpass" } };

function fetchInit(mockFetch: unknown): Record<string, unknown> {
  const call = (mockFetch as { mock: { calls: unknown[][] } }).mock.calls[0];
  return call[1] as Record<string, unknown>;
}

describe("User-Agent header on outgoing requests (EASEE-27)", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    // The config node schedules its first token check 2s out; fake timers keep
    // it from firing against an unloaded runtime (same as rest-call-errors.test.ts).
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    helper.unload();
  });

  it(
    "doAuthRestCall sends a User-Agent naming this package and its real version, with no username",
    () =>
      new Promise<void>((resolve, reject) => {
        helper.load(configNode as any, flow as any, credentials, async () => {
          try {
            const config: any = helper.getNode("config1");
            // Pre-authenticated, so ensureAuthentication() short-circuits and the
            // only fetch is the one under test.
            config.accessToken = "test-access-token";
            config.tokenExpires = new Date(Date.now() + 3600 * 1000);

            globalThis.fetch = vi.fn().mockResolvedValue({
              ok: true,
              status: 200,
              statusText: "OK",
              text: () => Promise.resolve('{"ok":true}'),
            });

            await config.doAuthRestCall("/chargers/EH000000/config");

            expect(globalThis.fetch).toHaveBeenCalledTimes(1);
            const userAgent = fetchInit(globalThis.fetch).headers as Record<string, string>;
            expect(userAgent["User-Agent"]).toMatch(USER_AGENT_PATTERN);
            expect(userAgent["User-Agent"]).not.toContain("test@example.com");
            expect(userAgent["User-Agent"].toLowerCase()).not.toContain("username");

            resolve();
          } catch (error) {
            reject(error);
          }
        });
      }),
    15000,
  );

  it(
    "doLogin sends a User-Agent naming this package and its real version, with no username",
    () =>
      new Promise<void>((resolve, reject) => {
        helper.load(configNode as any, flow as any, credentials, async () => {
          try {
            const config: any = helper.getNode("config1");

            globalThis.fetch = vi.fn().mockResolvedValue({
              ok: true,
              status: 200,
              headers: { get: (name: string) => (name === "content-type" ? "application/json" : null) },
              json: () => Promise.resolve({ accessToken: "tok", refreshToken: "ref", expiresIn: 3600 }),
            });

            await config.doLogin();

            expect(globalThis.fetch).toHaveBeenCalledTimes(1);
            const headers = fetchInit(globalThis.fetch).headers as Record<string, string>;
            expect(headers["User-Agent"]).toMatch(USER_AGENT_PATTERN);
            expect(headers["User-Agent"]).not.toContain("test@example.com");
            expect(headers["User-Agent"].toLowerCase()).not.toContain("username");

            resolve();
          } catch (error) {
            reject(error);
          }
        });
      }),
    15000,
  );
});
