# The compatibility surface

What you may not rename, why nothing here catches you if you do, and the one mapping
that is not what it looks like.

This package is published to npm as `@runnane/node-red-contrib-easee` and installed by
strangers from the Node-RED palette. **Their flows are JSON files on their disks, and
you cannot migrate them.** Node-RED has no schema migration hook for contributed nodes:
on upgrade it reads the saved flow, looks up each node by its type string, and reads
each property by name. A name that no longer exists does not error — it reads
`undefined`, or the node is reported as unknown and the flow stops working, with no
message the user can act on.

Adding a new **optional** property with a default is safe. Renaming or removing one is a
breaking change.

## The three names that are frozen

### 1. Node type names

`easee-configuration`, `easee-rest-client`, `charger-streaming-client`.

Each appears in **three** places that must agree, and only one of them is obvious:

| where | why it matters |
| --- | --- |
| `package.json` → `node-red.nodes` | how Node-RED finds the file at all |
| `RED.nodes.registerType(...)` in the `.js` | registers the runtime half |
| `RED.nodes.registerType(...)` in the `.html` | registers the editor half |

Plus `type: "easee-configuration"` inside the *other two* nodes' `defaults.configuration`
block — that string is how a client node declares which config node type it accepts.
Rename the config node and both client nodes stop being able to reference it.

### 2. Flow property names

The keys of each `.html`'s `defaults` block. These are the literal JSON keys in a user's
flow file:

| node | properties |
| --- | --- |
| `easee-configuration` | `username`, `debugLogging`, `debugToNodeWarn` |
| `easee-rest-client` | `name`, `charger`, `site`, `circuit`, `configuration`, `inputs`, `outputs` |
| `charger-streaming-client` | `name`, `charger`, `configuration`, `skipNegotiation`, `inputs`, `outputs` |

### 3. The credential name

`password`, declared in `easee-configuration.html`'s `credentials` block.

Credentials are stored by Node-RED **outside** the flow file, in a separate encrypted
store keyed by node id and property name. Renaming `password` orphans every existing
user's stored secret: the flow keeps working until the token expires, then fails to log
in, and the user has no idea their password "disappeared". Treat it as the most frozen
name in the repo.

It is also the one value that must never be logged. `debugLogging` is a user-facing
switch and anything it prints is something a user will paste into a public GitHub issue.

## The mapping that is not what it looks like

The editor writes `configuration`. The runtime reads it into `configurationNode`:

```js
// easee-rest-client.js:37 and charger-streaming-client.js:37
node.configurationNode = n.configuration;
node.connection = RED.nodes.getNode(node.configurationNode);
```

So there are **two** names for one thing, and only `configuration` is the compatibility
surface — `configurationNode` is an internal field you may rename freely. Grepping for
`configuration` finds both and grepping for `configurationNode` finds only half the
story. The two client nodes also disagree on what they call the resolved node:
`easee-rest-client` assigns it to `node.connection`, `charger-streaming-client` to
`node.connectionConfig`. That is cosmetic, but it means a change made "the same way" in
both files is not actually the same change.

## The output count is a surface too

`charger-streaming-client` declares **6** outputs, labelled in the `.html`:

```
1 …  2 …  3 …  4 ProductUpdate  5 ChargerUpdate  6 CommandResponse
```

`node.send([...])` in the runtime half passes a 6-element array positionally. Reducing
the count, or reordering the array, orphans wires in flows that use the later outputs —
silently, because a wire from a removed output is simply dropped on load. If you add an
output, add it at the **end**.

## Nothing in this repo checks any of the above

This is the important part. Every gate is blind to it:

- **No `.html` file is linted, parsed or executed by any gate.** `npm run lint` covers
  `easee-client/*.js`, `tests/**/*.js` and `scripts/*.js` — the editor halves are in
  none of those globs. A syntax error inside an `.html` `<script>` block ships.
- **No test loads a saved flow from a previous version.** `npm run test:compat` proves
  each node *registers*; it says nothing about whether an existing flow still binds to
  it.
- **`.js` and `.html` are never compared.** Nothing asserts that the `defaults` block
  and the constructor's `n.<prop>` reads describe the same set of properties.

So this is a **review** responsibility, not a gate one. When a change touches a
`defaults` block, a `credentials` block, a `registerType` call or the `node-red` block in
`package.json`, say explicitly in the PR body what a user's existing flow does after the
upgrade.

### The drift this has already produced

`charger-streaming-client.js` reads a `responses` property twice:

```js
node.responses = n.responses;   // line 38
node.responses = n.responses;   // line 41 — the same assignment again
```

There is **no `responses` key in that node's `defaults` block**, so the editor never
writes one and `n.responses` is always `undefined`. Nothing reads `node.responses`
anywhere in the repo either — but `locales/en-US/charger-streaming-client.json` still
carries a `"responses": "Responses"` label for it. The editor half dropped the field and
the runtime half and the locale file kept their halves of it, and no gate noticed
because no gate looks.

Tracked as **EASEE-10**. It is inert, which is exactly why it survived: the failure mode
of this surface is silence.

## Before changing anything named above

```bash
grep -rn "<the-name>" easee-client/ package.json README.md example.json
npm pack --dry-run          # what actually ships
```

`example.json` is a sample flow using these node types — if you rename one, that file is
the first place your change is visibly wrong, and it is the closest thing the repo has to
a compatibility fixture.
