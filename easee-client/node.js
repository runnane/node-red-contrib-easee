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

    node.accessToken = false;
    node.refreshToken = false;

    node.username = n.username;
    node.password = n.password;
    node.charger = n.charger;
    node.options = {};
    node.reconnectInterval = parseInt(n.reconnectInterval);
    node.refreshTokenHandler = null;

    if (node.reconnectInterval < 100) node.reconnectInterval = 100;
    node.path = 'https://api.easee.cloud/hubs/chargers';

    node.closing = false; // Used to check if node-red is closing, or not, and if so decline any reconnect attempts.

    // Get tokens for SignalR auth
    async function getToken() {
        if (!node.username) {
          console.log("[easee] No username, exiting");
          return;
        }
        if (!node.password) {
          console.log("[easee] No password, exiting");
          return;
        }
        if (!node.charger) {
          console.log("[easee] No charger, exiting");
          return;
        }
        
        const response = await fetch('https://api.easee.cloud/api/accounts/login', {
          method: 'post',
          body: JSON.stringify({ userName: node.username, password: node.password }),
          headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();
   //     const headers = response.headers();
        if(!response.ok){
             // failed getting token
             console.log(data);
             console.log(response.status);
             console.log(response.statusText);
             console.log("[easee] failed response - getToken(), exiting");
             return;
        }
        if(!data.accessToken){
          // failed getting token
          console.log(data);
          console.log(headers);
          console.log("[easee] failed getToken(), exiting");
          return;
        }
        //console.log("[easee] Got accessToken: " + data.accessToken);
        //console.log("[easee] Got refreshToken: " + data.refreshToken);
        node.accessToken = data.accessToken;
        node.refreshToken = data.refreshToken;
        
        node.refreshTokenHandler = setTimeout(() => refreshToken(), 60*60*3 * 1000);
    }

    // Get token for SignalR auth
    async function refreshToken() {
      console.log("[easee] refreshToken()");
      if (!node.accessToken) {
        console.log("[easee] No accessToken, exiting");
        return;
      }
      if (!node.refreshToken) {
        console.log("[easee] No refreshToken, exiting");
        return;
      }
     
      const response = await fetch('https://api.easee.cloud/api/accounts/refresh_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/*+json'  },
        body: JSON.stringify({ accessToken: node.accessToken, refreshToken: node.refreshToken })
      });

      const data = await response.json();
      if(!data.accessToken){
        // failed getting token
        console.log("[easee] failed refreshToken(), exiting");
        return;
      }
      //console.log("[easee] Got accessToken: " + data.accessToken);
      //console.log("[easee] Got refreshToken: " + data.refreshToken);
      node.accessToken = data.accessToken;
      node.refreshToken = data.refreshToken;

      node.refreshTokenHandler = setTimeout(() => refreshToken(), 60*60*3 * 1000);
    }

    


    // Connect to remote endpoint
    function startconn() {
      node.closing = false;
      if (node.reconnectTimoutHandle) clearTimeout(node.reconnectTimoutHandle);
      if (node.refreshTokenHandler) clearTimeout(node.refreshTokenHandler);
      node.reconnectTimoutHandle = null;
      node.refreshTokenHandler = null;

      if (!node.charger) {
        console.log("[easee] No charger, exiting");
        node.emit('erro', {
          err: "No charger, exiting",
        });
        return;
      }
      if (!node.accessToken) {
        console.log("[easee] No accessToken, waiting");
        node.emit('erro', {
          err: "No accessToken, waiting",
        });
        node.reconnectTimoutHandle = setTimeout(() => startconn(), node.reconnectInterval);
        return;
      }

      node.options.accessTokenFactory = () => node.accessToken;

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
        node.send([null, null, null, { payload: data }, null, null]);
      });

      node.connectionConfig.connection.on("ChargerUpdate", (data) => {
        //console.log("[easee] got ProductUpdate");

        const observations = [
          {
            "observationId": 15,
            "name": "LocalPreAuthorizeEnabled",
            "dataType": 2
          },
          {
            "observationId": 16,
            "name": "LocalAuthorizeOfflineEnabled",
            "dataType": 2
          },
          {
            "observationId": 17,
            "name": "AllowOfflineTxForUnknownId",
            "dataType": 2
          },
          {
            "observationId": 20,
            "name": "SiteStructure",
            "dataType": 6
          },
          {
            "observationId": 21,
            "name": "DetectedPowerGridType",
            "dataType": 4
          },
          {
            "observationId": 22,
            "name": "CircuitMaxCurrentP1",
            "dataType": 3
          },
          {
            "observationId": 23,
            "name": "CircuitMaxCurrentP2",
            "dataType": 3
          },
          {
            "observationId": 24,
            "name": "CircuitMaxCurrentP3",
            "dataType": 3
          },
          {
            "observationId": 25,
            "name": "Location",
            "dataType": 5
          },
          {
            "observationId": 26,
            "name": "SiteIDString",
            "dataType": 6
          },
          {
            "observationId": 27,
            "name": "SiteIDNumeric",
            "dataType": 4
          },
          {
            "observationId": 30,
            "name": "LockCablePermanently",
            "dataType": 2
          },
          {
            "observationId": 31,
            "name": "IsEnabled",
            "dataType": 2
          },
          {
            "observationId": 33,
            "name": "CircuitSequenceNumber",
            "dataType": 4
          },
          {
            "observationId": 34,
            "name": "SinglePhaseNumber",
            "dataType": 4
          },
          {
            "observationId": 35,
            "name": "Enable3Phases_DEPRECATED",
            "dataType": 2
          },
          {
            "observationId": 36,
            "name": "WiFiSSID",
            "dataType": 6
          },
          {
            "observationId": 37,
            "name": "EnableIdleCurrent",
            "dataType": 2
          },
          {
            "observationId": 38,
            "name": "PhaseMode",
            "dataType": 4
          },
          {
            "observationId": 40,
            "name": "LedStripBrightness",
            "dataType": 4
          },
          {
            "observationId": 41,
            "name": "LocalAuthorizationRequired",
            "dataType": 2
          },
          {
            "observationId": 42,
            "name": "AuthorizationRequired",
            "dataType": 2
          },
          {
            "observationId": 43,
            "name": "RemoteStartRequired",
            "dataType": 2
          },
          {
            "observationId": 44,
            "name": "SmartButtonEnabled",
            "dataType": 2
          },
          {
            "observationId": 45,
            "name": "OfflineChargingMode",
            "dataType": 4
          },
          {
            "observationId": 46,
            "name": "LEDMode",
            "dataType": 4
          },
          {
            "observationId": 47,
            "name": "MaxChargerCurrent",
            "dataType": 3
          },
          {
            "observationId": 48,
            "name": "DynamicChargerCurrent",
            "dataType": 3
          },
          {
            "observationId": 50,
            "name": "MaxCurrentOfflineFallback_P1",
            "dataType": 4
          },
          {
            "observationId": 51,
            "name": "MaxCurrentOfflineFallback_P2",
            "dataType": 4
          },
          {
            "observationId": 52,
            "name": "MaxCurrentOfflineFallback_P3",
            "dataType": 4
          },
          {
            "observationId": 62,
            "name": "ChargingSchedule",
            "dataType": 6
          },
          {
            "observationId": 68,
            "name": "WiFiAPEnabled",
            "dataType": 2
          },
          {
            "observationId": 69,
            "name": "PairedUserIDToken",
            "dataType": 6
          },
          {
            "observationId": 70,
            "name": "CircuitTotalAllocatedPhaseConductorCurrent_L1",
            "dataType": 3
          },
          {
            "observationId": 71,
            "name": "CircuitTotalAllocatedPhaseConductorCurrent_L2",
            "dataType": 3
          },
          {
            "observationId": 72,
            "name": "CircuitTotalAllocatedPhaseConductorCurrent_L3",
            "dataType": 3
          },
          {
            "observationId": 73,
            "name": "CircuitTotalPhaseConductorCurrent_L1",
            "dataType": 3
          },
          {
            "observationId": 74,
            "name": "CircuitTotalPhaseConductorCurrent_L2",
            "dataType": 3
          },
          {
            "observationId": 75,
            "name": "CircuitTotalPhaseConductorCurrent_L3",
            "dataType": 3
          },
          {
            "observationId": 80,
            "name": "SoftwareRelease",
            "dataType": 4
          },
          {
            "observationId": 81,
            "name": "ICCID",
            "dataType": 6
          },
          {
            "observationId": 82,
            "name": "ModemFwId",
            "dataType": 6
          },
          {
            "observationId": 83,
            "name": "OTAErrorCode",
            "dataType": 4
          },
          {
            "observationId": 89,
            "name": "RebootReason",
            "dataType": 4
          },
          {
            "observationId": 90,
            "name": "PowerPCBVersion",
            "dataType": 4
          },
          {
            "observationId": 91,
            "name": "ComPCBVersion",
            "dataType": 4
          },
          {
            "observationId": 96,
            "name": "ReasonForNoCurrent",
            "dataType": 4
          },
          {
            "observationId": 97,
            "name": "LoadBalancingNumberOfConnectedChargers",
            "dataType": 4
          },
          {
            "observationId": 98,
            "name": "UDPNumOfConnectedNodes",
            "dataType": 4
          },
          {
            "observationId": 99,
            "name": "LocalConnection",
            "dataType": 4
          },
          {
            "observationId": 100,
            "name": "PilotMode",
            "dataType": 6
          },
          {
            "observationId": 101,
            "name": "CarConnected_DEPRECATED",
            "dataType": 2
          },
          {
            "observationId": 102,
            "name": "SmartCharging",
            "dataType": 2
          },
          {
            "observationId": 103,
            "name": "CableLocked",
            "dataType": 2
          },
          {
            "observationId": 104,
            "name": "CableRating",
            "dataType": 3
          },
          {
            "observationId": 105,
            "name": "PilotHigh",
            "dataType": 3
          },
          {
            "observationId": 106,
            "name": "PilotLow",
            "dataType": 3
          },
          {
            "observationId": 107,
            "name": "BackPlateID",
            "dataType": 6
          },
          {
            "observationId": 108,
            "name": "UserIDTokenReversed",
            "dataType": 6
          },
          {
            "observationId": 109,
            "name": "ChargerOpMode",
            "dataType": 4,
            "valueMapping" : function(val){
              const modes = {
                0 : "Offline",
                1 : "Disconnected",
                2 : "AwaitingStart",
                3 : "Charging",
                4 : "Completed",
                5 : "Error",
                6 : "ReadyToCharge",
              }
              return modes[val];
            }
          },
          {
            "observationId": 110,
            "name": "OutputPhase",
            "dataType": 4
          },
          {
            "observationId": 111,
            "name": "DynamicCircuitCurrentP1",
            "dataType": 3
          },
          {
            "observationId": 112,
            "name": "DynamicCircuitCurrentP2",
            "dataType": 3
          },
          {
            "observationId": 113,
            "name": "DynamicCircuitCurrentP3",
            "dataType": 3
          },
          {
            "observationId": 114,
            "name": "OutputCurrent",
            "dataType": 3
          },
          {
            "observationId": 115,
            "name": "DeratedCurrent",
            "dataType": 3
          },
          {
            "observationId": 116,
            "name": "DeratingActive",
            "dataType": 2
          },
          {
            "observationId": 117,
            "name": "DebugString",
            "dataType": 6
          },
          {
            "observationId": 118,
            "name": "ErrorString",
            "dataType": 6
          },
          {
            "observationId": 119,
            "name": "ErrorCode",
            "dataType": 4
          },
          {
            "observationId": 120,
            "name": "TotalPower",
            "dataType": 3
          },
          {
            "observationId": 121,
            "name": "SessionEnergy",
            "dataType": 3
          },
          {
            "observationId": 122,
            "name": "EnergyPerHour",
            "dataType": 3
          },
          {
            "observationId": 123,
            "name": "LegacyEvStatus",
            "dataType": 4
          },
          {
            "observationId": 124,
            "name": "LifetimeEnergy",
            "dataType": 3
          },
          {
            "observationId": 125,
            "name": "LifetimeRelaySwitches",
            "dataType": 4
          },
          {
            "observationId": 126,
            "name": "LifetimeHours",
            "dataType": 4
          },
          {
            "observationId": 127,
            "name": "DynamicCurrentOfflineFallback_DEPRICATED",
            "dataType": 4
          },
          {
            "observationId": 128,
            "name": "UserIDToken",
            "dataType": 6
          },
          {
            "observationId": 129,
            "name": "ChargingSession",
            "dataType": 6
          },
          {
            "observationId": 130,
            "name": "CellRSSI",
            "dataType": 4
          },
          {
            "observationId": 131,
            "name": "CellRAT",
            "dataType": 4
          },
          {
            "observationId": 132,
            "name": "WiFiRSSI",
            "dataType": 4
          },
          {
            "observationId": 133,
            "name": "CellAddress",
            "dataType": 6
          },
          {
            "observationId": 134,
            "name": "WiFiAddress",
            "dataType": 6
          },
          {
            "observationId": 135,
            "name": "WiFiType",
            "dataType": 6
          },
          {
            "observationId": 136,
            "name": "LocalRSSI",
            "dataType": 4
          },
          {
            "observationId": 137,
            "name": "MasterBackPlateID",
            "dataType": 6
          },
          {
            "observationId": 138,
            "name": "LocalTxPower",
            "dataType": 4
          },
          {
            "observationId": 139,
            "name": "LocalState",
            "dataType": 6
          },
          {
            "observationId": 140,
            "name": "FoundWiFi",
            "dataType": 6
          },
          {
            "observationId": 141,
            "name": "ChargerRAT",
            "dataType": 4
          },
          {
            "observationId": 142,
            "name": "CellularInterfaceErrorCount",
            "dataType": 4
          },
          {
            "observationId": 143,
            "name": "CellularInterfaceResetCount",
            "dataType": 4
          },
          {
            "observationId": 144,
            "name": "WifiInterfaceErrorCount",
            "dataType": 4
          },
          {
            "observationId": 145,
            "name": "WifiInterfaceResetCount",
            "dataType": 4
          },
          {
            "observationId": 146,
            "name": "LocalNodeType",
            "dataType": 4
          },
          {
            "observationId": 147,
            "name": "LocalRadioChannel",
            "dataType": 4
          },
          {
            "observationId": 148,
            "name": "LocalShortAddress",
            "dataType": 4
          },
          {
            "observationId": 149,
            "name": "LocalParentAddrOrNumOfNodes",
            "dataType": 4
          },
          {
            "observationId": 150,
            "name": "TempMax",
            "dataType": 3
          },
          {
            "observationId": 151,
            "name": "TempAmbientPowerBoard",
            "dataType": 3
          },
          {
            "observationId": 152,
            "name": "TempInputT2",
            "dataType": 3
          },
          {
            "observationId": 153,
            "name": "TempInputT3",
            "dataType": 3
          },
          {
            "observationId": 154,
            "name": "TempInputT4",
            "dataType": 3
          },
          {
            "observationId": 155,
            "name": "TempInputT5",
            "dataType": 3
          },
          {
            "observationId": 160,
            "name": "TempOutputN",
            "dataType": 3
          },
          {
            "observationId": 161,
            "name": "TempOutputL1",
            "dataType": 3
          },
          {
            "observationId": 162,
            "name": "TempOutputL2",
            "dataType": 3
          },
          {
            "observationId": 163,
            "name": "TempOutputL3",
            "dataType": 3
          },
          {
            "observationId": 170,
            "name": "TempAmbient",
            "dataType": 3
          },
          {
            "observationId": 171,
            "name": "LightAmbient",
            "dataType": 4
          },
          {
            "observationId": 172,
            "name": "IntRelHumidity",
            "dataType": 4
          },
          {
            "observationId": 173,
            "name": "BackPlateLocked",
            "dataType": 2
          },
          {
            "observationId": 174,
            "name": "CurrentMotor",
            "dataType": 3
          },
          {
            "observationId": 175,
            "name": "BackPlateHallSensor",
            "dataType": 4
          },
          {
            "observationId": 182,
            "name": "InCurrent_T2",
            "dataType": 3
          },
          {
            "observationId": 183,
            "name": "InCurrent_T3",
            "dataType": 3
          },
          {
            "observationId": 184,
            "name": "InCurrent_T4",
            "dataType": 3
          },
          {
            "observationId": 185,
            "name": "InCurrent_T5",
            "dataType": 3
          },
          {
            "observationId": 190,
            "name": "InVolt_T1_T2",
            "dataType": 3
          },
          {
            "observationId": 191,
            "name": "InVolt_T1_T3",
            "dataType": 3
          },
          {
            "observationId": 192,
            "name": "InVolt_T1_T4",
            "dataType": 3
          },
          {
            "observationId": 193,
            "name": "InVolt_T1_T5",
            "dataType": 3
          },
          {
            "observationId": 194,
            "name": "InVolt_T2_T3",
            "dataType": 3
          },
          {
            "observationId": 195,
            "name": "InVolt_T2_T4",
            "dataType": 3
          },
          {
            "observationId": 196,
            "name": "InVolt_T2_T5",
            "dataType": 3
          },
          {
            "observationId": 197,
            "name": "InVolt_T3_T4",
            "dataType": 3
          },
          {
            "observationId": 198,
            "name": "InVolt_T3_T5",
            "dataType": 3
          },
          {
            "observationId": 199,
            "name": "InVolt_T4_T5",
            "dataType": 3
          },
          {
            "observationId": 202,
            "name": "OutVoltPin1_2",
            "dataType": 3
          },
          {
            "observationId": 203,
            "name": "OutVoltPin1_3",
            "dataType": 3
          },
          {
            "observationId": 204,
            "name": "OutVoltPin1_4",
            "dataType": 3
          },
          {
            "observationId": 205,
            "name": "OutVoltPin1_5",
            "dataType": 3
          },
          {
            "observationId": 210,
            "name": "VoltLevel33",
            "dataType": 3
          },
          {
            "observationId": 211,
            "name": "VoltLevel5",
            "dataType": 3
          },
          {
            "observationId": 212,
            "name": "VoltLevel12",
            "dataType": 3
          },
          {
            "observationId": 230,
            "name": "EqAvailableCurrentP1",
            "dataType": 3
          },
          {
            "observationId": 231,
            "name": "EqAvailableCurrentP2",
            "dataType": 3
          },
          {
            "observationId": 232,
            "name": "EqAvailableCurrentP3",
            "dataType": 3
          }
        ];
        
       data.valueText = "";
        for(const idx in observations){

            if(observations[idx].observationId == data.id){
                data.dataName = observations[idx].name;

                // Binary = 1,
                // Boolean = 2,
                // Double = 3,
                // Integer = 4,
                // Position = 5,
                // String = 6,
                // Statistics = 7

                switch(observations[idx].dataType){
                  case 3: // double
                    data.value = parseFloat(data.value);
                    break;
                  case 4: // int
                    data.value = parseInt(data.value);
                    break;

                }

                if(observations[idx].valueMapping != undefined){
                  data.valueText = observations[idx].valueMapping(data.value);
                }
                               
                break;

            }
        }
        node.send([null, null, null, null, { payload: data }, null]);
      });
      node.connectionConfig.connection.on("CommandResponse", (data) => {
        //console.log("[easee] got ProductUpdate");
        node.send([null, null, null, null, null, { payload: data }]);
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