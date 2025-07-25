/**
 * Comprehensive Parser Migration Test Suite
 * 
 * This test suite validates the complete migration of the parseObservation function
 * from the monolithic easee-configuration.js to the new modular lib/api/parser.js.
 * 
 * Test Coverage:
 * - All 100+ observation definitions with IDs, names, data types, and units
 * - Comprehensive value mapping functions for enums and special values
 * - Alternate name support for different naming conventions
 * - Backwards compatibility with existing Node-RED nodes
 * - ID mode (default) and name mode parsing
 * - Streaming node data formats (ChargerUpdate/ProductUpdate events)
 * - REST API data formats matching original implementation approach
 * - Real-world scenario testing with mixed data sources
 * - Error handling for unknown observations and malformed data
 * 
 * Total Tests: 44 comprehensive test cases
 * Migration Status: Complete - all original functionality preserved
 */

const { parseObservation, parseObservations, OBSERVATIONS, VALUE_TYPES } = require('../../lib/api/parser');

describe('Comprehensive Parser Migration', () => {

    describe('parseObservation - ID Mode (Default)', () => {
        test('should parse observation by ID with value mapping (PhaseMode)', () => {
            const data = {
                id: 38,
                value: 2,
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(data);

            expect(result).toMatchObject({
                id: 38,
                dataName: 'PhaseMode',
                observationId: 38,
                dataType: 4,
                dataTypeName: 'Integer',
                value: 2,
                valueText: 'Auto phase mode',
                valueUnit: '',
                unit: ''
            });
        });

        test('should parse observation by ID with value mapping (LEDMode)', () => {
            const data = {
                id: 46,
                value: 24,
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(data);

            expect(result).toMatchObject({
                dataName: 'LEDMode',
                observationId: 46,
                value: 24,
                valueText: 'Normal mode (Charging)'
            });
        });

        test('should parse observation by ID with units (TotalPower)', () => {
            const data = {
                id: 120,
                value: '7200',
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(data);

            expect(result).toMatchObject({
                dataName: 'TotalPower',
                observationId: 120,
                dataType: 3,
                dataTypeName: 'Double',
                value: 7200, // Should be parsed as float
                valueUnit: 'W',
                unit: 'W'
            });
        });

        test('should parse observation by ID with comprehensive value mapping (ReasonForNoCurrent)', () => {
            const data = {
                id: 96,
                value: 77,
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(data);

            expect(result).toMatchObject({
                dataName: 'ReasonForNoCurrent',
                observationId: 96,
                value: 77,
                valueText: 'Charger Limit - Current limited by charger max current'
            });
        });

        test('should parse observation by ID with alternate name support (voltage)', () => {
            const data = {
                id: 190,
                value: '230.5',
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(data);

            expect(result).toMatchObject({
                dataName: 'InVolt_T1_T2',
                observationId: 190,
                dataType: 3,
                dataTypeName: 'Double',
                value: 230.5,
                valueUnit: 'V',
                unit: 'V'
            });
        });

        test('should handle unknown observation ID', () => {
            const data = {
                id: 999,
                value: 42,
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(data);

            expect(result).toMatchObject({
                id: 999,
                value: 42,
                dataName: 'unknown_999',
                observationId: 999, // Now set to id for numeric unknown observations
                valueText: '',
                valueUnit: ''
            });
        });

        test('should set observationId to id for unknown streaming observations', () => {
            // Simulate streaming observation with unknown ID
            const streamingData = {
                id: 555, // Unknown observation ID from streaming
                value: 'test_value',
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(streamingData);

            expect(result).toMatchObject({
                id: 555,
                observationId: 555, // Should be set to the id value for unknown numeric observations
                dataName: 'unknown_555',
                value: 'test_value',
                dataTypeName: 'Unknown',
                valueText: '',
                valueUnit: ''
            });
        });
    });

    describe('parseObservation - Name Mode', () => {
        test('should parse observation by exact name match', () => {
            const data = {
                dataName: 'TotalPower',
                value: '3600',
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(data, 'name');

            expect(result).toMatchObject({
                dataName: 'TotalPower',
                observationId: 120,
                dataType: 3,
                dataTypeName: 'Double',
                value: 3600,
                valueUnit: 'W'
            });
        });

        test('should parse observation by alternate name match', () => {
            const data = {
                dataName: 'inVoltageT1T2',
                value: '240.0',
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(data, 'name');

            expect(result).toMatchObject({
                dataName: 'InVolt_T1_T2',
                observationId: 190,
                value: 240.0,
                valueUnit: 'V'
            });
        });

        test('should parse observation by name without underscores', () => {
            const data = {
                dataName: 'incurrentt2',
                value: '15.5',
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(data, 'name');

            expect(result).toMatchObject({
                dataName: 'InCurrent_T2',
                observationId: 182,
                value: 15.5,
                valueUnit: 'A'
            });
        });

        test('should handle case insensitive name matching', () => {
            const data = {
                dataName: 'totalpower',
                value: '5000',
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(data, 'name');

            expect(result).toMatchObject({
                dataName: 'TotalPower',
                observationId: 120,
                value: 5000
            });
        });
    });

    describe('Data Type Parsing', () => {
        test('should parse Boolean data type from string', () => {
            const data = {
                id: 31, // IsEnabled
                value: 'true',
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(data);

            expect(result.dataTypeName).toBe('Boolean');
            expect(result.value).toBe(true); // Should be converted to actual boolean
        });

        test('should parse Boolean data type from false string', () => {
            const data = {
                id: 102, // SmartCharging
                value: 'false',
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(data);

            expect(result.dataTypeName).toBe('Boolean');
            expect(result.value).toBe(false); // Should be converted to actual boolean
        });

        test('should parse Boolean data type from number', () => {
            const data = {
                id: 103, // CableLocked
                value: 1,
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(data);

            expect(result.dataTypeName).toBe('Boolean');
            expect(result.value).toBe(true); // Should be converted to actual boolean
        });

        test('should parse Boolean data type from zero', () => {
            const data = {
                id: 116, // DeratingActive
                value: 0,
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(data);

            expect(result.dataTypeName).toBe('Boolean');
            expect(result.value).toBe(false); // Should be converted to actual boolean
        });

        test('should parse Integer data type', () => {
            const data = {
                id: 27,
                value: '12345',
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(data);

            expect(result.dataTypeName).toBe('Integer');
            expect(result.value).toBe(12345);
        });

        test('should parse Double data type', () => {
            const data = {
                id: 47,
                value: '32.5',
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(data);

            expect(result.dataTypeName).toBe('Double');
            expect(result.value).toBe(32.5);
        });

        test('should parse String data type', () => {
            const stringData = {
                id: 107,
                value: 'EH123456',
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(stringData);

            expect(result).toMatchObject({
                dataTypeName: 'String',
                value: 'EH123456'
            });
        });

        test('should parse JSON data type with string input', () => {
            const jsonData = {
                id: 129, // ChargingSession
                value: '{"sessionId": 12345, "energy": 25.5, "startTime": "2023-12-31T10:00:00Z"}',
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(jsonData);

            expect(result).toMatchObject({
                dataName: 'ChargingSession',
                dataTypeName: 'JSON',
                value: {
                    sessionId: 12345,
                    energy: 25.5,
                    startTime: '2023-12-31T10:00:00Z'
                },
                valueText: 'JSON data parsed successfully'
            });
        });

        test('should parse JSON data type with object input', () => {
            const jsonData = {
                id: 20, // SiteStructure
                value: { address: 'Test Street 123', installer: 'Easee', owner: 'John Doe' },
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(jsonData);

            expect(result).toMatchObject({
                dataName: 'SiteStructure',
                dataTypeName: 'JSON',
                value: {
                    address: 'Test Street 123',
                    installer: 'Easee',
                    owner: 'John Doe'
                },
                valueText: 'JSON object'
            });
        });

        test('should handle invalid JSON gracefully', () => {
            const invalidJsonData = {
                id: 129, // ChargingSession
                value: '{"invalidJson": missing quote}',
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(invalidJsonData);

            expect(result).toMatchObject({
                dataName: 'ChargingSession',
                dataTypeName: 'JSON',
                value: '{"invalidJson": missing quote}', // Should keep original string
                valueText: expect.stringContaining('JSON parse error:')
            });
        });
    });

    describe('Value Mapping Functions', () => {
        test('should apply ChargerOpMode value mapping', () => {
            const data = {
                id: 109,
                value: 3,
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(data);

            expect(result.valueText).toBe('Charging - 	Charging.');
        });

        test('should apply OutputPhase value mapping', () => {
            const data = {
                id: 110,
                value: 30,
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(data);

            expect(result.valueText).toBe('3-phases (N+L1, N+L2, N+L3)');
        });

        test('should apply PilotMode value mapping with string values', () => {
            const data = {
                id: 100,
                value: 'C',
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(data);

            expect(result.valueText).toBe('Car charging');
        });

        test('should apply RebootReason value mapping', () => {
            const data = {
                id: 89,
                value: 4,
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(data);

            expect(result.valueText).toBe('SoftwareReset');
        });
    });

    describe('Backwards Compatibility', () => {
        test('should maintain all required fields for backwards compatibility', () => {
            const data = {
                id: 121,
                value: '45.67',
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(data);

            // Check all expected fields are present
            expect(result).toHaveProperty('id');
            expect(result).toHaveProperty('timestamp');
            expect(result).toHaveProperty('timestampMs');
            expect(result).toHaveProperty('dataType');
            expect(result).toHaveProperty('dataTypeName');
            expect(result).toHaveProperty('dataName');
            expect(result).toHaveProperty('observationId');
            expect(result).toHaveProperty('value');
            expect(result).toHaveProperty('valueText');
            expect(result).toHaveProperty('valueUnit');
            expect(result).toHaveProperty('unit'); // Alias for valueUnit
            expect(result).toHaveProperty('raw');
        });

        test('should handle null and undefined values gracefully', () => {
            const data = {
                id: 120,
                value: null,
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(data);

            expect(result.value).toBe(null);
            expect(result.valueText).toBe('');
        });

        test('should generate timestamp if missing', () => {
            const data = {
                id: 120,
                value: 1000
            };

            const result = parseObservation(data);

            expect(result.timestamp).toBeDefined();
            expect(result.timestampMs).toBeDefined();
            expect(typeof result.timestampMs).toBe('number');
        });
    });

    describe('parseObservations - Array Processing', () => {
        test('should parse multiple observations and group by charger ID', () => {
            const observations = [
                {
                    id: 'EH123456_1_1640995200_120',
                    dataType: 120,
                    value: 7200,
                    timestamp: '2023-12-31T12:00:00Z'
                },
                {
                    id: 'EH123456_1_1640995200_121',
                    dataType: 121,
                    value: 25.5,
                    timestamp: '2023-12-31T12:00:00Z'
                },
                {
                    id: 'EH789012_1_1640995200_120',
                    dataType: 120,
                    value: 3600,
                    timestamp: '2023-12-31T12:00:00Z'
                }
            ];

            const result = parseObservations(observations);

            expect(Object.keys(result)).toEqual(['EH123456', 'EH789012']);
            expect(result['EH123456']).toHaveLength(2);
            expect(result['EH789012']).toHaveLength(1);
        });
    });

    describe('Streaming Node Data Formats', () => {
        test('should parse ChargerUpdate streaming data format', () => {
            // Simulate data as received from SignalR ChargerUpdate event
            const streamingData = {
                id: 120, // Observation ID for TotalPower
                value: 7200,
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(streamingData);

            expect(result).toMatchObject({
                id: 120,
                dataName: 'TotalPower',
                observationId: 120,
                dataType: 3,
                dataTypeName: 'Double',
                value: 7200,
                valueUnit: 'W',
                unit: 'W',
                timestampMs: expect.any(Number)
            });
        });

        test('should parse ProductUpdate streaming data format', () => {
            // Simulate data as received from SignalR ProductUpdate event
            const streamingData = {
                id: 46, // LEDMode
                value: 24,
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(streamingData);

            expect(result).toMatchObject({
                id: 46,
                dataName: 'LEDMode',
                observationId: 46,
                dataType: 4,
                dataTypeName: 'Integer',
                value: 24,
                valueText: 'Normal mode (Charging)',
                valueUnit: '',
                unit: ''
            });
        });

        test('should parse ChargerUpdate with enum value mapping', () => {
            // ChargerOpMode observation from streaming
            const streamingData = {
                id: 109,
                value: 3,
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(streamingData);

            expect(result).toMatchObject({
                dataName: 'ChargerOpMode',
                observationId: 109,
                value: 3,
                valueText: 'Charging - 	Charging.',
                dataTypeName: 'Integer'
            });
        });

        test('should parse streaming data with string ID format', () => {
            // Some streaming data might come with string ID format
            const streamingData = {
                id: 'EH123456_1_1640995200_120',
                value: 5400,
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(streamingData);

            // Should still work with string ID
            expect(result).toMatchObject({
                id: 'EH123456_1_1640995200_120',
                value: 5400,
                timestamp: '2023-12-31T12:00:00Z'
            });
        });

        test('should parse voltage observations with alternate names from streaming', () => {
            // Voltage observation that has alternate name support
            const streamingData = {
                id: 190, // InVolt_T1_T2
                value: 230.5,
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(streamingData);

            expect(result).toMatchObject({
                dataName: 'InVolt_T1_T2',
                observationId: 190,
                value: 230.5,
                valueUnit: 'V',
                unit: 'V'
            });
        });
    });

    describe('REST API Data Formats', () => {
        test('should parse charger_state REST API response format', () => {
            // Simulate charger_state data as it would be parsed by the REST client
            // This matches the original implementation approach
            const restApiData = {
                dataName: 'totalPower',
                value: 7200,
                origValue: 7200
            };

            const result = parseObservation(restApiData, 'name');

            // The parser should find TotalPower observation and properly map it
            expect(result).toMatchObject({
                dataName: 'TotalPower', // Mapped to standard observation name
                observationId: 120, // Should find the TotalPower observation
                value: 7200,
                valueUnit: 'W', // Should include units from observation definition
                unit: 'W',
                dataType: 3,
                dataTypeName: 'Double'
            });
        });

        test('should parse observation data by name for REST API compatibility', () => {
            // REST API might send data with observation names instead of IDs
            const restApiData = {
                dataName: 'TotalPower',
                value: 4800,
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(restApiData, 'name');

            expect(result).toMatchObject({
                dataName: 'TotalPower',
                observationId: 120,
                dataType: 3,
                dataTypeName: 'Double',
                value: 4800,
                valueUnit: 'W',
                unit: 'W'
            });
        });

        test('should handle REST API observation with alternate naming', () => {
            // REST API might use alternate names for voltage observations
            const restApiData = {
                dataName: 'inVoltageT1T2',
                value: 235.2,
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(restApiData, 'name');

            expect(result).toMatchObject({
                dataName: 'InVolt_T1_T2',
                observationId: 190,
                value: 235.2,
                valueUnit: 'V'
            });
        });

        test('should parse REST API boolean observation', () => {
            // Boolean observation from REST API
            const restApiData = {
                dataName: 'CableLocked',
                value: true,
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(restApiData, 'name');

            expect(result).toMatchObject({
                dataName: 'CableLocked',
                observationId: 103,
                dataType: 2,
                dataTypeName: 'Boolean',
                value: true
            });
        });

        test('should handle REST API current measurements', () => {
            // Current observation from REST API
            const restApiData = {
                dataName: 'OutputCurrent',
                value: '16.0',
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(restApiData, 'name');

            expect(result).toMatchObject({
                dataName: 'OutputCurrent',
                observationId: 114,
                dataType: 3,
                dataTypeName: 'Double',
                value: 16.0, // Should be parsed as number
                valueUnit: 'A'
            });
        });

        test('should handle unknown REST API observation data', () => {
            // REST API data that doesn't match any known observation
            const unknownRestData = {
                dataName: 'unknownField',
                value: 42,
                origValue: 42
            };

            const result = parseObservation(unknownRestData, 'name');

            expect(result).toMatchObject({
                dataName: 'unknownField', // Should keep original name
                value: 42,
                observationId: undefined, // Won't match any standard observation
                valueText: '',
                valueUnit: ''
            });
        });

        test('should parse SmartCharging REST API data with correct observationId', () => {
            // REST API data for SmartCharging as it would be processed by the REST client
            const smartChargingData = {
                dataName: 'smartCharging',
                value: true,
                origValue: true
            };

            const result = parseObservation(smartChargingData, 'name');

            expect(result).toMatchObject({
                dataName: 'SmartCharging', // Should map to standard observation name
                observationId: 102, // Should get the correct numeric observationId as shown in screenshot
                value: true,
                dataType: 2, // Boolean data type
                dataTypeName: 'Boolean',
                valueUnit: '',
                unit: ''
            });
        });
    });

    describe('Real-world Scenario Tests', () => {
        test('should handle mixed streaming and REST API data together', () => {
            // Mixed array of observations from different sources
            const mixedObservations = [
                // Streaming format
                {
                    id: 120,
                    value: 7200,
                    timestamp: '2023-12-31T12:00:00Z'
                },
                // REST API format with name
                {
                    dataName: 'SessionEnergy',
                    value: '25.67',
                    timestamp: '2023-12-31T12:00:00Z'
                }
            ];

            // Parse streaming format by ID
            const streamingResult = parseObservation(mixedObservations[0]);
            expect(streamingResult.dataName).toBe('TotalPower');
            expect(streamingResult.value).toBe(7200);

            // Parse REST API format by name
            const restResult = parseObservation(mixedObservations[1], 'name');
            expect(restResult.dataName).toBe('SessionEnergy');
            expect(restResult.observationId).toBe(121);
            expect(restResult.value).toBe(25.67);
        });

        test('should handle temperature observations with units', () => {
            // Temperature observation as might come from either source
            const tempData = {
                id: 150, // TempMax
                value: '45.5',
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(tempData);

            expect(result).toMatchObject({
                dataName: 'TempMax',
                observationId: 150,
                value: 45.5,
                valueUnit: '°C',
                unit: '°C'
            });
        });

        test('should handle WiFi/Network observations', () => {
            // Network-related observations
            const wifiData = {
                id: 132, // WiFiRSSI
                value: -45,
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(wifiData);

            expect(result).toMatchObject({
                dataName: 'WiFiRSSI',
                observationId: 132,
                value: -45,
                dataTypeName: 'Integer'
            });
        });

        test('should handle complex enum mapping (ReasonForNoCurrent)', () => {
            // Complex enum with many possible values
            const reasonData = {
                id: 96,
                value: 75, // Cable - Current limited by cable rating
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(reasonData);

            expect(result).toMatchObject({
                dataName: 'ReasonForNoCurrent',
                observationId: 96,
                value: 75,
                valueText: 'Cable - Current limited by cable rating'
            });
        });

        test('should handle PilotMode with string values', () => {
            // PilotMode uses string values instead of numeric
            const pilotData = {
                id: 100,
                value: 'B', // Car connected
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(pilotData);

            expect(result).toMatchObject({
                dataName: 'PilotMode',
                observationId: 100,
                value: 'B',
                valueText: 'Car connected'
            });
        });

        test('should handle new observations from official documentation', () => {
            // Test some of the newly added observations

            // Test SelfTestResult (ID 1)
            const selfTestData = {
                id: 1,
                value: 'PASSED',
                timestamp: '2023-12-31T12:00:00Z'
            };
            const selfTestResult = parseObservation(selfTestData);
            expect(selfTestResult.dataName).toBe('SelfTestResult');
            expect(selfTestResult.observationId).toBe(1);

            // Test NumberOfCarsConnected (ID 76)
            const carsConnectedData = {
                id: 76,
                value: 3,
                timestamp: '2023-12-31T12:00:00Z'
            };
            const carsConnectedResult = parseObservation(carsConnectedData);
            expect(carsConnectedResult.dataName).toBe('NumberOfCarsConnected');
            expect(carsConnectedResult.observationId).toBe(76);

            // Test ConnectedToCloud (ID 250)
            const cloudData = {
                id: 250,
                value: true,
                timestamp: '2023-12-31T12:00:00Z'
            };
            const cloudResult = parseObservation(cloudData);
            expect(cloudResult.dataName).toBe('ConnectedToCloud');
            expect(cloudResult.observationId).toBe(250);
            expect(cloudResult.dataTypeName).toBe('Boolean');
        });
    });

    describe('Comprehensive Observation Coverage', () => {
        test('should have all observation IDs from original implementation', () => {
            const expectedIds = [
                1, 2, 10, 11, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 31, 32, 33, 34, 35, 36, 37, 38,
                40, 41, 42, 43, 44, 45, 46, 47, 48, 50, 51, 52, 54, 62, 65, 68, 69, 70, 71, 72, 73,
                74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 89, 90, 91, 96, 97, 98, 99, 100, 101, 102, 103, 104,
                105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119,
                120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134,
                135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149,
                150, 151, 152, 153, 154, 155, 160, 161, 162, 163, 170, 171, 172, 173, 174,
                175, 182, 183, 184, 185, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199,
                202, 203, 204, 205, 206, 210, 211, 212, 223, 230, 231, 232, 250, 251
            ];

            const actualIds = OBSERVATIONS.map(obs => obs.observationId).sort((a, b) => a - b);
            expect(actualIds).toEqual(expectedIds.sort((a, b) => a - b));
        });

        test('should include all value mapping functions from original', () => {
            const observationsWithMappings = OBSERVATIONS.filter(obs => obs.valueMapping);

            // These are the observation IDs that have value mappings in the original
            const expectedMappingIds = [38, 45, 46, 89, 96, 100, 109, 110];
            const actualMappingIds = observationsWithMappings.map(obs => obs.observationId);

            expect(actualMappingIds.sort()).toEqual(expectedMappingIds.sort());
        });

        test('should include all alternate names from original', () => {
            const observationsWithAltNames = OBSERVATIONS.filter(obs => obs.altName);

            // These observations have alternate names in the original
            const expectedAltNameIds = [190, 191, 192, 193, 194, 195, 196, 197, 198, 199];
            const actualAltNameIds = observationsWithAltNames.map(obs => obs.observationId);

            expect(actualAltNameIds.sort()).toEqual(expectedAltNameIds.sort());
        });
    });

    describe('JSON Data Type Support', () => {
        test('should parse SelfTestDetails JSON observation', () => {
            const selfTestData = {
                id: 2,
                value: '{"testStatus": "passed", "components": ["relay", "contactor", "pilot"], "timestamp": "2023-12-31T12:00:00Z"}',
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(selfTestData);

            expect(result).toMatchObject({
                dataName: 'SelfTestDetails',
                observationId: 2,
                dataTypeName: 'JSON',
                value: {
                    testStatus: 'passed',
                    components: ['relay', 'contactor', 'pilot'],
                    timestamp: '2023-12-31T12:00:00Z'
                },
                valueText: 'JSON data parsed successfully'
            });
        });

        test('should parse ChargeSessionStart JSON observation', () => {
            const sessionStartData = {
                id: 223,
                value: '{"sessionId": "abc123", "userId": "user456", "startTime": "2023-12-31T12:00:00Z", "rfidToken": "1234567890"}',
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(sessionStartData);

            expect(result).toMatchObject({
                dataName: 'ChargeSessionStart',
                observationId: 223,
                dataTypeName: 'JSON',
                value: {
                    sessionId: 'abc123',
                    userId: 'user456',
                    startTime: '2023-12-31T12:00:00Z',
                    rfidToken: '1234567890'
                },
                valueText: 'JSON data parsed successfully'
            });
        });

        test('should parse SiteStructure JSON observation', () => {
            const siteStructureData = {
                id: 20,
                value: '{"address": "Test Street 123", "contactInfo": "test@example.com", "installer": "Easee", "owner": "John Doe"}',
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(siteStructureData);

            expect(result).toMatchObject({
                dataName: 'SiteStructure',
                observationId: 20,
                dataTypeName: 'JSON',
                value: {
                    address: 'Test Street 123',
                    contactInfo: 'test@example.com',
                    installer: 'Easee',
                    owner: 'John Doe'
                },
                valueText: 'JSON data parsed successfully'
            });
        });

        test('should handle JSON object input', () => {
            const jsonObjectData = {
                id: 62, // ChargingSchedule
                value: {
                    schedule: [
                        { start: '08:00', end: '16:00', current: 16 },
                        { start: '22:00', end: '06:00', current: 32 }
                    ]
                },
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(jsonObjectData);

            expect(result).toMatchObject({
                dataName: 'ChargingSchedule',
                observationId: 62,
                dataTypeName: 'JSON',
                value: {
                    schedule: [
                        { start: '08:00', end: '16:00', current: 16 },
                        { start: '22:00', end: '06:00', current: 32 }
                    ]
                },
                valueText: 'JSON object'
            });
        });

        test('should convert all Boolean observations correctly', () => {
            // Test with all Boolean observation IDs from official documentation
            const booleanObservations = [
                { id: 15, name: 'LocalPreAuthorizeEnabled' },
                { id: 16, name: 'LocalAuthorizeOfflineEnabled' },
                { id: 17, name: 'AllowOfflineTxForUnknownId' },
                { id: 30, name: 'LockCablePermanently' },
                { id: 31, name: 'IsEnabled' },
                { id: 41, name: 'LocalAuthorizationRequired' },
                { id: 42, name: 'AuthorizationRequired' },
                { id: 43, name: 'RemoteStartRequired' },
                { id: 44, name: 'SmartButtonEnabled' },
                { id: 102, name: 'SmartCharging' },
                { id: 103, name: 'CableLocked' },
                { id: 116, name: 'DeratingActive' },
                { id: 250, name: 'ConnectedToCloud' }
            ];

            booleanObservations.forEach(obs => {
                // Test string 'true'
                const trueData = {
                    id: obs.id,
                    value: 'true',
                    timestamp: '2023-12-31T12:00:00Z'
                };
                const trueResult = parseObservation(trueData);
                expect(trueResult.dataTypeName).toBe('Boolean');
                expect(trueResult.value).toBe(true);

                // Test string 'false'
                const falseData = {
                    id: obs.id,
                    value: 'false',
                    timestamp: '2023-12-31T12:00:00Z'
                };
                const falseResult = parseObservation(falseData);
                expect(falseResult.dataTypeName).toBe('Boolean');
                expect(falseResult.value).toBe(false);

                // Test number 1
                const oneData = {
                    id: obs.id,
                    value: 1,
                    timestamp: '2023-12-31T12:00:00Z'
                };
                const oneResult = parseObservation(oneData);
                expect(oneResult.dataTypeName).toBe('Boolean');
                expect(oneResult.value).toBe(true);

                // Test number 0
                const zeroData = {
                    id: obs.id,
                    value: 0,
                    timestamp: '2023-12-31T12:00:00Z'
                };
                const zeroResult = parseObservation(zeroData);
                expect(zeroResult.dataTypeName).toBe('Boolean');
                expect(zeroResult.value).toBe(false);
            });
        });

        test('should handle invalid JSON gracefully', () => {
            const invalidJsonData = {
                id: 129, // ChargingSession
                value: '{"invalidJson": missing quote}',
                timestamp: '2023-12-31T12:00:00Z'
            };

            const result = parseObservation(invalidJsonData);

            expect(result).toMatchObject({
                dataName: 'ChargingSession',
                observationId: 129,
                dataTypeName: 'JSON',
                value: '{"invalidJson": missing quote}', // Should keep original string
                valueText: expect.stringContaining('JSON parse error:')
            });
        });
    });

    describe('Error Handling', () => {
        test('should handle invalid input gracefully', () => {
            expect(parseObservation(null)).toBe(null);
            expect(parseObservation(undefined)).toBe(null);
            expect(parseObservation('string')).toBe(null);
            expect(parseObservation(123)).toBe(null);
        });

        test('should handle empty object', () => {
            const result = parseObservation({});

            expect(result).toMatchObject({
                id: 'unknown',
                dataName: 'unknown_undefined',
                valueText: '',
                valueUnit: ''
            });
        });
    });
});
