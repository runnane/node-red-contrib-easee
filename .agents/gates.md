# This repo's gates

The gate command, what CI runs on top of it, and why a green run here means very little.

[`.agents/repo.json`](repo.json) names this file as `gatesDoc`, which is how a
repo-agnostic command finds this repo's particulars without carrying them. Its
counterpart is the **`gate-failures` skill** in the userspace bundle: that one names no
command or runner, so it can be shared; this one is nothing but commands and runners,
so it never leaves the repo. Read them together the first time a gate fails in a pass.

## The command

```bash
pnpm gates          # biome + typecheck + build + tests with coverage + Node-RED load check
pnpm check:fix      # biome check --write; commit what it rewrites
```

Five checks, all offline. They are chained with `&&`, so the run stops at the first
failure and the last thing printed is the thing that broke. Redirect to a log rather
than scrolling for it: `pnpm gates > /tmp/easee-gates.log 2>&1; echo $?`.

| # | Check | Script | What it would catch |
| --- | --- | --- | --- |
| 1 | lint + format | `pnpm check` | Biome over `easee-client/**/*.ts`, `scripts/`, `tests/` and root config. Formatting is an **error**, not a warning |
| 2 | typecheck | `pnpm typecheck` | TypeScript 7 (`tsc` from `typescript@7`, the native compiler) over every `.ts` |
| 3 | build | `pnpm build` | emit into `dist/`, then copy the `.html` halves and `locales/` beside the `.js` |
| 4 | tests + coverage | `pnpm test:coverage` | 13 files / 125 tests (Vitest 5), **and** the `vitest.config.mts` thresholds |
| 5 | Node-RED load | `pnpm test:compat` | a node in `dist/` that no longer registers in a real Node-RED runtime, a `node-red.nodes` path that points at nothing, or a renamed node type |

The order matters. Gate 4 needs gate 3: `published-package.test.ts` inspects the built
`dist/`, and gate 5 runs `dist/scripts/check-node-loads.js`. So neither `pnpm test` nor
`pnpm test:compat` means anything on a tree that was not just built.

## pnpm, like the siblings — with two traps of its own

Since EASEE-19 this repo is pnpm (`packageManager` in `package.json`, `pnpm-lock.yaml`),
so the muscle memory from RCP, SPND and the rest is now right. Two things differ:

- **`pnpm.packageExtensions` is load-bearing.** pnpm's strict layout does not put
  `@node-red/registry` where `node-red-node-test-helper` looks for it (it is node-red's
  dependency's dependency). Without the extension, gate 5 and every helper-based test
  fail with `Cannot read properties of undefined (reading 'log')`, and the real `Cannot
  find module …/@node-red/registry/lib/util` is swallowed because the helper logs it
  through a mocked `console`. The extension pins the registry to node-red's own version —
  bump both together.
- **The consumer install in CI is npm on purpose.** The Node-RED palette manager
  installs contributed nodes with npm, so the compat job installs the packed tarball
  with `npm install` to get the layout a user actually gets. Do not "fix" it to pnpm.

## `pnpm test` is not the gate

```bash
pnpm test             # 125 tests, thresholds NEVER evaluated; published-package fails without dist/
pnpm test:coverage    # the same tests, thresholds enforced
```

A green `pnpm test` therefore says **nothing** about the coverage floor. This is the
single easiest way to report "gates green" in this repo and be wrong.

## The coverage floor

The thresholds in `vitest.config.mts` sit just under the measured numbers, so any change
that *reduces* coverage fails the build:

```
statements 56.82% (454/799)   branches 51.91% (230/443)
functions  49.03% (51/104)    lines    56.65% (447/789)     — v8, measured 2026-09-15 (EASEE-35)
```

Those numbers are low because the suite is thin, not because the floor is slack — see
[`testing.md`](testing.md). When coverage rises, **raise the floor in the same change**.
Never lower one to make a build pass.

The floor was **re-baselined** in EASEE-19, not lowered: Jest measured with istanbul, the
v8 provider counts differently (Jest said branches 29.11% over 395 for the same code), so
the old numbers did not carry across. Proven to bite (measured against the first, 29.3%
floor): running one test file with coverage fails all four thresholds (`Coverage for statements (8.28%) does not meet global
threshold (29.3%)`, exit 1).

### The path-group trap, and why it no longer applies

Under Jest, a path-based `coverageThreshold` group such as `"./easee-client/"` removed
every matched file from the `global` group — which left `global` **empty** and its
thresholds silently unenforced. That is exactly what was there before EASEE-1, where a
global threshold of **99% passed**.

**Vitest 5 does not do this. Measured (EASEE-19):** with `thresholds: { statements: 99,
"easee-client/**": { statements: 10 } }`, the run still fails with `Coverage for
statements (29.35%) does not meet global threshold (99%)` — the global figure still
counts the glob-matched files. So a glob group is safe to add here, but re-run that
check if you add one after a Vitest major: the trap was silent the first time, and the
comment in `vitest.config.mts` says so in the file it would be reintroduced into.

## CI runs three jobs; the local gate covers one and a half of them

`.github/workflows/ci.yml`, on push and PR to `main` and `develop`:

| job | what | local equivalent |
| --- | --- | --- |
| `lint-and-test` × **3** (Node 22/24/26) | `pnpm gates`, all five checks, on every leg; coverage uploaded from 24 | `pnpm gates` |
| `Node-RED Compatibility` × **4** (Node 18/20/22/24) | build + `pnpm pack` on 22, then switch Node, `npm install` the tarball elsewhere and load all three nodes from **there** | gate 5, but see below |
| `Security Audit` | `pnpm audit:prod` (blocking) + `pnpm audit` and `pnpm outdated` (informational) | **none — needs the network** |

`.github/workflows/release.yml` (EASEE-16) is **not a gate** — it runs only when a
maintainer dispatches it, never on push or PR. It reruns `pnpm gates` + `pnpm
audit:prod` + the packed-tarball load on Node 22 and **refuses to release a commit whose
`ci.yml` push run is not green**, so a red `main` blocks releases as well as merges.
Since EASEE-19 it also hands the publish job the `dist/` it just gated, because the
package is its build and the tag does not contain it. Its invariants that no workflow
run can see before it publishes are pinned by `tests/unit/release-workflow.test.ts`;
the traps are in the Release section of [`AGENTS.md`](../AGENTS.md).

Three consequences worth internalising:

- **A locally-green gate can be followed by a red CI tick that is not your change.** The
  audit job is the only one that can do this, and it is the one the local gate omits on
  purpose: a gate that fails on a plane is a bad gate. Run `pnpm build && pnpm
  audit:prod` yourself when you have network and CI is red on that job.
- **The compat job is stricter than gate 5.** Gate 5 loads the nodes from the working
  tree's `dist/`; CI loads them from the *packed tarball*. So a file the `files`
  allowlist leaves out passes locally and fails in CI, correctly. If the compat job is
  red and gate 5 is green, suspect `files` in `package.json` before you suspect the node
  code, and reproduce with:

  ```bash
  pnpm pack --pack-destination /tmp
  npm install --prefix /tmp/compat --no-package-lock /tmp/runnane-node-red-contrib-easee-*.tgz
  node dist/scripts/check-node-loads.js --package-dir /tmp/compat/node_modules/@runnane/node-red-contrib-easee
  ```

- **Node 18 and 20 are only ever exercised by the compat job.** Vitest 5 needs ≥ 22.12,
  so no test runs there. The build targets ES2022 to keep `engines: >=18` true; if a
  compat leg on 18 or 20 goes red, that claim is what broke — an API newer than the
  target in `easee-client/`, most likely.

## `main` is green, and a red tick is real

The `Security Audit` job was red on `main` **continuously from 2025-09-13 to
2026-08-30** because a plain audit trips on devDependency advisories that never ship —
27 of 28 were dev-only. For a year, "CI is red" was the normal state here, so nobody read
it, and a genuine high-severity advisory in the one production dependency sat unread
inside that noise for months (EASEE-8).

EASEE-9 replaced it with an audit of only the tree a consumer installs, now
`scripts/audit-production.ts` running `pnpm audit --json --prod`. pnpm reports in the
npm-v6 shape (`advisories` keyed by id), not npm 7+'s `vulnerabilities`/`via`, and the
script throws if `advisories` is missing so a changed shape cannot read as a clean tree.
**If you have old notes saying a red tick in this repo is not your regression, delete
them — the opposite is true.**

The allowlist in that script self-cleans, which is the part that matters when you touch
dependencies:

1. An advisory that is **not** allowlisted fails the build.
2. An allowlist entry that matches **nothing** *also* fails the build.

That is exactly how the one entry it ever held left. `ws` (`GHSA-96hv-2xvq-fx4p`, reached
via `@microsoft/signalr`, EASEE-8) was allowlisted on the belief that 7.5.10 was the last
7.x; `ws` 7.5.11–7.5.13 shipped the fix inside SignalR's `^7.5.10` range, and the lockfile
refresh in EASEE-21 made `audit:prod` fail with `STALE allowlist entry … matches nothing`.
The fix was to delete the entry, not to silence it. The allowlist is empty now — keep it
that way unless an advisory genuinely cannot be fixed from here. The `review` date in an entry is
documentation and is deliberately **not** enforced; a gate that reddens on a calendar day
with no code change is the same unreadable signal all over again.

## Green proves very little here — the honest list

The gate is fast and cheap, and it is nearly blind. What nothing checks:

- **The Easee cloud.** Every REST call and the whole SignalR stream are mocked. No gate
  has ever spoken to the real API, so an endpoint change, an auth-flow change, or a
  renamed field in a `ProductUpdate` is invisible until a user reports it.
- **Most of `easee-rest-client.ts`.** Its `charger_state` path runs through a real
  runtime; most other topics are never exercised.
- **The editor halves.** No `.html` file is linted, parsed or executed by any gate.
  A syntax error in a `.html` `<script>` block reaches users. The `defaults`/`credentials`
  blocks that make up the compatibility surface are checked by nothing at all — see
  [`compatibility.md`](compatibility.md).
- **Flow compatibility.** Nothing loads a saved flow from a previous version, so a
  renamed property is caught by no gate in this repo. That is a review responsibility.
- **Runtime behaviour under reconnect.** Token refresh, `fullReconnect()` and the
  backoff paths are the most fragile code here and among the least covered.
- **Types are not a contract with the outside.** The TypeScript types describe what the
  code *assumes* the API and Node-RED hand it (`TokenResponse`, `ObservationData`, the
  `RED` API from `@types/node-red`). A green typecheck proves the code agrees with those
  assumptions, not that the assumptions are true.

So treat "gates green" as *"I did not break the build, the types, the loading or the
linting"*, and do the failing-direction check on whatever you actually changed.

## The failing-direction check, in this repo

Mutate the **implementation**, never the assertion, and check that the test **naming
your claim** goes red:

```bash
cp easee-client/<file>.ts /tmp/<file>.pristine     # copy FIRST
# edit easee-client/<file>.ts so the guard you added is genuinely gone
pnpm exec vitest run tests/unit/<the-test>.test.ts > /tmp/easee-mutation.log 2>&1
grep -n "×\|FAIL" /tmp/easee-mutation.log          # which test name went red?
cp /tmp/<file>.pristine easee-client/<file>.ts      # restore from the copy
diff /tmp/<file>.pristine easee-client/<file>.ts    # must print nothing
git status --porcelain                              # a diff is blind to new untracked files
```

Adjacent red is not evidence. Restore from the copy, **not** `git checkout -- <file>`,
which discards every other uncommitted change in that file.

## Flake

None known. The suite is 125 tests over ~2 seconds with no network, no fixed ports (the
SignalR HTTP client tests bind an ephemeral one on 127.0.0.1), no database and no shared
fixed filenames, so there is nothing for a concurrent run to adopt — which
is also why `/auto --parallel N`'s gate split is unnecessary here: every gate is safe to
run concurrently from several worktrees. The one shared path is `dist/`, per worktree.

If a run is red, it is a real failure. Capture the log before re-running anything.
