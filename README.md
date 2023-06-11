# @runnane/node-red-contrib-easee npm module

[![npm](https://img.shields.io/npm/v/@runnane/node-red-contrib-easee.svg?maxAge=2592000)](https://www.npmjs.com/package/@runnane/node-red-contrib-easee)
[![downloads](https://img.shields.io/npm/dt/@runnane/node-red-contrib-easee.svg?maxAge=2592000)](https://www.npmjs.com/package/@runnane/node-red-contrib-easee)

Node-Red module for streaming Easee charger data.

## Features

- SignalR streaming client
- Pre-defined list of REST API GET/POST commands
- Custom commands through REST API

## Howto

`npm i @runnane/node-red-contrib-easee`

Add the `easee charger streaming client` node
Configure the node with username/password and the Charger ID.

## Streaming node

Configure the node with username/password and a Charger ID ("EH000000").
Streaming telemetry from the signalR enpoint will be available in the fourth output,
the `ProductUpdate` one.

## REST node

Use the `easee REST Client` node
Configure the node with an account username/password.

There are two ways of sending commands:

### Sending predefined commands by topic

Send the your selected command as the topic into the node.
You can set the charger, site and/or circuit variables directly in the node, or send them as
`msg.charger`, `msg.site` and `msg.circuit` to override.
Implemented commands that may be sent as topic, are:

- `login`
- `refresh_token`
- `charger`
- `charger_details`
- `charger_state`
- `charger_site`
- `charger_config`
- `charger_session_latest`
- `charger_session_ongoing`
- `stop_charging`
- `start_charging`
- `pause_charging`
- `resume_charging`
- `toggle_charging`
- `dynamic_current` (Without msg.payload.body for reading (GET), and with msg.payload.body for setting (POST).)
- `reboot`

Example, [get charger details](https://developer.easee.cloud/reference/get_api-chargers-id-details):

```javascript
node.send({
  topic: "charger_details",
  charger: "EH000000",
});
```

### Sending custom commands

Send the full path as msg.command, and optionally the POST body as msg.payload.
See [developer.easee.cloud](https://developer.easee.cloud/reference/get_api-chargers) for full list of commands.

Example to [set dynamic current to 3x25A](https://developer.easee.cloud/reference/post_api-sites-siteid-circuits-circuitid-dynamiccurrent) by doing a custom command with POST body:

```javascript
node.send({
  command: "/sites/1234/circuits/1345/dynamic_current",
  body: { phase1: 25, phase2: 25, phase3: 25 },
});
```

## Todo

- Better documentation and examples

## Credits

- Initially forked from [node-red-contrib-signalrcore](https://github.com/scottpage/node-red-contrib-signalrcore), then rewritten
