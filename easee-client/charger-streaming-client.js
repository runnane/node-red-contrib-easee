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
  const signalR = require("@microsoft/signalr");
  const fetch = (...args) =>
    import('node-fetch').then(({ "default": fetch }) => fetch(...args));

  var inspect = require("util").inspect;

  // =======================
  // === The node itself ===
  // =======================
  function ChargerStreamingClientNode(n) {
    RED.nodes.createNode(this, n);
    var node = this;
    node.charger = n.charger;
    node.configurationNode = n.configuration;
    node.responses = n.responses;
    node.connectionConfig = RED.nodes.getNode(node.configurationNode);
    node.responses = n.responses;
    node.options = {};
    node.reconnectInterval = 3000;
    node.closing = false; // Used to check if node-red is closing, or not, and if so decline any reconnect attempts.

    if (!this.connectionConfig) {
      this.error("Missing easee configuration");
      return;
    }

    node.fullReconnect = () => {
      node.connectionConfig.doLogin().then(json => {
        node.startconn();
      });
    };

    this.connectionConfig.on('update', (msg) => {
      node.status({
        fill: "green",
        shape: "dot",
        text: msg.update
      });
      //console.log(msg);
    });

    this.on('input', (msg, send, done) => {
      node.fullReconnect();
      if (done) {
        done();
      }
    });

    this.on('opened', (event) => {
      node.status({
        fill: "green",
        shape: "dot",
        text: RED._("node-red:common.status.connected"),
        event: "connect",
        _session: {
          type: "signalr",
          id: event.id
        }
      });

      // send the connected msg
      node.send([{ _connectionId: event.id, payload: "Connected" }, null, null]);

      //sending SubscribeWithCurrentState");
      node.connection.send("SubscribeWithCurrentState", node.charger, true);

      node.connection.on("ProductUpdate", (data) => {
        data = node.connectionConfig.parseObservation(data);
        node.send([null, null, null, { payload: data }, null, null]);
      });

      node.connection.on("ChargerUpdate", (data) => {
        data = node.connectionConfig.parseObservation(data);
        node.send([null, null, null, null, { payload: data }, null]);
      });
      node.connection.on("CommandResponse", (data) => {
        //console.log("[easee] got ProductUpdate");
        node.send([null, null, null, null, null, { payload: data }]);
      });
    });

    this.on('erro', (event) => {
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

    this.on('closed', (event) => {
      var status;
      if (event.count > 0) {
        status = {
          fill: "green",
          shape: "dot",
          text: RED._("node-red:common.status.connected")
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
      };
      node.status(status);
      node.send([null, null, { _connectionId: event.id, payload: "Disconnected" }]);
    });

    this.on('close',  (removed, done) => {
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
      node.status({});
      if (done) done();
    });
   
    // Connect to remote endpoint
    node.startconn = () => {
      node.closing = false;
      if (node.reconnectTimoutHandle) clearTimeout(node.reconnectTimoutHandle);
      node.reconnectTimoutHandle = null;

      if (!node.charger) {
        node.error("No charger, exiting");
        node.emit('erro', {
          err: "No charger, exiting",
        });
        return;
      }
      if (!node.connectionConfig.accessToken) {
        node.error("No accessToken, exiting");
        node.emit('erro', {
          err: "No accessToken, waiting",
        });
        node.reconnectTimoutHandle = setTimeout(() => node.startconn(), node.reconnectInterval);
        return;
      }

      node.options.accessTokenFactory = () => node.connectionConfig.accessToken;

      var connection = new signalR.HubConnectionBuilder()
        .withUrl(node.connectionConfig.signalRpath, node.options)
        .configureLogging(signalR.LogLevel.Debug)
        .build();

      node.connection = connection; // keep for closing
      node.handleConnection(connection);
    }

    node.reconnect = () => {
      if (node.reconnectTimoutHandle) clearTimeout(node.reconnectTimoutHandle);
      if (node.closing) return;
      node.connectionConfig.doLogin().then(json => {
        node.reconnectTimoutHandle = setTimeout(() => node.startconn(), node.reconnectInterval);
      })
     
    }
    node.notifyOnError = (err, id) => {
      if (!err) return;
      node.emit('erro', {
        err: err,
        id: id
      });
    }

    node.handleConnection = async (connection) => {
      let id = '';
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
          node.notifyOnError(err, id);
          node.reconnect();
        });
      } catch (err) {
        node.notifyOnError(err, id);
        node.reconnect();
      }
    }

    node.closing = false;


    // Start in 2 sec
   setTimeout(() => node.fullReconnect(), 2000);


  }
  RED.nodes.registerType("charger-streaming-client", ChargerStreamingClientNode);

}
