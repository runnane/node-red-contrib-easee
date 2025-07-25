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
      node.skipNegotiation = n.skipNegotiation || false;
      node.connectionConfig = RED.nodes.getNode(node.configurationNode);
      node.responses = n.responses;
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

      // Get the Easee client from the configuration node
      const easeeClient = this.connectionConfig.easeeClient;
      if (!easeeClient) {
        node.emit("erro", {
          err: "[easee] Configuration node not properly initialized",
        });
        node.status({
          fill: "red",
          shape: "ring",
          text: "Configuration not initialized",
        });
        return;
      }

      // Check if credentials are valid using modular validation
      try {
        const validation = this.connectionConfig.validateCredentials();
        if (!validation.valid) {
          node.emit("erro", {
            err: `[easee] Configuration node is invalid: ${validation.message}`,
          });
          node.status({
            fill: "red",
            shape: "ring",
            text: "Invalid configuration",
          });
          return;
        }
      } catch (error) {
        node.emit("erro", {
          err: `[easee] Error validating configuration: ${error.message}`,
        });
        node.status({
          fill: "red",
          shape: "ring",
          text: "Configuration error",
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

        node.connection.send("SubscribeWithCurrentState", node.charger, true);

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

        easeeClient.logger.error("Error in easee-streaming-client:", event.err);
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
      node.startconn = async () => {
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

        // Ensure we have a fresh token before connecting
        try {
          const isAuthenticated = await node.connectionConfig.ensureAuthentication();
          if (!isAuthenticated) {
            node.emit("erro", {
              err: "Authentication failed, cannot connect to SignalR",
            });
            node.reconnectTimoutHandle = setTimeout(
              () => node.startconn(),
              node.reconnectInterval
            );
            return;
          }
        } catch (error) {
          easeeClient.logger.error("Authentication error before SignalR connection:", error);
          node.emit("erro", {
            err: "Authentication error: " + error.message,
          });
          node.reconnectTimoutHandle = setTimeout(
            () => node.startconn(),
            node.reconnectInterval
          );
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

        // Debug: log token status and decode it to check permissions
        const token = node.connectionConfig.accessToken;
        easeeClient.logger.debug("Access token available, length:", token ? token.length : 0);
        
        if (token) {
          try {
            // Import the lib directly to access token functions
            const easeeLib = require('../lib');
            
            // Try to decode the token to see what's inside
            const tokenPayload = easeeLib.auth.decodeToken(token);
            if (tokenPayload) {
              easeeClient.logger.debug("Token payload keys:", Object.keys(tokenPayload));
              easeeClient.logger.debug("Token expires at:", tokenPayload.exp ? new Date(tokenPayload.exp * 1000).toISOString() : 'unknown');
              if (tokenPayload.scope) {
                easeeClient.logger.debug("Token scopes:", tokenPayload.scope);
              }
              if (tokenPayload.aud) {
                easeeClient.logger.debug("Token audience:", tokenPayload.aud);
              }
            }
            
            // Also validate the token
            const tokenValidation = easeeLib.auth.validateToken(token);
            easeeClient.logger.debug("Token validation:", tokenValidation);
          } catch (error) {
            easeeClient.logger.debug("Could not decode/validate token:", error.message);
          }
        }
        
        easeeClient.logger.debug("Connecting to SignalR hub:", node.connectionConfig.signalRpath);
        easeeClient.logger.debug("For charger:", node.charger);

        // Configure SignalR options properly for v8+
        const signalROptions = {
          accessTokenFactory: () => {
            const token = node.connectionConfig.accessToken;
            easeeClient.logger.debug("Providing access token for SignalR, length:", token ? token.length : 0);
            return token;
          }
        };

        // Add skipNegotiation option if enabled - requires WebSocket transport
        if (node.skipNegotiation) {
          signalROptions.skipNegotiation = true;
          signalROptions.transport = signalR.HttpTransportType.WebSockets;
          easeeClient.logger.debug("SignalR negotiation disabled - forcing direct WebSocket connection");
        }

        // Some SignalR hubs require query parameters for authorization context
        const signalRUrl = node.connectionConfig.signalRpath;
        easeeClient.logger.debug("Using SignalR URL:", signalRUrl);
        easeeClient.logger.debug("Skip negotiation:", node.skipNegotiation);

        try {
          var connection = new signalR.HubConnectionBuilder()
            .withUrl(signalRUrl, signalROptions)
            .configureLogging(signalR.LogLevel.Debug)
            .build();

          node.connection = connection; // keep for closing
          node.handleConnection(connection);
        } catch (error) {
          easeeClient.logger.error("Error creating SignalR connection:", error);
          node.emit("erro", {
            err: `[easee] Error creating SignalR connection: ${error.message}`,
          });
          node.status({
            fill: "red",
            shape: "ring",
            text: "SignalR connection error",
          });
          return;
        }
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
            easeeClient.logger.error("Authentication failed during reconnect");
          }
        }).catch((error) => {
          easeeClient.logger.error("Error during reconnect:", error);
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
