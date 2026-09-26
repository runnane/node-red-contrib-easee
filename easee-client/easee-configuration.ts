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
import type { NodeAPI } from "node-red";
import type {
  ApiErrorBody,
  EaseeConfigurationDef,
  EaseeConfigurationNode,
  EaseeCredentials,
  ReloginResult,
  TokenResponse,
} from "./types";
import { buildUserAgent } from "./user-agent";

interface ObservationDefinition {
  observationId: number;
  name: string;
  dataType: number;
  valueUnit?: string;
  altName?: string;
  valueMapping?: (val: unknown) => string | undefined;
}

/**
 * Pull a human-readable message out of a failed REST response's parsed JSON body,
 * for doAuthRestCall() (EASEE-20). Mirrors what doLogin() / doRefreshToken() already
 * parse from the Easee API's problem-details shape (`title` / `detail` /
 * `errorCodeName`, modelled by ApiErrorBody) — the same fields
 * tests/fixtures/mockData.ts's loginErrors / refreshErrors already encode, and
 * doAuthRestCall's own callers had never seen because of the bug this fixes. No gate
 * can corroborate the shape against a live Easee response; this is the shape those
 * two call sites already believe.
 *
 * Falls back to a plain `message` field, then to null so the caller falls back to
 * the raw response body. A `null` or non-object JSON value must never reach here —
 * the caller is responsible for treating those as "not JSON".
 */
function extractApiErrorDetail(json: ApiErrorBody & { message?: string }): string | null {
  const { title, detail, errorCodeName } = json;
  if (title || detail || errorCodeName) {
    const label = title || errorCodeName || "Unknown error";
    return `${label}${detail ? ` - ${detail}` : ""}`;
  }
  if (typeof json.message === "string" && json.message) {
    return json.message;
  }
  return null;
}

// `export =` rather than `export default`: Node-RED require()s this file and needs
// module.exports to BE the factory. TypeScript emits this as `module.exports = ...`.
export = (RED: NodeAPI) => {
  // Computed once per runtime start (this factory function runs once), not per
  // node instance or per request — see EASEE-27.
  const userAgent = buildUserAgent(RED);

  function EaseeConfiguration(this: EaseeConfigurationNode, n: EaseeConfigurationDef) {
    RED.nodes.createNode(this, n);
    // biome-ignore lint/complexity/noUselessThisAlias: `node` is the Node-RED idiom, captured by every helper below
    const node = this;

    // Extract node properties
    node.username = n.username || "";

    // Debug logging configuration - set early for use in validation
    node.debugLogging = n.debugLogging || false;
    node.debugToNodeWarn = n.debugToNodeWarn || false;

    /**
     * Centralized logging helper functions following Node-RED standards
     * Define these early so they can be used in validation and throughout the node
     */

    // Log info level messages (equivalent to console.log)
    node.logInfo = (message: string, data: unknown = null) => {
      const formattedMessage = `[easee] ${message}`;

      // Always log to console
      if (data !== null && typeof data === "object") {
        console.log(formattedMessage, data);
      } else if (data !== null) {
        console.log(`${formattedMessage} ${data}`);
      } else {
        console.log(formattedMessage);
      }

      // Also log to node warn if configured
      if (node.debugToNodeWarn) {
        node.warn(data !== null ? `${formattedMessage} ${JSON.stringify(data)}` : formattedMessage);
      }
    };

    // Log debug level messages (only when debug logging is enabled)
    node.logDebug = (message: string, data: unknown = null) => {
      if (!node.debugLogging) {
        return;
      }

      const formattedMessage = `[easee] DEBUG: ${message}`;

      // Log to console when debug is enabled
      if (data !== null && typeof data === "object") {
        console.log(formattedMessage, data);
      } else if (data !== null) {
        console.log(`${formattedMessage} ${data}`);
      } else {
        console.log(formattedMessage);
      }

      // Also log to node warn if configured
      if (node.debugToNodeWarn) {
        node.warn(data !== null ? `${formattedMessage} ${JSON.stringify(data)}` : formattedMessage);
      }
    };

    // Log error level messages (equivalent to console.error)
    node.logError = (message: string, error: unknown = null) => {
      const formattedMessage = `[easee] ERROR: ${message}`;

      // Always log errors to console
      if (error !== null) {
        console.error(formattedMessage, error);
      } else {
        console.error(formattedMessage);
      }

      // Also log to node error for Node-RED error handling
      if (error !== null) {
        node.error(`${formattedMessage} ${(error as { message?: unknown }).message || error}`);
      } else {
        node.error(formattedMessage);
      }
    };

    // Log warning level messages
    node.logWarn = (message: string, data: unknown = null) => {
      const formattedMessage = `[easee] WARN: ${message}`;

      // Log to console
      if (data !== null && typeof data === "object") {
        console.warn(formattedMessage, data);
      } else if (data !== null) {
        console.warn(`${formattedMessage} ${data}`);
      } else {
        console.warn(formattedMessage);
      }

      // Always log warnings to node warn
      node.warn(data !== null ? `${formattedMessage} ${JSON.stringify(data)}` : formattedMessage);
    };

    // Validate credentials are provided during node creation
    node.validateCredentials = () => {
      if (!node.username || node.username.trim() === "") {
        return { valid: false, message: "Username is required" };
      }

      if (!node.credentials) {
        return { valid: false, message: "No credentials object found" };
      }

      if (!node.credentials.password || node.credentials.password.trim() === "") {
        return { valid: false, message: "Password is required" };
      }

      return { valid: true, message: "Credentials are valid" };
    };

    // Check if this configuration node is ready for use by other nodes
    node.isConfigurationValid = () => {
      return node.validateCredentials().valid;
    };

    // Perform initial validation
    const validation = node.validateCredentials();
    if (!validation.valid) {
      node.logError(`Configuration node validation failed: ${validation.message}`);
      node.status({
        fill: "red",
        shape: "ring",
        text: "Invalid configuration - missing credentials",
      });
      node.error(
        `[easee] Configuration node is invalid: ${validation.message}. Please edit the configuration and provide both username and password.`,
      );
      node.warn(`[easee] This node will not function until valid credentials are provided.`);
      // Don't return or throw - let the node exist but be non-functional
    }

    node.signalRpath = "https://streams.easee.com/hubs/chargers";
    node.RestApipath = "https://api.easee.com/api";
    // The observations endpoint is NOT under /api — it is its own service at
    // https://api.easee.com/state/{serial}/observations. Callers reach it by
    // passing an absolute URL, which doAuthRestCall() uses verbatim.
    node.StateApipath = "https://api.easee.com/state";

    node.accessToken = false;
    node.refreshToken = false;
    node.tokenExpires = new Date();
    node.tokenIssuedAt = new Date();
    node.tokenLifetime = 0; // Token lifetime in seconds

    node.checkTokenHandler = null;
    node.refreshRetryCount = 0;
    node.maxRefreshRetries = 5;
    node.loginRetryCount = 0;
    node.maxLoginRetries = 5;
    node.transportRetryCount = 0;
    node.authenticationInProgress = false; // Prevent concurrent authentication attempts

    // Token renewal thresholds (best practices)
    node.RENEWAL_THRESHOLD_PERCENTAGE = 0.75; // Renew at 75% of lifetime
    node.MIN_BUFFER_TIME = 300; // Minimum 5 minutes buffer before expiration
    node.EARLY_RENEWAL_THRESHOLD = 600; // 10 minutes - for very short tokens

    /**
     * Stop running token refresh on closed
     */
    node.on("close", () => {
      if (node.checkTokenHandler) {
        clearTimeout(node.checkTokenHandler);
        node.checkTokenHandler = null;
      }
    });

    /**
     * Start running token refresh on start (event is emitted at end of constructor)
     */
    node.on("start", () => {
      node.checkToken().catch((error) => {
        node.logError("Error in checkToken during start:", error);
        node.status({
          fill: "red",
          shape: "ring",
          text: "Authentication error",
        });
      });
    });

    /**
     *
     * @param {string} url
     * @param {string} method
     * @param {*} body
     * @returns
     */
    node.genericCall = (url, method = "GET", body = null) => {
      return node.doAuthRestCall(url, method, null, body).then((response) => {
        return response;
      });
    };

    /**
     *
     * @param {*} url
     * @param {*} method
     * @param {*} headers
     * @param {*} body
     * @returns
     */
    node.doAuthRestCall = async (url, method = "GET", headers = null, body = null) => {
      // Ensure authentication is available before making the call
      const authAvailable = await node.ensureAuthentication();
      if (!authAvailable) {
        const error = new Error("Authentication not available");
        node.logError("Authentication not available for doAuthRestCall");
        node.status({
          fill: "red",
          shape: "ring",
          text: "Authentication failed",
        });
        throw error;
      }

      const requestHeaders = {
        "User-Agent": userAgent,
        ...headers,
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${node.accessToken}`,
      };
      const bodyPayload = body ? JSON.stringify(body) : null;

      // An absolute URL is used verbatim; a path is resolved against the /api
      // base. Needed because the observations endpoint lives outside /api.
      const requestUrl = /^https?:\/\//i.test(url) ? url : node.RestApipath + url;

      const response = await fetch(requestUrl, {
        method: method,
        headers: requestHeaders,
        body: bodyPayload,
      }).catch((error) => {
        node.logError("Critical error in doAuthRestCall() fetch, failing", error);
        node.error(error);
        return undefined;
      });

      if (response === undefined) {
        // fetch() rejected, and that is logged above. Before the TypeScript
        // conversion (EASEE-19) this fell through to `response.text()` and threw
        // "Cannot read properties of undefined (reading 'text')" instead.
        throw new Error("REST Command failed: the request did not complete");
      }

      const http_text = await response.text();
      let http_json: unknown = null;
      try {
        http_json = JSON.parse(http_text);
      } catch {
        // Ignore JSON parse errors - http_json will remain null
      }

      const http_status = response.status;
      const http_statusText = response.statusText;
      const is_ok = response.ok;
      const is_json = typeof http_json === "object";

      if (!is_ok) {
        // This used to try `is_json?.message` first — but is_json was a boolean, so
        // that branch never ran and every failure reported the raw body regardless
        // of shape. extractApiErrorDetail() is the fix (EASEE-20): it reads the same
        // problem-details fields doLogin()/doRefreshToken() already parse, with a
        // `message` fallback, and returns null (raw body stays the message) for a
        // `null` or non-JSON body.
        const errorDetail =
          is_json && http_json !== null
            ? extractApiErrorDetail(http_json as ApiErrorBody & { message?: string })
            : null;
        throw new Error(`REST Command failed (${http_status}: ${http_statusText}) ${errorDetail ?? http_text}`);
      }
      if (is_json && http_json !== null) {
        node.status({
          fill: "green",
          shape: "dot",
          text: url,
        });
        return http_json;
      } else {
        node.status({
          fill: "green",
          shape: "dot",
          text: url,
        });
        return {
          result: http_status,
          resultText: http_statusText,
        };
      }
    }; // node.doAuthRestCall()

    /**
     *
     * https://developer.easee.com/reference/get_api-resources-observation-properties
     *
     * @param {*} data
     * @param {*} mode
     * @returns
     */
    node.parseObservation = (data, mode = "id") => {
      const observations: ObservationDefinition[] = [
        {
          observationId: 15,
          name: "LocalPreAuthorizeEnabled",
          dataType: 2,
        },
        {
          observationId: 16,
          name: "LocalAuthorizeOfflineEnabled",
          dataType: 2,
        },
        {
          observationId: 17,
          name: "AllowOfflineTxForUnknownId",
          dataType: 2,
        },
        {
          observationId: 20,
          name: "SiteStructure",
          dataType: 6,
        },
        {
          observationId: 21,
          name: "DetectedPowerGridType",
          dataType: 4,
        },
        {
          observationId: 22,
          name: "CircuitMaxCurrentP1",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 23,
          name: "CircuitMaxCurrentP2",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 24,
          name: "CircuitMaxCurrentP3",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 25,
          name: "Location",
          dataType: 5,
        },
        {
          observationId: 26,
          name: "SiteIDString",
          dataType: 6,
        },
        {
          observationId: 27,
          name: "SiteIDNumeric",
          dataType: 4,
        },
        {
          observationId: 30,
          name: "LockCablePermanently",
          dataType: 2,
        },
        {
          observationId: 31,
          name: "IsEnabled",
          dataType: 2,
        },
        {
          observationId: 33,
          name: "CircuitSequenceNumber",
          dataType: 4,
        },
        {
          observationId: 34,
          name: "SinglePhaseNumber",
          dataType: 4,
        },
        {
          observationId: 35,
          name: "Enable3Phases_DEPRECATED",
          dataType: 2,
        },
        {
          observationId: 36,
          name: "WiFiSSID",
          dataType: 6,
        },
        {
          observationId: 37,
          name: "EnableIdleCurrent",
          dataType: 2,
        },
        {
          observationId: 38,
          name: "PhaseMode",
          dataType: 4,
          valueMapping: (val) => {
            // https://developer.easee.com/docs/enumerations#phasemode-38
            const modes: Record<string, string> = {
              0: "Ignore,no phase mode reported",
              1: "Locked to 1-phase",
              2: "Auto phase mode",
              3: "Locked to 3-phase",
            };
            return modes[val as string];
          },
        },
        {
          observationId: 40,
          name: "LedStripBrightness",
          dataType: 4,
        },
        {
          observationId: 41,
          name: "LocalAuthorizationRequired",
          dataType: 2,
        },
        {
          observationId: 42,
          name: "AuthorizationRequired",
          dataType: 2,
        },
        {
          observationId: 43,
          name: "RemoteStartRequired",
          dataType: 2,
        },
        {
          observationId: 44,
          name: "SmartButtonEnabled",
          dataType: 2,
        },
        {
          observationId: 45,
          name: "OfflineChargingMode",
          dataType: 4,
          valueMapping: (val) => {
            // https://developer.easee.com/docs/enumerations#offline-charging-mode-45
            const modes: Record<string, string> = {
              0: "Always allow charging if offline",
              1: "Only allow charging if token is whitelisted in the local token cache",
              2: "Never allow charging if offline",
            };
            return modes[val as string];
          },
        },
        {
          observationId: 46,
          name: "LEDMode",
          dataType: 4,
          valueMapping: (val) => {
            // https://developer.easee.com/docs/enumerations#led-mode-46
            const modes: Record<string, string> = {
              0: "Charger is disabled",

              1: "Charger is updating",
              2: "Charger is updating",
              3: "Charger is updating",
              4: "Charger is updating",
              5: "Charger is updating",
              6: "Charger is updating",
              7: "Charger is updating",
              8: "Charger is updating",
              9: "Charger is updating",
              10: "Charger is updating",
              11: "Charger is updating",
              12: "Charger is updating",
              13: "Charger is updating",
              14: "Charger is updating",
              15: "Charger is updating",

              16: "Charger is faulty",
              17: "Charger is faulty",

              18: "Standby Master",
              19: "Standby Secondary",
              20: "Secondary unit searching for master",
              21: "Smart mode (Not charging)",
              22: "Smart mode (Charging)",

              23: "Normal mode (Not charging)",
              24: "Normal mode (Charging)",
              25: "Waiting for authorization",
              26: "Verifying with backend",
              27: "Check configuration (Backplate chip defect)",
              29: "Pairing RFID Keys",
              43: "Self test mode",
              44: "Self test mode",
            };
            return modes[val as string];
          },
        },
        {
          observationId: 47,
          name: "MaxChargerCurrent",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 48,
          name: "DynamicChargerCurrent",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 50,
          name: "MaxCurrentOfflineFallback_P1",
          dataType: 4,
        },
        {
          observationId: 51,
          name: "MaxCurrentOfflineFallback_P2",
          dataType: 4,
        },
        {
          observationId: 52,
          name: "MaxCurrentOfflineFallback_P3",
          dataType: 4,
        },
        {
          observationId: 62,
          name: "ChargingSchedule",
          dataType: 6,
        },
        {
          observationId: 68,
          name: "WiFiAPEnabled",
          dataType: 2,
        },
        {
          observationId: 69,
          name: "PairedUserIDToken",
          dataType: 6,
        },
        {
          observationId: 70,
          name: "CircuitTotalAllocatedPhaseConductorCurrent_L1",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 71,
          name: "CircuitTotalAllocatedPhaseConductorCurrent_L2",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 72,
          name: "CircuitTotalAllocatedPhaseConductorCurrent_L3",
          dataType: 3,
        },
        {
          observationId: 73,
          name: "CircuitTotalPhaseConductorCurrent_L1",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 74,
          name: "CircuitTotalPhaseConductorCurrent_L2",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 75,
          name: "CircuitTotalPhaseConductorCurrent_L3",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 80,
          name: "SoftwareRelease",
          dataType: 4,
        },
        {
          observationId: 81,
          name: "ICCID",
          dataType: 6,
        },
        {
          observationId: 82,
          name: "ModemFwId",
          dataType: 6,
        },
        {
          observationId: 83,
          name: "OTAErrorCode",
          dataType: 4,
        },
        {
          observationId: 89,
          name: "RebootReason",
          dataType: 4,
          valueMapping: (val) => {
            // https://developer.easee.com/docs/enumerations#rebootreason-89
            const modes: Record<string, string> = {
              0: "FirewallReset",
              1: "OptionByteLoaderReset",
              2: "PinReset",
              3: "BOR",
              4: "SoftwareReset",
              5: "IndependentWindowWatchdogReset",
              6: "WindowWatchdogReset",
              7: "LowPowerReset",

              12: "Brownout",
              20: "Reboot",
            };
            return modes[val as string];
          },
        },
        {
          observationId: 90,
          name: "PowerPCBVersion",
          dataType: 4,
        },
        {
          observationId: 91,
          name: "ComPCBVersion",
          dataType: 4,
        },
        {
          observationId: 96,
          name: "ReasonForNoCurrent",
          dataType: 4,
          valueMapping: (val) => {
            // https://developer.easee.com/docs/enumerations#reasonfornocurrent-96
            const modes: Record<string, string> = {
              0: "Charger Fine - Charger is OK, use main charger status",

              1: "Loadbalancing - Max circuit current too low, adjust power circuit up.",
              2: "Loadbalancing - Max dynamic circuit current too low (Partner Loadbalancing)",
              3: "Loadbalancing - Max dynamic offline fallback circuit current too low",
              4: "Loadbalancing - Circuit fuse too low",
              5: "Loadbalancing - Waiting in queue",
              6: "Loadbalancing - Waiting in fully charged queue (Assumes a connected EV uses delated charging, EV Charging complete",

              7: "Error - illegal grid type (Error - Fault in automatic grid type detection)",
              8: "Error - primary unit has not received current request from secondary unit (car)",
              9: "Error - Master communication lost (Error)",
              10: "Error - No current from equalizer to low",
              11: "Error - No current, phase not connected",

              25: "Error - Current limited by circuit fuse",
              26: "Error - Current limited by circuit max current",
              27: "Error - Current limited by dynamic circuit current",
              28: "Error - Current limited by equalizer",
              29: "Error - Current limited by circuit load balancing",

              50: "Load balancing circuit - Secondary unit not requesting current (No car connected)",
              51: "Load balancing circuit - Max charger current too low",
              52: "Load balancing circuit - Max Dynamic charger current too low",

              53: "Informational - Charger disabled",

              54: "Waiting - Pending scheduled charging",
              55: "Waiting - Pending authorization",

              56: "Error - Charger in error state",
              57: "Error - Erratic EV",

              75: "Cable - Current limited by cable rating",
              76: "Schedule - Current limited by schedule",
              77: "Charger Limit - Current limited by charger max current",
              78: "Charger Limit - Current limited by dynamic charger current",
              79: "Car Limit - Current limited by car not charging",
              80: "??? - Current limited by local adjustment",
              81: "Car Limit - Current limited by car",

              100: "UndefinedError",
            };
            return modes[val as string];
          },
        },
        {
          observationId: 97,
          name: "LoadBalancingNumberOfConnectedChargers",
          dataType: 4,
        },
        {
          observationId: 98,
          name: "UDPNumOfConnectedNodes",
          dataType: 4,
        },
        {
          observationId: 99,
          name: "LocalConnection",
          dataType: 4,
        },
        {
          observationId: 100,
          name: "PilotMode",
          dataType: 6,
          valueMapping: (val) => {
            // https://developer.easee.com/docs/enumerations#pilotmode-100
            const modes: Record<string, string> = {
              A: "Car disconnected",
              B: "Car connected",
              C: "Car charging",
              D: "Car needs ventilation",
              F: "Fault detected (LED goes Red and charging stops)",
            };
            return modes[val as string];
          },
        },
        {
          observationId: 101,
          name: "CarConnected_DEPRECATED",
          dataType: 2,
        },
        {
          observationId: 102,
          name: "SmartCharging",
          dataType: 2,
        },
        {
          observationId: 103,
          name: "CableLocked",
          dataType: 2,
        },
        {
          observationId: 104,
          name: "CableRating",
          dataType: 3,
        },
        {
          observationId: 105,
          name: "PilotHigh",
          dataType: 3,
        },
        {
          observationId: 106,
          name: "PilotLow",
          dataType: 3,
        },
        {
          observationId: 107,
          name: "BackPlateID",
          dataType: 6,
        },
        {
          observationId: 108,
          name: "UserIDTokenReversed",
          dataType: 6,
        },
        {
          observationId: 109,
          name: "ChargerOpMode",
          dataType: 4,
          valueMapping: (val) => {
            // https://developer.easee.com/docs/enumerations#op-mode-109
            const modes: Record<string, string> = {
              0: "Offline - Offline.",
              1: "Disconnected - No car connected.",
              2: "AwaitingStart - Car connected, charger is waiting for EV or load balancing. SuspendedEVSE.",
              3: "Charging - 	Charging.",
              4: "Completed - Car has paused/stopped charging.",
              5: "Error - Error in charger.",
              6: "ReadyToCharge - Charger is waiting for car to take energy. SuspendedEV.",
              7: "Awaiting Authentication - Charger is waiting for authentication.",
              8: "De-authenticating - Charger is de-authenticating.",
            };
            return modes[val as string];
          },
        },
        {
          observationId: 110,
          name: "OutputPhase",
          dataType: 4,
          valueMapping: (val) => {
            // https://developer.easee.com/docs/enumerations#output-phase-110
            const modes: Record<string, string> = {
              0: "Unassigned",

              10: "1-phase (N+L1)",
              11: "1-phase (L1+L2)",
              12: "1-phase (N+L2)",
              13: "1-phase (L1+L3)",
              14: "1-phase (N+L3)",
              15: "1-phase (L2+L3)",

              20: "2-phases on TN (N+L1, N+L2)",
              21: "2-phases on TN (N+L2, N+L3)",
              22: "2-phases on IT (L1+L2, L2+L3)",

              30: "3-phases (N+L1, N+L2, N+L3)",
            };
            return modes[val as string];
          },
          /*
          public enum OutputPhaseType {
            UNASSIGNED = 0,
            // Unassigned

            P1_T2_T3_TN = 10,
            // 1-phase (N+L1)

            P1_T2_T3_IT = 11,
            // 1-phase (L1+L2)

            P1_T2_T4_TN = 12,
            // 1-phase (N+L2)

            P1_T2_T4_IT = 13,
            // 1-phase (L1+L3)

            P1_T2_T5_TN = 14,
            // 1-phase (N+L3)

            P1_T3_T4_IT = 15,
            // 1-phase (L2+L3)

            P2_T2_T3_T4_TN = 20,
            // 2-phases on TN (N+L1, N+L2)

            P2_T2_T4_T5_TN = 21,
            // 2-phases on TN (N+L2, N+L3)

            P2_T2_T3_T4_IT = 22,
            // 2-phases on IT (L1+L2, L2+L3)

            P3_T2_T3_T4_T5_TN = 30
            // 3-phases (N+L1, N+L2, N+L3)
          }
          */
        },
        {
          observationId: 111,
          name: "DynamicCircuitCurrentP1",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 112,
          name: "DynamicCircuitCurrentP2",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 113,
          name: "DynamicCircuitCurrentP3",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 114,
          name: "OutputCurrent",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 115,
          name: "DeratedCurrent",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 116,
          name: "DeratingActive",
          dataType: 2,
        },
        {
          observationId: 117,
          name: "DebugString",
          dataType: 6,
        },
        {
          observationId: 118,
          name: "ErrorString",
          dataType: 6,
        },
        {
          observationId: 119,
          name: "ErrorCode",
          dataType: 4,
        },
        {
          observationId: 120,
          name: "TotalPower",
          dataType: 3,
          valueUnit: "W",
        },
        {
          observationId: 121,
          name: "SessionEnergy",
          dataType: 3,
          valueUnit: "kWh",
        },
        {
          observationId: 122,
          name: "EnergyPerHour",
          dataType: 3,
          valueUnit: "kWh",
        },
        {
          observationId: 123,
          name: "LegacyEvStatus",
          dataType: 4,
        },
        {
          observationId: 124,
          name: "LifetimeEnergy",
          dataType: 3,
          valueUnit: "kWh",
        },
        {
          observationId: 125,
          name: "LifetimeRelaySwitches",
          dataType: 4,
        },
        {
          observationId: 126,
          name: "LifetimeHours",
          dataType: 4,
        },
        {
          observationId: 127,
          name: "DynamicCurrentOfflineFallback_DEPRICATED",
          dataType: 4,
        },
        {
          observationId: 128,
          name: "UserIDToken",
          dataType: 6,
        },
        {
          observationId: 129,
          name: "ChargingSession",
          dataType: 6,
        },
        {
          observationId: 130,
          name: "CellRSSI",
          dataType: 4,
        },
        {
          observationId: 131,
          name: "CellRAT",
          dataType: 4,
        },
        {
          observationId: 132,
          name: "WiFiRSSI",
          dataType: 4,
        },
        {
          observationId: 133,
          name: "CellAddress",
          dataType: 6,
        },
        {
          observationId: 134,
          name: "WiFiAddress",
          dataType: 6,
        },
        {
          observationId: 135,
          name: "WiFiType",
          dataType: 6,
        },
        {
          observationId: 136,
          name: "LocalRSSI",
          dataType: 4,
        },
        {
          observationId: 137,
          name: "MasterBackPlateID",
          dataType: 6,
        },
        {
          observationId: 138,
          name: "LocalTxPower",
          dataType: 4,
        },
        {
          observationId: 139,
          name: "LocalState",
          dataType: 6,
        },
        {
          observationId: 140,
          name: "FoundWiFi",
          dataType: 6,
        },
        {
          observationId: 141,
          name: "ChargerRAT",
          dataType: 4,
        },
        {
          observationId: 142,
          name: "CellularInterfaceErrorCount",
          dataType: 4,
        },
        {
          observationId: 143,
          name: "CellularInterfaceResetCount",
          dataType: 4,
        },
        {
          observationId: 144,
          name: "WifiInterfaceErrorCount",
          dataType: 4,
        },
        {
          observationId: 145,
          name: "WifiInterfaceResetCount",
          dataType: 4,
        },
        {
          observationId: 146,
          name: "LocalNodeType",
          dataType: 4,
        },
        {
          observationId: 147,
          name: "LocalRadioChannel",
          dataType: 4,
        },
        {
          observationId: 148,
          name: "LocalShortAddress",
          dataType: 4,
        },
        {
          observationId: 149,
          name: "LocalParentAddrOrNumOfNodes",
          dataType: 4,
        },
        {
          observationId: 150,
          name: "TempMax",
          dataType: 3,
          valueUnit: "°C",
        },
        {
          observationId: 151,
          name: "TempAmbientPowerBoard",
          dataType: 3,
          valueUnit: "°C",
        },
        {
          observationId: 152,
          name: "TempInputT2",
          dataType: 3,
          valueUnit: "°C",
        },
        {
          observationId: 153,
          name: "TempInputT3",
          dataType: 3,
          valueUnit: "°C",
        },
        {
          observationId: 154,
          name: "TempInputT4",
          dataType: 3,
          valueUnit: "°C",
        },
        {
          observationId: 155,
          name: "TempInputT5",
          dataType: 3,
          valueUnit: "°C",
        },
        {
          observationId: 160,
          name: "TempOutputN",
          dataType: 3,
          valueUnit: "°C",
        },
        {
          observationId: 161,
          name: "TempOutputL1",
          dataType: 3,
          valueUnit: "°C",
        },
        {
          observationId: 162,
          name: "TempOutputL2",
          dataType: 3,
          valueUnit: "°C",
        },
        {
          observationId: 163,
          name: "TempOutputL3",
          dataType: 3,
          valueUnit: "°C",
        },
        {
          observationId: 170,
          name: "TempAmbient",
          dataType: 3,
          valueUnit: "°C",
        },
        {
          observationId: 171,
          name: "LightAmbient",
          dataType: 4,
        },
        {
          observationId: 172,
          name: "IntRelHumidity",
          dataType: 4,
        },
        {
          observationId: 173,
          name: "BackPlateLocked",
          dataType: 2,
        },
        {
          observationId: 174,
          name: "CurrentMotor",
          dataType: 3,
        },
        {
          observationId: 175,
          name: "BackPlateHallSensor",
          dataType: 4,
        },
        {
          observationId: 182,
          name: "InCurrent_T2",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 183,
          name: "InCurrent_T3",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 184,
          name: "InCurrent_T4",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 185,
          name: "InCurrent_T5",
          dataType: 3,
          valueUnit: "V",
        },
        {
          observationId: 190,
          name: "InVolt_T1_T2",
          dataType: 3,
          valueUnit: "V",
          altName: "inVoltageT1T2",
        },
        {
          observationId: 191,
          name: "InVolt_T1_T3",
          dataType: 3,
          valueUnit: "V",
          altName: "inVoltageT1T3",
        },
        {
          observationId: 192,
          name: "InVolt_T1_T4",
          dataType: 3,
          valueUnit: "V",
          altName: "inVoltageT1T4",
        },
        {
          observationId: 193,
          name: "InVolt_T1_T5",
          dataType: 3,
          valueUnit: "V",
          altName: "inVoltageT1T5",
        },
        {
          observationId: 194,
          name: "InVolt_T2_T3",
          dataType: 3,
          valueUnit: "V",
          altName: "inVoltageT2T3",
        },
        {
          observationId: 195,
          name: "InVolt_T2_T4",
          dataType: 3,
          valueUnit: "V",
          altName: "inVoltageT2T4",
        },
        {
          observationId: 196,
          name: "InVolt_T2_T5",
          dataType: 3,
          valueUnit: "V",
          altName: "inVoltageT2T5",
        },
        {
          observationId: 197,
          name: "InVolt_T3_T4",
          dataType: 3,
          valueUnit: "V",
          altName: "inVoltageT3T4",
        },
        {
          observationId: 198,
          name: "InVolt_T3_T5",
          dataType: 3,
          valueUnit: "V",
          altName: "inVoltageT3T5",
        },
        {
          observationId: 199,
          name: "InVolt_T4_T5",
          dataType: 3,
          valueUnit: "V",
          altName: "inVoltageT4T5",
        },
        {
          observationId: 202,
          name: "OutVoltPin1_2",
          dataType: 3,
          valueUnit: "V",
        },
        {
          observationId: 203,
          name: "OutVoltPin1_3",
          dataType: 3,
          valueUnit: "V",
        },
        {
          observationId: 204,
          name: "OutVoltPin1_4",
          dataType: 3,
          valueUnit: "V",
        },
        {
          observationId: 205,
          name: "OutVoltPin1_5",
          dataType: 3,
          valueUnit: "V",
        },
        {
          observationId: 210,
          name: "VoltLevel33",
          dataType: 3,
          valueUnit: "V",
        },
        {
          observationId: 211,
          name: "VoltLevel5",
          dataType: 3,
          valueUnit: "V",
        },
        {
          observationId: 212,
          name: "VoltLevel12",
          dataType: 3,
          valueUnit: "V",
        },
        {
          observationId: 230,
          name: "EqAvailableCurrentP1",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 231,
          name: "EqAvailableCurrentP2",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 232,
          name: "EqAvailableCurrentP3",
          dataType: 3,
          valueUnit: "A",
        },
      ];

      data.valueText = "";
      data.valueUnit = "";

      for (const observation of observations) {
        if (mode === "id" && observation.observationId === data.id) {
          // Id match
        } else if (mode === "name" && observation.name.toLowerCase() === (data.dataName as string).toLowerCase()) {
          // Name match
        } else if (
          mode === "name" &&
          observation.altName !== undefined &&
          observation.altName.toLowerCase() === (data.dataName as string).toLowerCase()
        ) {
          // Altname match
        } else if (
          mode === "name" &&
          observation.name.replace(/_/g, "").toLowerCase() === (data.dataName as string).toLowerCase()
        ) {
          // Altname match
        } else {
          continue;
        }

        data.dataName = observation.name;
        data.observationId = observation.observationId;

        if (observation.valueUnit !== undefined) {
          data.valueUnit = observation.valueUnit;
        }
        const valueTypes: Record<number, string> = {
          1: "Binary",
          2: "Boolean",
          3: "Double",
          4: "Integer",
          5: "Position",
          6: "String",
          7: "Statistics",
        };

        data.dataType = observation.dataType;
        data.dataTypeName = valueTypes[observation.dataType];
        if (data.value !== null) {
          switch (data.dataTypeName) {
            case "Double":
              data.value = parseFloat(data.value as string);
              break;
            case "Integer":
              // biome-ignore lint/correctness/useParseIntRadix: a radix would change how "0x…" parses; EASEE-19 keeps runtime behaviour identical
              data.value = parseInt(data.value as string);
              break;
          }
        }

        if (observation.valueMapping !== undefined) {
          data.valueText = observation.valueMapping(data.value);
        }

        break;
      }

      return data;
    }; // node.parseObservation()

    /**
     * Ensures authentication is available, using existing token or triggering refresh if needed
     * This is the preferred method for consumer nodes to ensure authentication.
     *
     * IMPORTANT: This method prevents double login issues by checking token validity
     * before triggering authentication, unlike doLogin() which always performs a fresh login.
     * Consumer nodes (REST client, streaming client) should use this instead of doLogin().
     *
     * @returns {Promise<boolean>} true if authentication is available, false otherwise
     */
    node.ensureAuthentication = async () => {
      // Validate credentials first
      const credentialsCheck = node.validateCredentials();
      if (!credentialsCheck.valid) {
        node.logDebug(`Cannot ensure authentication: ${credentialsCheck.message}`);
        return false;
      }

      // If authentication is already in progress, wait for it to complete
      if (node.authenticationInProgress) {
        node.logDebug("Authentication already in progress, waiting...");

        // Helper function to avoid function-in-loop issue
        const waitDelay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

        // Wait for current authentication to complete (max 30 seconds)
        const maxWaitTime = 30000; // 30 seconds
        const pollInterval = 100; // 100ms
        const startTime = Date.now();

        while (node.authenticationInProgress && Date.now() - startTime < maxWaitTime) {
          await waitDelay(pollInterval);
        }
        // Return current authentication status
        return !!node.accessToken;
      }

      // If we have a valid token, use it
      if (node.accessToken) {
        const now = new Date();
        const timeToExpire = Math.floor((Number(node.tokenExpires) - Number(now)) / 1000);

        // If token is still valid (more than 1 minute remaining), use it
        if (timeToExpire > 60) {
          return true;
        }
      }

      // Token is missing or expiring soon, trigger a check which will refresh/login as needed
      try {
        await node.checkToken();
        return !!node.accessToken;
      } catch (error) {
        node.logError("Error ensuring authentication:", error);
        return false;
      }
    };

    /**
     * Check token expiration and refresh if needed using best practices
     */
    node.checkToken = async () => {
      // Validate credentials before attempting any authentication
      const credentialsCheck = node.validateCredentials();
      if (!credentialsCheck.valid) {
        node.logDebug(`Cannot authenticate: ${credentialsCheck.message}`);
        node.status({
          fill: "red",
          shape: "ring",
          text: "Invalid configuration - edit to add credentials",
        });
        // Don't schedule another check if credentials are invalid
        return;
      }

      // Prevent concurrent authentication attempts
      if (node.authenticationInProgress) {
        node.logDebug("Authentication already in progress, skipping duplicate checkToken call");
        return;
      }

      // Set authentication flag
      node.authenticationInProgress = true;

      try {
        const now = new Date();
        const timeToExpire = Math.floor((Number(node.tokenExpires) - Number(now)) / 1000);
        const tokenAge = Math.floor((Number(now) - Number(node.tokenIssuedAt)) / 1000);

        // Determine if we need to refresh the token based on best practices
        let shouldRefresh = false;
        let reason = "";
        // Set when a failed login decides when the next check runs.
        let retryAfterMs: number | null = null;

        if (!node.accessToken) {
          shouldRefresh = true;
          reason = "No access token";
        } else if (timeToExpire <= 0) {
          shouldRefresh = true;
          reason = "Token expired";
        } else if (timeToExpire <= node.MIN_BUFFER_TIME) {
          shouldRefresh = true;
          reason = `Token expires in ${timeToExpire}s (within buffer time)`;
        } else if (node.tokenLifetime > 0) {
          // Use percentage-based renewal for tokens with known lifetime
          const renewalThreshold = node.tokenLifetime * node.RENEWAL_THRESHOLD_PERCENTAGE;
          if (tokenAge >= renewalThreshold) {
            shouldRefresh = true;
            reason = `Token age ${tokenAge}s exceeds ${Math.floor(node.RENEWAL_THRESHOLD_PERCENTAGE * 100)}% of lifetime (${renewalThreshold}s)`;
          }
        } else if (timeToExpire <= node.EARLY_RENEWAL_THRESHOLD) {
          // Fallback for tokens without known lifetime - renew if less than 10 minutes remain
          shouldRefresh = true;
          reason = `Token expires in ${timeToExpire}s (early renewal threshold)`;
        }

        if (shouldRefresh) {
          node.logInfo(`Token refresh needed: ${reason}`);
          node.status({
            fill: "yellow",
            shape: "ring",
            text: "Refreshing token...",
          });

          const refreshResult = await node.doRefreshToken();

          // undefined: no tokens to refresh, doRefreshToken() never attempted
          // anything (EASEE-39). null: a refresh was attempted and failed.
          // Either way this is the one and only place that logs in.
          if (refreshResult === null || refreshResult === undefined) {
            node.status({
              fill: "yellow",
              shape: "ring",
              text: "Token expired, re-authenticating...",
            });

            try {
              await node.doLogin();
              // Reset retry counters on successful login
              node.refreshRetryCount = 0;
              node.loginRetryCount = 0;
              node.transportRetryCount = 0;
            } catch (loginError) {
              node.logError("Fresh login also failed:", loginError);

              // The cycle is never stopped here (EASEE-38). A failure the API
              // did not answer with 400/401/403 says nothing about the
              // credentials, so it backs off (capped at 5 minutes) and says so.
              if (!isCredentialRejection(loginError)) {
                node.transportRetryCount++;
                retryAfterMs = transportRetryDelayMs(node.transportRetryCount);
                node.status({
                  fill: "yellow",
                  shape: "ring",
                  text: `Cannot reach Easee - retrying in ${Math.round(retryAfterMs / 1000)}s`,
                });
              } else {
                node.transportRetryCount = 0;
                if (node.loginRetryCount < node.maxLoginRetries) {
                  node.loginRetryCount++;
                }

                if (node.loginRetryCount >= node.maxLoginRetries) {
                  node.status({
                    fill: "red",
                    shape: "ring",
                    text: "Authentication failed - check credentials",
                  });
                  node.error(
                    "[easee] Authentication failed after maximum retries. Please check credentials and reconfigure the node, or press Re-login.",
                  );

                  // Drop any tokens, and keep trying - slowly - rather than stop:
                  // a credential rejection can be the API's mistake, and the
                  // Re-login button (EASEE-28) covers the user-driven case.
                  node.accessToken = false;
                  node.refreshToken = false;
                  node.tokenExpires = new Date();
                  node.tokenIssuedAt = new Date();
                  node.tokenLifetime = 0;
                  node.refreshRetryCount = 0;
                  retryAfterMs = CREDENTIAL_RETRY_DELAY_MS;
                } else {
                  node.status({
                    fill: "yellow",
                    shape: "ring",
                    text: `Login retry ${node.loginRetryCount}/${node.maxLoginRetries}`,
                  });
                }
              }
            }
          }
        }

        // Calculate adaptive check interval based on token lifetime and expiration
        let checkInterval: number;
        const credentialsValid = node.validateCredentials();

        if (retryAfterMs !== null) {
          checkInterval = retryAfterMs;
        } else if (!credentialsValid.valid) {
          checkInterval = 300 * 1000; // 5 minutes for invalid credentials
        } else if (!node.accessToken) {
          checkInterval = 60 * 1000; // 1 minute if no token
        } else {
          const currentTime = new Date();
          const timeToExpireMs = Number(node.tokenExpires) - Number(currentTime);
          const timeToRenewal = timeToExpireMs - node.MIN_BUFFER_TIME * 1000;
          const currentTokenAge = Math.floor((Number(currentTime) - Number(node.tokenIssuedAt)) / 1000);

          if (node.tokenLifetime > 0) {
            // For tokens with known lifetime, check at strategic intervals
            const renewalTime = node.tokenLifetime * node.RENEWAL_THRESHOLD_PERCENTAGE * 1000 - currentTokenAge * 1000;
            checkInterval = Math.max(Math.min(renewalTime / 4, 300 * 1000), 30 * 1000); // Between 30s and 5min
          } else if (timeToRenewal > 0) {
            // For tokens without known lifetime, check based on time to renewal
            checkInterval = Math.max(Math.min(timeToRenewal / 3, 300 * 1000), 30 * 1000); // Between 30s and 5min
          } else {
            // Token needs attention soon
            checkInterval = 30 * 1000; // 30 seconds
          }
        }

        // Recalculate current timing for accurate logging
        const logTime = new Date();
        const logTimeToExpire = Math.floor((Number(node.tokenExpires) - Number(logTime)) / 1000);
        const logTokenAge = Math.floor((Number(logTime) - Number(node.tokenIssuedAt)) / 1000);

        node.logDebug(
          `Next token check in ${Math.floor(checkInterval / 1000)}s (time to expire: ${logTimeToExpire}s, token age: ${logTokenAge}s)`,
        );

        // Schedule next token check
        node.checkTokenHandler = setTimeout(() => {
          node.checkToken().catch((error) => {
            node.logError("Error in checkToken during scheduled check:", error);
            node.status({
              fill: "red",
              shape: "ring",
              text: "Authentication error",
            });
          });
        }, checkInterval);
      } finally {
        // Always clear the authentication flag
        node.authenticationInProgress = false;
      }
    };

    /**
     * Refresh the access token using the refresh token.
     * @returns {Promise<Object|null|undefined>} The refresh response; `null` if a
     *   refresh was attempted and failed; `undefined` if there were no tokens to
     *   refresh at all — the caller must log in itself (EASEE-39), this function
     *   no longer does.
     */
    node.doRefreshToken = async () => {
      if (!node.accessToken || !node.refreshToken) {
        // Not logged in, so there is nothing to refresh. Signal "needs login"
        // (undefined, already part of this function's declared return type)
        // and leave the login itself to the caller (EASEE-39): checkToken()
        // is the only caller that used to treat doRefreshToken()'s own
        // failed-login `null` as a second, separate signal to log in again,
        // which meant a failed cycle with no tokens sent two logins for one
        // loginRetryCount. Logging in here as well as there was the bug.
        node.logInfo("No tokens available for refresh, needs login");
        return undefined;
      }

      const response = await fetch(`${node.RestApipath}/accounts/refresh_token`, {
        method: "POST",
        headers: {
          "User-Agent": userAgent,
          Accept: "application/json",
          "Content-Type": "application/*+json",
        },
        body: JSON.stringify({
          accessToken: node.accessToken,
          refreshToken: node.refreshToken,
        }),
      })
        .then(async (response) => {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.indexOf("application/json") !== -1) {
            const json = (await response.json()) as Partial<TokenResponse> & ApiErrorBody;

            // Check if the response indicates an error (like invalid refresh token)
            if (!response.ok) {
              const errorMsg = json.title || json.errorCodeName || "Unknown error";
              const errorDetail = json.detail || "";
              throw httpStatusError(
                `Token refresh failed (${response.status}): ${errorMsg}${errorDetail ? ` - ${errorDetail}` : ""}`,
                response.status,
              );
            }

            return json;
          } else {
            const errortxt = await response.text();
            throw httpStatusError(`Unable to refresh token, response not JSON: ${errortxt}`, response.status);
          }
        })
        .then((json) => {
          if (!json.accessToken) {
            // Failed getting token
            node.logError("doRefreshToken error(): ", json);
            node.error(
              "[easee] EaseeConfiguration::doRefreshToken() - Failed doRefreshToken(), REST command did not return token",
            );
            return null;
          }

          // Successful refresh - reset retry counter and update token info
          node.refreshRetryCount = 0;
          node.accessToken = json.accessToken;
          node.refreshToken = json.refreshToken as string;

          // Update token timing information for best-practice renewal
          const now = new Date();
          node.tokenIssuedAt = now;
          node.tokenLifetime = json.expiresIn || 0;

          const t = new Date();
          t.setSeconds(t.getSeconds() + (json.expiresIn as number));
          node.tokenExpires = t;

          node.logInfo(
            `Token refreshed successfully. Lifetime: ${node.tokenLifetime}s, expires at: ${t.toISOString()}`,
          );

          node.emit("update", {
            update: "Token refreshed successfully",
          });

          return json as TokenResponse;
        })
        .catch((error): Promise<TokenResponse | null | undefined> | null => {
          // Determine if this is a token validity issue or network/other issue.
          // Only a 400/401/403 answer is a credential/token error; a 5xx or no
          // response at all is transient and must not drop still-valid tokens
          // (EASEE-40) — the same classification EASEE-38 gave doLogin().
          const isTokenInvalid = isCredentialRejection(error);

          const isNetworkError =
            error.message.includes("fetch") || error.message.includes("network") || error.message.includes("timeout");

          if (isTokenInvalid) {
            // Token is invalid - clear tokens and request fresh login
            node.logInfo("Refresh token invalid, clearing tokens and will attempt fresh login");
            node.accessToken = false;
            node.refreshToken = false;
            node.tokenExpires = new Date();
            node.tokenIssuedAt = new Date();
            node.tokenLifetime = 0;
            node.refreshRetryCount = 0; // Reset refresh retry counter

            node.emit("update", {
              update: "Token refresh failed, will attempt fresh login",
            });

            return null; // Return null to indicate we should try fresh login
          } else if (isNetworkError && node.refreshRetryCount < node.maxRefreshRetries) {
            // Network error - retry refresh
            node.refreshRetryCount++;
            node.logInfo(
              `Network error during token refresh, retry ${node.refreshRetryCount}/${node.maxRefreshRetries}`,
            );

            node.emit("update", {
              update: `Token refresh retry ${node.refreshRetryCount}/${node.maxRefreshRetries}`,
            });

            // Wait a bit before retrying and return a promise
            return new Promise((resolve) => {
              setTimeout(async () => {
                try {
                  const retryResult = await node.doRefreshToken();
                  resolve(retryResult);
                } catch {
                  resolve(null);
                }
              }, 2000 * node.refreshRetryCount);
            });
          } else {
            // Max retries reached or other error
            node.logError("Token refresh failed after retries or due to other error:", error);
            node.refreshRetryCount++;
            if (node.refreshRetryCount >= node.maxRefreshRetries) {
              node.logInfo("Max refresh retries reached, clearing tokens and attempting fresh login");
              node.accessToken = false;
              node.refreshToken = false;
              node.tokenExpires = new Date();
              node.tokenIssuedAt = new Date();
              node.tokenLifetime = 0;
              node.refreshRetryCount = 0;

              node.emit("update", {
                update: "Token refresh failed after retries, attempting fresh login",
              });

              return null; // Return null to indicate we should try fresh login
            }

            node.error(error);
            node.warn(error);
            node.logError("Fatal error during doRefreshToken()", error);
            return null;
          }
        });

      return response;
    };

    /**
     * Reset authentication state: drops both tokens and their timing, and
     * zeroes every retry counter checkToken() and doLogin() maintain. Called
     * from relogin() (EASEE-28's "Re-login" button) before it attempts a
     * fresh login — the caller stops the token-check timer itself first,
     * since only it knows whether that's appropriate.
     *
     * Deliberately does not set a status or emit an "update": a caller that
     * is about to try a fresh login (relogin() always is) is not yet in an
     * error state, and a "reconfiguration required" message here would be a
     * false failure report for the moment between the reset and that
     * attempt's own outcome. Set status/emit at the call site instead.
     */
    node.resetAuthenticationState = () => {
      node.logInfo("Resetting authentication state");
      node.accessToken = false;
      node.refreshToken = false;
      node.tokenExpires = new Date();
      node.tokenIssuedAt = new Date();
      node.tokenLifetime = 0;
      node.refreshRetryCount = 0;
      node.loginRetryCount = 0;
      node.transportRetryCount = 0;
    };

    /**
     * Perform login with username and password
     * @param {string} _username - Username (optional, uses stored credentials if not provided)
     * @param {string} _password - Password (optional, uses stored credentials if not provided)
     * @returns {Promise<Object>} The login response
     */
    node.doLogin = async (_username, _password) => {
      const url = "/accounts/login";

      // If no parameters provided, validate stored credentials
      if (!_username && !_password) {
        const credentialsCheck = node.validateCredentials();
        if (!credentialsCheck.valid) {
          const error = new Error(`Cannot login: ${credentialsCheck.message}`);
          node.logError(`Login failed: ${credentialsCheck.message}`);
          node.status({
            fill: "red",
            shape: "ring",
            text: "Invalid configuration - missing credentials",
          });
          throw error;
        }
      }

      if (!_username && !node.username) {
        const error = new Error("No username provided for login");
        node.logError("Login failed: No username configured");
        node.status({
          fill: "red",
          shape: "ring",
          text: "No username configured",
        });
        throw error;
      }

      if (!_password && !node.credentials?.password) {
        const error = new Error("No password provided for login");
        node.logError("Login failed: No password configured");
        node.status({
          fill: "red",
          shape: "ring",
          text: "No password configured",
        });
        throw error;
      }
      const response = await fetch(node.RestApipath + url, {
        method: "post",
        body: JSON.stringify({
          userName: _username ?? node.username,
          password: _password ?? node.credentials.password,
        }),
        headers: {
          "User-Agent": userAgent,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      })
        .then(async (response) => {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.indexOf("application/json") !== -1) {
            const json = (await response.json()) as Partial<TokenResponse> & ApiErrorBody;

            // Check if login failed
            if (!response.ok) {
              const errorMsg = json.title || json.errorCodeName || "Login failed";
              const errorDetail = json.detail || "";
              throw httpStatusError(
                `Login failed (${response.status}): ${errorMsg}${errorDetail ? ` - ${errorDetail}` : ""}`,
                response.status,
              );
            }

            return json;
          } else {
            const errortxt = await response.text();
            throw httpStatusError(`Unable to login, response not JSON: ${errortxt}`, response.status);
          }
        })
        .then((json) => {
          if ("accessToken" in json) {
            node.accessToken = json.accessToken as string;
            node.refreshToken = json.refreshToken as string;

            // Update token timing information for best-practice renewal
            const now = new Date();
            node.tokenIssuedAt = now;
            node.tokenLifetime = json.expiresIn || 0;

            const t = new Date();
            t.setSeconds(t.getSeconds() + (json.expiresIn as number));
            node.tokenExpires = t;

            // Reset retry counters on successful login
            node.refreshRetryCount = 0;
            node.loginRetryCount = 0;
            node.transportRetryCount = 0;

            node.logInfo(`Login successful. Token lifetime: ${node.tokenLifetime}s, expires at: ${t.toISOString()}`);

            node.status({
              fill: "green",
              shape: "dot",
              text: "Authenticated successfully",
            });

            node.emit("update", {
              update: "Login successful, token retrieved",
            });

            return json as TokenResponse;
          } else {
            throw new Error("Login response did not contain access token");
          }
        })
        .catch((error) => {
          // Only a 400/401/403 answer is a credential error; a 5xx used to
          // match "Login failed" here and was reported as one (EASEE-38).
          if (isCredentialRejection(error)) {
            node.status({
              fill: "red",
              shape: "ring",
              text: "Invalid credentials",
            });
            console.error("[easee] Login failed due to invalid credentials:", error.message);
          } else {
            node.status({
              fill: "red",
              shape: "ring",
              text: "Login error",
            });
            console.error("[easee] Login failed due to other error:", error.message);
          }

          node.error(error);
          throw error; // Re-throw to be handled by caller
        });

      return response;
    };

    /**
     * Throw the tokens away and log in again, on request from the editor's
     * "Re-login" button (EASEE-28). Also restarts the token-check cycle, which
     * after maxLoginRetries credential rejections only retries every 30 minutes
     * (EASEE-38) — this is the way to try again now.
     *
     * The result is sent to the browser, so its error text has the password and
     * both tokens redacted from it: doLogin() errors embed API response text.
     */
    node.relogin = async () => {
      if (node.authenticationInProgress) {
        return { ok: false, status: 409, error: "Authentication is already in progress; try again in a moment" };
      }

      const credentialsCheck = node.validateCredentials();
      if (!credentialsCheck.valid) {
        return { ok: false, status: 401, error: `Cannot login: ${credentialsCheck.message}` };
      }

      const secrets = [node.credentials?.password, node.accessToken, node.refreshToken];

      if (node.checkTokenHandler) {
        clearTimeout(node.checkTokenHandler);
        node.checkTokenHandler = null;
      }
      node.resetAuthenticationState();

      node.logInfo("Re-login requested from the editor");
      node.authenticationInProgress = true;
      let result: ReloginResult;
      try {
        await node.doLogin();
        result = { ok: true, status: 200 };
      } catch (error) {
        const raw = error instanceof Error ? error.message : String(error);
        const message = redactSecrets(raw, [...secrets, node.accessToken, node.refreshToken]);
        const status = isCredentialRejection(error) ? 401 : 500;
        result = { ok: false, status, error: message };
      } finally {
        node.authenticationInProgress = false;
      }

      // Restart the token-check cycle: straight away after a good login (it only
      // schedules the next check), after a minute after a failed one.
      node.checkTokenHandler = setTimeout(() => node.emit("start"), result.ok ? 0 : 60 * 1000);
      return result;
    };

    // Start connecting in two seconds
    node.checkTokenHandler = setTimeout(() => node.emit("start"), 2000);
  }

  // Explicit type arguments: left to inference, TypeScript reads the credential
  // types off the `credentials` literal below and they no longer match the node's.
  RED.nodes.registerType<EaseeConfigurationNode, EaseeConfigurationDef, unknown, EaseeCredentials>(
    "easee-configuration",
    EaseeConfiguration,
    {
      credentials: {
        username: { type: "text" },
        password: { type: "password" },
      },
    },
  );

  // The editor's "Re-login" button (EASEE-28). Registered once per runtime, here
  // rather than in the constructor, and dispatches on the deployed node's id.
  // The response carries ok/error only — never the password or a token.
  RED.httpAdmin.post(
    "/easee-configuration/:id/relogin",
    RED.auth.needsPermission("easee-configuration.write"),
    async (req, res) => {
      const target = RED.nodes.getNode(String(req.params.id)) as EaseeConfigurationNode | null;
      if (!target || target.type !== "easee-configuration" || typeof target.relogin !== "function") {
        res.status(404).json({
          ok: false,
          error: "No deployed easee-configuration node has that id. Deploy the flow first.",
        });
        return;
      }

      try {
        const result = await target.relogin();
        if (result.ok) {
          res.status(200).json({ ok: true });
        } else {
          res.status(result.status).json({ ok: false, error: result.error });
        }
      } catch {
        res.status(500).json({ ok: false, error: "Re-login failed unexpectedly; see the Node-RED log" });
      }
    },
  );
};

/** Replace every occurrence of each non-empty secret in `text` with a marker. */
function redactSecrets(text: string, secrets: unknown[]): string {
  let out = text;
  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length > 0) {
      out = out.split(secret).join("[redacted]");
    }
  }
  return out;
}

/** An Error that carries the HTTP status the Easee API answered with, if it answered at all. */
type HttpStatusError = Error & { status?: number };

function httpStatusError(message: string, status: number): HttpStatusError {
  const error: HttpStatusError = new Error(message);
  error.status = status;
  return error;
}

/**
 * True only for a definite credential rejection: `accounts/login` answered
 * 400, 401 or 403. A rejected fetch (no response), a 5xx or anything else is
 * a transport or server failure and says nothing about the credentials
 * (EASEE-38).
 */
function isCredentialRejection(error: unknown): boolean {
  const status = (error as HttpStatusError | null | undefined)?.status;
  return status === 400 || status === 401 || status === 403;
}

/**
 * Delay before the next token check after the `failures`-th transport failure
 * in a row: 1, 2, 4 minutes, then 5 minutes for good. Never stops (EASEE-38).
 */
function transportRetryDelayMs(failures: number): number {
  const base = 60 * 1000;
  const ceiling = 5 * 60 * 1000;
  return Math.min(base * 2 ** Math.max(failures - 1, 0), ceiling);
}

/** Delay between login attempts once the credentials have been rejected maxLoginRetries times. */
const CREDENTIAL_RETRY_DELAY_MS = 30 * 60 * 1000;
