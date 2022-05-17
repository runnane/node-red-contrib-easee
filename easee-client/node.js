/**
 * Copyright JS Foundation and other contributors, http://js.foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function (RED) {
  "use strict";
  const signalR = require("@microsoft/signalr");
  const fetch = require('node-fetch');
  var inspect = require("util").inspect;

  // =======================
  // === SignalR Configuration/Connection node ===
  // =======================
  function SignalRClientNode(n) {
    // Create a RED node
    RED.nodes.createNode(this, n);
    var node = this;

    // Local copies of the node configuration (as defined in the .html)
   

    node.secure = n.secure;
    node.token = false;
    node.username = n.username;
    node.password = n.password;
    node.charger = n.charger;
    node.options = {};
    node.reconnectInterval = parseInt(n.reconnectInterval);

    if (node.reconnectInterval < 100) node.reconnectInterval = 100;
    node.path = 'https://api.easee.cloud/hubs/chargers';

    node.closing = false; // Used to check if node-red is closing, or not, and if so decline any reconnect attempts.

    // Get token for SignalR auth
    async function getToken(){
      if(!node.username) {
        console.log("[easee] No username, exiting");
        return;
      }
      if(!node.password) {
        console.log("[easee] No password, exiting");
        return;
      }
      if(!node.charger) {
        console.log("[easee] No charger, exiting");
        return;
      }
      const body = { userName: node.username, password: node.password };
      const response = await fetch('https://api.easee.cloud/api/accounts/login', {
        method: 'post',
        body: JSON.stringify(body),
        headers: {'Content-Type': 'application/json'}
      });
      const data = await response.json();
      console.log("[easee] Got token: " + data.accessToken);
      node.token = data.accessToken
    }


    // Connect to remote endpoint
    function startconn() {
      node.closing = false;
      if (node.reconnectTimoutHandle) clearTimeout(node.reconnectTimoutHandle);
      node.reconnectTimoutHandle = null;

      if(!node.charger) {
        console.log("[easee] No charger, exiting");
        node.emit('erro', {
          err: "No charger, exiting",
        });
        return;
      }
      if(!node.token) {
        console.log("[easee] No token, waiting");
        node.emit('erro', {
          err: "No token, waiting",
        });
        node.reconnectTimoutHandle = setTimeout(() => startconn(), node.reconnectInterval);
        return;
      }

      node.options.accessTokenFactory = () => node.token;

      var connection = new signalR.HubConnectionBuilder()
        .withUrl(node.path, node.options)
        .configureLogging(signalR.LogLevel.Debug)
        .build();

      node.connection = connection; // keep for closing
      handleConnection(connection);
    }

    async function handleConnection( /*connection*/ connection) {
      var id = '';

      function notifyOnError(err) {
        if (!err) return;
        node.emit('erro', {
          err: err,
          id: id
        });
      }

      function reconnect() {
        if (node.reconnectTimoutHandle) clearTimeout(node.reconnectTimoutHandle);
        if (node.closing) return;
        node.reconnectTimoutHandle = setTimeout(() => startconn(), node.reconnectInterval);
      }

      try {
        await connection.start();
        // We're connected
        id = connection.connectionId;
        node.emit('opened', {
          count: '',
          id: id
        });

        connection.onclose(err => {
          node.emit('closed', {
            count: '',
            id: id
          });
          notifyOnError(err);
          reconnect();
        });
      } catch (err) {
        notifyOnError(err);
        reconnect();
      }
    }

    node.closing = false;
    getToken();
    startconn(); // start outbound connection

    node.on("close", function () {
      node.closing = true;
      node.connection.stop();
      if (node.reconnectTimoutHandle) {
        clearTimeout(node.reconnectTimoutHandle);
        node.reconnectTimoutHandle = null;
      }
    });
  }
  RED.nodes.registerType("signalr-client", SignalRClientNode);

  // =======================
  // === SignalR In node ===
  // =======================
  function SignalRInNode(n) {
    RED.nodes.createNode(this, n);
    var node = this;
    node.client = n.client;
    node.responses = n.responses;
    node.connectionConfig = RED.nodes.getNode(this.client);

    if (!this.connectionConfig) {
      this.error(RED._("signalr.errors.missing-conf"));
      return;
    }
    this.connectionConfig.on('opened', function (event) {
      console.log("[easee] onOpened()");
      node.status({
        fill: "green",
        shape: "dot",
        text: RED._("signalr.status.connected", {
          count: event.count
        }),
        event: "connect",
        _session: {
          type: "signalr",
          id: event.id
        }
      });

      // send the connected msg
      node.send([{ _connectionId: event.id, payload: "Connected" }, null, null]);

      console.log("[easee] Connected, sending SubscribeWithCurrentState");
      node.connectionConfig.connection.send("SubscribeWithCurrentState", node.connectionConfig.charger, true);

      node.connectionConfig.connection.on("ProductUpdate", (data) => {
        //console.log("[easee] got ProductUpdate");
        node.send([null, null, null, { payload: data}, null, null]);
      });

      node.connectionConfig.connection.on("ChargerUpdate", (data) => {
        //console.log("[easee] got ProductUpdate");
        node.send([null, null, null, null, { payload: data}, null]);
      });
      node.connectionConfig.connection.on("CommandResponse", (data) => {
        //console.log("[easee] got ProductUpdate");
        node.send([null, null, null,null, null,{ payload: data}]);
      });

      
      

    });
   
    this.connectionConfig.on('erro', function (event) {
      node.status({
        fill: "red",
        shape: "ring",
        text: RED._("node-red:common.status.error"),
        event: "error",
        _session: {
          type: "signalr",
          id: event.id
        }
      });
      var errMsg = { payload: event.err };
      if (event.id) errMsg._connectionId = event.id;
      node.send([null, errMsg, null]);
    });
    this.connectionConfig.on('closed', function (event) {
      var status;
      if (event.count > 0) {
        status = {
          fill: "green",
          shape: "dot",
          text: RED._("signalr.status.connected", {
            count: event.count
          })
        };
      } else {
        status = {
          fill: "red",
          shape: "ring",
          text: RED._("node-red:common.status.disconnected")
        };
      }
      status.event = "disconnect";
      status._session = {
        type: "signalr",
        id: event.id
      }
      node.status(status);
      node.send([null, null, { _connectionId: event.id, payload: "Disconnected" }]);
    });
    this.on('close', function (removed, done) {
      if (removed && node.connectionConfig) {
        node.connectionConfig.removeInputNode(node);
      } else {
        // This node is being restarted
      }
      node.status({});
      if (done) done();
    });
  }
  RED.nodes.registerType("signalr in", SignalRInNode);

  // =======================
  // === SignalR Out node ===
  // =======================
  function SignalROutNode(n) {
    RED.nodes.createNode(this, n);
    var node = this;
    node.client = n.client;
    node.connectionConfig = RED.nodes.getNode(this.client);
    if (!node.connectionConfig) {
      this.error(RED._("signalr.errors.missing-conf"));
      return
    }
    node.connectionConfig.on('opened', function (event) {
      node.status({
        fill: "green",
        shape: "dot",
        text: RED._("signalr.status.connected", {
          count: event.count
        }),
        event: "connect",
        _session: {
          type: "signalr",
          id: event.id
        }
      });
    });
    node.connectionConfig.on('erro', function (event) {
      node.status({
        fill: "red",
        shape: "ring",
        text: RED._("node-red:common.status.error"),
        event: "error",
        _session: {
          type: "signalr",
          id: event.id
        }
      })
    });
    node.connectionConfig.on('closed', function (event) {
      var status;
      if (event.count > 0) {
        status = {
          fill: "green",
          shape: "dot",
          text: RED._("signalr.status.connected", {
            count: event.count
          })
        };
      } else {
        status = {
          fill: "red",
          shape: "ring",
          text: RED._("node-red:common.status.disconnected")
        };
      }
      status.event = "disconnect";
      status._session = {
        type: "signalr",
        id: event.id
      }
      node.status(status);
    });
    node.on("input", function (msg, nodeSend, nodeDone) {
      var methodName = msg.topic;
      var payload = msg.payload;
      var connectionConfig = node.connectionConfig;
      if (!connectionConfig) {
        node.error('Unable to find connection configuration');
        if (nodeDone) nodeDone();
        return;
      }
      if (!methodName) {
        node.error('Missing msg.topic');
        if (nodeDone) nodeDone();
        return;
      }
      if (!payload) {
        node.error('Missing msg.payload');
        if (nodeDone) nodeDone();
        return;
      }
      if (!Array.isArray(payload)) {
        node.error('msg.payload must be an array');
        if (nodeDone) nodeDone();
        return;
      }
      connectionConfig.connection.send(methodName, ...payload);
      if (nodeDone) nodeDone();
    });
    node.on('close', function (done) {
      node.status({});
      if (done) done();
    });
  }
  RED.nodes.registerType("signalr out", SignalROutNode);
}