# AGENTS.md

Guidance for coding agents (and humans) working in **this repo**. Follows the
[agents.md](https://agents.md) convention. Topic deep-dives live in
[`.agents/`](.agents/) and are **not** auto-loaded — open the relevant one on demand.

**Everything generic has moved out.** The conventions that no single repo owns —
branch → commit → PR, one issue one PR, follow-ups become issues, split rather than
half-ship, read the whole issue, a stated blocker is a claim, comment on start and
finish, repo work vs operator work — live once in the userspace bundle
(`runnane/agent-userspace`) and are injected per runtime. This file holds only what is
true *here*, and [`.agents/repo.json`](.agents/repo.json) holds the handful of facts
that differ between repos.

## What this is

A **Node-RED contribution package** that talks to the [Easee](https://easee.com) EV
charger cloud. Three nodes, all registered from `package.json`'s `node-red` block:

| node type | file | shape |
| --- | --- | --- |
| `easee-configuration` | `easee-client/easee-configuration.js` | config node — holds the credentials, owns login, token refresh and the shared REST helper. 1943 lines; by far the biggest thing here |
| `easee-rest-client` | `easee-client/easee-rest-client.js` | 1 in → 1 out. Issues REST calls against the Easee API using the config node's token |
| `charger-streaming-client` | `easee-client/charger-streaming-client.js` | 1 in → **6 out**, over a `@microsoft/signalr` websocket. Outputs 4/5/6 are `ProductUpdate` / `ChargerUpdate` / `CommandResponse` |

Each node is a `.js` runtime half plus a `.html` editor half, and **the two halves are
a contract** — see [`.agents/compatibility.md`](.agents/compatibility.md).

It is published to npm as **`@runnane/node-red-contrib-easee`** and installed by
strangers from the Node-RED palette. That single fact is what makes this repo different
from its siblings, and it has its own rule below.

Work is tracked in the **EASEE** project of our own control-plane portal, reached over
the `respawn-control` MCP server. The project slug is `node-red-contrib-easee`.
`.mcp.json` is **gitignored** (via `.git/info/exclude`) — this repository is public, so
the URL and token come from the environment and never from a file in the tree:

```bash
export RESPAWN_MCP_URL='https://<portal-host>/mcp?modules=issues'
export RESPAWN_MCP_TOKEN='<api key>'
```

## Setup

```bash
npm ci                # NOT pnpm — see the warning below
npm run gates         # everything that must be green before a PR
```

Node ≥ 18 (`engines`), and CI proves all four of 18/20/22/24. There is no build step,
no database, no container, and no dev server: the package *is* its source.

## ⚠️ This repo is npm. Every sibling is pnpm.

`npm ci`, `npm test`, `npm run lint` — there is no `pnpm-lock.yaml` here and
`pnpm install` would write one, producing a lockfile CI does not use and a diff nobody
wants. An agent arriving from RCP, ELEG, DECK or SPND has exactly the wrong muscle
memory, which is why this warning is at the top of the file rather than buried in
[`.agents/gates.md`](.agents/gates.md).

## Build / test / lint (run before finishing any change)

```bash
npm run gates         # ⭐ lint + coverage-enforcing tests + Node-RED load check
npm run lint:fix      # eslint --fix; commit what it rewrites
```

`npm run gates` is the one to run. Three checks, ~6 seconds total, all offline:

| # | Check | Command | Notes |
| --- | --- | --- | --- |
| 1 | lint | `eslint easee-client/*.js tests/**/*.js scripts/*.js` | ~0.6s |
| 2 | tests + coverage | `jest --coverage` | 8 suites / 80 tests, ~5s. **Enforces the thresholds** |
| 3 | Node-RED load | `node scripts/check-node-loads.js` | registers all three nodes in a real Node-RED runtime |

**`npm test` is not the gate.** `collectCoverage` is `false` in `jest.config.js`, so a
green `npm test` says nothing about the coverage floor and CI will still fail you. Use
`npm run gates` (or `npm run test:coverage` for the test half alone).

**CI runs a fourth job the local gate deliberately does not:** `npm run audit:prod`,
which needs the network. A locally-green gate can therefore be followed by a red CI
tick that is *not* your change. [`.agents/gates.md`](.agents/gates.md) explains how to
tell the two apart — read it the first time a gate goes red.

Keep the suites green, and add tests with every behaviour change. **The coverage
thresholds are a floor that only ever goes up:** when coverage rises, raise the floor
to just under the new number in the same change. Never lower one to make a build pass.

## The hard rule that is specific to this repo

**This package is public and installed by strangers, and their flows are files on
their disks that you cannot migrate.**

Three things are a compatibility surface, not implementation detail:

1. **Node type names** — `easee-configuration`, `easee-rest-client`,
   `charger-streaming-client`. They appear in `package.json`'s `node-red` block, in
   `RED.nodes.registerType()` on both halves, and in every saved flow.
2. **Flow property names** — the keys in each `.html`'s `defaults` block
   (`username`, `charger`, `site`, `circuit`, `configuration`, `skipNegotiation`,
   `debugLogging`, `debugToNodeWarn`).
3. **The credential name** — `password`, declared in `easee-configuration.html`'s
   `credentials` block and stored separately by Node-RED.

Renaming any of them **silently breaks existing flows on upgrade**, with no error the
user can act on: Node-RED finds no node of that type, or reads `undefined` for a
property, and the flow simply stops working. There is no migration hook and no
deprecation path. Adding a new optional property with a default is safe; renaming or
removing one is a breaking change that needs a major version and a README note.

The output *count* of `charger-streaming-client` (6) is the same kind of surface —
reducing it orphans wires in flows that use outputs 4–6.

Details and the non-obvious mapping trap: [`.agents/compatibility.md`](.agents/compatibility.md).

## Secrets and the public tree

`visibility` in the manifest is **`public`**. Nothing internal may land in a commit, a
fixture, a test or a generated file: no credentials, no real Easee account names, no
charger serials, no portal hostnames or tokens.

Where a fixture would otherwise contain such data, **generate it** rather than sanitise
it — sanitising is a process that fails silently once. `tests/fixtures/mockData.js` is
already synthetic; keep it that way.

The password is a Node-RED **credential**, which means it is stored outside the flow
file and is never logged. Do not add it to a debug output, a node status string, or an
error message. `debugLogging` exists and is user-facing — anything it prints is
something a user will paste into a public GitHub issue.

## What ships to npm, and what must not

The published tarball is defined by `.npmignore` (there is no `files` block in
`package.json`), which is a **denylist** — anything new is included by default unless
excluded. That is the wrong default for a repo that carries agent instructions, so
`.agents/`, `.claude/`, `AGENTS.md` and `CLAUDE.md` are excluded explicitly and
`tests/unit/published-package.test.js` fails if that ever stops being true.

Check what a change does to the artefact with:

```bash
npm pack --dry-run
```

CI's `Node-RED Compatibility` job goes further and packs the tarball, installs it
elsewhere, and loads all three nodes from *there* — so a file `.npmignore` wrongly
drops is caught as a load failure rather than as a bug report.

## Release

`npm run release` shells out to `npx np`. There are **no changesets** here and no
conventional-commit automation, so **no changeset is owed** for a user-visible change —
update `README.md` instead where the change is one a user would notice.

The manifest records `release: "release-it"`, which is the closest of the three values
the shared schema allows (`changesets` / `release-it` / `none`) — there is no `np`
member. It is the right answer to the question the field exists to settle, *"is a
changeset owed?"* (no), and `none` would have been worse: it means "this repo does not
release", which is false for a published npm package. Tracked upstream as **RCP-1090**.

Publishing is the only thing in this repo with a blast radius outside it, and it is
**operator work**: an agent does not publish. `liveBoundary` is `none` for the repo
itself precisely because the boundary is the npm registry at release time, not anything
a gate run touches.

## How agent instructions reach this repo

Four tracked files and nothing else:
[`CLAUDE.md`](CLAUDE.md) (a shim), this file, [`.agents/repo.json`](.agents/repo.json),
and the deep-dives in [`.agents/`](.agents/).

**There is no `.claude/commands/` directory here, and adding one would be a
regression.** The shared command bodies and the `gate-failures` / `pr-hygiene` /
`agent-isolation` skills live in the userspace bundle (`runnane/agent-userspace`) and
are injected per runtime. Copying them in was the old model; it was measured to have
split a *contractually byte-identical* tier into three cohorts across the set, which is
why the manifest replaced it.

Keep formatters and codemods away from `.agents/**` and the two Markdown entry points.

## Where things are

```
easee-client/          the three nodes — .js runtime half + .html editor half each
  locales/en-US/       editor strings for charger-streaming-client
scripts/
  check-node-loads.js  loads every node into a real Node-RED runtime (gate 3)
  audit-production.js  npm audit scoped to shipped deps, with an allowlist (CI only)
tests/
  unit/                7 files, mostly auth/token/config-validation
  integration/         authFlow + node-red-node-test-helper
  fixtures/mockData.js synthetic fixtures — keep them synthetic
  mocks/               hand-written Node-RED mocks
.github/workflows/ci.yml  the 4-leg Node matrix, the compat job, the audit job
jest.config.js         coverage floor lives here, with the trap documented in place
```

## Definition of done

- `npm run gates` green, and the failing-direction check done: break the invariant,
  watch the **named** test go red, restore, confirm the tree is clean.
- Coverage floor raised in the same change if coverage went up.
- `npm pack --dry-run` still lists only what should ship.
- Branch `<type>/<easee-n>-<kebab-title>`, one PR, the key in the branch or title.
- Start and closing comments on the issue; the PR URL in the closing one.
