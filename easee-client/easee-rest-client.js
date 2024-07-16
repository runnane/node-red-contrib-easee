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

      node.REQUEST = async (url, method = "GET", body = null) => {
        node.status({
          fill: "yellow",
          shape: "dot",
          text: method + ": sending",
        });
        return node.connectionConfig
          .genericCall(url, method, body)
          .then((response) => {
            node.status({
              fill: "green",
              shape: "dot",
              text: method + ": ok",
            });
            node.send({
              status: "ok",
              topic: url,
              payload: response,
            });
            return response;
          })
          .catch((error) => {
            node.status({
              fill: "red",
              shape: "dot",
              text: method + ": failed",
            });
            node.send({
              status: "error",
              topic: method + ": failed",
              payload: null,
              error: error,
              url: url
            });
            return error;
          });
      };


      /**
       * REST API GET helper command
       * @param {*} url 
       * @returns 
       */
      node.GET = async (url) => {
        return node.REQUEST(url, "GET");
      };

      /**
       * REST API DELETE helper command
       * 
       * @param {*} url 
       * @returns 
       */
      node.DELETE = async (url) => {
        return node.REQUEST(url, "DELETE");
      };

      /**
       * REST API POST helper command
       * 
       * @param {*} url 
       * @param {*} body 
       * @returns 
       */
      node.POST = async (url, body = {}) => {
        return node.REQUEST(url, "POST", body);
      };

      /**
       * On incoming nodered message
       */
      node.on("input", function (msg, send, done) {
        node.charger = msg?.charger ?? n.charger;
        node.site = msg?.site ?? n.site;
        node.circuit = msg?.circuit ?? n.circuit;

        let method = "GET";
        let path = "";
        let body;
        let url = "";

        if (msg?.payload?.method ?? false) {
          method = msg.payload.method.toUpperCase();
        }

        if (node[method] == undefined) {
          node.send({
            status: "error",
            topic: "error",
            payload: null,
            error: `Invalid HTTP method: ${method}`,
          });
          return;
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
          // Run full path as defined by node-red parameters
          node[method](path, body);
        } else if (msg?.topic ?? false) {
          // Run command as defined by topic
          if (msg.topic == "login") {
            node.connectionConfig
              .doLogin()
              .then((json) => {
                node.send({
                  status: "ok",
                  topic: "/accounts/login/",
                  payload: json,
                });
              })
              .catch((error) => {
                console.error(error);
                // node.warn(error);
                node.send({
                  status: "error",
                  topic: "login: failed",
                  payload: null,
                  error: error,
                  url: url
                });
              });
          } else if (msg.topic == "refresh_token") {
            node.connectionConfig
              .doRefreshToken()
              .then((json) => {
                node.send({
                  status: "ok",
                  topic: "/accounts/refresh_token/",
                  payload: json,
                });
              })
              .catch((error) => {
                console.error(error);
                // node.warn(error);
                node.send({
                  status: "error",
                  topic: "refresh_token: failed",
                  payload: null,
                  error: error,
                  url: url
                });
              });

          } else {
            try {
              switch (msg.topic) {
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
                        status: "ok",
                        topic: url,
                        payload: json,
                      });
                    }

                  }).catch((error) => {
                    //  node.warn(url + " failed: " + error);
                    node.status({
                      fill: "red",
                      shape: "dot",
                      text: "Command failed",
                    });
                    node.send({
                      status: "error",
                      topic: "charger_state command failed",
                      payload: null,
                      error: error,
                    });
                  });
                  break;

                default:

                  node.status({
                    fill: "red",
                    shape: "dot",
                    text: "Unknown topic",
                  });

                  node.send({
                    status: "error",
                    topic: "Unknown topic '" + msg.topic + "'",
                    payload: null,
                    error: error,
                  });

                  break;
              }


            } catch (error) {
              node.warn("REST client command failed: " + error);

              node.send({
                status: "error",
                topic: "REST client command failed",
                payload: null,
                error: error,
              });
            }
          }
        } else {
          // Missing topic
          node.send({
            status: "error",
            topic: "error",
            payload: null,
            error: "Missing required payload.path or topic",
          });
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
