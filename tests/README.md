# Tests

Vitest 5, TypeScript, ESM. The maintained description of what this suite covers — and,
more usefully, what it does not — is [`.agents/testing.md`](../.agents/testing.md); this
file is the short version for someone who just opened the directory.

## Layout

```
tests/
├── package.json                  # {"type": "module"}: tests are ESM, the node sources are CommonJS
├── setup.ts                      # global fetch mock + testHelpers; leaves fake timers on between tests
├── fixtures/
│   └── mockData.ts               # synthetic API error bodies — keep them synthetic, this repo is public
├── mocks/
│   └── nodeRedMocks.ts           # a stub RED runtime and the typed fetchMock()
├── helpers/
│   └── node-red-runtime.ts       # which node-red helper.init() boots (EASEE_NODE_RED_PATH)
├── unit/
│   ├── charger-state-observations.test.ts
│   ├── configValidation.test.ts
│   ├── published-package.test.ts # what `pnpm pack` would publish — needs a built dist/
│   ├── release-workflow.test.ts  # what release.yml must keep that no workflow run can check first
│   ├── rest-call-errors.test.ts
│   ├── streaming-client-lifecycle.test.ts
│   ├── streaming-client-options.test.ts
│   └── …
└── integration/
    ├── configuration-auth.test.ts # login / refresh / token check on the real config node
    └── nodeRedTestHelper.test.ts # a real Node-RED runtime via node-red-node-test-helper
```

Only `tests/unit/*.test.ts` and `tests/integration/*.test.ts` are run
(`vitest.config.mts`). A test anywhere else is silently skipped.

## Running

```bash
pnpm gates                  # what must be green before a PR (includes build + coverage floor)
pnpm build                  # needed once before `pnpm test`: published-package.test reads dist/
pnpm test                   # all tests, no coverage thresholds
pnpm test:coverage          # with the coverage floor from vitest.config.mts
pnpm test:unit
pnpm test:integration
pnpm test:watch
pnpm test:node-red-5         # the same suite, helper.init() booting node-red 5 instead (EASEE-41)
pnpm exec vitest run tests/unit/configValidation.test.ts   # one file
```

## Writing one

```ts
import helper from "node-red-node-test-helper";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import easeeConfiguration from "../../easee-client/easee-configuration.js";
import { initHelperWithResolvedRuntime } from "../helpers/node-red-runtime.js";
import { fetchMock } from "../mocks/nodeRedMocks.js";

initHelperWithResolvedRuntime(helper);

describe("feature", () => {
  beforeEach(() => vi.useRealTimers()); // the helper needs real timers
  afterEach(() => helper.unload());

  it("does the thing", async () => {
    const flow = [{ id: "cfg", type: "easee-configuration", username: "user@example.invalid" }];
    await new Promise<void>((resolve) => helper.load(easeeConfiguration as any, flow, { cfg: { password: "synthetic" } }, resolve));
    const node: any = helper.getNode("cfg");
    fetchMock().mockImplementation(() => globalThis.testHelpers.createFetchResponse({ /* synthetic body */ }));
    // act on the REAL node, not a copy of its logic — then assert
    expect(/* … */).toBe(/* … */);
  });
});
```

- Import from `"vitest"` explicitly; there are no globals.
- Import sources with the `.js` extension (`nodenext` requires it; Vite resolves the `.ts`).
- No `done` callbacks — return a Promise.
- Drive the real node (see `integration/configuration-auth.test.ts`), stubbing only the
  network. Tests that copied the node's logic onto a mock and tested the copy passed
  whatever `easee-client/` did; EASEE-31 removed them — do not add more.
- Before claiming a test protects something, break the implementation and watch that test
  go red (see `.agents/testing.md`).
