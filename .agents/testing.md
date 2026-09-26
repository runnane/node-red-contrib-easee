# Testing

What the suite covers, what it does not, and how to add to it without adding a test that
cannot fail.

## The shape of it

A few seconds, no network, no fixed ports, no database. Vitest 5, TypeScript, ESM. No
file or test count is quoted here on purpose: prose no gate checks drifted three times
(EASEE-43). The run itself prints the count; the enforced number is the floor in
`vitest.config.mts`. (`signalr-http-client.test.ts` binds an ephemeral port on 127.0.0.1, so
concurrent runs cannot collide.)

```
tests/
  package.json                          {"type": "module"} — tests are ESM, the sources are not
  setup.ts                              global setup, runs before each file
  fixtures/mockData.ts                  synthetic API error bodies — keep them synthetic
  mocks/nodeRedMocks.ts                 a stub RED, and fetchMock()
  unit/charger-state-observations.test.ts   rest client charger_state → observations (EASEE-13)
  unit/configValidation.test.ts         the credential-validation helper
  unit/streaming-client-options.test.ts SignalR option assembly (incl. skipNegotiation)
  unit/published-package.test.ts        what `pnpm pack` would publish (EASEE-3, EASEE-19)
  unit/release-workflow.test.ts         what release.yml must keep that no run can check first (EASEE-16)
  unit/rest-call-errors.test.ts         doAuthRestCall when fetch rejects (EASEE-19)
  unit/streaming-client-lifecycle.test.ts   close + "opened" handlers, subscription, httpClient wiring (EASEE-19, EASEE-35)
  unit/signalr-http-client.test.ts      the HTTP client handed to SignalR, against a real local server (EASEE-35)
  integration/configuration-auth.test.ts   doLogin / doRefreshToken / checkToken on the real node (EASEE-31)
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
  `mocks/nodeRedMocks.ts`, which is typed. **That mock is global, so anything that calls
  the real `fetch` gets `undefined` back** — a test of code that talks to a real server
  fails with `Cannot read properties of undefined (reading 'url')` or similar, far from
  the cause. Such a test swaps in `testHelpers.realFetch` in its `beforeEach` and puts
  the mock back in `afterEach`, as `signalr-http-client.test.ts` does (EASEE-35).
- Vitest has no `done` callback. Return a Promise and `reject(err)` where Jest code called
  `done(err)`.
- `setup.ts` leaves **fake timers on** after every test, as the Jest setup did. Vitest
  throws where Jest only warned when a timer helper runs with fake timers off, so the
  setup guards `clearAllTimers` / `runOnlyPendingTimers` with `vi.isFakeTimers()`. Do the
  same in a test that calls them. A test whose code under test needs a real timer — an
  HTTP timeout, say — calls `vi.useRealTimers()` in its own `beforeEach`, or the timer
  never fires and the test times out instead of failing.

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

## Coverage: the floor in `vitest.config.mts`, and it only goes up

**The authoritative number is the `thresholds` block in `vitest.config.mts`**, which
`pnpm gates` enforces, with a dated comment for every raise above it. Read it there
rather than trusting a figure in prose. As a dated snapshot only:

Per file, measured 2026-09-26 on `main` at `dee95a3` (after EASEE-26), v8:

| file | stmts | branch | funcs | note |
| --- | --- | --- | --- | --- |
| `charger-streaming-client.ts` | 98.82% | 93.05% | 93.75% | the real connect / reconnect / close path with SignalR stubbed at the module boundary (EASEE-45) |
| `easee-configuration.ts` | 93.49% | 89.79% | 80% | auth, token check, refresh and Re-login through the real node; the least-covered file by functions |
| `easee-rest-client.ts` | 97.53% | 91.22% | 95.45% | every predefined topic and the custom-path route through a real runtime (EASEE-44) |
| `errors.ts` / `logging.ts` | ≥93% | ≥99% | 100% | the classifier and logging plumbing (EASEE-26 / EASEE-29) |
| `signalr-http-client.ts` | 98.80% | 95.94% | 100% | a real local HTTP server and SignalR negotiation (EASEE-35); only the pre-18.14.1 `Set-Cookie` fallback is unreached |

Global at that commit: statements 96.19%, branches 92.7%, functions 90.57%, lines 96.43%.
The thresholds sit just under the latest measured numbers. **Raise them in the
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

- **Is the function under test actually called?** Four older files (`authentication`,
  `tokenChecking`, `tokenRefresh`, `authFlow`) re-implemented the node's logic inline on
  a mock and tested *that* — they passed no matter what `easee-client/` did, and had
  drifted from it. EASEE-31 replaced them with `configuration-auth.test.ts`. Don't add
  more of those; drive the real node, as that file and `charger-state-observations` do. Grep your own diff for a `test(` block with no assertion, and for
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
- **Re-measure the count before quoting one.** Run `pnpm gates` on `main` and on your
  branch and quote both Vitest summary lines; never quote a count from memory or from
  these docs, which deliberately carry none (EASEE-43).

## The integration suite uses a real Node-RED runtime

`tests/integration/nodeRedTestHelper.test.ts` (and `charger-state-observations`) use
`node-red-node-test-helper`, which loads the nodes into an actual Node-RED instance
rather than a mock. That is the direction the suite should grow; EASEE-31 moved the auth tests onto it.
`configValidation` and `streaming-client-missing-config` still construct the real node
against the stub RED in `mocks/nodeRedMocks.ts` — real code, a fake runtime.

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
