# @runnane/node-red-contrib-easee npm module

[![npm](https://img.shields.io/npm/v/@runnane/node-red-contrib-easee.svg?maxAge=2592000)](https://www.npmjs.com/package/@runnane/node-red-contrib-easee)
[![downloads](https://img.shields.io/npm/dt/@runnane/node-red-contrib-easee.svg?maxAge=2592000)](https://www.npmjs.com/package/@runnane/node-red-contrib-easee)
[![license](https://img.shields.io/npm/l/@runnane/node-red-contrib-easee.svg)](https://github.com/runnane/node-red-contrib-easee/blob/main/LICENSE)

Node-Red module for streaming Easee charger data.

## Features

- SignalR streaming client
- Pre-defined list of REST API GET/POST commands
- Custom commands through REST API

## Howto

`npm i @runnane/node-red-contrib-easee`

Add the `easee Charger Streaming Client` node
Configure the node with username/password and the Charger ID.

## Streaming node

Configure the node with username/password and a Charger ID ("EH000000").
Streaming telemetry from the signalR enpoint will be available in the fourth output,
the `ProductUpdate` one.

## REST node

Use the `easee REST Client` node
Configure the node with an account username/password.
The REST node will not authenticate on its own, so you will need to authenticate/renew tokens.
However, if you use the `easee Charger Streaming Client` node,
you do not need to authenticate additionally with the REST node, as the signalR socket
will authenticate and renew automatically.

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

Example, [get charger details](https://developer.easee.com/reference/get_api-chargers-id-details):

```javascript
node.send({
  topic: "charger_details",
  charger: "EH000000",
});
```

### Sending custom commands

Send the full path as msg.command, and optionally the POST body as msg.payload.
See [get_api-chargers](https://developer.easee.com/reference/get_api-chargers) for full list of commands.
When adding a body, the request will be sent as a POST, else as a GET. If you wish to send a POST without body, add an empty object as POST argument.

Example to [set dynamic current to 3x25A](https://developer.easee.com/reference/post_api-sites-siteid-circuits-circuitid-dynamiccurrent) by doing a custom command with POST body:

Set dynamic current:
```javascript
node.send({ 
  payload: {
    path: "/sites/1234/circuits/1345/dynamic_current",
    body: { phase1: 25, phase2: 25, phase3: 25 },
  }
});
```

Pause charging:
```javascript
node.send({ 
  payload: {
    path: "/chargers/EH000000/commands/pause_charging",
    body: {},
  }
});
```

## Development

### Code Quality

This project uses ESLint for code quality and formatting:

```bash
# Check for linting issues
npm run lint

# Auto-fix formatting issues  
npm run lint:fix
```

See [ESLINT.md](ESLINT.md) for detailed ESLint configuration and usage.

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

## Example

See [example flows](https://github.com/runnane/node-red-contrib-easee/blob/main/example.json)
![image](https://github.com/runnane/node-red-contrib-easee/assets/1679504/744fd250-3bab-46d8-a31a-3421f6d4c42d)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Credits and Attribution

- **Author**: Jon Tungland (@runnane)
- **Original Fork**: Initially forked from [node-red-contrib-signalrcore](https://github.com/scottpage/node-red-contrib-signalrcore) by Scott Page (Apache License 2.0), then extensively rewritten
- **API Documentation**: [developer.easee.com](https://developer.easee.com/docs/integrations)
- **Enumerations**: [developer.easee.com](https://developer.easee.com/docs/enumerations)

### License Migration Notice

This project was migrated from Apache License 2.0 to MIT License in 2025. The original Apache License 2.0 code from the forked project `node-red-contrib-signalrcore` has been preserved in the LICENSE file for attribution purposes. All subsequent modifications and additions by Jon Tungland are licensed under the MIT License.

## Dependencies

All dependencies are compatible with the MIT License:
- `@microsoft/signalr`: MIT License
- `node-fetch`: MIT License
