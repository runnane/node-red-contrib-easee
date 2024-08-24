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
      node.connection = RED.nodes.getNode(node.configurationNode);

      if (!node.connection) {
        node.error("Missing easee configuration");
        return;
      }

      /**
       * Helper func for sending sailure
       * @param string url 
       * @param {string} method 
       * @param {*} error 
       */
      node.fail = async (url, method, error) => {
        console.error(error);
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
        return true;
      };

      /**
      * Helper func for sending success
      * @param {string} url 
      * @param {string} method 
      * @param {*} response 
      */
      node.ok = async (url, method, response) => {
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
        node.status({
          fill: "yellow",
          shape: "dot",
          text: method + ": sending",
        });
        return node.connection
          .genericCall(url, method, body)
          .then((response) => {
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
      node.GET = async (url) => {
        return node.REQUEST(url, "GET");
      };

      /**
       * REST API POST COMMAND (wrapper)
       * 
       * @param {string} url 
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
        } else if (msg?.payload?.body ?? false) {
          method = "POST";
        }

        if (msg?.payload?.path ?? false) {
          path = msg.payload.path;
        } else if (msg?.command ?? false) {
          path = msg.command;
        }

        if (msg?.payload?.body ?? false) {
          body = msg.payload.body;
        }


        if (node[method] == undefined) {
          return node.fail("error", "POST", `Invalid HTTP method: ${method}`);
        }

        if (path && method) {
          // Run full path as defined by node-red parameters
          node[method](path, body);

        } else if (msg?.topic ?? false) {
          // Run command as defined by topic
          try {
            switch (msg.topic) {
              case "login":
                node.connection
                  .doLogin()
                  .then((json) => {
                    return node.ok("/accounts/login/", "POST", json);
                  })
                  .catch((error) => {
                    return node.fail("/accounts/login/", "POST", error);
                  });
                break;
              case "refresh_token":
                node.connection
                  .doRefreshToken()
                  .then((json) => {
                    return node.ok("/accounts/refresh_token/", "POST", json);
                  })
                  .catch((error) => {
                    return node.fail("/accounts/refresh_token/", "POST", error);

                  });

                break;
              case "dynamic_current":
                if (!node.site) {
                  node.error("dynamic_current failed: site missing");
                  return;
                } else if (!node.circuit) {
                  node.error("dynamic_current failed: circuit missing");
                  return;
                } else if (typeof msg.payload == "object") {
                  // Do POST update of circuit
                  node.POST(`/sites/${node.site}/circuits/${node.circuit}/dynamicCurrent`, msg.payload);
                } else {
                  // GET circuit information
                  node.GET(`/sites/${node.site}/circuits/${node.circuit}/dynamicCurrent`);
                }
                break;

              case "charger":
                node.GET(`/chargers/${node.charger}?alwaysGetChargerAccessLevel=true`);
                break;

              case "charger_details":
                node.GET(`/chargers/${node.charger}/details`);
                break;

              case "charger_site":
                node.GET(`/chargers/${node.charger}/site`);
                break;

              case "charger_config":
                node.GET(`/chargers/${node.charger}/config`);
                break;

              case "charger_session_latest":
                node.GET(`/chargers/${node.charger}/sessions/latest`);
                break;

              case "charger_session_ongoing":
                node.GET(`/chargers/${node.charger}/sessions/ongoing`);
                break;

              case "start_charging":
              case "stop_charging":
              case "pause_charging":
              case "resume_charging":
              case "toggle_charging":
              case "reboot":
                node.POST(`/chargers/${node.charger}/commands/${msg.topic}`);
                break;

              case "charger_state":
                url = `/chargers/${node.charger}/state`;
                node.connection.genericCall(url).then((json) => {
                  if (typeof json !== "object") {
                    node.error("charger_state failed");
                  } else {
                    // Parse observations
                    Object.keys(json).forEach((idx) => {
                      json[idx] = node.connection.parseObservation(
                        {
                          dataName: idx,
                          value: json[idx],
                          origValue: json[idx],
                        },
                        "name"
                      );
                    });
                    return node.ok(url, "GET", json);

                  }

                }).catch((error) => {
                  return node.fail(url, "GET", error);

                });
                break;

              default:

                return node.fail("error", "GET", `Unknown topic ${msg.topic}`);


                break;
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
  }

  RED.nodes.registerType("easee-rest-client", EaseeRestClient);
};
