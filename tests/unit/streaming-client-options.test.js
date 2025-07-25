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

  it('should set skipNegotiation to false by default', function (done) {
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
        skipNegotiation: false
      }
    ];

    helper.load([configNode, streamingClientNode], flow, function () {
      try {
        const streamingNode = helper.getNode('streaming1');
        expect(streamingNode.skipNegotiation).toBe(false);
        done();
      } catch (error) {
        done(error);
      }
    });
  });

  it('should set skipNegotiation to true when configured', function (done) {
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
        skipNegotiation: true
      }
    ];

    helper.load([configNode, streamingClientNode], flow, function () {
      try {
        const streamingNode = helper.getNode('streaming1');
        expect(streamingNode.skipNegotiation).toBe(true);
        done();
      } catch (error) {
        done(error);
      }
    });
  });

  it('should default skipNegotiation to false when not specified', function (done) {
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
        configuration: 'config1'
        // skipNegotiation not specified
      }
    ];

    helper.load([configNode, streamingClientNode], flow, function () {
      try {
        const streamingNode = helper.getNode('streaming1');
        expect(streamingNode.skipNegotiation).toBe(false);
        done();
      } catch (error) {
        done(error);
      }
    });
  });
});
