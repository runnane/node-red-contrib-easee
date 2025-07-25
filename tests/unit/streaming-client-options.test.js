/**
 * Tests for the streaming client skipNegotiation option
 */

const helper = require('node-red-node-test-helper');
const streamingClientNode = require('../../easee-client/charger-streaming-client.js');
const configNode = require('../../easee-client/easee-configuration.js');

helper.init(require.resolve('node-red'));

describe('Streaming Client Options', function () {
  afterEach(function (done) {
    helper.unload();
    done();
  });

  it('should have skipNegotiation property as false by default', function (done) {
    const flow = [
      {
        id: 'config1',
        type: 'easee-configuration',
        name: 'Test Config',
        username: 'test@example.com',
        password: 'testpass'
      },
      {
        id: 'streaming1',
        type: 'charger-streaming-client',
        name: 'Test Streaming',
        charger: 'EH000000',
        configuration: 'config1',
        wires: [[], [], [], [], [], []]
      }
    ];

    helper.load([configNode, streamingClientNode], flow, function () {
      try {
        const streamingNode = helper.getNode('streaming1');
        expect(streamingNode.skipNegotiation).toBe(false);
        done();
      } catch (err) {
        done(err);
      }
    });
  });

  it('should accept skipNegotiation as true when configured', function (done) {
    const flow = [
      {
        id: 'config1',
        type: 'easee-configuration',
        name: 'Test Config',
        username: 'test@example.com',
        password: 'testpass'
      },
      {
        id: 'streaming1',
        type: 'charger-streaming-client',
        name: 'Test Streaming',
        charger: 'EH000000',
        configuration: 'config1',
        skipNegotiation: true,
        wires: [[], [], [], [], [], []]
      }
    ];

    helper.load([configNode, streamingClientNode], flow, function () {
      try {
        const streamingNode = helper.getNode('streaming1');
        expect(streamingNode.skipNegotiation).toBe(true);
        done();
      } catch (err) {
        done(err);
      }
    });
  });

  it('should handle skipNegotiation property correctly when undefined', function (done) {
    const flow = [
      {
        id: 'config1',
        type: 'easee-configuration',
        name: 'Test Config',
        username: 'test@example.com',
        password: 'testpass'
      },
      {
        id: 'streaming1',
        type: 'charger-streaming-client',
        name: 'Test Streaming',
        charger: 'EH000000',
        configuration: 'config1',
        skipNegotiation: undefined,
        wires: [[], [], [], [], [], []]
      }
    ];

    helper.load([configNode, streamingClientNode], flow, function () {
      try {
        const streamingNode = helper.getNode('streaming1');
        // Should default to false when undefined
        expect(streamingNode.skipNegotiation).toBe(false);
        done();
      } catch (err) {
        done(err);
      }
    });
  });
});
