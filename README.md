# @runnane/node-red-contrib-easee npm module

[![npm](https://img.shields.io/npm/v/@runnane/node-red-contrib-easee.svg?maxAge=2592000)](https://www.npmjs.com/package/@runnane/node-red-contrib-easee)
[![downloads](https://img.shields.io/npm/dt/@runnane/node-red-contrib-easee.svg?maxAge=2592000)](https://www.npmjs.com/package/@runnane/node-red-contrib-easee)
[![license](https://img.shields.io/npm/l/@runnane/node-red-contrib-easee.svg)](https://github.com/runnane/node-red-contrib-easee/blob/main/LICENSE)

Node-Red module for streaming Easee charger data.

## Features

- SignalR streaming client
- Pre-defined list of REST API GET/POST commands
- Custom commands through REST API

Every REST and SignalR request identifies itself to Easee with a
`node-red-contrib-easee/<version> (Node-RED/<version>; Node/<version>)` User-Agent, so
Easee can attribute traffic to this package instead of to anonymous Node.js fetch/SignalR.

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

The configuration node keeps retrying on its own. When Easee cannot be reached
(a network error or a 5xx from the API) it says so and retries after 1, 2 and 4
minutes, then every 5 minutes, for as long as it takes. Only when Easee rejects
the username or password five times in a row does it report
"Login rejected – check credentials", and even then it tries again every
30 minutes; press **Re-login** to try again at once.

### Changing the credentials from a flow

A flow can supply the Easee username and password at runtime, for example from a
Home Assistant helper, by sending the REST node a message with the topic
`update_credentials`:

```javascript
msg.topic = "update_credentials";
msg.payload = {
  username: "user@example.invalid", // optional: keep the current one if left out
  password: "not-a-real-password",  // optional: keep the current one if left out
};
return msg;
```

At least one of the two must be given, and the topic is required, so no other
message can change the credentials.

- The configuration node logs in with the new credentials straight away. If Easee
  accepts them, every node using that configuration node uses them from then on,
  including for token renewal and **Re-login**. The REST node sends
  `{ status: "ok", payload: { success: true, changed: { username, password } } }`.
- If the login fails (Easee rejects them, or cannot be reached), **nothing
  changes**: the previous credentials and tokens stay in use. The REST node reports
  the error (a **Catch** node receives it) and sends `status: "error"`.
- **They are kept in memory only.** Nothing is written to Node-RED's credentials
  file. When Node-RED restarts, or the configuration node is redeployed, it goes
  back to the username and password saved in the editor, so send the message again
  at startup if you rely on it (an **Inject** node set to fire once on start works).
- The password and username are never logged, shown in a status or sent on: the
  output message is a new one, and the copy of the input message a Catch node
  receives has both fields removed from its payload. Messages you send into the
  REST node are still yours, so keep the password out of **Debug** nodes wired
  before it.
- A REST node whose configuration node has no username or password accepts
  `update_credentials` and refuses every other topic until credentials arrive. The
  streaming node still needs them saved in the editor to start.

### Troubleshooting errors

Every error the nodes report says what failed and what to do about it, and the
node's status names the kind of failure in a few words:

| Status | Meaning | What to do |
| --- | --- | --- |
| `Login rejected – check credentials` | Easee rejected the username or password | Fix them in the configuration node, then press **Re-login** |
| `Easee unreachable – retrying` | No answer from Easee | Check the network; the node retries on its own |
| `API error <status>` | Easee answered this one request with an error (e.g. 403: no access to that charger, 404: unknown id) | Check the charger, site or circuit id |
| `No configuration node` / `Configuration incomplete` / `Missing username or password` | The node has no configuration node, or it lacks a username or password | Select or fill in the configuration node, then deploy |
| `No charger id` / `No site id` / `No circuit id` | The node or message does not say which charger, site or circuit | Set it on the node, or send `msg.charger` / `msg.site` / `msg.circuit` |

Errors raised while handling an incoming message are passed to `node.error()` with
that message, so a **Catch** node receives them. The password, the tokens, the
username and the charger serial are replaced with `[redacted]` in error text, so it
is safe to paste into an issue. The messages on the nodes' outputs are unchanged.

### Logging and debug output

All three nodes log through Node-RED's own logger, so their lines carry the
node's id and name and follow the `logging.console.level` in your `settings.js`.

- **Enable debug logging** (configuration node) turns on the detailed messages
  about authentication, tokens, API calls and the SignalR connection. They are
  logged at Node-RED's `debug` level, so the runtime only prints them when
  `logging.console.level` is `"debug"` (or `"trace"`). With the box unticked
  they are not produced at all.
- **Output debug to node warnings** also copies those messages (and the info
  messages) to the debug sidebar as warnings, which needs no `settings.js` change.
- The streaming node's SignalR client logs only warnings and errors unless debug
  logging is on (up to 0.7.6 it logged at debug level for everyone).

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

### Identifying which RFID tag started a session

Easee's REST API has no parameter for starting a session "as" a specific RFID
tag — `POST /chargers/{id}/commands/start_charging` takes no request body at
all, and none of the other charger commands accept an ID token, RFID tag or
authorization credential either. (Easee's AMQP/RabbitMQ interface has a
separate `AuthorizeCharging` command that does take an `IDToken`, but that is a
different protocol with its own credentials, not something this package's REST
or streaming client speaks.) So a flow cannot choose which tag a session is
attributed to; it can only read back which tag the charger itself already used.

When RFID/authorization is enabled on the charger, presenting a tag is reported
over the streaming client's `ProductUpdate` output as observation **128**
(`UserIDToken`) — the tag's ID token string, unmodified — and observation
**108** (`UserIDTokenReversed`) carries the same value byte-reversed. (There is
also observation **69**, `PairedUserIDToken`, emitted only while the charger is
in RFID *pairing* mode, i.e. while registering a new tag — not during normal
charging.) Both flow through untouched: nothing in this package inspects,
filters or reformats a `UserIDToken`/`UserIDTokenReversed` value.

To tell which of several known tags was used, wire a Switch node off the
streaming client's fourth output. First narrow to `UserIDToken` updates —
`msg.payload.dataName === "UserIDToken"` — since `ProductUpdate` carries every
other observation too, then switch again on `msg.payload.value` against each
tag's own ID token (an obviously synthetic example: `"04AABBCCDD1122"`) to
route the flow per car. This only reports which tag a charger already read —
it cannot make the charger start a session under a different one.

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
- `update_credentials` (see [Changing the credentials from a flow](#changing-the-credentials-from-a-flow))
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
