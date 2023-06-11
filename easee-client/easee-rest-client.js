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
  const fetch = (...args) =>
    import("node-fetch").then(({ default: fetch }) => fetch(...args));

  function EaseeRestClient(n) {
    RED.nodes.createNode(this, n);
    var node = this;
    node.charger = n.charger;
    node.site = n.site;
    node.circuit = n.circuit;
    node.configurationNode = n.configuration;
    node.connectionConfig = RED.nodes.getNode(node.configurationNode);

    if (!this.connectionConfig) {
      this.error("Missing easee configuration");
      return;
    }

    node.genericCall = (url, send = true, method = "get", body = {}) => {
      return node
        .doAuthRestCall(url, method, {}, body)
        .then((json) => {
          if (send && json) {
            node.send({
              topic: url,
              payload: json,
              auth: {
                accessToken: node.connectionConfig.accessToken,
                refreshToken: node.connectionConfig.refreshToken,
                tokenExpires: node.connectionConfig.tokenExpires,
                tokenExpiresIn: Math.floor(
                  (node.connectionConfig.tokenExpires - new Date()) / 1000
                ),
              },
            });
          }
          return json;
        })
        .catch((error) => {
          node.error("easee-rest-client genericCall() failed");
          console.error(error);
          node.warn(error);
        });
    };

    this.on("input", function (msg, send, done) {
      let url = "";
      if (msg.topic == "login") {
        node.connectionConfig
          .doLogin()
          .then((json) => {
            node.send({
              topic: "/accounts/login/",
              payload: json,
              auth: {
                accessToken: node.connectionConfig.accessToken,
                refreshToken: node.connectionConfig.refreshToken,
                tokenExpires: node.connectionConfig.tokenExpires,
                tokenExpiresIn: node.connectionConfig.tokenExpires - new Date(),
              },
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
              auth: {
                accessToken: node.connectionConfig.accessToken,
                refreshToken: node.connectionConfig.refreshToken,
                tokenExpires: node.connectionConfig.tokenExpires,
                tokenExpiresIn: node.connectionConfig.tokenExpires - new Date(),
              },
            });
          })
          .catch((error) => {
            console.error(error);
            node.warn(error);
          });
      } else if (
        "payload" in msg &&
        typeof msg.payload == "object" &&
        "path" in msg.payload
      ) {
        if ("body" in msg.payload) {
          // Do POST
          node.genericCall(msg.payload.path, true, "post", msg.payload.body);
        } else {
          // Do GET
          node.genericCall(msg.payload.path);
        }
      } else {
        try {
          switch (msg.topic) {
            case "dynamic_current":
              if (
                !("payload" in msg) ||
                !(typeof msg.payload == "object") ||
                !("site_id" in msg.payload)
              ) {
                node.error("dynamic_current failed: site_id missing");
              } else if (!("circuit_id" in msg.payload)) {
                node.error("dynamic_current failed: circuit_id missing");
              } else if ("body" in msg.payload) {
                // Do POST update of circuit
                node.genericCall(
                  "/sites/" +
                    msg.payload.site_id +
                    "/circuits/" +
                    msg.payload.circuit_id +
                    "/dynamicCurrent",
                  true,
                  "post",
                  msg.payload.body
                );
              } else {
                // GET circuit information
                node.genericCall(
                  "/sites/" +
                    msg.payload.site_id +
                    "/circuits/" +
                    msg.payload.circuit_id +
                    "/dynamicCurrent"
                );
              }

              break;

            case "charger":
              node.genericCall("/chargers/" + node.charger);
              break;

            case "charger_details":
              node.genericCall("/chargers/" + node.charger + "/details");
              break;

            case "charger_state":
              const url = "/chargers/" + node.charger + "/state";
              node.genericCall(url, false).then((json) => {
                try {
                  if (typeof json !== "object") {
                    node.error("charger_state failed");
                  } else {
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
                      auth: {
                        accessToken: node.connectionConfig.accessToken,
                        refreshToken: node.connectionConfig.refreshToken,
                        tokenExpires: node.connectionConfig.tokenExpires,
                        tokenExpiresIn: Math.floor(
                          (node.connectionConfig.tokenExpires - new Date()) /
                            1000
                        ),
                      },
                    });
                  }
                } catch (e) {
                  node.warn("command failed: " + error);
                  node.error("command failed: " + error);
                }
              });
              break;

            case "charger_site":
              node.genericCall("/chargers/" + node.charger + "/site");
              break;

            case "charger_session_latest":
              node.genericCall(
                "/chargers/" + node.charger + "/sessions/latest"
              );
              break;

            case "charger_session_ongoing":
              node.genericCall(
                "/chargers/" + node.charger + "/sessions/ongoing"
              );
              break;

            case "stop_charging":
              node.genericCall(
                "/chargers/" + node.charger + "/commands/stop_charging",
                true,
                "post"
              );
              break;

            case "start_charging":
              node.genericCall(
                "/chargers/" + node.charger + "/commands/start_charging",
                true,
                "post"
              );
              break;

            case "pause_charging":
              node.genericCall(
                "/chargers/" + node.charger + "/commands/pause_charging",
                true,
                "post"
              );
              break;

            case "resume_charging":
              node.genericCall(
                "/chargers/" + node.charger + "/commands/resume_charging",
                true,
                "post"
              );
              break;

            case "toggle_charging":
              node.genericCall(
                "/chargers/" + node.charger + "/commands/toggle_charging",
                true,
                "post"
              );
              break;

            default:
              node.send({ topic: "error", payload: "Unknown topic" });
              node.status({
                fill: "red",
                shape: "dot",
                text: "Unknown topic",
              });
              break;
          }
        } catch (error) {
          node.warn("command failed: " + error);
        }
      }

      if (done) {
        done();
      }
    });

    node.doAuthRestCall = async (
      url,
      method = "get",
      headers = {},
      body = {}
    ) => {
      headers = {
        ...headers,
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: "Bearer " + node.connectionConfig.accessToken,
      };
      const bodyPayload = JSON.stringify(body);
      if (!node.connectionConfig.accessToken) {
        node.send({ topic: "error", payload: "Not logged in" });
        node.status({
          fill: "red",
          shape: "dot",
          text: "Not logged in",
        });
        return;
      }
      try {
        const response = await fetch(node.connectionConfig.RestApipath + url, {
          method: method,
          headers: headers,
          body: method == "post" ? bodyPayload : null,
        });

        // console.log(response);
        if (!response.ok) {
          console.error("Could not fetch(): " + response.statusText);
          throw Error("REST Command failed, check console for errors.");
        }

        const text = await response.text();
        // console.error(text);
        try {
          const data = JSON.parse(text);
          node.status({
            fill: "green",
            shape: "dot",
            text: url,
          });
          return data;
        } catch (err) {
          node.status({
            fill: "green",
            shape: "dot",
            text: url,
          });
          return { status: response.status, statusText: response.statusText };
        }
      } catch (error) {
        node.error({
          url: node.connectionConfig.RestApipath + url,
          method: method,
          headers: headers,
          body: method == "post" ? bodyPayload : null,
        });
        node.error("easee-rest-client fetch() failed");
        node.error(error);
        console.error(error);
        return {};
      }
    };

    node.doRestCall = async (url, body, method = "post", headers = {}) => {
      headers = {
        ...headers,
        Accept: "application/json",
        "Content-Type": "application/json",
      };
      const bodyPayload = JSON.stringify(body);

      const response = await fetch(node.connectionConfig.RestApipath + url, {
        method: method,
        body: method == "post" ? bodyPayload : null,
        headers: headers,
      })
        .then((response) => {
          if (!response.ok) {
            throw Error("REST Command failed, check console for errors.");
          }
          return response.json();
        })
        .then((json) => {
          if ("accessToken" in json) {
            node.connectionConfig.accessToken = json.accessToken;
            node.connectionConfig.refreshToken = json.refreshToken;
            var t = new Date();
            t.setSeconds(t.getSeconds() + json.expiresIn);
            node.connectionConfig.tokenExpires = t;
          }
          node.status({
            fill: "green",
            shape: "dot",
            text: url,
          });
          return json;
        })
        .catch((error) => {
          node.error(error);
          console.error(error);
        });
      return response;
    };
  }

  RED.nodes.registerType("easee-rest-client", EaseeRestClient);
};
