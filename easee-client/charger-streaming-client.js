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
    
    node.accessToken = false;
    node.refreshToken = false;


    node.options = {};
    node.reconnectInterval = 3000;
    node.refreshTokenHandler = null;
    node.closing = false; // Used to check if node-red is closing, or not, and if so decline any reconnect attempts.

    if (!this.connectionConfig) {
      this.error("Missing easee configuration");
      return;
    }

    node.fullReconnect = () => {
      //console.log("[easee] fullReconnect() ");
      getToken().then(()=>{
        startconn();
      });
    }




    this.on('input', function(msg, send, done) {
      node.fullReconnect();
      if (done) {
        done();
      }
    });

    this.on('opened', function (event) {
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

    this.on('erro', function (event) {
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

    this.on('closed', function (event) {
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
      }
      node.status(status);
      node.send([null, null, { _connectionId: event.id, payload: "Disconnected" }]);
    });

    this.on('close', function (removed, done) {

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
    
    // Get tokens for SignalR auth
    async function getToken() {
      //console.log("[easee] getToken()");
      if (!node.connectionConfig.credentials.username) {          
        node.error("No username, exiting");
        return;
      }
      if (!node.connectionConfig.credentials.password) {
        node.error("No password, exiting");
        return;
      }
      if (!node.charger) {
        node.error("No charger, exiting");
        return;
      }
      const payload = JSON.stringify({ userName: node.connectionConfig.credentials.username, password: node.connectionConfig.credentials.password });

      const response = await fetch(node.connectionConfig.RestApipath + '/accounts/login', {
        method: 'post',
        body: payload,
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      if(!response.ok){
            // failed getting token
            console.log(data);
            console.log(response.status);
            console.log(response.statusText);
            node.error("failed response - getToken(), exiting");
            return;
      }
      if(!data.accessToken){
        // failed getting token
        console.log(data);
        console.log(headers);
        node.error("failed getToken(), exiting");
        return;
      }
      //console.log("[easee] Got accessToken: " + data.accessToken);
      //console.log("[easee] Got refreshToken: " + data.refreshToken);
      node.accessToken = data.accessToken;
      node.refreshToken = data.refreshToken;
      
      node.refreshTokenHandler = setTimeout(() => doRefreshToken(), 60*60*3 * 1000);
    }

    // Get token for SignalR auth
    async function doRefreshToken() {
      console.log("[easee] doRefreshToken()");
      if (!node.accessToken) {
        node.error("No accessToken, exiting");
        return;
      }
      if (!node.refreshToken) {
        node.error("No refreshToken, exiting");
        return;
      }

      
     
      const response = await fetch(node.connectionConfig.RestApipath + '/accounts/refresh_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/*+json'  },
        body: JSON.stringify({ accessToken: node.accessToken, refreshToken: node.refreshToken })
      });

      const data = await response.json();
      if(!data.accessToken){
        // failed getting token
        node.error("failed doRefreshToken(), exiting");
        return;
      }

      node.accessToken = data.accessToken;
      node.refreshToken = data.refreshToken;

      node.refreshTokenHandler = setTimeout(() => doRefreshToken(), 60*60*3 * 1000);
    }

    // Connect to remote endpoint
    function startconn() {
      //console.log("[easee] startconn() ");
      node.closing = false;
      if (node.reconnectTimoutHandle) clearTimeout(node.reconnectTimoutHandle);
      if (node.refreshTokenHandler) clearTimeout(node.refreshTokenHandler);
      node.reconnectTimoutHandle = null;
      node.refreshTokenHandler = null;

      if (!node.charger) {
        node.error("No charger, exiting");
        node.emit('erro', {
          err: "No charger, exiting",
        });
        return;
      }
      if (!node.accessToken) {
        node.error("No accessToken, exiting");
        node.emit('erro', {
          err: "No accessToken, waiting",
        });
        node.reconnectTimoutHandle = setTimeout(() => startconn(), node.reconnectInterval);
        return;
      }

      node.options.accessTokenFactory = () => node.accessToken;

      var connection = new signalR.HubConnectionBuilder()
        .withUrl(node.connectionConfig.signalRpath, node.options)
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
        getToken();
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
   //getToken();
   // startconn(); // start outbound connection

    // Start in 2 sec
   setTimeout(() => node.fullReconnect(), 2000);


  }
  RED.nodes.registerType("charger-streaming-client", ChargerStreamingClientNode);

}