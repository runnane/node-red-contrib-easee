/**
 * Tests for the charger_state topic after Easee sunset
 * GET /api/chargers/{id}/state on 2026-09-01 (EASEE-13).
 *
 * These drive the real easee-rest-client node through node-red-node-test-helper
 * with global.fetch mocked, so the whole path is exercised: node input ->
 * genericCall -> doAuthRestCall -> fetch -> re-keying -> node.send.
 */

import helper from "node-red-node-test-helper";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import configNode from "../../easee-client/easee-configuration.js";
import restClientNode from "../../easee-client/easee-rest-client.js";
import { initHelperWithResolvedRuntime } from "../helpers/node-red-runtime.js";
import { fetchMock } from "../mocks/nodeRedMocks.js";

initHelperWithResolvedRuntime(helper);

const CHARGER = "EH000000";

const flow = [
  {
    id: "config1",
    type: "easee-configuration",
    name: "Test Config",
    username: "test@example.com",
  },
  {
    id: "rest1",
    type: "easee-rest-client",
    name: "Test Rest",
    charger: CHARGER,
    configuration: "config1",
    wires: [["out1"]],
  },
  { id: "out1", type: "helper" },
];

const credentials = { config1: { password: "testpass" } };

type LoadedCallback = (rest: any, out: any, config: any) => void | Promise<void>;

/**
 * Load the flow and pre-authenticate the config node so ensureAuthentication()
 * short-circuits without touching the network.
 */
function loadAuthenticated(callback: LoadedCallback) {
  helper.load([configNode, restClientNode] as any, flow as any, credentials, () => {
    const config: any = helper.getNode("config1");
    config.accessToken = "test-access-token";
    config.tokenExpires = new Date(Date.now() + 3600 * 1000);
    callback(helper.getNode("rest1"), helper.getNode("out1"), config);
  });
}

/** Build a fetch mock returning the given observations array. */
function mockObservations(observations: unknown[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: () => "application/json" },
    text: () => Promise.resolve(JSON.stringify({ observations })),
  });
}

describe("charger_state via the observations endpoint", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    // tests/setup.ts installs fake timers globally; this path awaits a real
    // 50ms status delay inside the node, so it needs real ones.
    vi.useRealTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    helper.unload();
  });

  it(
    "requests the observations endpoint and never the sunset /state path",
    () =>
      new Promise<void>((resolve, reject) => {
        globalThis.fetch = mockObservations([]);

        loadAuthenticated((rest) => {
          rest.on("call:error", () => {});
          fetchMock().mockClear();
          rest.receive({ topic: "charger_state" });

          setTimeout(() => {
            try {
              expect(globalThis.fetch).toHaveBeenCalledTimes(1);
              const requestedUrl = fetchMock().mock.calls[0][0];

              // The endpoint that replaced it, at its own base outside /api.
              // Asserted with startsWith, not toContain: a double-prefixed
              // "https://api.easee.com/api" + "https://api.easee.com/state/..."
              // still *contains* the right substring, so toContain alone passes
              // even when the absolute-URL handling is broken.
              expect(requestedUrl.startsWith(`https://api.easee.com/state/${CHARGER}/observations?ids=`)).toBe(true);

              // The sunset endpoint must not be requested again. Pinned literally:
              // this is the exact path that started returning 404.
              expect(requestedUrl).not.toContain(`/api/chargers/${CHARGER}/state`);
              resolve();
            } catch (error) {
              reject(error);
            }
          }, 300);
        });
      }),
    15000,
  );

  it(
    "asks for the 52 observation ids that reproduce the old state payload",
    () =>
      new Promise<void>((resolve, reject) => {
        globalThis.fetch = mockObservations([]);

        loadAuthenticated((rest) => {
          rest.on("call:error", () => {});
          fetchMock().mockClear();
          rest.receive({ topic: "charger_state" });

          setTimeout(() => {
            try {
              const requestedUrl = fetchMock().mock.calls[0][0];
              const ids = (new URL(requestedUrl).searchParams.get("ids") ?? "").split(",").map(Number);

              expect(ids).toHaveLength(52);
              expect(new Set(ids).size).toBe(52);

              // Spot-check ids pinned from Easee's observation-id documentation
              // rather than derived from the implementation's own table.
              expect(ids).toContain(102); // SmartCharging   -> smartCharging
              expect(ids).toContain(120); // TotalPower      -> totalPower
              expect(ids).toContain(80); //  SoftwareRelease -> chargerFirmware
              expect(ids).toContain(50); //  MaxCurrentOfflineFallback_P1

              // 250 (ConnectedToCloud) is deliberately excluded: it is not in the
              // module's observation table and an unknown id risks a 400 that would
              // take the other 52 fields down with it.
              expect(ids).not.toContain(250);
              resolve();
            } catch (error) {
              reject(error);
            }
          }, 300);
        });
      }),
    15000,
  );

  it(
    "re-keys the id-keyed response back to the old field names",
    () =>
      new Promise<void>((resolve, reject) => {
        globalThis.fetch = mockObservations([
          { id: 102, value: true, dataType: 2, timestamp: "2026-09-02T10:00:00.000Z" },
          { id: 120, value: "7.5", dataType: 3, timestamp: "2026-09-02T10:00:00.000Z" },
          { id: 109, value: "3", dataType: 4, timestamp: "2026-09-02T10:00:00.000Z" },
        ]);

        loadAuthenticated((rest, out) => {
          out.on("input", (msg: any) => {
            try {
              expect(msg.status).toBe("ok");

              // Keyed by the OLD endpoint's field names, which is what saved flows
              // read. Values pinned literally, not derived from the fixture.
              expect(msg.payload.smartCharging.value).toBe(true);
              expect(msg.payload.totalPower.value).toBe(7.5);
              expect(msg.payload.chargerOpMode.value).toBe(3);

              // parseObservation still resolves the table's own name and id.
              expect(msg.payload.smartCharging.dataName).toBe("SmartCharging");
              expect(msg.payload.totalPower.observationId).toBe(120);
              expect(msg.payload.totalPower.dataTypeName).toBe("Double");

              // The numeric ids the transport uses must not leak into the payload.
              expect(msg.payload["102"]).toBeUndefined();
              resolve();
            } catch (error) {
              reject(error);
            }
          });
          rest.receive({ topic: "charger_state" });
        });
      }),
    15000,
  );

  it(
    "coerces by the table's dataType, so a Double arrives as a number",
    () =>
      new Promise<void>((resolve, reject) => {
        globalThis.fetch = mockObservations([
          { id: 121, value: "12.25", dataType: 3, timestamp: "2026-09-02T10:00:00.000Z" },
        ]);

        loadAuthenticated((rest, out) => {
          out.on("input", (msg: any) => {
            try {
              expect(msg.payload.sessionEnergy.value).toBe(12.25);
              expect(typeof msg.payload.sessionEnergy.value).toBe("number");
              expect(msg.payload.sessionEnergy.origValue).toBe("12.25");
              resolve();
            } catch (error) {
              reject(error);
            }
          });
          rest.receive({ topic: "charger_state" });
        });
      }),
    15000,
  );

  it(
    "omits an observation the charger did not report rather than emitting null",
    () =>
      new Promise<void>((resolve, reject) => {
        globalThis.fetch = mockObservations([
          { id: 102, value: false, dataType: 2, timestamp: "2026-09-02T10:00:00.000Z" },
        ]);

        loadAuthenticated((rest, out) => {
          out.on("input", (msg: any) => {
            try {
              expect(msg.payload.smartCharging).toBeDefined();
              expect("totalPower" in msg.payload).toBe(false);
              expect(Object.keys(msg.payload)).toEqual(["smartCharging"]);
              resolve();
            } catch (error) {
              reject(error);
            }
          });
          rest.receive({ topic: "charger_state" });
        });
      }),
    15000,
  );

  it(
    "fails the call when the response has no observations array",
    () =>
      new Promise<void>((resolve, reject) => {
        globalThis.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: { get: () => "application/json" },
          text: () => Promise.resolve(JSON.stringify({ somethingElse: true })),
        });

        loadAuthenticated((rest, out, config) => {
          const errors: string[] = [];
          rest.error = (message: string) => errors.push(message);
          out.on("input", () => {
            reject(new Error("should not have emitted a successful payload"));
          });
          rest.receive({ topic: "charger_state" });

          setTimeout(() => {
            try {
              expect(errors).toContain("charger_state failed");
              expect(config.accessToken).toBe("test-access-token");
              resolve();
            } catch (error) {
              reject(error);
            }
          }, 300);
        });
      }),
    15000,
  );
});

describe("doAuthRestCall absolute-URL handling", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    // tests/setup.ts installs fake timers globally; this path awaits a real
    // 50ms status delay inside the node, so it needs real ones.
    vi.useRealTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    helper.unload();
  });

  it(
    "uses an absolute URL verbatim and still prefixes a bare path",
    () =>
      new Promise<void>((resolve, reject) => {
        globalThis.fetch = mockObservations([]);

        loadAuthenticated(async (_rest, _out, config) => {
          try {
            fetchMock().mockClear();

            await config.doAuthRestCall("https://api.easee.com/state/EH000000/observations?ids=102");
            expect(fetchMock().mock.calls[0][0]).toBe("https://api.easee.com/state/EH000000/observations?ids=102");

            await config.doAuthRestCall("/chargers/EH000000/config");
            expect(fetchMock().mock.calls[1][0]).toBe("https://api.easee.com/api/chargers/EH000000/config");

            resolve();
          } catch (error) {
            reject(error);
          }
        });
      }),
    15000,
  );
});
