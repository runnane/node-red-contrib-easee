/**
 * Data Parsing Module
 * 
 * Provides functions for parsing and transforming Easee API data.
 * Handles observation data, charger information, and other API responses.
 * 
 * Based on the complete observation definitions from the original monolithic implementation
 * with full value mappings, alternate names, and backwards compatibility.
 * 
 * @module lib/api/parser
 */

/**
 * Parsed observation data
 * @typedef {Object} ParsedObservation
 * @property {string} id - Observation ID
 * @property {string} timestamp - ISO timestamp
 * @property {number} timestampMs - Timestamp in milliseconds
 * @property {string} dataType - Type of observation data
 * @property {string} dataTypeName - Human readable data type name
 * @property {string} dataName - Observation name for backwards compatibility
 * @property {number} observationId - Numeric observation ID
 * @property {*} value - Parsed observation value
 * @property {string} valueText - Human readable value text (for enums)
 * @property {string} valueUnit - Unit of measurement (if applicable)
 * @property {Object} raw - Original raw observation data
 */

/**
 * Charger status information
 * @typedef {Object} ChargerStatus
 * @property {string} id - Charger ID
 * @property {string} name - Charger name
 * @property {boolean} online - Whether charger is online
 * @property {string} state - Current charging state
 * @property {number} [power] - Current power output (kW)
 * @property {number} [current] - Current amperage
 * @property {number} [voltage] - Voltage
 * @property {string} [lastSeen] - Last communication timestamp
 */

/**
 * Complete observation definitions from the original implementation
 * Includes all observation IDs, names, data types, units, alternate names, and value mappings
 * 
 * Based on: https://developer.easee.com/reference/get_api-resources-observation-properties
 * Updated with official documentation from: https://developer.easee.com/docs/observation-ids
 */
const OBSERVATIONS = [
  {
    observationId: 1,
    name: "SelfTestResult",
    dataType: 1,
  },
  {
    observationId: 2,
    name: "SelfTestDetails",
    dataType: 8, // JSON data type
  },
  {
    observationId: 10,
    name: "WiFiEvent",
    dataType: 4,
  },
  {
    observationId: 11,
    name: "ChargerOfflineReason",
    dataType: 4,
  },
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
    observationId: 18,
    name: "ErraticEvMaxToggles",
    dataType: 4,
  },
  {
    observationId: 19,
    name: "BackplateType",
    dataType: 4,
  },
  {
    observationId: 20,
    name: "SiteStructure",
    dataType: 8, // JSON data type
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
    observationId: 28,
    name: "RfidTimeoutAuth",
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
    observationId: 32,
    name: "TemperatureMonitorState",
    dataType: 4,
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
      // https://developer.easee.com/docs/enumerations#phasemode-38
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
      // https://developer.easee.com/docs/enumerations#offline-charging-mode-45
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
      // https://developer.easee.com/docs/enumerations#led-mode-46
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
    observationId: 54,
    name: "ReleaseCableAtPowerOff",
    dataType: 1,
  },
  {
    observationId: 62,
    name: "ChargingSchedule",
    dataType: 8, // JSON data type
  },
  {
    observationId: 65,
    name: "PairedEqualizer",
    dataType: 1,
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
    valueUnit: "A",
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
    observationId: 76,
    name: "NumberOfCarsConnected",
    dataType: 4,
  },
  {
    observationId: 77,
    name: "NumberOfCarsCharging",
    dataType: 4,
  },
  {
    observationId: 78,
    name: "NumberOfCarsInQueue",
    dataType: 4,
  },
  {
    observationId: 79,
    name: "NumberOfCarsFullyCharged",
    dataType: 4,
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
    observationId: 84,
    name: "MobileNetworkOperator",
    dataType: 1,
  },
  {
    observationId: 89,
    name: "RebootReason",
    dataType: 4,
    valueMapping: (val) => {
      // https://developer.easee.com/docs/enumerations#rebootreason-89
      const modes = {
        0: "FirewallReset",
        1: "OptionByteLoaderReset",
        2: "PinReset",
        3: "BOR",
        4: "SoftwareReset",
        5: "IndependentWindowWatchdogReset",
        6: "WindowWatchdogReset",
        7: "LowPowerReset",

        12: "Brownout",
        20: "Reboot",

      };
      return modes[val];
    },
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
      // https://developer.easee.com/docs/enumerations#reasonfornocurrent-96
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
      // https://developer.easee.com/docs/enumerations#pilotmode-100
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
      // https://developer.easee.com/docs/enumerations#op-mode-109
      const modes = {
        0: "Offline - Offline.",
        1: "Disconnected - No car connected.",
        2: "AwaitingStart - Car connected, charger is waiting for EV or load balancing. SuspendedEVSE.",
        3: "Charging - 	Charging.",
        4: "Completed - Car has paused/stopped charging.",
        5: "Error - Error in charger.",
        6: "ReadyToCharge - Charger is waiting for car to take energy. SuspendedEV.",
        7: "Awaiting Authentication - Charger is waiting for authentication.",
        8: "De-authenticating - Charger is de-authenticating.",
      };
      return modes[val];
    },
  },
  {
    observationId: 110,
    name: "OutputPhase",
    dataType: 4,
    valueMapping: (val) => {
      // https://developer.easee.com/docs/enumerations#output-phase-110
      const modes = {
        0: "Unassigned",

        10: "1-phase (N+L1)",
        11: "1-phase (L1+L2)",
        12: "1-phase (N+L2)",
        13: "1-phase (L1+L3)",
        14: "1-phase (N+L3)",
        15: "1-phase (L2+L3)",

        20: "2-phases on TN (N+L1, N+L2)",
        21: "2-phases on TN (N+L2, N+L3)",
        22: "2-phases on IT (L1+L2, L2+L3)",

        30: "3-phases (N+L1, N+L2, N+L3)",
      };
      return modes[val];
    },
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
    dataType: 8, // JSON data type
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
    dataType: 3, // Should be Double according to official documentation
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
  {
    observationId: 206,
    name: "OutVoltPin2And3",
    dataType: 3,
    valueUnit: "V",
  },
  {
    observationId: 223,
    name: "ChargeSessionStart",
    dataType: 8, // JSON data type
  },
  {
    observationId: 250,
    name: "ConnectedToCloud",
    dataType: 2,
  },
  {
    observationId: 251,
    name: "CloudDisconnectReason",
    dataType: 1,
  },
];

/**
 * Data type mappings for parsing values
 */
const VALUE_TYPES = {
  1: "Binary",
  2: "Boolean", 
  3: "Double",
  4: "Integer",
  5: "Position",
  6: "String",
  7: "Statistics",
  8: "JSON", // Added JSON support
};

/**
 * Parses a raw observation using the complete original implementation logic
 * Supports both "id" and "name" modes for matching observations, includes
 * all value mappings, alternate names, and full backwards compatibility.
 * 
 * @param {Object} data - Raw observation object with id, value, dataName properties
 * @param {string} [mode="id"] - Matching mode: "id" or "name"
 * @returns {ParsedObservation} Parsed observation data with full compatibility
 * 
 * @example
 * // Parse by observation ID
 * const parsed = parseObservation({
 *   id: 120,
 *   value: 7200,
 *   timestamp: '2021-12-31T23:00:00Z'
 * });
 * 
 * // Parse by observation name
 * const parsed = parseObservation({
 *   dataName: 'TotalPower',
 *   value: 7200,
 *   timestamp: '2021-12-31T23:00:00Z'
 * }, 'name');
 */
function parseObservation(data, mode = "id") {
  if (!data || typeof data !== 'object') {
    return null;
  }

  // Initialize default values as per original implementation
  data.valueText = "";
  data.valueUnit = "";

  // Find matching observation using original logic
  for (const idx in OBSERVATIONS) {
    const observation = OBSERVATIONS[idx];
    let isMatch = false;

    if (mode === "id" && observation.observationId == data.id) {
      // Id match
      isMatch = true;
    } else if (
      mode === "name" &&
      data.dataName &&
      observation.name.toLowerCase() === data.dataName.toLowerCase()
    ) {
      // Name match
      isMatch = true;
    } else if (
      mode === "name" &&
      data.dataName &&
      observation.altName &&
      observation.altName.toLowerCase() === data.dataName.toLowerCase()
    ) {
      // Alternate name match
      isMatch = true;
    } else if (
      mode === "name" &&
      data.dataName &&
      observation.name.replace(/\_/g, "").toLowerCase() === data.dataName.toLowerCase()
    ) {
      // Name without underscores match
      isMatch = true;
    }

    if (!isMatch) {
      continue;
    }

    // Set observation properties as per original implementation
    data.dataName = observation.name;
    data.observationId = observation.observationId;

    // Set value unit if available
    if (observation.valueUnit !== undefined) {
      data.valueUnit = observation.valueUnit;
    }

    // Set data type information
    data.dataType = observation.dataType;
    data.dataTypeName = VALUE_TYPES[observation.dataType] || "Unknown";

    // Parse value based on data type as per original implementation
    if (data.value !== null && data.value !== undefined) {
      switch (data.dataTypeName) {
        case "Boolean":
          // Convert to actual boolean type
          if (typeof data.value === 'string') {
            data.value = data.value.toLowerCase() === 'true';
          } else if (typeof data.value === 'number') {
            data.value = Boolean(data.value);
          } else {
            data.value = Boolean(data.value);
          }
          break;
        case "Double":
          data.value = parseFloat(data.value);
          break;
        case "Integer":
          data.value = parseInt(data.value);
          break;
        case "JSON":
          // Parse JSON data safely
          if (typeof data.value === 'string') {
            try {
              data.value = JSON.parse(data.value);
              data.valueText = "JSON data parsed successfully";
            } catch (error) {
              // If JSON parsing fails, keep as string and add error info
              data.valueText = `JSON parse error: ${error.message}`;
            }
          } else if (typeof data.value === 'object') {
            // Already an object, keep as-is
            data.valueText = "JSON object";
          }
          break;
        // String, etc. keep as-is
      }
    }

    // Apply value mapping if available
    if (observation.valueMapping && typeof observation.valueMapping === 'function') {
      data.valueText = observation.valueMapping(data.value);
    }

    break;
  }

  // Log unknown observation IDs (commented out as per original)
  if (!data.observationId) {
    // console.error(`Unknown observation id ${data.id}:`);
    // console.error(data);
    
    // For streaming observations: if we have a numeric id but no observationId match,
    // the id is likely the correct observation ID that's just not in our definitions
    if (data.id && typeof data.id === 'number' && data.id > 0) {
      data.observationId = data.id;
    }
  }

  // Parse timestamp for compatibility
  let timestampMs;
  if (data.timestamp) {
    timestampMs = new Date(data.timestamp).getTime();
  } else {
    timestampMs = Date.now();
  }

  // Return complete parsed observation with backwards compatibility
  return {
    id: data.id || 'unknown',
    timestamp: data.timestamp || new Date().toISOString(),
    timestampMs: timestampMs,
    dataType: data.dataType,
    dataTypeName: data.dataTypeName || "Unknown",
    dataName: data.dataName || `unknown_${data.id}`, // For backwards compatibility
    observationId: data.observationId,
    value: data.value,
    valueText: data.valueText || "",
    valueUnit: data.valueUnit || "",
    unit: data.valueUnit || "", // Alias for backwards compatibility
    raw: data
  };
}

/**
 * Parses multiple observations and groups them by charger ID
 * 
 * @param {Array} observations - Array of raw observations
 * @returns {Object} Observations grouped by charger ID
 * 
 * @example
 * const grouped = parseObservations(observationArray);
 * Object.keys(grouped).forEach(chargerId => {
 *   console.log(`Charger ${chargerId}:`, grouped[chargerId]);
 * });
 */
function parseObservations(observations) {
  if (!Array.isArray(observations)) {
    return {};
  }
  
  const grouped = {};
  
  observations.forEach(obs => {
    const parsed = parseObservation(obs);
    if (parsed) {
      // Extract charger ID from observation ID (format: EHXXXXXX_1_timestamp_datatype)
      const chargerId = parsed.id.split('_')[0] || 'unknown';
      
      if (!grouped[chargerId]) {
        grouped[chargerId] = [];
      }
      
      grouped[chargerId].push(parsed);
    }
  });
  
  return grouped;
}

/**
 * Extracts charger status from observation data
 * Uses the comprehensive observation definitions to map status information
 * 
 * @param {Array} observations - Array of parsed observations for a charger
 * @param {string} chargerId - Charger ID
 * @returns {ChargerStatus} Charger status summary
 */
function extractChargerStatus(observations, chargerId) {
  if (!Array.isArray(observations)) {
    return null;
  }
  
  const status = {
    id: chargerId,
    name: chargerId,
    online: false,
    state: 'unknown'
  };
  
  // Find latest timestamp to determine if online
  let latestTimestamp = 0;
  
  observations.forEach(obs => {
    if (obs.timestampMs > latestTimestamp) {
      latestTimestamp = obs.timestampMs;
    }
    
    // Extract specific status information using observation names
    switch (obs.dataName) {
      case 'ChargerOpMode':
        status.state = obs.valueText || obs.value;
        break;
        
      case 'TotalPower':
        status.power = obs.value;
        break;
        
      case 'OutputCurrent':
        status.current = obs.value;
        break;
        
      case 'InVolt_T1_T2':
        if (!status.voltage) status.voltage = {};
        status.voltage.l1 = obs.value;
        break;
        
      case 'InVolt_T1_T3':
        if (!status.voltage) status.voltage = {};
        status.voltage.l2 = obs.value;
        break;
        
      case 'InVolt_T1_T4':
        if (!status.voltage) status.voltage = {};
        status.voltage.l3 = obs.value;
        break;
    }
  });
  
  // Consider online if data is less than 5 minutes old
  const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
  status.online = latestTimestamp > fiveMinutesAgo;
  status.lastSeen = new Date(latestTimestamp).toISOString();
  
  return status;
}

/**
 * Parses charger configuration data from REST API
 * 
 * @param {Object} chargerData - Raw charger data from API
 * @returns {Object} Parsed charger configuration
 */
function parseChargerConfig(chargerData) {
  if (!chargerData || typeof chargerData !== 'object') {
    return null;
  }
  
  return {
    id: chargerData.id,
    name: chargerData.name || chargerData.id,
    siteId: chargerData.siteId,
    siteName: chargerData.siteName,
    circuitId: chargerData.circuitId,
    productCode: chargerData.productCode,
    backPlate: chargerData.backPlate,
    levelOfAccess: chargerData.levelOfAccess,
    location: chargerData.location,
    address: chargerData.address,
    createdOn: chargerData.createdOn,
    updatedOn: chargerData.updatedOn
  };
}

/**
 * Formats observation data for Node-RED message payload
 * 
 * @param {ParsedObservation} observation - Parsed observation
 * @returns {Object} Node-RED compatible message payload
 */
function formatForNodeRed(observation) {
  return {
    chargerId: observation.id.split('_')[0],
    dataType: observation.dataName || observation.dataType,
    dataName: observation.dataName, // Backwards compatibility
    value: observation.value,
    valueText: observation.valueText,
    unit: observation.unit || observation.valueUnit,
    timestamp: observation.timestamp,
    payload: observation.value,
    topic: `easee/${observation.id.split('_')[0]}/${observation.dataName || observation.dataType}`
  };
}

/**
 * Creates a data parser bound to specific options
 * Provides both new and legacy parsing methods for backwards compatibility
 * 
 * @param {Object} [options={}] - Parser options
 * @param {Function} [options.logger] - Logger function
 * @returns {Object} Parser object with bound methods
 */
function createParser(options = {}) {
  const opts = { logger: () => {}, ...options };
  
  return {
    parseObservation: (obs, mode = "id") => {
     // opts.logger(`Parsing observation: ${obs?.dataType || obs?.id}`);
      return parseObservation(obs, mode);
    },
    
    parseObservations: (observations) => {
      opts.logger(`Parsing ${observations?.length || 0} observations`);
      return parseObservations(observations);
    },
    
    extractChargerStatus: (observations, chargerId) => {
      opts.logger(`Extracting status for charger: ${chargerId}`);
      return extractChargerStatus(observations, chargerId);
    },
    
    parseChargerConfig: (data) => {
      opts.logger(`Parsing charger config: ${data?.id}`);
      return parseChargerConfig(data);
    },
    
    formatForNodeRed: (observation) => {
      return formatForNodeRed(observation);
    }
  };
}

module.exports = {
  parseObservation,
  parseObservations,
  extractChargerStatus,
  parseChargerConfig,
  formatForNodeRed,
  createParser,
  
  // Export constants for external use
  OBSERVATIONS,
  VALUE_TYPES
};
