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

| node type | source | shape |
| --- | --- | --- |
| `easee-configuration` | `easee-client/easee-configuration.ts` | config node — holds the credentials, owns login, token refresh and the shared REST helper. ~1950 lines; by far the biggest thing here |
| `easee-rest-client` | `easee-client/easee-rest-client.ts` | 1 in → 1 out. Issues REST calls against the Easee API using the config node's token |
| `charger-streaming-client` | `easee-client/charger-streaming-client.ts` | 1 in → **6 out**, over a `@microsoft/signalr` websocket. Outputs 4/5/6 are `ProductUpdate` / `ChargerUpdate` / `CommandResponse` |

Each node is a TypeScript runtime half plus a `.html` editor half, and **the two halves
are a contract** — see [`.agents/compatibility.md`](.agents/compatibility.md). The types
the three nodes share (the configuration node's shape, above all) are in
`easee-client/types.ts`.

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
pnpm install          # pnpm, like every sibling repo (since EASEE-19)
pnpm gates            # everything that must be green before a PR
```

Two Node versions matter, and they are different on purpose:

- **To develop:** Node ≥ 22.12. Vitest 5 requires it, and CI's test legs run 22/24/26.
- **To use the package:** Node ≥ 18 (`engines`). The build targets ES2022, and CI's
  `Node-RED Compatibility` job loads the *packed tarball* on 18/20/22/24 — that job is
  the only evidence behind `>=18`, because nothing else can run there.

## The toolchain, and the four things about it that are not obvious

pnpm, Biome, Vitest and TypeScript 7 (the native compiler, `tsgo`, shipped as the
`typescript@7` package's `tsc`). There is a build step: **the package is its compiled
output**, `dist/easee-client/`, not its source.

1. **The node sources are CommonJS and end in `export = (RED) => {…}`.** Node-RED
   `require()`s a node file and needs `module.exports` to *be* the factory; TypeScript
   emits `export =` as exactly that. `export default` would emit `exports.default`, which
   Node-RED ≥ 4 happens to unwrap and the `node-red >=2` this package claims does not.
   `scripts/check-node-loads.ts` fails if a node file stops exporting a function.
2. **`tests/` is ESM, the sources are not.** `tests/package.json` says `"type":
   "module"`, because Vitest runs tests as ESM and TypeScript only allows `import.meta`
   in a file it believes is ESM. Tests import a node as
   `import easeeConfiguration from "../../easee-client/easee-configuration.js"` — the
   `.js` is required by `nodenext`, and Vite maps it to the `.ts`. `module.exports =` in a
   `.ts` source would compile but **fail under Vitest** ("module is not defined"), which is
   why the sources use `export =`.
3. **`pnpm.packageExtensions` in `package.json` is load-bearing.** Under pnpm's strict
   layout `node-red-node-test-helper` cannot find `@node-red/registry` (a dependency of
   node-red's dependency), so every real-runtime test and gate 5 fail with `Cannot read
   properties of undefined (reading 'log')` — the real `Cannot find module` is swallowed
   by the helper. The extension links it beside node-red. Its version must match
   node-red's; when dependabot bumps node-red, bump it too.
4. **`pnpm.overrides` clears two dev-only advisory chains that no in-range bump
   reaches** (EASEE-25): `@types/node-red__util>jsonata` (`>=2.2.1`, `@types/node-red`'s
   type-only dependency on an old, vulnerable `jsonata`) and `express>qs` (`>=6.16.0`,
   pulled in by node-red's pinned `express`). Neither `jsonata` nor `qs` ships — both
   sit under `devDependencies` only, `pnpm audit:prod` was and stays 0 — but they show
   up in a full `pnpm audit` and on GitHub's Dependabot alerts, which is what this
   exists to silence. `@types/node-red__util>jsonata` needs only jsonata's type
   declarations, so bumping it is typecheck-safe; confirmed by `tsc --noEmit` staying
   green with the override in place. Delete the `jsonata` line once `@types/node-red`
   moves its `@types/node-red__util` dependency to `jsonata>=2.2.1` on its own; delete
   the `qs` line once node-red's `express` pin moves past `qs@6.16.0`.

## Build / test / lint (run before finishing any change)

```bash
pnpm gates            # ⭐ biome + typecheck + build + tests with coverage + Node-RED load check
pnpm check:fix        # biome check --write; commit what it rewrites
```

`pnpm gates` is the one to run. Five checks, all offline, chained with `&&`:

| # | Check | Command | Notes |
| --- | --- | --- | --- |
| 1 | lint + format | `biome check` | `easee-client/`, `scripts/`, `tests/` and the root config files. **Not** the `.html` editor halves |
| 2 | typecheck | `tsc --noEmit` | TypeScript 7; every `.ts` in the repo |
| 3 | build | `tsc -p tsconfig.build.json` + copy `.html`/`locales/` | emits `dist/easee-client/` (ships) and `dist/scripts/` (does not) |
| 4 | tests + coverage | `vitest run --coverage` | 13 files / 125 tests. **Enforces the thresholds** |
| 5 | Node-RED load | `node dist/scripts/check-node-loads.js` | registers all three nodes from `dist/` in a real Node-RED runtime |

**`pnpm test` is not the gate.** Thresholds are only evaluated with `--coverage`, and
`tests/unit/published-package.test.ts` inspects the *built* tree, so on a fresh checkout
it fails with "run `pnpm build` first". Use `pnpm gates` (or `pnpm build && pnpm
test:coverage` for the test half alone).

**CI runs a job the local gate deliberately does not:** `pnpm audit:prod`, which needs
the network. A locally-green gate can therefore be followed by a red CI tick that is
*not* your change. [`.agents/gates.md`](.agents/gates.md) explains how to tell the two
apart — read it the first time a gate goes red.

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

The *file paths* in `node-red.nodes` are **not** part of it — no flow contains them,
which is why EASEE-19 could move them to `dist/`. What they must do is point at emitted
files; gate 5 reads them from `package.json` rather than from its own list.

Details and the non-obvious mapping trap: [`.agents/compatibility.md`](.agents/compatibility.md).

## Secrets and the public tree

`visibility` in the manifest is **`public`**. Nothing internal may land in a commit, a
fixture, a test or a generated file: no credentials, no real Easee account names, no
charger serials, no portal hostnames or tokens.

Where a fixture would otherwise contain such data, **generate it** rather than sanitise
it — sanitising is a process that fails silently once. `tests/fixtures/mockData.ts` is
already synthetic; keep it that way.

The password is a Node-RED **credential**, which means it is stored outside the flow
file and is never logged. Do not add it to a debug output, a node status string, or an
error message. `debugLogging` exists and is user-facing — anything it prints is
something a user will paste into a public GitHub issue.

## What ships to npm, and what must not

The published tarball is defined by the **`files` allowlist** in `package.json` —
`["dist/easee-client"]` — plus the `package.json`, `README.md` and `LICENSE` that pnpm
and npm always add. (Before EASEE-19 it was a `.npmignore` denylist, under which anything
new shipped by default.) `dist/` is gitignored and built by `prepack`, so `pnpm pack` and
`pnpm publish` always carry a fresh build.

`tests/unit/published-package.test.ts` fails if a node file stops shipping, or if the
TypeScript sources, `dist/scripts/`, the agent instructions or the tooling config start
to. An allowlist can still be widened by accident; the test is what notices.

Check what a change does to the artefact with:

```bash
pnpm pack --dry-run
```

CI's `Node-RED Compatibility` job goes further and packs the tarball, installs it
elsewhere **with npm** (the palette's installer), and loads all three nodes from *there*
— so a file the allowlist leaves out is caught as a load failure rather than as a bug
report.

## Release

Releases are cut **from CI, by hand**: Actions → **Release** → *Run workflow*, pick
`patch` / `minor` / `major`, and untick *Dry run* (it defaults to on).
[`.github/workflows/release.yml`](.github/workflows/release.yml) (EASEE-16) then:

1. refuses anything but `main`, and refuses a commit whose `ci.yml` push run is not green;
2. runs `pnpm gates` + `pnpm audit:prod` on Node 22, then `npm version <bump>` — a
   commit titled `0.7.6` and an annotated tag `v0.7.6`, the same shape as every earlier
   release (npm, not pnpm: it only touches `package.json` and git);
3. loads the packed tarball in Node-RED, uploads the built `dist/easee-client/` as an
   artifact, then pushes the commit and tag to `main` atomically;
4. publishes from the **tag plus that artifact** with npm **trusted publishing** (OIDC —
   no `NPM_TOKEN` secret exists, and provenance is attached), with `--ignore-scripts`
   and no install, after checking every node file is present;
5. creates the GitHub release with generated notes.

There is no local release path: `npx np` was removed with EASEE-16. There are **no
changesets** here and no conventional-commit automation, so **no changeset is owed** for
a user-visible change — update `README.md` instead where the change is one a user would
notice.

Traps, each of which fails only on the run that publishes:

- **The workflow filename is bound to npm's trusted publisher.** Renaming `release.yml`
  makes publishing fail with an auth error. `tests/unit/release-workflow.test.ts` pins it.
- **`repository.url` in `package.json` must stay this GitHub repo** — npm checks it
  against the provenance statement.
- **The tag does not contain the package.** `dist/` is gitignored (EASEE-19), so the
  publish job only has something to publish because `prepare` uploads the build. Publish
  runs `--ignore-scripts` on purpose — there is no install to build with, and no
  third-party code may run in the job holding the publish credential — so a missing
  artifact would otherwise publish a package with no nodes in it. The completeness check
  before `npm publish` is what stops that; `tests/unit/release-workflow.test.ts` pins the
  hand-off.
- **The version commit is pushed with `GITHUB_TOKEN`, so it gets no CI run.** Releasing
  again straight away is refused by the CI-green check; merge something first.
- **If `main` protection ever requires PRs or status checks,** the bot's push is rejected
  and the workflow needs a bypass or a different design.
- **Recovery after a partial run:** if `publish` or `github-release` fails after the tag
  was pushed, use *Re-run failed jobs* — both skip work already done, and the build
  artifact is kept for 7 days. **Do not dispatch a new run**; that bumps the version a
  second time.

The manifest records `release: "np"`, for what that value *means* in the shared schema
("prompts for a version and reads no commit messages") rather than for the tool: a
human picks `patch` / `minor` / `major` at dispatch, and nothing reads commit messages.
The `np` tool itself is gone (EASEE-16). `release-it` would say conventional commits
drive the version, and `none` would say this repo does not publish; both are false.
(EASEE-14.)

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

Keep formatters and codemods away from `.agents/**` and the two Markdown entry points —
`biome.json` includes source, tests, scripts and root config only, for that reason.

## Where things are

```
easee-client/            the three nodes — .ts runtime half + .html editor half each
  types.ts               types shared between the nodes (the config node's shape)
  signalr-http-client.ts the HTTP client handed to SignalR — never its default, which
                         requires whichever tough-cookie npm hoisted (EASEE-35). Ships:
                         charger-streaming-client.js requires it at load time
  locales/en-US/         editor strings for charger-streaming-client
scripts/                 TypeScript, compiled to dist/scripts/ and run from there
  check-node-loads.ts    loads every node into a real Node-RED runtime (gate 5)
  audit-production.ts    pnpm audit scoped to shipped deps, with an allowlist (CI only)
tests/                   ESM (tests/package.json), Vitest
  unit/                  config validation, node lifecycle, SignalR HTTP client, tarball + release guards
  integration/           real Node-RED runtime via node-red-node-test-helper (auth, re-login)
  fixtures/mockData.ts   synthetic API error bodies — keep them synthetic
  mocks/                 a stub RED and the typed fetch mock
dist/                    build output, gitignored; dist/easee-client/ is what ships
.github/workflows/ci.yml the test matrix, the packed-tarball compat matrix, the audit job
.github/workflows/release.yml  dispatched release: gate, bump, tag, publish the gated dist/ (EASEE-16)
vitest.config.mts        coverage floor lives here, with the trap documented in place
tsconfig.json            typecheck config (everything); tsconfig.build.json emits
biome.json               lint + format
```

## Definition of done

- `pnpm gates` green, and the failing-direction check done: break the invariant,
  watch the **named** test go red, restore, confirm the tree is clean.
- Coverage floor raised in the same change if coverage went up.
- `pnpm pack --dry-run` still lists only what should ship.
- Branch `<type>/<easee-n>-<kebab-title>`, one PR, the key in the branch or title.
- Start and closing comments on the issue; the PR URL in the closing one.
