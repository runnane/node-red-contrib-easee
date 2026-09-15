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
import {
  HttpTransportType,
  type HubConnection,
  HubConnectionBuilder,
  type IHttpConnectionOptions,
  LogLevel,
} from "@microsoft/signalr";
import type { Node, NodeAPI, NodeDef, NodeStatus } from "node-red";
import { EaseeSignalRHttpClient } from "./signalr-http-client";
import type { EaseeConfigurationNode, InputListener, LogFn, ObservationData } from "./types";

/** The streaming client's saved flow properties (the `defaults` block in the .html). */
interface ChargerStreamingClientDef extends NodeDef {
  charger?: string;
  configuration: string;
  skipNegotiation?: boolean;
  /** Not in the editor's `defaults`, so always undefined — EASEE-10. */
  responses?: unknown;
}

interface ErroEvent {
  err: unknown;
  id?: string | null;
}

interface ConnectionEvent {
  count: string | number;
  id: string | null;
}

/**
 * Node-RED's status also carries `event` and `_session` for the websocket-style
 * status this node was forked from, and `text` is whatever was passed — this node
 * passes an Error through from notifyOnError().
 */
interface SessionStatus extends Omit<NodeStatus, "text"> {
  text?: unknown;
  event?: string;
  _session?: { type: string; id?: string | null };
}

interface ChargerStreamingClientNode extends Node {
  charger?: string;
  configurationNode: string;
  responses: unknown;
  skipNegotiation: boolean;
  /** Typed non-null: the constructor returns before any use when it is missing. */
  connectionConfig: EaseeConfigurationNode;
  logInfo: LogFn;
  logDebug: LogFn;
  logError: LogFn;
  logWarn: LogFn;
  options: Record<string, unknown>;
  reconnectInterval: number;
  closing: boolean;
  reconnectTimoutHandle?: ReturnType<typeof setTimeout> | null;
  /** The SignalR hub connection; undefined until startconn() has built one. */
  connection?: HubConnection;
  fullReconnect(): void;
  startconn(): void;
  reconnect(): void;
  notifyOnError(err: unknown, id: string | null): void;
  handleConnection(connection: HubConnection): Promise<void>;
  status(status: string | SessionStatus): void;

  on(event: "input", listener: InputListener): this;
  on(event: "close", listener: () => void): this;
  on(event: "close", listener: (done: () => void) => void): this;
  on(event: "close", listener: (removed: boolean, done: () => void) => void): this;
  on(event: "opened", listener: (event: ConnectionEvent) => void): this;
  on(event: "closed", listener: (event: ConnectionEvent) => void): this;
  on(event: "erro", listener: (event: ErroEvent) => void): this;
}

// `export =` rather than `export default`: Node-RED require()s this file and needs
// module.exports to BE the factory. TypeScript emits this as `module.exports = ...`.
export = (RED: NodeAPI) => {
  function ChargerStreamingClientNode(this: ChargerStreamingClientNode, n: ChargerStreamingClientDef) {
    RED.nodes.createNode(this, n);
    // biome-ignore lint/complexity/noUselessThisAlias: `node` is the Node-RED idiom, captured by every helper below
    const node = this;
    node.charger = n.charger;
    node.configurationNode = n.configuration;
    node.responses = n.responses;
    node.skipNegotiation = n.skipNegotiation !== undefined ? n.skipNegotiation : true;
    node.connectionConfig = RED.nodes.getNode(node.configurationNode) as EaseeConfigurationNode;
    node.responses = n.responses;

    // Use configuration node's logging if available, fallback to console
    node.logInfo =
      node.connectionConfig?.logInfo ||
      ((msg: string, data?: unknown) => {
        console.log(`[easee] ${msg}`, data || "");
      });
    node.logDebug =
      node.connectionConfig?.logDebug ||
      ((msg: string, data?: unknown) => {
        if (node.connectionConfig?.debugLogging) {
          console.log(`[easee] DEBUG: ${msg}`, data || "");
        }
      });
    node.logError =
      node.connectionConfig?.logError ||
      ((msg: string, error?: unknown) => {
        console.error(`[easee] ERROR: ${msg}`, error || "");
      });
    node.logWarn =
      node.connectionConfig?.logWarn ||
      ((msg: string, data?: unknown) => {
        console.warn(`[easee] WARN: ${msg}`, data || "");
      });
    node.options = {};
    node.reconnectInterval = 3000;
    node.closing = false;

    if (!node.connectionConfig) {
      node.emit("erro", {
        err: "[easee] Missing easee account configuration node",
      });
      node.status({
        fill: "red",
        shape: "ring",
        text: "Missing configuration",
      });
      return;
    }

    // Check if the configuration node has valid credentials
    if (!node.connectionConfig.isConfigurationValid?.()) {
      node.emit("erro", {
        err: "[easee] Configuration node is invalid - missing username or password",
      });
      node.status({
        fill: "red",
        shape: "ring",
        text: "Invalid configuration - missing credentials",
      });
      return;
    }

    node.fullReconnect = () => {
      node.connectionConfig
        .ensureAuthentication()
        .then((isAuthenticated) => {
          if (isAuthenticated) {
            node.startconn();
          } else {
            node.emit("erro", {
              err: "Authentication failed during fullReconnect()",
            });
          }
        })
        .catch((e) => {
          node.emit("erro", {
            err: `Error during fullReconnect(): ${e.message}`,
          });
        });
    };

    node.connectionConfig.on("update", (msg) => {
      node.status({
        fill: "green",
        shape: "dot",
        text: msg.update,
      });
    });

    node.on("input", (_msg, _send, done) => {
      node.fullReconnect();
      if (done) {
        done();
      }
    });

    node.on("opened", (event) => {
      node.status({
        fill: "green",
        shape: "dot",
        text: RED._("node-red:common.status.connected"),
        event: "connect",
        _session: {
          type: "signalr",
          id: event.id,
        },
      });

      // send the connected msg
      node.send([{ _connectionId: event.id, payload: "Connected" }, null, null]);

      // Handlers are registered before subscribing: SubscribeWithCurrentState sends
      // the current state straight away, and a message with no handler is dropped.
      node.connection?.on("ProductUpdate", (data: ObservationData) => {
        try {
          // Use the configuration node's parseObservation method
          data = node.connectionConfig.parseObservation(data);
          node.send([null, null, null, { payload: data }, null, null]);
        } catch (error) {
          // Was `easeeClient.logger.error(...)`, which threw before the raw
          // data below could be sent (fixed in EASEE-19).
          node.logError("Error parsing ProductUpdate:", error);
          // Send raw data if parsing fails
          node.send([null, null, null, { payload: data }, null, null]);
        }
      });

      node.connection?.on("ChargerUpdate", (data: ObservationData) => {
        try {
          // Use the configuration node's parseObservation method
          data = node.connectionConfig.parseObservation(data);
          node.send([null, null, null, null, { payload: data }, null]);
        } catch (error) {
          // Was `easeeClient.logger.error(...)`, which threw before the raw
          // data below could be sent (fixed in EASEE-19).
          node.logError("Error parsing ChargerUpdate:", error);
          // Send raw data if parsing fails
          node.send([null, null, null, null, { payload: data }, null]);
        }
      });
      node.connection?.on("CommandResponse", (data: unknown) => {
        node.send([null, null, null, null, null, { payload: data }]);
      });

      // invoke(), not send() (EASEE-35, GitHub #62). send() is fire-and-forget: the
      // hub never reports a failure for it, so a subscription it refused for this
      // charger left the node showing "connected" while emitting nothing. A rejected
      // send() also escaped the try/catch that used to surround it, being a promise.
      const subscribe = async () => {
        try {
          await node.connection?.invoke("SubscribeWithCurrentState", node.charger, true);
          node.logDebug("Subscribed to charger updates for:", node.charger);
        } catch (error) {
          // Was `easeeClient.logger.error(...)` — an undefined name, so this catch
          // threw a ReferenceError instead of logging (fixed in EASEE-19).
          node.logError("Error invoking SubscribeWithCurrentState:", error);
          node.emit("erro", {
            err: `Failed to subscribe to charger updates: ${error instanceof Error ? error.message : String(error)}`,
            id: event.id,
          });
        }
      };
      void subscribe();
    });

    /**
     * Error event
     */
    node.on("erro", (event) => {
      node.logError("Error in easee-streaming-client:", event.err);
      node.warn(event.err);

      node.status({
        fill: "red",
        shape: "ring",
        text: event.err,
        event: "error",
        _session: {
          type: "signalr",
          id: event.id,
        },
      });
      const errMsg: { payload: unknown; _connectionId?: string } = { payload: event.err };
      if (event.id) {
        errMsg._connectionId = event.id;
      }
      node.send([null, errMsg, null]);
    });

    node.on("closed", (event) => {
      let status: SessionStatus;
      // `count` is always "" today, and "" > 0 is false — Number("") is 0, so this
      // is the same comparison with the coercion written down.
      if (Number(event.count) > 0) {
        status = {
          fill: "green",
          shape: "dot",
          text: RED._("node-red:common.status.connected"),
        };
      } else {
        status = {
          fill: "red",
          shape: "ring",
          text: RED._("node-red:common.status.disconnected"),
        };
      }
      status.event = "disconnect";
      status._session = {
        type: "signalr",
        id: event.id,
      };
      node.status(status);
      node.send([null, null, { _connectionId: event.id, payload: "Disconnected" }]);
    });

    // Two parameters on purpose: Node-RED picks the (removed, done) form of the
    // close callback by the listener's arity.
    node.on("close", (_removed: boolean, done: () => void) => {
      node.closing = true;
      // Optional since EASEE-19: a node that never connected (no charger, no token
      // yet) has no connection, and this used to throw here. Node-RED swallows an
      // error from a close listener, so nothing was reported — the rest of this
      // handler just never ran: a pending reconnect timer survived the close and
      // "Disconnected" was never sent.
      node.connection?.stop();
      if (node.reconnectTimoutHandle) {
        clearTimeout(node.reconnectTimoutHandle);
        node.reconnectTimoutHandle = null;
      }

      // When `removed` was true this used to call node.removeInputNode(node): a
      // method of the signalrcore node this package was forked from, which does not
      // exist here. It threw (silently, as above), so a removed node never reported
      // "Disconnected". Removed in EASEE-19; nothing else happens on removal that
      // does not happen on restart.

      node.emit("erro", {
        err: "Disconnected",
      });
      if (done) {
        done();
      }
    });

    // Connect to remote endpoint
    node.startconn = () => {
      node.closing = false;
      if (node.reconnectTimoutHandle) {
        clearTimeout(node.reconnectTimoutHandle);
      }
      node.reconnectTimoutHandle = null;

      if (!node.charger) {
        node.emit("erro", {
          err: "No charger, exiting",
        });
        return;
      }
      if (!node.connectionConfig.accessToken) {
        node.emit("erro", {
          err: "No accessToken, waiting",
        });
        node.reconnectTimoutHandle = setTimeout(() => node.startconn(), node.reconnectInterval);
        return;
      }

      node.logDebug("Establishing easee SignalR connection...");
      node.logDebug("For hub:", node.connectionConfig.signalRpath);
      node.logDebug("For charger:", node.charger);

      // Configure SignalR options properly for v8+
      const signalROptions: IHttpConnectionOptions = {
        accessTokenFactory: () => {
          const token = node.connectionConfig.accessToken;
          node.logDebug("Providing access token for SignalR, length:", token ? token.length : 0);
          // `false` when logged out; SignalR then sends no usable token and the
          // hub rejects the connection, which reconnect() handles.
          return token as string;
        },
        // Never SignalR's default client in Node: it requires whichever tough-cookie
        // npm hoisted, and 2.x/3.x break negotiation with "reading 'secure'" (EASEE-35).
        httpClient: new EaseeSignalRHttpClient(),
      };

      // Add skipNegotiation option if enabled - requires WebSocket transport
      if (node.skipNegotiation) {
        signalROptions.skipNegotiation = true;
        signalROptions.transport = HttpTransportType.WebSockets;
        node.logDebug("SignalR negotiation disabled - forcing direct WebSocket connection");
      }

      // Some SignalR hubs require query parameters for authorization context
      const signalRUrl = node.connectionConfig.signalRpath;
      node.logDebug("Using SignalR URL:", signalRUrl);
      node.logDebug("Skip negotiation:", node.skipNegotiation);

      let connection: HubConnection;
      try {
        connection = new HubConnectionBuilder()
          .withUrl(signalRUrl, signalROptions)
          .configureLogging(LogLevel.Debug)
          .build();
      } catch (error) {
        node.logError("Error creating SignalR connection:", error);
        node.emit("erro", {
          err: `[easee] Error creating SignalR connection: ${(error as Error).message}`,
        });
        node.status({
          fill: "red",
          shape: "ring",
          text: "SignalR connection error",
        });
        return;
      }

      node.connection = connection; // keep for closing
      node.handleConnection(connection);
    };

    node.reconnect = () => {
      if (node.reconnectTimoutHandle) {
        clearTimeout(node.reconnectTimoutHandle);
      }
      if (node.closing) {
        return;
      }
      node.connectionConfig
        .ensureAuthentication()
        .then((isAuthenticated) => {
          if (isAuthenticated) {
            node.reconnectTimoutHandle = setTimeout(() => node.startconn(), node.reconnectInterval);
          } else {
            node.logError("Authentication failed during reconnect");
          }
        })
        .catch((error) => {
          node.logError("Error during reconnect:", error);
        });
    };

    node.notifyOnError = (err, id) => {
      if (!err) {
        return;
      }
      node.emit("erro", {
        err: err,
        id: id,
      });
    };

    node.handleConnection = async (connection) => {
      let id: string | null = "";
      try {
        await connection.start();
        // We're connected
        id = connection.connectionId;
        node.emit("opened", {
          count: "",
          id: id,
        });

        connection.onclose((err) => {
          node.emit("closed", {
            count: "",
            id: id,
          });
          node.notifyOnError(err, id);
          node.reconnect();
        });
      } catch (err) {
        node.notifyOnError(err, id);
        node.reconnect();
      }
    };

    node.closing = false;

    // Start in 2 sec
    setTimeout(() => node.fullReconnect(), 2000);
  }

  RED.nodes.registerType("charger-streaming-client", ChargerStreamingClientNode);
};
