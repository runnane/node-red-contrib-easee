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

  function EaseeConfiguration(n) {
    RED.nodes.createNode(this, n);
    var node = this;

    node.signalRpath = "https://streams.easee.com/hubs/chargers";
    node.RestApipath = "https://api.easee.com/api";

    node.accessToken = false;
    node.refreshToken = false;
    node.tokenExpires = new Date();

    node.parseObservation = (data, mode = "id") => {
      const observations = [
        {
          observationId: 15,
          name: "LocalPreAuthorizeEnabled",
          dataType: 2,
        },
        {
          observationId: 16,
          name: "LocalAuthorizeOfflineEnabled",
          dataType: 2,
        },
        {
          observationId: 17,
          name: "AllowOfflineTxForUnknownId",
          dataType: 2,
        },
        {
          observationId: 20,
          name: "SiteStructure",
          dataType: 6,
        },
        {
          observationId: 21,
          name: "DetectedPowerGridType",
          dataType: 4,
        },
        {
          observationId: 22,
          name: "CircuitMaxCurrentP1",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 23,
          name: "CircuitMaxCurrentP2",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 24,
          name: "CircuitMaxCurrentP3",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 25,
          name: "Location",
          dataType: 5,
        },
        {
          observationId: 26,
          name: "SiteIDString",
          dataType: 6,
        },
        {
          observationId: 27,
          name: "SiteIDNumeric",
          dataType: 4,
        },
        {
          observationId: 30,
          name: "LockCablePermanently",
          dataType: 2,
        },
        {
          observationId: 31,
          name: "IsEnabled",
          dataType: 2,
        },
        {
          observationId: 33,
          name: "CircuitSequenceNumber",
          dataType: 4,
        },
        {
          observationId: 34,
          name: "SinglePhaseNumber",
          dataType: 4,
        },
        {
          observationId: 35,
          name: "Enable3Phases_DEPRECATED",
          dataType: 2,
        },
        {
          observationId: 36,
          name: "WiFiSSID",
          dataType: 6,
        },
        {
          observationId: 37,
          name: "EnableIdleCurrent",
          dataType: 2,
        },
        {
          observationId: 38,
          name: "PhaseMode",
          dataType: 4,
          valueMapping: (val) => {
            // https://developer.easee.cloud/docs/enumerations
            const modes = {
              0: "Ignore,no phase mode reported",
              1: "Locked to 1-phase",
              2: "Auto phase mode",
              3: "Locked to 3-phase",
            };
            return modes[val];
          },
        },
        {
          observationId: 40,
          name: "LedStripBrightness",
          dataType: 4,
        },
        {
          observationId: 41,
          name: "LocalAuthorizationRequired",
          dataType: 2,
        },
        {
          observationId: 42,
          name: "AuthorizationRequired",
          dataType: 2,
        },
        {
          observationId: 43,
          name: "RemoteStartRequired",
          dataType: 2,
        },
        {
          observationId: 44,
          name: "SmartButtonEnabled",
          dataType: 2,
        },
        {
          observationId: 45,
          name: "OfflineChargingMode",
          dataType: 4,
          valueMapping: (val) => {
            // https://developer.easee.cloud/docs/enumerations
            const modes = {
              0: "Always allow charging if offline",
              1: "Only allow charging if token is whitelisted in the local token cache",
              2: "Never allow charging if offline",
            };
            return modes[val];
          },
        },
        {
          observationId: 46,
          name: "LEDMode",
          dataType: 4,
          valueMapping: (val) => {
            // https://developer.easee.cloud/docs/enumerations
            const modes = {
              0: "Charger is disabled",

              1: "Charger is updating",
              2: "Charger is updating",
              3: "Charger is updating",
              4: "Charger is updating",
              5: "Charger is updating",
              6: "Charger is updating",
              7: "Charger is updating",
              8: "Charger is updating",
              9: "Charger is updating",
              10: "Charger is updating",
              11: "Charger is updating",
              12: "Charger is updating",
              13: "Charger is updating",
              14: "Charger is updating",
              15: "Charger is updating",

              16: "Charger is faulty",
              17: "Charger is faulty",

              18: "Standby Master",
              19: "Standby Secondary",
              20: "Secondary unit searching for master",
              21: "Smart mode (Not charging)",
              22: "Smart mode (Charging)",

              23: "Normal mode (Not charging)",
              24: "Normal mode (Charging)",
              25: "Waiting for authorization",
              26: "Verifying with backend",
              27: "Check configuration (Backplate chip defect)",
              29: "Pairing RFID Keys",
              43: "Self test mode",
              44: "Self test mode",
            };
            return modes[val];
          },
        },
        {
          observationId: 47,
          name: "MaxChargerCurrent",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 48,
          name: "DynamicChargerCurrent",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 50,
          name: "MaxCurrentOfflineFallback_P1",
          dataType: 4,
        },
        {
          observationId: 51,
          name: "MaxCurrentOfflineFallback_P2",
          dataType: 4,
        },
        {
          observationId: 52,
          name: "MaxCurrentOfflineFallback_P3",
          dataType: 4,
        },
        {
          observationId: 62,
          name: "ChargingSchedule",
          dataType: 6,
        },
        {
          observationId: 68,
          name: "WiFiAPEnabled",
          dataType: 2,
        },
        {
          observationId: 69,
          name: "PairedUserIDToken",
          dataType: 6,
        },
        {
          observationId: 70,
          name: "CircuitTotalAllocatedPhaseConductorCurrent_L1",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 71,
          name: "CircuitTotalAllocatedPhaseConductorCurrent_L2",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 72,
          name: "CircuitTotalAllocatedPhaseConductorCurrent_L3",
          dataType: 3,
        },
        {
          observationId: 73,
          name: "CircuitTotalPhaseConductorCurrent_L1",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 74,
          name: "CircuitTotalPhaseConductorCurrent_L2",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 75,
          name: "CircuitTotalPhaseConductorCurrent_L3",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 80,
          name: "SoftwareRelease",
          dataType: 4,
        },
        {
          observationId: 81,
          name: "ICCID",
          dataType: 6,
        },
        {
          observationId: 82,
          name: "ModemFwId",
          dataType: 6,
        },
        {
          observationId: 83,
          name: "OTAErrorCode",
          dataType: 4,
        },
        {
          observationId: 89,
          name: "RebootReason",
          dataType: 4,
        },
        {
          observationId: 90,
          name: "PowerPCBVersion",
          dataType: 4,
        },
        {
          observationId: 91,
          name: "ComPCBVersion",
          dataType: 4,
        },
        {
          observationId: 96,
          name: "ReasonForNoCurrent",
          dataType: 4,
          valueMapping: (val) => {
            // https://developer.easee.cloud/docs/enumerations

            const modes = {
              0: "Charger Fine - Charger is OK, use main charger status",

              1: "Loadbalancing - Max circuit current too low, adjust power circuit up.",
              2: "Loadbalancing - Max dynamic circuit current too low (Partner Loadbalancing)",
              3: "Loadbalancing - Max dynamic offline fallback circuit current too low",
              4: "Loadbalancing - Circuit fuse too low",
              5: "Loadbalancing - Waiting in queue",
              6: "Loadbalancing - Waiting in fully charged queue (Assumes a connected EV uses delated charging, EV Charging complete",

              7: "Error - illegal grid type (Error - Fault in automatic grid type detection)",
              8: "Error - primary unit has not received current request from secondary unit (car)",
              9: "Error - Master communication lost (Error)",
              10: "Error - No current from equalizer to low",
              11: "Error - No current, phase not connected",

              25: "Error - Current limited by circuit fuse",
              26: "Error - Current limited by circuit max current",
              27: "Error - Current limited by dynamic circuit current",
              28: "Error - Current limited by equalizer",
              29: "Error - Current limited by circuit load balancing",

              50: "Load balancing circuit - Secondary unit not requesting current (No car connected)",
              51: "Load balancing circuit - Max charger current too low",
              52: "Load balancing circuit - Max Dynamic charger current too low",

              53: "Informational - Charger disabled",

              54: "Waiting - Pending scheduled charging",
              55: "Waiting - Pending authorization",

              56: "Error - Charger in error state",
              57: "Error - Erratic EV",

              75: "Cable - Current limited by cable rating",
              76: "Schedule - Current limited by schedule",
              77: "Charger Limit - Current limited by charger max current",
              78: "Charger Limit - Current limited by dynamic charger current",
              79: "Car Limit - Current limited by car not charging",
              80: "??? - Current limited by local adjustment",
              81: "Car Limit - Current limited by car",

              100: "UndefinedError",
            };
            return modes[val];
          },
        },
        {
          observationId: 97,
          name: "LoadBalancingNumberOfConnectedChargers",
          dataType: 4,
        },
        {
          observationId: 98,
          name: "UDPNumOfConnectedNodes",
          dataType: 4,
        },
        {
          observationId: 99,
          name: "LocalConnection",
          dataType: 4,
        },
        {
          observationId: 100,
          name: "PilotMode",
          dataType: 6,
          valueMapping: (val) => {
            // https://developer.easee.cloud/docs/enumerations
            const modes = {
              A: "Car disconnected",
              B: "Car connected",
              C: "Car charging",
              D: "Car needs ventilation",
              F: "Fault detected (LED goes Red and charging stops)",
            };
            return modes[val];
          },
        },
        {
          observationId: 101,
          name: "CarConnected_DEPRECATED",
          dataType: 2,
        },
        {
          observationId: 102,
          name: "SmartCharging",
          dataType: 2,
        },
        {
          observationId: 103,
          name: "CableLocked",
          dataType: 2,
        },
        {
          observationId: 104,
          name: "CableRating",
          dataType: 3,
        },
        {
          observationId: 105,
          name: "PilotHigh",
          dataType: 3,
        },
        {
          observationId: 106,
          name: "PilotLow",
          dataType: 3,
        },
        {
          observationId: 107,
          name: "BackPlateID",
          dataType: 6,
        },
        {
          observationId: 108,
          name: "UserIDTokenReversed",
          dataType: 6,
        },
        {
          observationId: 109,
          name: "ChargerOpMode",
          dataType: 4,
          valueMapping: (val) => {
            // https://developer.easee.cloud/docs/enumerations

            const modes = {
              0: "Offline",
              1: "Disconnected",
              2: "AwaitingStart",
              3: "Charging",
              4: "Completed",
              5: "Error",
              6: "ReadyToCharge",
            };
            return modes[val];
          },
        },
        {
          observationId: 110,
          name: "OutputPhase",
          dataType: 4,
          /*
          public enum OutputPhaseType { 
            UNASSIGNED = 0, 
            // Unassigned 

            P1_T2_T3_TN = 10, 
            // 1-phase (N+L1) 

            P1_T2_T3_IT = 11, 
            // 1-phase (L1+L2) 

            P1_T2_T4_TN = 12, 
            // 1-phase (N+L2) 

            P1_T2_T4_IT = 13, 
            // 1-phase (L1+L3) 

            P1_T2_T5_TN = 14, 
            // 1-phase (N+L3) 

            P1_T3_T4_IT = 15, 
            // 1-phase (L2+L3) 

            P2_T2_T3_T4_TN = 20, 
            // 2-phases on TN (N+L1, N+L2) 

            P2_T2_T4_T5_TN = 21, 
            // 2-phases on TN (N+L2, N+L3) 

            P2_T2_T3_T4_IT = 22, 
            // 2-phases on IT (L1+L2, L2+L3)

            P3_T2_T3_T4_T5_TN = 30 
            // 3-phases (N+L1, N+L2, N+L3) 
          }
          */
        },
        {
          observationId: 111,
          name: "DynamicCircuitCurrentP1",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 112,
          name: "DynamicCircuitCurrentP2",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 113,
          name: "DynamicCircuitCurrentP3",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 114,
          name: "OutputCurrent",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 115,
          name: "DeratedCurrent",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 116,
          name: "DeratingActive",
          dataType: 2,
        },
        {
          observationId: 117,
          name: "DebugString",
          dataType: 6,
        },
        {
          observationId: 118,
          name: "ErrorString",
          dataType: 6,
        },
        {
          observationId: 119,
          name: "ErrorCode",
          dataType: 4,
        },
        {
          observationId: 120,
          name: "TotalPower",
          dataType: 3,
          valueUnit: "W",
        },
        {
          observationId: 121,
          name: "SessionEnergy",
          dataType: 3,
          valueUnit: "kWh",
        },
        {
          observationId: 122,
          name: "EnergyPerHour",
          dataType: 3,
          valueUnit: "kWh",
        },
        {
          observationId: 123,
          name: "LegacyEvStatus",
          dataType: 4,
        },
        {
          observationId: 124,
          name: "LifetimeEnergy",
          dataType: 3,
          valueUnit: "kWh",
        },
        {
          observationId: 125,
          name: "LifetimeRelaySwitches",
          dataType: 4,
        },
        {
          observationId: 126,
          name: "LifetimeHours",
          dataType: 4,
        },
        {
          observationId: 127,
          name: "DynamicCurrentOfflineFallback_DEPRICATED",
          dataType: 4,
        },
        {
          observationId: 128,
          name: "UserIDToken",
          dataType: 6,
        },
        {
          observationId: 129,
          name: "ChargingSession",
          dataType: 6,
        },
        {
          observationId: 130,
          name: "CellRSSI",
          dataType: 4,
        },
        {
          observationId: 131,
          name: "CellRAT",
          dataType: 4,
        },
        {
          observationId: 132,
          name: "WiFiRSSI",
          dataType: 4,
        },
        {
          observationId: 133,
          name: "CellAddress",
          dataType: 6,
        },
        {
          observationId: 134,
          name: "WiFiAddress",
          dataType: 6,
        },
        {
          observationId: 135,
          name: "WiFiType",
          dataType: 6,
        },
        {
          observationId: 136,
          name: "LocalRSSI",
          dataType: 4,
        },
        {
          observationId: 137,
          name: "MasterBackPlateID",
          dataType: 6,
        },
        {
          observationId: 138,
          name: "LocalTxPower",
          dataType: 4,
        },
        {
          observationId: 139,
          name: "LocalState",
          dataType: 6,
        },
        {
          observationId: 140,
          name: "FoundWiFi",
          dataType: 6,
        },
        {
          observationId: 141,
          name: "ChargerRAT",
          dataType: 4,
        },
        {
          observationId: 142,
          name: "CellularInterfaceErrorCount",
          dataType: 4,
        },
        {
          observationId: 143,
          name: "CellularInterfaceResetCount",
          dataType: 4,
        },
        {
          observationId: 144,
          name: "WifiInterfaceErrorCount",
          dataType: 4,
        },
        {
          observationId: 145,
          name: "WifiInterfaceResetCount",
          dataType: 4,
        },
        {
          observationId: 146,
          name: "LocalNodeType",
          dataType: 4,
        },
        {
          observationId: 147,
          name: "LocalRadioChannel",
          dataType: 4,
        },
        {
          observationId: 148,
          name: "LocalShortAddress",
          dataType: 4,
        },
        {
          observationId: 149,
          name: "LocalParentAddrOrNumOfNodes",
          dataType: 4,
        },
        {
          observationId: 150,
          name: "TempMax",
          dataType: 3,
          valueUnit: "°C",
        },
        {
          observationId: 151,
          name: "TempAmbientPowerBoard",
          dataType: 3,
          valueUnit: "°C",
        },
        {
          observationId: 152,
          name: "TempInputT2",
          dataType: 3,
          valueUnit: "°C",
        },
        {
          observationId: 153,
          name: "TempInputT3",
          dataType: 3,
          valueUnit: "°C",
        },
        {
          observationId: 154,
          name: "TempInputT4",
          dataType: 3,
          valueUnit: "°C",
        },
        {
          observationId: 155,
          name: "TempInputT5",
          dataType: 3,
          valueUnit: "°C",
        },
        {
          observationId: 160,
          name: "TempOutputN",
          dataType: 3,
          valueUnit: "°C",
        },
        {
          observationId: 161,
          name: "TempOutputL1",
          dataType: 3,
          valueUnit: "°C",
        },
        {
          observationId: 162,
          name: "TempOutputL2",
          dataType: 3,
          valueUnit: "°C",
        },
        {
          observationId: 163,
          name: "TempOutputL3",
          dataType: 3,
          valueUnit: "°C",
        },
        {
          observationId: 170,
          name: "TempAmbient",
          dataType: 3,
          valueUnit: "°C",
        },
        {
          observationId: 171,
          name: "LightAmbient",
          dataType: 4,
        },
        {
          observationId: 172,
          name: "IntRelHumidity",
          dataType: 4,
        },
        {
          observationId: 173,
          name: "BackPlateLocked",
          dataType: 2,
        },
        {
          observationId: 174,
          name: "CurrentMotor",
          dataType: 3,
        },
        {
          observationId: 175,
          name: "BackPlateHallSensor",
          dataType: 4,
        },
        {
          observationId: 182,
          name: "InCurrent_T2",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 183,
          name: "InCurrent_T3",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 184,
          name: "InCurrent_T4",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 185,
          name: "InCurrent_T5",
          dataType: 3,
          valueUnit: "V",
        },
        {
          observationId: 190,
          name: "InVolt_T1_T2",
          dataType: 3,
          valueUnit: "V",
          altName: "inVoltageT1T2",
        },
        {
          observationId: 191,
          name: "InVolt_T1_T3",
          dataType: 3,
          valueUnit: "V",
          altName: "inVoltageT1T3",
        },
        {
          observationId: 192,
          name: "InVolt_T1_T4",
          dataType: 3,
          valueUnit: "V",
          altName: "inVoltageT1T4",
        },
        {
          observationId: 193,
          name: "InVolt_T1_T5",
          dataType: 3,
          valueUnit: "V",
          altName: "inVoltageT1T5",
        },
        {
          observationId: 194,
          name: "InVolt_T2_T3",
          dataType: 3,
          valueUnit: "V",
          altName: "inVoltageT2T3",
        },
        {
          observationId: 195,
          name: "InVolt_T2_T4",
          dataType: 3,
          valueUnit: "V",
          altName: "inVoltageT2T4",
        },
        {
          observationId: 196,
          name: "InVolt_T2_T5",
          dataType: 3,
          valueUnit: "V",
          altName: "inVoltageT2T5",
        },
        {
          observationId: 197,
          name: "InVolt_T3_T4",
          dataType: 3,
          valueUnit: "V",
          altName: "inVoltageT3T4",
        },
        {
          observationId: 198,
          name: "InVolt_T3_T5",
          dataType: 3,
          valueUnit: "V",
          altName: "inVoltageT3T5",
        },
        {
          observationId: 199,
          name: "InVolt_T4_T5",
          dataType: 3,
          valueUnit: "V",
          altName: "inVoltageT4T5",
        },
        {
          observationId: 202,
          name: "OutVoltPin1_2",
          dataType: 3,
          valueUnit: "V",
        },
        {
          observationId: 203,
          name: "OutVoltPin1_3",
          dataType: 3,
          valueUnit: "V",
        },
        {
          observationId: 204,
          name: "OutVoltPin1_4",
          dataType: 3,
          valueUnit: "V",
        },
        {
          observationId: 205,
          name: "OutVoltPin1_5",
          dataType: 3,
          valueUnit: "V",
        },
        {
          observationId: 210,
          name: "VoltLevel33",
          dataType: 3,
          valueUnit: "V",
        },
        {
          observationId: 211,
          name: "VoltLevel5",
          dataType: 3,
          valueUnit: "V",
        },
        {
          observationId: 212,
          name: "VoltLevel12",
          dataType: 3,
          valueUnit: "V",
        },
        {
          observationId: 230,
          name: "EqAvailableCurrentP1",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 231,
          name: "EqAvailableCurrentP2",
          dataType: 3,
          valueUnit: "A",
        },
        {
          observationId: 232,
          name: "EqAvailableCurrentP3",
          dataType: 3,
          valueUnit: "A",
        },
      ];

      data.valueText = "";
      data.valueUnit = "";

      for (const idx in observations) {
        if (mode == "id" && observations[idx].observationId == data.id) {
          // Id match
        } else if (
          mode == "name" &&
          observations[idx].name.toLowerCase() == data.dataName.toLowerCase()
        ) {
          // Name match
        } else if (
          mode == "name" &&
          "altName" in observations[idx] &&
          observations[idx].altName.toLowerCase() == data.dataName.toLowerCase()
        ) {
          // Altname match
        } else if (
          mode == "name" &&
          observations[idx].name.replace(/\_/g, "").toLowerCase() ==
            data.dataName.toLowerCase()
        ) {
          // Altname match
        } else {
          continue;
        }

        data.dataName = observations[idx].name;
        data.observationId = observations[idx].observationId;

        if (
          "valueUnit" in observations[idx] &&
          observations[idx].valueUnit != undefined
        ) {
          data.valueUnit = observations[idx].valueUnit;
        }
        const valueTypes = {
          1: "Binary",
          2: "Boolean",
          3: "Double",
          4: "Integer",
          5: "Position",
          6: "String",
          7: "Statistics",
        };

        data.dataType = observations[idx].dataType;
        data.dataTypeName = valueTypes[observations[idx].dataType];
        if (data.value !== null) {
          switch (data.dataTypeName) {
            case "Double":
              data.value = parseFloat(data.value);
              break;
            case "Integer":
              data.value = parseInt(data.value);
              break;
          }
        }

        if (
          "valueMapping" in observations[idx] &&
          observations[idx].valueMapping != undefined
        ) {
          data.valueText = observations[idx].valueMapping(data.value);
        }

        break;
      }

      return data;
    };

    node.checkToken = async () => {
      const expiresIn = Math.floor((node.tokenExpires - new Date()) / 1000);
      if (expiresIn < 43200) {
        await node.doRefreshToken();
      }
      node.checkTokenHandler = setTimeout(() => node.checkToken(), 60 * 1000);
    };

    node.doRefreshToken = async () => {
      if (!node.accessToken) {
        console.log(
          "[easee] EaseeConfiguration::doRefreshToken() - No accessToken, exiting"
        );
        return;
      }
      if (!node.refreshToken) {
        console.log(
          "[easee] EaseeConfiguration::doRefreshToken() - No refreshToken, exiting"
        );
        return;
      }

      const response = await fetch(
        node.RestApipath + "/accounts/refresh_token",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/*+json",
          },
          body: JSON.stringify({
            accessToken: node.accessToken,
            refreshToken: node.refreshToken,
          }),
        }
      )
        .then((response) => {
          return response.json();
        })
        .then((json) => {
          if (!json.accessToken) {
            // failed getting token
            node.error(
              "[easee] EaseeConfiguration::doRefreshToken() - Failed doRefreshToken(), exiting"
            );
            return;
          }

          node.accessToken = json.accessToken;
          node.refreshToken = json.refreshToken;
          var t = new Date();
          t.setSeconds(t.getSeconds() + json.expiresIn);
          node.tokenExpires = t;

          node.emit("update", {
            update: "Token refreshed",
          });

          return json;
        });

      return response;
    };

    node.doLogin = async () => {
      const url = "/accounts/login";
      const response = await fetch(node.RestApipath + url, {
        method: "post",
        body: JSON.stringify({
          userName: node.credentials.username,
          password: node.credentials.password,
        }),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      })
        .then((response) => {
          return response.json();
        })
        .then((json) => {
          if ("accessToken" in json) {
            node.accessToken = json.accessToken;
            node.refreshToken = json.refreshToken;
            var t = new Date();
            t.setSeconds(t.getSeconds() + json.expiresIn);
            node.tokenExpires = t;
          }
          node.status({
            fill: "green",
            shape: "dot",
            text: url,
          });
          return json;
        });

      node.emit("update", {
        update: "Token retrieved (logged in)",
      });

      return response;
    };

    node.checkTokenHandler = setTimeout(() => node.checkToken(), 2000);
  }

  RED.nodes.registerType("easee-configuration", EaseeConfiguration, {
    credentials: {
      username: { type: "text" },
      password: { type: "password" },
    },
  });
};
