/**
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
 **/

module.exports = function (RED) {
  "use strict";

  class EaseeRestClient {
    constructor(n) {
      RED.nodes.createNode(this, n);
      var node = this;
      node.charger = n.charger;
      node.site = n.site;
      node.circuit = n.circuit;
      node.configurationNode = n.configuration;
      node.connectionConfig = RED.nodes.getNode(node.configurationNode);

      if (!node.connectionConfig) {
        node.error("Missing easee configuration");
        return;
      }

      // REST API GET COMMAND (wrapper)
      node.GET = async (url) => {
        node.status({
          fill: "yellow",
          shape: "dot",
          text: "GET: sending",
        });
        return node.connectionConfig
          .genericCall(url)
          .then((response) => {
            node.status({
              fill: "green",
              shape: "dot",
              text: "GET: ok",
            });
            node.send({
              topic: url,
              payload: response,
            });
            return response;
          })
          .catch((error) => {
            node.warn(url + " GET failed: " + error);
            node.status({
              fill: "red",
              shape: "dot",
              text: "GET: failed",
            });
            return error;
          });
      };

      // REST API DELETE COMMAND (wrapper)
      node.DELETE = async (url) => {
        node.status({
          fill: "yellow",
          shape: "dot",
          text: "DELETE: sending",
        });
        return node.connectionConfig
          .genericCall(url, "delete")
          .then((response) => {
            node.status({
              fill: "green",
              shape: "dot",
              text: "DELETE: ok",
            });
            node.send({
              topic: url,
              payload: response,
            });
            return response;
          })
          .catch((error) => {
            node.warn(url + " DELETE failed: " + error);
            node.status({
              fill: "red",
              shape: "dot",
              text: "DELETE: failed",
            });
            return error;
          });
      };

      // REST API POST COMMAND (wrapper)
      node.POST = async (url, body = {}) => {
        node.status({
          fill: "yellow",
          shape: "dot",
          text: "POST: sending",
        });
        return node.connectionConfig
          .genericCall(url, "post", body)
          .then((response) => {
            node.status({
              fill: "green",
              shape: "dot",
              text: "POST: ok",
            });
            node.send({
              topic: url,
              payload: response,
            });
            return response;
          })
          .catch((error) => {
            node.warn(url + " POST failed: " + error);
            node.status({
              fill: "red",
              shape: "dot",
              text: "POST: failed",
            });
            return error;
          });
      };

      // On incoming nodered message
      node.on("input", function (msg, send, done) {
        node.charger = msg?.charger ?? n.charger;
        node.site = msg?.site ?? n.site;
        node.circuit = msg?.circuit ?? n.circuit;

        let method = "GET";
        //   let parms = [];
        let path = "";
        let body;
        let url = "";
        if (msg?.payload?.method ?? false) {
          method = msg.payload.method.toUpperCase();
        }

        if (msg?.payload?.path ?? false) {
          path = msg.payload.path;
        } else if (msg?.command ?? false) {
          path = msg.command;
        }

        if (msg?.payload?.body ?? false) {
          body = msg.payload.body;
        }


        if (path && method && method in node) {
          // Run full path as defined by NR parameters
          console.debug(`Running ${method} against ${path} with ${body}`);
          node[method](path, body);
        } else if (msg?.topic ?? false) {
          // Run command as defined by topic
          if (msg.topic == "login") {
            node.connectionConfig
              .doLogin()
              .then((json) => {
                node.send({
                  topic: "/accounts/login/",
                  payload: json,
                });
              })
              .catch((error) => {
                console.error(error);
                node.warn(error);
              });
          } else if (msg.topic == "refresh_token") {
            node.connectionConfig
              .doRefreshToken()
              .then((json) => {
                node.send({
                  topic: "/accounts/refresh_token/",
                  payload: json,
                });
              })
              .catch((error) => {
                console.error(error);
                node.warn(error);
              });

          } else {
            try {
              switch (msg.topic) {
                // TODO: This one should be moved to another node ??
                case "dynamic_current":
                  if (!node.site) {
                    node.error("dynamic_current failed: site missing");
                  } else if (!node.circuit) {
                    node.error("dynamic_current failed: circuit missing");
                  } else if (typeof msg.payload == "object") {
                    // Do POST update of circuit
                    node.POST(
                      "/sites/" +
                      node.site +
                      "/circuits/" +
                      node.circuit +
                      "/dynamicCurrent",
                      msg.payload
                    );
                  } else {
                    // GET circuit information
                    node.GET(
                      "/sites/" +
                      node.site +
                      "/circuits/" +
                      node.circuit +
                      "/dynamicCurrent"
                    );
                  }

                  break;

                case "charger":
                  node.GET(
                    "/chargers/" +
                    node.charger +
                    "?alwaysGetChargerAccessLevel=true"
                  );
                  break;

                case "charger_details":
                  node.GET("/chargers/" + node.charger + "/details");
                  break;

                case "charger_site":
                  node.GET("/chargers/" + node.charger + "/site");
                  break;

                case "charger_config":
                  node.GET("/chargers/" + node.charger + "/config");
                  break;

                case "charger_session_latest":
                  node.GET("/chargers/" + node.charger + "/sessions/latest");
                  break;

                case "charger_session_ongoing":
                  node.GET("/chargers/" + node.charger + "/sessions/ongoing");
                  break;

                case "start_charging":
                case "stop_charging":
                case "pause_charging":
                case "resume_charging":
                case "toggle_charging":
                case "reboot":
                  node.POST(
                    "/chargers/" + node.charger + "/commands/" + msg.topic
                  );
                  break;

                case "charger_state":
                  url = "/chargers/" + node.charger + "/state";
                  node.connectionConfig.genericCall(url).then((json) => {
                    try {
                      if (typeof json !== "object") {
                        node.error("charger_state failed");
                      } else {
                        // Parse observations
                        Object.keys(json).forEach((idx) => {
                          json[idx] = node.connectionConfig.parseObservation(
                            {
                              dataName: idx,
                              value: json[idx],
                              origValue: json[idx],
                            },
                            "name"
                          );
                        });

                        node.send({
                          topic: url,
                          payload: json,
                        });
                      }
                    } catch (error) {
                      node.warn(url + " failed: " + error);
                      node.send({ topic: "error", payload: error, url: url });
                    }
                  });
                  break;

                default:
                  node.send({ topic: "error", payload: "Unknown topic '" + msg.topic + "'" });
                  node.status({
                    fill: "red",
                    shape: "dot",
                    text: "Unknown topic",
                  });
                  break;
              }
            } catch (error) {
              node.warn("Command failed: " + error);
              node.send({ topic: "error", payload: error });
            }
          }
        } else {
          // Missing topic
          node.send({ topic: "error", payload: "Missing required payload.path or topic" });
          node.status({
            fill: "red",
            shape: "dot",
            text: "Missing required payload.path or topic",
          });
        }
        if (done) {
          done();
        }
      });
    }
  }

  RED.nodes.registerType("easee-rest-client", EaseeRestClient);
};
