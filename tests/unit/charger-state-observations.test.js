/**
 * Tests for the charger_state topic after Easee sunset
 * GET /api/chargers/{id}/state on 2026-09-01 (EASEE-13).
 *
 * These drive the real easee-rest-client node through node-red-node-test-helper
 * with global.fetch mocked, so the whole path is exercised: node input ->
 * genericCall -> doAuthRestCall -> fetch -> re-keying -> node.send.
 */

const { URL } = require("url");
const helper = require("node-red-node-test-helper");
const restClientNode = require("../../easee-client/easee-rest-client.js");
const configNode = require("../../easee-client/easee-configuration.js");

helper.init(require.resolve("node-red"));

const CHARGER = "EH000000";

const flow = [
  {
    id: "config1",
    type: "easee-configuration",
    name: "Test Config",
    username: "test@example.com"
  },
  {
    id: "rest1",
    type: "easee-rest-client",
    name: "Test Rest",
    charger: CHARGER,
    configuration: "config1",
    wires: [["out1"]]
  },
  { id: "out1", type: "helper" }
];

const credentials = { config1: { password: "testpass" } };

/**
 * Load the flow and pre-authenticate the config node so ensureAuthentication()
 * short-circuits without touching the network.
 */
function loadAuthenticated(callback) {
  helper.load([configNode, restClientNode], flow, credentials, function() {
    const config = helper.getNode("config1");
    config.accessToken = "test-access-token";
    config.tokenExpires = new Date(Date.now() + 3600 * 1000);
    callback(helper.getNode("rest1"), helper.getNode("out1"), config);
  });
}

/** Build a fetch mock returning the given observations array. */
function mockObservations(observations) {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: () => "application/json" },
    text: () => Promise.resolve(JSON.stringify({ observations }))
  });
}

describe("charger_state via the observations endpoint", function() {
  let originalFetch;

  beforeEach(function() {
    originalFetch = global.fetch;
    // tests/setup.js installs fake timers globally; this path awaits a real
    // 50ms status delay inside the node, so it needs real ones.
    jest.useRealTimers();
  });

  afterEach(function(done) {
    global.fetch = originalFetch;
    helper.unload();
    done();
  });

  it("requests the observations endpoint and never the sunset /state path", function(done) {
    global.fetch = mockObservations([]);

    loadAuthenticated(function(rest) {
      rest.on("call:error", () => {});
      global.fetch.mockClear();
      rest.receive({ topic: "charger_state" });

      setTimeout(function() {
        try {
          expect(global.fetch).toHaveBeenCalledTimes(1);
          const requestedUrl = global.fetch.mock.calls[0][0];

          // The endpoint that replaced it, at its own base outside /api.
          // Asserted with startsWith, not toContain: a double-prefixed
          // "https://api.easee.com/api" + "https://api.easee.com/state/..."
          // still *contains* the right substring, so toContain alone passes
          // even when the absolute-URL handling is broken.
          expect(requestedUrl.startsWith(`https://api.easee.com/state/${CHARGER}/observations?ids=`)).toBe(true);

          // The sunset endpoint must not be requested again. Pinned literally:
          // this is the exact path that started returning 404.
          expect(requestedUrl).not.toContain(`/api/chargers/${CHARGER}/state`);
          done();
        } catch (error) {
          done(error);
        }
      }, 300);
    });
  }, 15000);

  it("asks for the 52 observation ids that reproduce the old state payload", function(done) {
    global.fetch = mockObservations([]);

    loadAuthenticated(function(rest) {
      rest.on("call:error", () => {});
      global.fetch.mockClear();
      rest.receive({ topic: "charger_state" });

      setTimeout(function() {
        try {
          const requestedUrl = global.fetch.mock.calls[0][0];
          const ids = new URL(requestedUrl).searchParams.get("ids").split(",").map(Number);

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
          done();
        } catch (error) {
          done(error);
        }
      }, 300);
    });
  }, 15000);

  it("re-keys the id-keyed response back to the old field names", function(done) {
    global.fetch = mockObservations([
      { id: 102, value: true, dataType: 2, timestamp: "2026-09-02T10:00:00.000Z" },
      { id: 120, value: "7.5", dataType: 3, timestamp: "2026-09-02T10:00:00.000Z" },
      { id: 109, value: "3", dataType: 4, timestamp: "2026-09-02T10:00:00.000Z" }
    ]);

    loadAuthenticated(function(rest, out) {
      out.on("input", function(msg) {
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
          done();
        } catch (error) {
          done(error);
        }
      });
      rest.receive({ topic: "charger_state" });
    });
  }, 15000);

  it("coerces by the table's dataType, so a Double arrives as a number", function(done) {
    global.fetch = mockObservations([
      { id: 121, value: "12.25", dataType: 3, timestamp: "2026-09-02T10:00:00.000Z" }
    ]);

    loadAuthenticated(function(rest, out) {
      out.on("input", function(msg) {
        try {
          expect(msg.payload.sessionEnergy.value).toBe(12.25);
          expect(typeof msg.payload.sessionEnergy.value).toBe("number");
          expect(msg.payload.sessionEnergy.origValue).toBe("12.25");
          done();
        } catch (error) {
          done(error);
        }
      });
      rest.receive({ topic: "charger_state" });
    });
  }, 15000);

  it("omits an observation the charger did not report rather than emitting null", function(done) {
    global.fetch = mockObservations([
      { id: 102, value: false, dataType: 2, timestamp: "2026-09-02T10:00:00.000Z" }
    ]);

    loadAuthenticated(function(rest, out) {
      out.on("input", function(msg) {
        try {
          expect(msg.payload.smartCharging).toBeDefined();
          expect("totalPower" in msg.payload).toBe(false);
          expect(Object.keys(msg.payload)).toEqual(["smartCharging"]);
          done();
        } catch (error) {
          done(error);
        }
      });
      rest.receive({ topic: "charger_state" });
    });
  }, 15000);

  it("fails the call when the response has no observations array", function(done) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => "application/json" },
      text: () => Promise.resolve(JSON.stringify({ somethingElse: true }))
    });

    loadAuthenticated(function(rest, out, config) {
      const errors = [];
      rest.error = (message) => errors.push(message);
      out.on("input", function() {
        done(new Error("should not have emitted a successful payload"));
      });
      rest.receive({ topic: "charger_state" });

      setTimeout(function() {
        try {
          expect(errors).toContain("charger_state failed");
          expect(config.accessToken).toBe("test-access-token");
          done();
        } catch (error) {
          done(error);
        }
      }, 300);
    });
  }, 15000);
});

describe("doAuthRestCall absolute-URL handling", function() {
  let originalFetch;

  beforeEach(function() {
    originalFetch = global.fetch;
    // tests/setup.js installs fake timers globally; this path awaits a real
    // 50ms status delay inside the node, so it needs real ones.
    jest.useRealTimers();
  });

  afterEach(function(done) {
    global.fetch = originalFetch;
    helper.unload();
    done();
  });

  it("uses an absolute URL verbatim and still prefixes a bare path", function(done) {
    global.fetch = mockObservations([]);

    loadAuthenticated(async function(rest, out, config) {
      try {
        global.fetch.mockClear();

        await config.doAuthRestCall("https://api.easee.com/state/EH000000/observations?ids=102");
        expect(global.fetch.mock.calls[0][0]).toBe(
          "https://api.easee.com/state/EH000000/observations?ids=102"
        );

        await config.doAuthRestCall("/chargers/EH000000/config");
        expect(global.fetch.mock.calls[1][0]).toBe(
          "https://api.easee.com/api/chargers/EH000000/config"
        );

        done();
      } catch (error) {
        done(error);
      }
    });
  }, 15000);
});
