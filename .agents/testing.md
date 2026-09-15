# Testing

What the suite covers, what it does not, and how to add to it without adding a test that
cannot fail.

## The shape of it

12 files, 105 tests, ~2 seconds, no network, no ports, no database. Vitest 5, TypeScript,
ESM.

```
tests/
  package.json                          {"type": "module"} — tests are ESM, the sources are not
  setup.ts                              global setup, runs before each file
  fixtures/mockData.ts                  synthetic API payloads — keep them synthetic
  mocks/nodeRedMocks.ts                 hand-written RED / node mocks, and fetchMock()
  unit/authentication.test.ts           login, error paths, non-JSON responses
  unit/charger-state-observations.test.ts   rest client charger_state → observations (EASEE-13)
  unit/configValidation.test.ts         the credential-validation helper
  unit/streaming-client-options.test.ts SignalR option assembly (incl. skipNegotiation)
  unit/tokenChecking.test.ts            token expiry arithmetic
  unit/tokenRefresh.test.ts             refresh flow and its failure paths
  unit/published-package.test.ts        what `pnpm pack` would publish (EASEE-3, EASEE-19)
  unit/release-workflow.test.ts         what release.yml must keep that no run can check first (EASEE-16)
  unit/rest-call-errors.test.ts         doAuthRestCall when fetch rejects (EASEE-19)
  unit/streaming-client-lifecycle.test.ts   close + "opened" handlers through a real runtime (EASEE-19)
  integration/authFlow.test.ts          the whole auth flow, still fully mocked
  integration/nodeRedTestHelper.test.ts node-red-node-test-helper — a real runtime
```

`vitest.config.mts` lists `tests/unit/*.test.ts` and `tests/integration/*.test.ts`
explicitly, so a test placed anywhere else is **silently not run**. Put new tests in one
of those two directories.

### Writing one

- Import from `"vitest"` explicitly (`describe`, `it`, `expect`, `vi`, …). There are no
  globals.
- Import a node as `import easeeRestClient from "../../easee-client/easee-rest-client.js";`
  — a default import of the source's `export =`, with the `.js` extension `nodenext`
  requires (Vite maps it to the `.ts`). For `require.resolve`, use
  `createRequire(import.meta.url)`.
- `fetch` is a `vi.fn()` installed by `setup.ts`; reach it through `fetchMock()` from
  `mocks/nodeRedMocks.ts`, which is typed.
- Vitest has no `done` callback. Return a Promise and `reject(err)` where Jest code called
  `done(err)`.
- `setup.ts` leaves **fake timers on** after every test, as the Jest setup did. Vitest
  throws where Jest only warned when a timer helper runs with fake timers off, so the
  setup guards `clearAllTimers` / `runOnlyPendingTimers` with `vi.isFakeTimers()`. Do the
  same in a test that calls them.

## `published-package.test.ts` tests the artefact, not the code

It runs `pnpm pack --dry-run --json` and asserts both directions: every file a user needs
ships (`dist/easee-client/*.js`, the `.html` halves, the locale file), and nothing that
must not ship does (the TypeScript sources, `dist/scripts/`, `scripts/`, the tooling
config, the lockfile, `tests/`, `.github/`, and the agent-instruction files).

Three things to know if you touch it:

- **It reads the built tree.** `dist/` must exist; `pnpm gates` builds before testing, and
  the test fails with "run `pnpm build` first" when it does not.
- **`pnpm pack --dry-run` still runs `prepack`**, which is `pnpm build` — a clean and
  compile from inside a test, racing anything else reading `dist/`. The test sets
  `npm_config_ignore_scripts=true`, measured to skip it.
- `package.json` / `README.md` / `LICENSE` are deliberately absent from `MUST_SHIP`:
  pnpm and npm force-include all three whatever `files` says, so asserting on them would
  be an assertion that cannot fail. The JSON shape also differs by tool (pnpm prints one
  object; npm prints an array, or an object keyed by name on npm 12), so it normalises.

## Coverage: ~47%, and the floor only goes up

```
statements 47.33% (337/712)   branches 39.23% (144/367)
functions  41.93% (39/93)     lines    47.08% (331/703)     — v8, measured 2026-09-15
```

Per file (statements):

| file | statements | note |
| --- | --- | --- |
| `charger-streaming-client.ts` | 47.71% | option assembly and the close / "opened" handlers; the connect/reconnect path is untested |
| `easee-configuration.ts` | 47.34% | auth, token logic and doAuthRestCall partly covered; over half its statements still are not |
| `easee-rest-client.ts` | 46.89% | the `charger_state` path (EASEE-13) through a real runtime; most topics untested |

The thresholds in `vitest.config.mts` sit just under those numbers. **Raise them in the
same change that raises coverage**, and never lower one to make a build pass. The
mechanics, and the path-group trap that once made a 99% floor pass silently, are in
[`gates.md`](gates.md).

These are **v8** numbers. Jest's istanbul instrumentation counted the same code
differently (it reported branches 29.11% over 395), so a Jest-era figure is not
comparable and was not carried across — EASEE-19 re-baselined the floor on the new
instrument rather than lowering the old one.

## Everything about the Easee cloud is mocked

There is no contract test, no recorded cassette, and no live probe. `fetch` and the
`@microsoft/signalr` client are replaced wholesale. So the suite verifies **our handling
of a response shape we wrote down ourselves**, and cannot detect:

- an endpoint that moved or changed its auth
- a renamed field inside a `ProductUpdate` / `ChargerUpdate` / `CommandResponse`
- a changed token lifetime or refresh semantics
- rate limiting, or any error the real API returns that `mockData.ts` does not model

When a change is driven by something the real API does, say in the PR body how you know
— a captured payload, upstream documentation, a user's report — because no gate can
corroborate it.

## Writing a test that can actually fail

The failing-direction check is the point (constitution §14), and the specific traps that
have bitten in repos like this one:

- **Is the function under test actually called?** Several of the older unit tests
  (`authentication`, `tokenChecking`, `tokenRefresh`) re-implement the node's logic
  inline on a mock and test *that* — they pass no matter what `easee-client/` does.
  Don't add more of those; drive the real node, as `charger-state-observations` and the
  integration suite do. Grep your own diff for a `test(` block with no assertion, and for
  a mock that is created and never asserted on.
- **Could expected and actual drift together?** `mockData.ts` feeds both the code and, in
  places, the expectation. Pin the expected value literally rather than deriving it from
  the same fixture the code consumed.
- **Mutate the implementation, not the assertion.** Editing an expected value to
  something wrong proves only that the assertion compares against the actual value.
  Patch `easee-client/*.ts` so the guard is genuinely gone, run `pnpm test:coverage`,
  and check that the test **naming your claim** went red — adjacent red is not evidence.
  Restore from a copy taken before the mutation, not `git checkout -- <file>`, then
  confirm `git status --porcelain` is clean.
- **Re-measure the count.** The suite is 105 tests as of EASEE-19: the 93 Jest tests on
  `main` before it (87 measured at a823c30, plus EASEE-16's six release-workflow tests),
  six new must-not-ship cases, one new release-workflow case, and five for the fixes the
  conversion forced. Quote a delta only after re-measuring on `main`, not from memory.

## The integration suite uses a real Node-RED runtime

`tests/integration/nodeRedTestHelper.test.ts` (and `charger-state-observations`) use
`node-red-node-test-helper`, which loads the nodes into an actual Node-RED instance
rather than a mock. That is the direction the suite should grow — EASEE-31 tracks moving
the mock-based unit tests onto real code paths, and the helper is how that gets done.

If a helper-based test fails with `Cannot read properties of undefined (reading 'log')`,
the real error is hidden: the helper logs it through the mocked `console`. It is almost
certainly `Cannot find module …/@node-red/registry/…` — see the `packageExtensions` note
in AGENTS.md.

It is not a substitute for `pnpm test:compat`, which loads the nodes the way a user's
install does (and in CI, from the packed tarball on every Node version `engines` claims).

## What is checked by nothing at all

Listed here so it is not rediscovered: the editor halves (`.html`) are neither linted nor
executed; no saved flow from a previous version is ever loaded; and the `defaults` /
`credentials` blocks that form the published compatibility surface are compared against
the runtime's property reads by no gate. See
[`compatibility.md`](compatibility.md) — that surface is a review responsibility.
