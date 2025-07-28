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

module.exports = function (RED) {
  "use strict";
  const signalR = require("@microsoft/signalr");

  class ChargerStreamingClientNode {
    constructor(n) {
      RED.nodes.createNode(this, n);
      var node = this;
      node.charger = n.charger;
      node.configurationNode = n.configuration;
      node.responses = n.responses;
      node.skipNegotiation = n.skipNegotiation !== undefined ? n.skipNegotiation : true;
      node.connectionConfig = RED.nodes.getNode(node.configurationNode);
      node.responses = n.responses;

      // Use configuration node's logging if available, fallback to console
      node.logInfo = node.connectionConfig?.logInfo || function(msg, data) { console.log(`[easee] ${msg}`, data || ''); };
      node.logDebug = node.connectionConfig?.logDebug || function(msg, data) { if (node.connectionConfig?.debugLogging) console.log(`[easee] DEBUG: ${msg}`, data || ''); };
      node.logError = node.connectionConfig?.logError || function(msg, error) { console.error(`[easee] ERROR: ${msg}`, error || ''); };
      node.logWarn = node.connectionConfig?.logWarn || function(msg, data) { console.warn(`[easee] WARN: ${msg}`, data || ''); };
      node.options = {};
      node.reconnectInterval = 3000;
      node.closing = false;

      if (!this.connectionConfig) {
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
      if (!node.connectionConfig.isConfigurationValid || !node.connectionConfig.isConfigurationValid()) {
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
              err: "Error during fullReconnect(): " + e.message,
            });
          });
      };

      this.connectionConfig.on("update", (msg) => {
        node.status({
          fill: "green",
          shape: "dot",
          text: msg.update,
        });
        //console.log(msg);
      });

      this.on("input", (msg, send, done) => {
        node.fullReconnect();
        if (done) {
          done();
        }
      });

      this.on("opened", (event) => {
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
        node.send([
          { _connectionId: event.id, payload: "Connected" },
          null,
          null,
        ]);

        try {
          node.connection.send("SubscribeWithCurrentState", node.charger, true);
        } catch (error) {
          easeeClient.logger.error("Error sending SubscribeWithCurrentState:", error);
          node.emit("erro", {
            err: `Failed to subscribe to charger updates: ${error.message}`,
            id: event.id
          });
        }

        node.connection.on("ProductUpdate", (data) => {
          try {
            // Use the configuration node's parseObservation method
            data = node.connectionConfig.parseObservation(data);
            node.send([null, null, null, { payload: data }, null, null]);
          } catch (error) {
            easeeClient.logger.error("Error parsing ProductUpdate:", error);
            // Send raw data if parsing fails
            node.send([null, null, null, { payload: data }, null, null]);
          }
        });

        node.connection.on("ChargerUpdate", (data) => {
          try {
            // Use the configuration node's parseObservation method
            data = node.connectionConfig.parseObservation(data);
            node.send([null, null, null, null, { payload: data }, null]);
          } catch (error) {
            easeeClient.logger.error("Error parsing ChargerUpdate:", error);
            // Send raw data if parsing fails
            node.send([null, null, null, null, { payload: data }, null]);
          }
        });
        node.connection.on("CommandResponse", (data) => {
          node.send([null, null, null, null, null, { payload: data }]);
        });
      });


      /**
       * Error event
       */
      this.on("erro", (event) => {

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
        var errMsg = { payload: event.err };
        if (event.id) errMsg._connectionId = event.id;
        node.send([null, errMsg, null]);
      });

      this.on("closed", (event) => {
        var status;
        if (event.count > 0) {
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
        node.send([
          null,
          null,
          { _connectionId: event.id, payload: "Disconnected" },
        ]);
      });

      this.on("close", (removed, done) => {
        node.closing = true;
        node.connection.stop();
        if (node.reconnectTimoutHandle) {
          clearTimeout(node.reconnectTimoutHandle);
          node.reconnectTimoutHandle = null;
        }

        if (removed) {
          node.removeInputNode(node);
        } else {
          // This node is being restarted
        }
        node.emit("erro", {
          err: "Disconnected",
        });
        if (done) done();
      });

      // Connect to remote endpoint
      node.startconn = () => {
        node.closing = false;
        if (node.reconnectTimoutHandle)
          clearTimeout(node.reconnectTimoutHandle);
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
          node.reconnectTimoutHandle = setTimeout(
            () => node.startconn(),
            node.reconnectInterval
          );
          return;
        }

        node.logDebug("Establishing easee SignalR connection...");
        node.logDebug("For hub:", node.connectionConfig.signalRpath);
        node.logDebug("For charger:", node.charger);

        // Configure SignalR options properly for v8+
        const signalROptions = {
          accessTokenFactory: () => {
            const token = node.connectionConfig.accessToken;
            node.logDebug("Providing access token for SignalR, length:", token ? token.length : 0);
            return token;
          }
        };

        // Add skipNegotiation option if enabled - requires WebSocket transport
        if (node.skipNegotiation) {
          signalROptions.skipNegotiation = true;
          signalROptions.transport = signalR.HttpTransportType.WebSockets;
          node.logDebug("SignalR negotiation disabled - forcing direct WebSocket connection");
        }

        // Some SignalR hubs require query parameters for authorization context
        const signalRUrl = node.connectionConfig.signalRpath;
        node.logDebug("Using SignalR URL:", signalRUrl);
        node.logDebug("Skip negotiation:", node.skipNegotiation);

        var connection;
        try {
          connection = new signalR.HubConnectionBuilder()
            .withUrl(signalRUrl, signalROptions)
            .configureLogging(signalR.LogLevel.Debug)
            .build();
        } catch (error) {
          node.logError("Error creating SignalR connection:", error);
          node.emit("erro", {
            err: `[easee] Error creating SignalR connection: ${error.message}`
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
        if (node.reconnectTimoutHandle)
          clearTimeout(node.reconnectTimoutHandle);
        if (node.closing) return;
        node.connectionConfig.ensureAuthentication().then((isAuthenticated) => {
          if (isAuthenticated) {
            node.reconnectTimoutHandle = setTimeout(
              () => node.startconn(),
              node.reconnectInterval
            );
          } else {
            node.logError("Authentication failed during reconnect");
          }
        }).catch((error) => {
          node.logError("Error during reconnect:", error);
        });
      };
      
      node.notifyOnError = (err, id) => {
        if (!err) return;
        node.emit("erro", {
          err: err,
          id: id,
        });
      };

      node.handleConnection = async (connection) => {
        let id = "";
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
  }
  RED.nodes.registerType(
    "charger-streaming-client",
    ChargerStreamingClientNode
  );
};
