# Testing

What the suite covers, what it does not, and how to add to it without adding a test that
cannot fail.

## The shape of it

8 suites, 80 tests, ~5 seconds, no network, no ports, no database.

```
tests/
  setup.js                            global setup, runs before each suite
  fixtures/mockData.js                synthetic API payloads — keep them synthetic
  mocks/nodeRedMocks.js               hand-written RED / node mocks
  unit/authentication.test.js         login, error paths, non-JSON responses
  unit/configValidation.test.js       the credential-validation helper
  unit/streaming-client-options.test.js   SignalR option assembly (incl. skipNegotiation)
  unit/tokenChecking.test.js          token expiry arithmetic
  unit/tokenRefresh.test.js           refresh flow and its failure paths
  unit/published-package.test.js      what `npm pack` would publish (EASEE-3)
  integration/authFlow.test.js        the whole auth flow, still fully mocked
  integration/nodeRedTestHelper.test.js   node-red-node-test-helper — a real runtime
```

`published-package.test.js` is the odd one out: it tests the **artefact**, not the code.
It shells out to `npm pack --dry-run --json` and asserts that the agent-instruction files
never ship and that every node file does. Two notes if you touch it — the JSON shape is
**not stable across npm versions** (npm 12 returns an object keyed by package name, the
npm bundled with Node 18/20/22 returns an array, and this repo's CI matrix spans both, so
it normalises rather than indexing), and `package.json` / `README.md` / `LICENSE` are
deliberately absent from its `MUST_SHIP` list because npm force-includes all three
whatever `.npmignore` says — asserting on them would be an assertion that cannot fail.

`testMatch` is explicit (`tests/unit/*.test.js`, `tests/integration/*.test.js`) and
every ignore pattern is cleared, so a test placed anywhere else is **silently not run**.
Put new tests in one of those two directories.

## Coverage: 12%, and the floor only goes up

```
statements 11.91% (84/705)   branches 7.98% (31/388)
functions   8.69% (8/92)     lines    12.01% (84/699)     — measured 2026-08-30
```

Per file:

| file | statements | note |
| --- | --- | --- |
| `charger-streaming-client.js` | 14.74% | option assembly only; the whole connect/reconnect path is untested |
| `easee-configuration.js` | 14.69% | auth and token logic partly covered; 1943 lines, most of them not |
| `easee-rest-client.js` | **0%** | nothing whatsoever |

The thresholds in `jest.config.js` sit just under those numbers. **Raise them in the
same change that raises coverage**, and never lower one to make a build pass. The
mechanics, and the path-group trap that made a 99% floor pass silently, are in
[`gates.md`](gates.md).

`easee-rest-client.js` at 0% is the obvious place for the next test to go, and it is
also the reason a green gate proves so little: that file could be entirely broken and
only the Node-RED load check (`npm run test:compat`) would notice, and only if it stopped
*loading*.

## Everything about the Easee cloud is mocked

There is no contract test, no recorded cassette, and no live probe. `global.fetch` and
the `@microsoft/signalr` client are replaced wholesale. So the suite verifies **our
handling of a response shape we wrote down ourselves**, and cannot detect:

- an endpoint that moved or changed its auth
- a renamed field inside a `ProductUpdate` / `ChargerUpdate` / `CommandResponse`
- a changed token lifetime or refresh semantics
- rate limiting, or any error the real API returns that `mockData.js` does not model

When a change is driven by something the real API does, say in the PR body how you know
— a captured payload, upstream documentation, a user's report — because no gate can
corroborate it.

## Writing a test that can actually fail

The failing-direction check is the point (constitution §14), and the specific traps that
have bitten in repos like this one:

- **Is the function under test actually called?** A test that asserts on a literal the
  test itself wrote, or greps the source file, or re-implements the logic inline, passes
  no matter what the implementation does. Grep your own diff for a `test(` block with no
  assertion, and for a mock that is created and never asserted on.
- **Could expected and actual drift together?** `mockData.js` feeds both the code and, in
  places, the expectation. Pin the expected value literally rather than deriving it from
  the same fixture the code consumed.
- **Mutate the implementation, not the assertion.** Editing an expected value to
  something wrong proves only that the assertion compares against the actual value.
  Patch `easee-client/*.js` so the guard is genuinely gone, run
  `npm run test:coverage`, and check that the test **naming your claim** went red —
  adjacent red is not evidence. Restore with the inverse edit, not
  `git checkout -- <file>`, then confirm `git status --porcelain` is clean.
- **Re-measure the count.** The suite is 80 tests as of EASEE-3; quote a delta only after
  re-measuring on `main`, not from memory.

## The integration suite uses a real Node-RED runtime

`tests/integration/nodeRedTestHelper.test.js` uses `node-red-node-test-helper`, which
loads the nodes into an actual Node-RED instance rather than a mock. That is the only
place a node's *registration* is exercised by jest, and it is the direction the suite
should grow — `TODO.md` has "use actual functions for testing and not mocking" as a
standing intention, and the helper is how that gets done.

It is not a substitute for `npm run test:compat`, which loads the nodes the way a user's
install does (and in CI, from the packed tarball).

## What is checked by nothing at all

Listed here so it is not rediscovered: the editor halves (`.html`) are neither linted nor
executed; no saved flow from a previous version is ever loaded; and the `defaults` /
`credentials` blocks that form the published compatibility surface are compared against
the runtime's property reads by no gate. See
[`compatibility.md`](compatibility.md) — that surface is a review responsibility.
