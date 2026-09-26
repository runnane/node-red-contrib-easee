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
import {
  categorizedError,
  type DescribeOptions,
  incompleteConfigurationError,
  missingConfigurationError,
  redactSecrets,
  reportError,
} from "./errors";
import { createFallbackLogHelpers } from "./logging";
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
  /**
   * Report a failed request (EASEE-26): node.error() with the input `msg`, so a
   * Catch node sees it, a status naming the kind of failure, and the unchanged
   * `status: "error"` output message.
   */
  fail(url: string, method: string, error: unknown, msg?: object, describe?: FailDescription): boolean;
  ok(url: string, method: string, response: unknown): boolean;
  REQUEST(url: string, method?: string, body?: unknown, msg?: object): Promise<boolean>;
  GET(url: string, msg?: object): Promise<boolean>;
  POST(url: string, body?: unknown, msg?: object): Promise<boolean>;
}

/** How fail() should describe an error that is a plain string (kept a string for the output msg). */
type FailDescription = Pick<DescribeOptions, "category" | "statusText" | "hint">;

/** The topic that sets the configuration node's credentials at runtime (EASEE-34). */
const UPDATE_CREDENTIALS_TOPIC = "update_credentials";

/** The text of an error, for the output msg of `update_credentials` (redacted by the caller). */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Where to set the charger, for the "no charger id" error. */
const CHARGER_HINT = "Set Charger in this node, or send msg.charger.";

/**
 * Charger serials are account identifiers; redact one from messages when it is
 * long enough that redacting it cannot eat unrelated text (a status code, say).
 */
const MIN_REDACTED_ID_LENGTH = 6;

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

    // Use the configuration node's logging if available, else this node's own
    // Node-RED logger (never console directly, EASEE-29).
    const fallbackLog = createFallbackLogHelpers(node, () => Boolean(node.connection?.debugLogging));
    node.logInfo = node.connection?.logInfo || fallbackLog.logInfo;
    node.logDebug = node.connection?.logDebug || fallbackLog.logDebug;
    node.logError = node.connection?.logError || fallbackLog.logError;
    node.logWarn = node.connection?.logWarn || fallbackLog.logWarn;

    if (!node.connection) {
      reportError(node, "Cannot start", missingConfigurationError());
      return;
    }

    // Check if the configuration node has valid credentials. Reported, but the
    // node still listens: an `update_credentials` message can supply them at
    // runtime (EASEE-34). Every other topic is refused until then.
    if (!node.connection.isConfigurationValid?.()) {
      reportError(node, "Cannot start", incompleteConfigurationError());
    }

    /** Never in a message or status: the config node's secrets, and the charger serial. */
    const secrets = (): unknown[] => [
      ...(node.connection.secrets?.() ?? []),
      typeof node.charger === "string" && node.charger.length >= MIN_REDACTED_ID_LENGTH ? node.charger : null,
    ];

    /**
     * Helper func for sending failure. The output message is unchanged
     * (`error` is whatever was thrown, as before); what changed is the
     * node.error() + status, which now say what failed and what to do, and
     * carry the input msg (EASEE-26).
     */
    node.fail = (url, method, error, msg, describe) => {
      reportError(node, `${method} request failed`, error, { msg, secrets: secrets(), ...describe });
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
    node.REQUEST = async (url, method = "GET", body = null, msg = undefined) => {
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
          return node.fail(url, method, error, msg);
        });
    };

    /**
     * REST API GET helper command
     * @param {*} url
     * @param {object} msg the input message, for error reporting
     */
    node.GET = (url, msg) => {
      return node.REQUEST(url, "GET", null, msg);
    };

    /**
     * REST API POST COMMAND (wrapper)
     *
     * @param {string} url
     * @param {*} body
     * @param {object} msg the input message, for error reporting
     */
    node.POST = (url, body = {}, msg = undefined) => {
      return node.REQUEST(url, "POST", body, msg);
    };

    /** A charger-scoped topic with no charger id: say so, rather than asking Easee for /chargers/undefined. */
    const failWithoutCharger = (method: string, msg: RestClientMessage): boolean => {
      if (node.charger) {
        return false;
      }
      node.fail(
        "error",
        method,
        categorizedError("No charger id", "config", { statusText: "No charger id", hint: CHARGER_HINT }),
        msg,
      );
      return true;
    };

    /**
     * The `update_credentials` topic (EASEE-34): hand msg.payload's username
     * and/or password to the configuration node, which logs in with them and
     * keeps them (in memory) only if Easee accepts them.
     *
     * The input message carries the password, so it is never passed on as it
     * stands: the output is a new message, and the copy handed to node.error()
     * (and so to a Catch node) has both fields removed from its payload.
     */
    const updateCredentials = async (msg: RestClientMessage): Promise<boolean> => {
      const payload = msg.payload;
      let safeMsg: object = msg;
      if (payload !== null && typeof payload === "object") {
        const { username: _username, password: _password, ...rest } = payload;
        safeMsg = { ...msg, payload: rest };
      }

      // Belt and braces: the values this message carries, whatever became of them.
      const offered = payload !== null && typeof payload === "object" ? [payload.username, payload.password] : [];
      const fail = (error: unknown): boolean => {
        const all = [...secrets(), ...offered];
        reportError(node, "Credential update failed", error, { msg: safeMsg, secrets: all });
        node.send({
          status: "error",
          topic: UPDATE_CREDENTIALS_TOPIC,
          payload: null,
          error: redactSecrets(errorMessage(error), all),
        });
        return true;
      };

      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
        return fail(
          categorizedError("msg.payload must be an object with username and/or password", "input", {
            statusText: "Invalid credentials message",
            hint: "Send msg.payload { username, password }; either may be left out, not both.",
          }),
        );
      }

      node.status({ fill: "yellow", shape: "ring", text: "Updating credentials..." });
      try {
        const changed = await node.connection.updateCredentials({
          username: payload.username as string | undefined,
          password: payload.password as string | undefined,
        });
        node.status({ fill: "green", shape: "dot", text: "Credentials updated" });
        node.send({
          status: "ok",
          topic: UPDATE_CREDENTIALS_TOPIC,
          payload: { success: true, message: "Credentials updated and logged in", changed },
        });
        return true;
      } catch (error) {
        return fail(error);
      }
    };

    /**
     * On incoming nodered message. done() is called on every path, including
     * the error ones that used to return before reaching it (EASEE-26).
     */
    node.on("input", async (inputMsg, _send, done) => {
      await handleInput(inputMsg as RestClientMessage);
      if (done) {
        done();
      }
    });

    const handleInput = async (msg: RestClientMessage): Promise<unknown> => {
      if (msg?.topic === UPDATE_CREDENTIALS_TOPIC) {
        return updateCredentials(msg);
      }
      if (!node.connection.isConfigurationValid?.()) {
        reportError(node, "Cannot send request", incompleteConfigurationError(), { msg });
        return undefined;
      }

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

      // `method` comes from the message. It used to be looked up as a property
      // of the node, which let any method name reach any node function (`ok`,
      // `fail`…); only GET and POST were ever meant to (EASEE-26). The output
      // msg.error stays the plain string it always was.
      if (method !== "GET" && method !== "POST") {
        return node.fail("error", "POST", `Invalid HTTP method: ${method}`, msg, {
          category: "input",
          statusText: "Invalid HTTP method",
          hint: "Use GET or POST in msg.payload.method.",
        });
      }

      if (path && method) {
        // Run full path as defined by node-red parameters
        if (method === "GET") {
          await node.GET(path, msg);
        } else {
          await node.POST(path, body, msg);
        }
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
                    // Same message as ever (it reaches msg.error), now tagged
                    // with why the login failed (EASEE-26).
                    return node.fail(
                      "/accounts/login/",
                      "POST",
                      categorizedError("Authentication failed", node.connection.authFailureCategory?.() ?? "unknown"),
                      msg,
                    );
                  }
                })
                .catch((error) => {
                  return node.fail("/accounts/login/", "POST", error, msg);
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
                .then(async (json) => {
                  // undefined: no tokens to refresh — doRefreshToken() no longer
                  // logs in on its own (EASEE-39). This command explicitly asked
                  // to authenticate, so do the login it used to do implicitly.
                  if (json === undefined) {
                    json = await node.connection.doLogin();
                  }

                  // Status: Processing token refresh result
                  node.status({
                    fill: "blue",
                    shape: "dot",
                    text: "POST: Processing...",
                  });
                  return node.ok("/accounts/refresh_token/", "POST", json);
                })
                .catch((error) => {
                  return node.fail("/accounts/refresh_token/", "POST", error, msg);
                });

              break;
            case "dynamic_current":
              // No output message on these two, as before; the error now
              // carries the msg, and no longer echoes the ids it was given
              // (account identifiers) back into the log (EASEE-26).
              if (!node.site) {
                reportError(
                  node,
                  "dynamic_current failed",
                  categorizedError("site missing", "config", {
                    statusText: "No site id",
                    hint: "Set Site in this node, or send msg.site or msg.payload.site_id.",
                  }),
                  { msg },
                );
                return;
              } else if (!node.circuit) {
                reportError(
                  node,
                  "dynamic_current failed",
                  categorizedError("circuit missing", "config", {
                    statusText: "No circuit id",
                    hint: "Set Circuit in this node, or send msg.circuit or msg.payload.circuit_id.",
                  }),
                  { msg },
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
                await node.POST(`/sites/${node.site}/circuits/${node.circuit}/dynamicCurrent`, apiPayload, msg);
              } else {
                // GET circuit information
                await node.GET(`/sites/${node.site}/circuits/${node.circuit}/dynamicCurrent`, msg);
              }
              break;

            case "charger":
              if (!failWithoutCharger("GET", msg)) {
                await node.GET(`/chargers/${node.charger}?alwaysGetChargerAccessLevel=true`, msg);
              }
              break;

            case "charger_details":
              if (!failWithoutCharger("GET", msg)) {
                await node.GET(`/chargers/${node.charger}/details`, msg);
              }
              break;

            case "charger_site":
              if (!failWithoutCharger("GET", msg)) {
                await node.GET(`/chargers/${node.charger}/site`, msg);
              }
              break;

            case "charger_config":
              if (!failWithoutCharger("GET", msg)) {
                await node.GET(`/chargers/${node.charger}/config`, msg);
              }
              break;

            case "charger_session_latest":
              if (!failWithoutCharger("GET", msg)) {
                await node.GET(`/chargers/${node.charger}/sessions/latest`, msg);
              }
              break;

            case "charger_session_ongoing":
              if (!failWithoutCharger("GET", msg)) {
                await node.GET(`/chargers/${node.charger}/sessions/ongoing`, msg);
              }
              break;

            case "start_charging":
            case "stop_charging":
            case "pause_charging":
            case "resume_charging":
            case "toggle_charging":
            case "reboot":
              if (!failWithoutCharger("POST", msg)) {
                await node.POST(`/chargers/${node.charger}/commands/${msg.topic}`, undefined, msg);
              }
              break;

            case "charger_state": {
              if (failWithoutCharger("GET", msg)) {
                break;
              }
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
                  // No output message here, as before; the error now says
                  // what was wrong and carries the msg (EASEE-26).
                  reportError(
                    node,
                    "charger_state failed",
                    categorizedError("Easee answered without an observations list", "api", {
                      statusText: "No charger state",
                      hint: "Check the charger id; the charger may be offline or not report its state.",
                    }),
                    { msg, secrets: secrets() },
                  );
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
                return node.fail(url, "GET", error, msg);
              }
              break;
            }

            default:
              return node.fail("error", "GET", `Unknown topic ${msg.topic}`, msg, {
                category: "input",
                statusText: "Unknown topic",
                hint: "See this node's help for the supported topics.",
              });
          }
        } catch (error) {
          return node.fail("REST client command failed", "GET", error, msg);
        }
      } else {
        // Missing topic
        return node.fail("error", "GET", `Missing required payload.path or topic`, msg, {
          category: "input",
          statusText: "No topic or path",
          hint: "Send msg.topic, or msg.payload.path with an optional method and body.",
        });
      }
      return undefined;
    };
  }

  RED.nodes.registerType("easee-rest-client", EaseeRestClient);
};
