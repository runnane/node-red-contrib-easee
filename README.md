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

### Re-login

If the configuration node's status says authentication failed or timed out, open
the configuration node in the editor and press **Re-login**. It discards the
deployed node's tokens and logs in to Easee again, without a redeploy, and shows
the outcome as a notification. The button is disabled until the configuration has
been deployed; it acts on the deployed credentials, not on unsaved edits.

## Streaming node

Configure the node with username/password and a Charger ID ("EH000000").
Streaming telemetry from the signalR enpoint will be available in the fourth output,
the `ProductUpdate` one.

If the Easee hub refuses the subscription for a charger — a charger ID the account
cannot access, for example — the reason is sent on the second (`Errors`) output and
shown in the node status. Earlier versions showed the node as connected and emitted
nothing.

Negotiation no longer depends on which `tough-cookie` package other installed nodes
brought along. An older one used to make negotiation fail with
`Cannot read properties of undefined (reading 'secure')`.

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
- `charger_state` (see the note below — Easee changed the underlying endpoint)
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

#### Errors from a failed command

When the Easee API rejects a REST command, `msg.error` now carries the API's own
error message (its `title` and `detail`, or a `message` field) instead of the raw
response body — for example `REST Command failed (403: Forbidden) Unauthorized -
The charger does not belong to this account` rather than the JSON blob that used to
appear there. If a flow matches on the old raw-body text, it will need updating; the
`REST Command failed (<status>: <statusText>)` prefix is unchanged. A response that
is not JSON, or whose JSON is `null`, still falls back to the raw body as before.

#### Note on `charger_state`

Easee retired `GET /api/chargers/{id}/state` on **1 September 2026**; it now returns
404. Since then `charger_state` reads the same values from the replacement
[observations endpoint](https://developer.easee.com/reference/getobservations) instead.

**Your flows do not need to change.** The payload is still an object keyed by the same
field names as before (`msg.payload.totalPower.value`, `msg.payload.chargerOpMode.value`
and so on), and each value is still a parsed observation. Each one now also carries a
`timestamp`.

Two differences worth knowing about:

- **Six fields are gone.** `connectedToCloud`, `fatalErrorCode`, `isOnline`, `voltage`,
  `latestPulse` and `errors` were derived cloud-side by the old endpoint rather than
  being device observations, and the replacement cannot return them. A field the charger
  has not reported is omitted from the payload rather than sent as `null`, so check with
  `"fieldName" in msg.payload` if you need to distinguish the two.
- **The endpoint is rate limited** to 100 requests per 5 minutes. If you drive
  `charger_state` from an inject node, keep the interval at 3 seconds or slower. For
  continuous updates prefer the streaming client node, which pushes changes instead of
  polling.

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

The nodes are written in TypeScript and compiled to `dist/`, which is what the npm
package ships. Development uses [pnpm](https://pnpm.io), [Biome](https://biomejs.dev),
[Vitest](https://vitest.dev) and TypeScript 7, and needs Node.js 22.12 or newer; the
published package itself still runs on Node.js 18 and later.

```bash
pnpm install
pnpm gates        # lint + format, typecheck, build, tests with coverage, Node-RED load check
```

### Code Quality

```bash
pnpm check        # Biome lint + format check
pnpm check:fix    # apply Biome's fixes
pnpm typecheck    # TypeScript
```

### Testing

```bash
pnpm build              # the package tests inspect the built dist/
pnpm test               # all tests
pnpm test:watch         # watch mode
pnpm test:coverage      # with the coverage floor enforced
pnpm test:unit
pnpm test:integration
pnpm test:compat        # load every node from dist/ into a real Node-RED runtime
```

### Continuous Integration

GitHub Actions runs on every pull request:

- **Gates**: `pnpm gates` on Node.js 22, 24 and 26
- **Compatibility**: the packed package is installed with npm and every node is loaded into Node-RED on Node.js 18, 20, 22 and 24
- **Security**: `pnpm audit` of the dependencies that ship, with known advisories accepted explicitly

### Releasing

Releases are cut from GitHub Actions: **Actions → Release → Run workflow**, choose
`patch`, `minor` or `major`, and untick *Dry run*. The workflow runs the checks, bumps
the version, pushes the `vX.Y.Z` tag, publishes to npm with
[trusted publishing](https://docs.npmjs.com/trusted-publishers) (so every version
carries provenance), and creates the GitHub release.

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
