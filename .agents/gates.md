# This repo's gates

The gate command, the four things CI runs, and why a green run here means very little.

[`.agents/repo.json`](repo.json) names this file as `gatesDoc`, which is how a
repo-agnostic command finds this repo's particulars without carrying them. Its
counterpart is the **`gate-failures` skill** in the userspace bundle: that one names no
command or runner, so it can be shared; this one is nothing but commands and runners,
so it never leaves the repo. Read them together the first time a gate fails in a pass.

## The command

```bash
npm run gates       # lint + coverage-enforcing tests + Node-RED load check
npm run lint:fix    # eslint --fix; commit what it rewrites
```

Three checks, ~6 seconds, all offline. They are chained with `&&`, so the run stops at
the first failure and the last thing printed is the thing that broke.

| # | Check | Script | Time | What it would catch |
| --- | --- | --- | --- | --- |
| 1 | lint | `npm run lint` | ~0.6s | eslint over `easee-client/*.js`, `tests/**/*.js`, `scripts/*.js` |
| 2 | tests + coverage | `npm run test:coverage` | ~5s | 8 suites / 80 tests, **and** the `jest.config.js` thresholds |
| 3 | Node-RED load | `npm run test:compat` | ~1s | a node that no longer registers in a real Node-RED runtime |

## ⚠️ npm, not pnpm — this is the repo where that matters

Every other repo in the set (RCP, ELEG, DECK, SPND, VTK, SKRAP, IPADR, ORCA) is pnpm.
This one is **npm**, with a `package-lock.json` and no `pnpm-workspace.yaml`.

`pnpm install` here does not fail — it *succeeds* and writes a `pnpm-lock.yaml` that CI
never reads, leaving an untracked lockfile and a `node_modules` laid out differently
from the one CI builds. So the failure is a confusing diff plus results that do not
match CI, not a clean error. Use `npm ci`.

## `npm test` is not the gate — coverage is off by default

`jest.config.js` sets `collectCoverage: false`, so:

```bash
npm test              # 80 passing tests, exit 0, thresholds NEVER evaluated
npm run test:coverage # the same 80 tests, thresholds enforced
```

A green `npm test` therefore says **nothing** about the coverage floor, and CI (which
runs `test:coverage` on the 20.x leg since EASEE-1) will still fail you. This is the
single easiest way to report "gates green" in this repo and be wrong.

## The coverage floor, and the trap that made a 99% floor pass

The thresholds in `jest.config.js` sit just under the measured numbers, so any change
that *reduces* coverage fails the build:

```
statements 11.91% (84/705)   branches 7.98% (31/388)
functions   8.69% (8/92)     lines    12.01% (84/699)     — measured 2026-08-30
```

Those numbers are low because the suite is thin, not because the floor is slack — see
[`testing.md`](testing.md). When coverage rises, **raise the floor in the same change**.
Never lower one to make a build pass.

**Do not reintroduce a path-based `coverageThreshold` group** such as `"./easee-client/"`.
Jest removes every file matched by a path group from the `global` group, and
`collectCoverageFrom` only collects `easee-client/**/*.js` — so a group on that directory
leaves the global group **empty** and its thresholds silently unenforced, with no warning
and a zero exit code. That is exactly what was there before EASEE-1, where a global
threshold of **99% passed**. Measured:

```bash
npx jest --coverage --coverageThreshold \
  '{"global":{"statements":99},"./easee-client/":{"statements":11}}'   # exit 0  ← wrong
npx jest --coverage --coverageThreshold '{"global":{"statements":99}}' # fails   ← right
```

The comment in `jest.config.js` says this too, deliberately: the trap is in the file it
would be reintroduced into.

## CI runs four jobs; the local gate runs three of them

`.github/workflows/ci.yml`, on push and PR to `main` and `develop`:

| job | what | local equivalent |
| --- | --- | --- |
| `lint-and-test` × **4** (Node 18/20/22/24) | `npm run lint` everywhere; `npm test` on 18/22/24 and `npm run test:coverage` on **20.x only** | gates 1 + 2 |
| `Node-RED Compatibility` | `npm pack`, install the tarball elsewhere, load all three nodes from **there** | gate 3, but see below |
| `Security Audit` | `npm run audit:prod` (blocking) + `npm outdated \|\| true` (informational) | **none — needs the network** |

Two consequences worth internalising:

- **A locally-green gate can be followed by a red CI tick that is not your change.** The
  audit job is the only one that can do this, and it is the one the local gate omits on
  purpose: a gate that fails on a plane is a bad gate. Run `npm run audit:prod` yourself
  when you have network and CI is red on that job.
- **The compat job is stricter than gate 3.** Gate 3 loads the nodes from the working
  tree; CI loads them from the *packed tarball*. So a file that `.npmignore` wrongly
  drops passes locally and fails in CI, correctly. If the compat job is red and gate 3
  is green, suspect `.npmignore` before you suspect the node code, and reproduce with:

  ```bash
  npm pack --pack-destination /tmp
  npm install --prefix /tmp/compat --no-package-lock /tmp/runnane-node-red-contrib-easee-*.tgz
  npm run test:compat -- --package-dir /tmp/compat/node_modules/@runnane/node-red-contrib-easee
  ```

## `main` is green, and a red tick is now real

The `Security Audit` job was red on `main` **continuously from 2025-09-13 to
2026-08-30** because `npm audit --audit-level=moderate` trips on devDependency
advisories that never ship — 27 of 28 were dev-only. For a year, "CI is red" was the
normal state here, so nobody read it, and a genuine high-severity advisory in the one
production dependency sat unread inside that noise for months (EASEE-8).

EASEE-9 replaced it with `scripts/audit-production.js` (`npm audit --omit=dev`), which
audits only the tree an npm consumer installs. **If you have old notes saying a red tick
in this repo is not your regression, delete them — the opposite is now true.**

The allowlist in that script self-cleans, which is the part that matters when you touch
dependencies:

1. An advisory that is **not** allowlisted fails the build.
2. An allowlist entry that matches **nothing** *also* fails the build.

So if upstream ever fixes `ws` (`GHSA-96hv-2xvq-fx4p`, reached via `@microsoft/signalr`,
tracked by EASEE-8), CI goes red saying `STALE allowlist entry` and naming the issue —
the fix is to delete the entry, not to silence it. The `review` date in an entry is
documentation and is deliberately **not** enforced; a gate that reddens on a calendar day
with no code change is the same unreadable signal all over again.

## Green proves very little here — the honest list

The gate is fast and cheap, and it is nearly blind. What nothing checks:

- **The Easee cloud.** Every REST call and the whole SignalR stream are mocked. No gate
  has ever spoken to the real API, so an endpoint change, an auth-flow change, or a
  renamed field in a `ProductUpdate` is invisible until a user reports it.
- **`easee-rest-client.js` at all.** It is at **0%** statement coverage. Gate 2 will
  happily pass with that file completely broken; only gate 3 notices if it stops
  *loading*.
- **The editor halves.** No `.html` file is linted, parsed or executed by any gate.
  A syntax error in a `.html` `<script>` block reaches users. The `defaults`/`credentials`
  blocks that make up the compatibility surface are checked by nothing at all — see
  [`compatibility.md`](compatibility.md).
- **Flow compatibility.** Nothing loads a saved flow from a previous version, so a
  renamed property is caught by no gate in this repo. That is a review responsibility.
- **Runtime behaviour under reconnect.** Token refresh, `fullReconnect()` and the
  backoff paths are the most fragile code here and among the least covered.

So treat "gates green" as *"I did not break the loading and the linting"*, and do the
failing-direction check on whatever you actually changed.

## The failing-direction check, in this repo

Mutate the **implementation**, never the assertion, and check that the test **naming
your claim** goes red:

```bash
# edit easee-client/<file>.js so the guard you added is genuinely gone
npm run test:coverage 2>&1 | tee /tmp/easee-mutation.log
grep -n "✕\|●" /tmp/easee-mutation.log   # which test name went red?
git diff                                  # then restore with the inverse edit
git status --porcelain                    # must be clean; a diff is blind to new untracked files
```

Adjacent red is not evidence. Restore with an inverse patch, **not** `git checkout --
<file>`, which discards every other uncommitted change in that file.

## Flake

None known. The suite is 80 tests over ~5 seconds with no network, no ports, no
database and no shared fixed filenames, so there is nothing for a concurrent run to
adopt — which is also why `/auto --parallel N`'s gate split is unnecessary here: every
gate is safe to run concurrently from several worktrees.

If a run is red, it is a real failure. Capture the log before re-running anything.
