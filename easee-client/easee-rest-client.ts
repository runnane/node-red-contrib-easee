/**
 * MIT License
 *
 * Copyright (c) 2025 Jon Tungland
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * This project was initially forked from node-red-contrib-signalrcore
 * by Scott Page (Apache License 2.0).
 **/
import type { Node, NodeAPI, NodeDef, NodeMessageInFlow } from "node-red";
import type { EaseeConfigurationNode, LogFn, ObservationData } from "./types";

/** The rest client's saved flow properties (the `defaults` block in the .html). */
interface EaseeRestClientDef extends NodeDef {
  charger?: string;
  site?: string;
  circuit?: string;
  configuration: string;
}

/** The fields of an incoming message this node reads. */
interface RestClientMessage extends NodeMessageInFlow {
  charger?: string;
  site?: string;
  circuit?: string;
  command?: string;
  payload?: {
    method?: string;
    path?: string;
    body?: unknown;
    site_id?: string;
    circuit_id?: string;
    dynamicChargerCurrent?: unknown;
    maxCircuitCurrentP1?: unknown;
    maxCircuitCurrentP2?: unknown;
    maxCircuitCurrentP3?: unknown;
    [key: string]: unknown;
  };
}

interface RawObservation {
  id: number;
  value: unknown;
  timestamp?: string;
}

interface EaseeRestClientNode extends Node {
  charger?: string;
  site?: string;
  circuit?: string;
  configurationNode: string;
  /** Typed non-null: the constructor returns before any use when it is missing. */
  connection: EaseeConfigurationNode;
  logInfo: LogFn;
  logDebug: LogFn;
  logError: LogFn;
  logWarn: LogFn;
  fail(url: string, method: string, error: unknown): boolean;
  ok(url: string, method: string, response: unknown): boolean;
  REQUEST(url: string, method?: string, body?: unknown): Promise<boolean>;
  GET(url: string): Promise<boolean>;
  POST(url: string, body?: unknown): Promise<boolean>;
}

// `export =` rather than `export default`: Node-RED require()s this file and needs
// module.exports to BE the factory. TypeScript emits this as `module.exports = ...`.
export = (RED: NodeAPI) => {
  /**
   * The fields the deprecated `GET /api/chargers/{id}/state` used to return,
   * mapped to the observation ids that carry the same value on
   * `GET /state/{serial}/observations?ids=...`, which replaced it when Easee
   * sunset `/state` on 2026-09-01.
   *
   * The keys are the *old* response's field names, deliberately: a user's flow
   * reads `msg.payload.smartCharging.value`, so the output stays keyed this way
   * even though the new endpoint is keyed by numeric id.
   *
   * Six of the old endpoint's 58 fields are absent and cannot be reproduced —
   * `connectedToCloud`, `fatalErrorCode`, `isOnline`, `voltage`, `latestPulse`
   * and `errors` were derived cloud-side rather than being device observations.
   * See README.md.
   */
  const CHARGER_STATE_OBSERVATIONS: Record<string, number> = {
    lockCablePermanently: 30,
    ledMode: 46,
    dynamicChargerCurrent: 48,
    offlineMaxCircuitCurrentP1: 50,
    offlineMaxCircuitCurrentP2: 51,
    offlineMaxCircuitCurrentP3: 52,
    wiFiAPEnabled: 68,
    circuitTotalAllocatedPhaseConductorCurrentL1: 70,
    circuitTotalAllocatedPhaseConductorCurrentL2: 71,
    circuitTotalAllocatedPhaseConductorCurrentL3: 72,
    circuitTotalPhaseConductorCurrentL1: 73,
    circuitTotalPhaseConductorCurrentL2: 74,
    circuitTotalPhaseConductorCurrentL3: 75,
    chargerFirmware: 80,
    reasonForNoCurrent: 96,
    smartCharging: 102,
    cableLocked: 103,
    cableRating: 104,
    chargerOpMode: 109,
    outputPhase: 110,
    dynamicCircuitCurrentP1: 111,
    dynamicCircuitCurrentP2: 112,
    dynamicCircuitCurrentP3: 113,
    outputCurrent: 114,
    deratedCurrent: 115,
    deratingActive: 116,
    errorCode: 119,
    totalPower: 120,
    sessionEnergy: 121,
    energyPerHour: 122,
    lifetimeEnergy: 124,
    cellRSSI: 130,
    wiFiRSSI: 132,
    localRSSI: 136,
    chargerRAT: 141,
    inCurrentT2: 182,
    inCurrentT3: 183,
    inCurrentT4: 184,
    inCurrentT5: 185,
    inVoltageT1T2: 190,
    inVoltageT1T3: 191,
    inVoltageT1T4: 192,
    inVoltageT1T5: 193,
    inVoltageT2T3: 194,
    inVoltageT2T4: 195,
    inVoltageT2T5: 196,
    inVoltageT3T4: 197,
    inVoltageT3T5: 198,
    inVoltageT4T5: 199,
    eqAvailableCurrentP1: 230,
    eqAvailableCurrentP2: 231,
    eqAvailableCurrentP3: 232,
  };

  function EaseeRestClient(this: EaseeRestClientNode, n: EaseeRestClientDef) {
    RED.nodes.createNode(this, n);
    // biome-ignore lint/complexity/noUselessThisAlias: `node` is the Node-RED idiom, captured by every helper below
    const node = this;
    node.charger = n.charger;
    node.site = n.site;
    node.circuit = n.circuit;
    node.configurationNode = n.configuration;
    node.connection = RED.nodes.getNode(node.configurationNode) as EaseeConfigurationNode;

    // Use configuration node's logging if available, fallback to console
    node.logInfo =
      node.connection?.logInfo ||
      ((msg: string, data?: unknown) => {
        console.log(`[easee] ${msg}`, data || "");
      });
    node.logDebug =
      node.connection?.logDebug ||
      ((msg: string, data?: unknown) => {
        if (node.connection?.debugLogging) {
          console.log(`[easee] DEBUG: ${msg}`, data || "");
        }
      });
    node.logError =
      node.connection?.logError ||
      ((msg: string, error?: unknown) => {
        console.error(`[easee] ERROR: ${msg}`, error || "");
      });
    node.logWarn =
      node.connection?.logWarn ||
      ((msg: string, data?: unknown) => {
        console.warn(`[easee] WARN: ${msg}`, data || "");
      });

    if (!node.connection) {
      node.error("[easee] Missing easee configuration node");
      node.status({
        fill: "red",
        shape: "ring",
        text: "Missing configuration",
      });
      return;
    }

    // Check if the configuration node has valid credentials
    if (!node.connection.isConfigurationValid?.()) {
      node.error("[easee] Configuration node is invalid - missing username or password");
      node.status({
        fill: "red",
        shape: "ring",
        text: "Invalid configuration - missing credentials",
      });
      return;
    }

    /**
     * Helper func for sending sailure
     * @param string url
     * @param {string} method
     * @param {*} error
     */
    node.fail = (url, method, error) => {
      node.logError("Error in easee-rest-client:", error);
      node.status({
        fill: "red",
        shape: "dot",
        text: `${method}: failed`,
      });
      node.send({
        status: "error",
        topic: `${method}: failed`,
        payload: null,
        error: error,
        url: url,
      });
      return true;
    };

    /**
     * Helper func for sending success
     * @param {string} url
     * @param {string} method
     * @param {*} response
     */
    node.ok = (url, method, response) => {
      node.status({
        fill: "green",
        shape: "dot",
        text: `${method}: ok`,
      });
      node.send({
        status: "ok",
        topic: url,
        payload: response,
      });
      return true;
    };

    /**
     * Wrapper for easee-configuration.genericCall()
     *
     * @param {*} url
     * @param {*} method
     * @param {*} body
     * @returns
     */
    node.REQUEST = async (url, method = "GET", body = null) => {
      // Status: Sending the request
      node.status({
        fill: "yellow",
        shape: "ring",
        text: `${method}: Sending...`,
      });

      // Small delay to ensure "Sending..." status is visible
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Status: Waiting for reply
      node.status({
        fill: "yellow",
        shape: "dot",
        text: `${method}: Waiting for reply...`,
      });

      return node.connection
        .genericCall(url, method, body)
        .then((response) => {
          // Status: Processing the response
          node.status({
            fill: "blue",
            shape: "dot",
            text: `${method}: Processing...`,
          });
          return node.ok(url, method, response);
        })
        .catch((error) => {
          return node.fail(url, method, error);
        });
    };

    /**
     * REST API GET helper command
     * @param {*} url
     * @returns
     */
    node.GET = (url) => {
      return node.REQUEST(url, "GET");
    };

    /**
     * REST API POST COMMAND (wrapper)
     *
     * @param {string} url
     * @param {*} body
     * @returns
     */
    node.POST = (url, body = {}) => {
      return node.REQUEST(url, "POST", body);
    };

    /**
     * On incoming nodered message
     */
    node.on("input", async (inputMsg, _send, done) => {
      const msg = inputMsg as RestClientMessage;

      // Status: Preparing the query
      node.status({
        fill: "blue",
        shape: "ring",
        text: "Preparing query...",
      });

      node.charger = msg?.charger ?? n.charger;
      node.site = msg?.site ?? msg?.payload?.site_id ?? n.site;
      node.circuit = msg?.circuit ?? msg?.payload?.circuit_id ?? n.circuit;

      let method = "GET";
      let path = "";
      let body: unknown;
      let url = "";

      if (msg?.payload?.method) {
        method = msg.payload.method.toUpperCase();
      } else if (msg?.payload?.body) {
        method = "POST";
      }

      if (msg?.payload?.path) {
        path = msg.payload.path;
      } else if (msg?.command) {
        path = msg.command;
      }

      if (msg?.payload?.body) {
        body = msg.payload.body;
      }

      // `method` comes from the message, so this is a lookup of an arbitrary name
      // on the node — GET and POST are the ones meant to be reached.
      const handler = (node as unknown as Record<string, unknown>)[method];
      if (handler === undefined) {
        return node.fail("error", "POST", `Invalid HTTP method: ${method}`);
      }

      if (path && method) {
        // Run full path as defined by node-red parameters
        await (handler as (url: string, body?: unknown) => Promise<boolean>).call(node, path, body);
      } else if (msg?.topic) {
        // Run command as defined by topic
        try {
          switch (msg.topic) {
            case "login":
              // Status: Sending authentication request
              node.status({
                fill: "yellow",
                shape: "ring",
                text: "POST: Sending...",
              });

              await node.connection
                .ensureAuthentication()
                .then((isAuthenticated) => {
                  // Status: Processing authentication result
                  node.status({
                    fill: "blue",
                    shape: "dot",
                    text: "POST: Processing...",
                  });
                  if (isAuthenticated) {
                    return node.ok("/accounts/login/", "POST", { success: true, message: "Authentication verified" });
                  } else {
                    return node.fail("/accounts/login/", "POST", new Error("Authentication failed"));
                  }
                })
                .catch((error) => {
                  return node.fail("/accounts/login/", "POST", error);
                });
              break;
            case "refresh_token":
              // Status: Sending token refresh request
              node.status({
                fill: "yellow",
                shape: "ring",
                text: "POST: Sending...",
              });

              await node.connection
                .doRefreshToken()
                .then((json) => {
                  // Status: Processing token refresh result
                  node.status({
                    fill: "blue",
                    shape: "dot",
                    text: "POST: Processing...",
                  });
                  return node.ok("/accounts/refresh_token/", "POST", json);
                })
                .catch((error) => {
                  return node.fail("/accounts/refresh_token/", "POST", error);
                });

              break;
            case "dynamic_current":
              if (!node.site) {
                node.error(
                  `dynamic_current failed: site missing. Provide site in msg.site, msg.payload.site_id, or node configuration. Current values: msg.site=${msg?.site}, msg.payload.site_id=${msg?.payload?.site_id}, node.site=${n.site}`,
                );
                return;
              } else if (!node.circuit) {
                node.error(
                  `dynamic_current failed: circuit missing. Provide circuit in msg.circuit, msg.payload.circuit_id, or node configuration. Current values: msg.circuit=${msg?.circuit}, msg.payload.circuit_id=${msg?.payload?.circuit_id}, node.circuit=${n.circuit}`,
                );
                return;
              } else if (
                typeof msg.payload === "object" &&
                (msg.payload.dynamicChargerCurrent !== undefined ||
                  msg.payload.maxCircuitCurrentP1 !== undefined ||
                  msg.payload.maxCircuitCurrentP2 !== undefined ||
                  msg.payload.maxCircuitCurrentP3 !== undefined)
              ) {
                // Do POST update of circuit - filter out site_id and circuit_id from payload for the API call
                const apiPayload = { ...msg.payload };
                delete apiPayload.site_id;
                delete apiPayload.circuit_id;
                await node.POST(`/sites/${node.site}/circuits/${node.circuit}/dynamicCurrent`, apiPayload);
              } else {
                // GET circuit information
                await node.GET(`/sites/${node.site}/circuits/${node.circuit}/dynamicCurrent`);
              }
              break;

            case "charger":
              await node.GET(`/chargers/${node.charger}?alwaysGetChargerAccessLevel=true`);
              break;

            case "charger_details":
              await node.GET(`/chargers/${node.charger}/details`);
              break;

            case "charger_site":
              await node.GET(`/chargers/${node.charger}/site`);
              break;

            case "charger_config":
              await node.GET(`/chargers/${node.charger}/config`);
              break;

            case "charger_session_latest":
              await node.GET(`/chargers/${node.charger}/sessions/latest`);
              break;

            case "charger_session_ongoing":
              await node.GET(`/chargers/${node.charger}/sessions/ongoing`);
              break;

            case "start_charging":
            case "stop_charging":
            case "pause_charging":
            case "resume_charging":
            case "toggle_charging":
            case "reboot":
              await node.POST(`/chargers/${node.charger}/commands/${msg.topic}`);
              break;

            case "charger_state": {
              // Easee sunset GET /api/chargers/{charger}/state on 2026-09-01;
              // it now 404s. The observations endpoint replaces it and lives
              // outside /api, so this is an absolute URL — doAuthRestCall()
              // uses one verbatim.
              const observationIds = Object.values(CHARGER_STATE_OBSERVATIONS);
              url = `${node.connection.StateApipath}/${node.charger}/observations?ids=${observationIds.join(",")}`;

              // Status: Sending charger state request
              node.status({
                fill: "yellow",
                shape: "ring",
                text: "GET: Sending...",
              });

              // Small delay to ensure "Sending..." status is visible
              await new Promise((resolve) => setTimeout(resolve, 50));

              try {
                // Status: Waiting for reply
                node.status({
                  fill: "yellow",
                  shape: "dot",
                  text: "GET: Waiting for reply...",
                });

                const json = await node.connection.genericCall(url);

                // Status: Processing charger state response
                node.status({
                  fill: "blue",
                  shape: "dot",
                  text: "GET: Processing...",
                });

                if (
                  typeof json !== "object" ||
                  json === null ||
                  !Array.isArray((json as { observations?: unknown }).observations)
                ) {
                  node.error("charger_state failed");
                } else {
                  // The endpoint returns a flat array keyed by observation id.
                  // Re-key it by the field names the old /state endpoint used,
                  // so existing flows keep reading msg.payload.<fieldName>.
                  const observations = (json as { observations: RawObservation[] }).observations;
                  const byId = new Map(observations.map((observation) => [observation.id, observation] as const));
                  const state: Record<string, ObservationData> = {};
                  Object.keys(CHARGER_STATE_OBSERVATIONS).forEach((fieldName) => {
                    const observation = byId.get(CHARGER_STATE_OBSERVATIONS[fieldName]);
                    if (observation === undefined) {
                      // The charger did not report this one; omit it rather
                      // than inventing a null the old endpoint never sent.
                      return;
                    }
                    state[fieldName] = node.connection.parseObservation(
                      {
                        // parseObservation overwrites dataName with the
                        // observation table's own name on a match, as it did
                        // before; this is the fallback for an id the table
                        // does not carry.
                        dataName: fieldName,
                        id: observation.id,
                        value: observation.value,
                        origValue: observation.value,
                        timestamp: observation.timestamp,
                      },
                      "id",
                    );
                  });
                  return node.ok(url, "GET", state);
                }
              } catch (error) {
                return node.fail(url, "GET", error);
              }
              break;
            }

            default:
              return node.fail("error", "GET", `Unknown topic ${msg.topic}`);
          }
        } catch (error) {
          return node.fail("REST client command failed", "GET", error);
        }
      } else {
        // Missing topic
        return node.fail("error", "GET", `Missing required payload.path or topic`);
      }
      if (done) {
        done();
      }
    });
  }

  RED.nodes.registerType("easee-rest-client", EaseeRestClient);
};
