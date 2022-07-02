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
  function ChargerClientNode(n) {
    RED.nodes.createNode(this, n);
    var node = this;
    node.client = n.client;
    node.responses = n.responses;
    node.connectionConfig = RED.nodes.getNode(this.client);

    if (!this.connectionConfig) {
      this.error(RED._("easee.errors.missing-conf"));
      return;
    }

    this.on('input', function(msg, send, done) {
      node.connectionConfig.fullReconnect();
      if (done) {
        done();
      }
    });

    this.connectionConfig.on('opened', function (event) {
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

      console.log("[easee] Connected, sending SubscribeWithCurrentState");
      node.connectionConfig.connection.send("SubscribeWithCurrentState", node.connectionConfig.charger, true);

      node.connectionConfig.connection.on("ProductUpdate", (data) => {
        node.send([null, null, null, { payload: data }, null, null]);
      });

      node.connectionConfig.connection.on("ChargerUpdate", (data) => {

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
            "dataType": 4,
            "valueMapping" : (val) => {
              // https://developer.easee.cloud/docs/enumerations
              const modes = {
                0 : "Ignore,no phase mode reported",
                1 : "Locked to 1-phase",  
                2 : "Auto phase mode", 
                3 : "Locked to 3-phase", 
              }
              return modes[val];
            }


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
            "dataType": 4,
            "valueMapping" : (val) => {
              // https://developer.easee.cloud/docs/enumerations

              const modes = {
                0 : "Charger Fine",   // Charger is OK, use main charger status

                1 : "Loadbalancing",  // Max circuit current too low, adjust power circuit up.
                2 : "Loadbalancing",  // Max dynamic circuit current too low (Partner Loadbalancing)
                3 : "Loadbalancing",  // Max dynamic offline fallback circuit current too low.
                4 : "Loadbalancing",  // Circuit fuse too low.
                5 : "Loadbalancing",  // Waiting in queue
                6 : "Loadbalancing",  // Waiting in fully charged queue (Assumes a connected EV uses delated charging, EV Charging complete.
             
                7 : "Error",   // illegal grid type (Error - Fault in automatic grid type detection)
                8 : "Error",   // primary unit has not received current request from secondary unit (car)
                9 : "Error",   // Master communication lost (Error)
                10 : "Error",  // No current from equalizer to low.
                11 : "Error",  // No current, phase not connected.

                25 : "Error",   // Current limited by circuit fuse.
                26 : "Error",   // Current limited by circuit max current.
                27 : "Error",   // Current limited by dynamic circuit current.
                28 : "Error",   // Current limited by equalizer.
                29 : "Error",   // Current limited by circuit load balancing.

                50 : "Load balancing circuit",   // Secondary unit not requesting current (No car connected)
                51 : "Load balancing circuit",   // Max charger current too low.
                52 : "Load balancing circuit",   // Max Dynamic charger current too low

                53 : "Informational",   // Charger disabled.

                54 : "Waiting",   // Pending scheduled charging
                55 : "Waiting",   // Pending authorization

                56 : "Error",   // Charger in error state.
                57 : "Error",   // Erratic EV

                75 : "Cable",           // Current limited by cable rating.
                76 : "Schedule",        // Current limited by schedule.
                77 : "Charger Limit",   // Current limited by charger max current.
                78 : "Charger Limit",   // Current limited by dynamic charger current.
                79 : "Car Limit",       // Current limited by car not charging.
                80 : "???",             // Current limited by local adjustment.
                81 : "Car Limit",       // Current limited by car.
                100 : "UndefinedError", // Max Dynamic charger current too low

              }
              return modes[val];
            }
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
            "valueMapping" : (val) => {
              // https://developer.easee.cloud/docs/enumerations

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
      if (removed && node.connectionConfig) {
        node.connectionConfig.removeInputNode(node);
      } else {
        // This node is being restarted
      }
      node.status({});
      if (done) done();
    });
  }
  RED.nodes.registerType("charger-client", ChargerClientNode);

}