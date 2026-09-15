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
│   └── mockData.ts               # synthetic API payloads — keep them synthetic, this repo is public
├── mocks/
│   └── nodeRedMocks.ts           # mock RED runtime, mock config node, fetchMock(), verify helpers
├── unit/
│   ├── authentication.test.ts
│   ├── charger-state-observations.test.ts
│   ├── configValidation.test.ts
│   ├── published-package.test.ts # what `pnpm pack` would publish — needs a built dist/
│   ├── release-workflow.test.ts  # what release.yml must keep that no workflow run can check first
│   ├── rest-call-errors.test.ts
│   ├── streaming-client-lifecycle.test.ts
│   ├── streaming-client-options.test.ts
│   ├── tokenChecking.test.ts
│   └── tokenRefresh.test.ts
└── integration/
    ├── authFlow.test.ts
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
pnpm exec vitest run tests/unit/configValidation.test.ts   # one file
```

## Writing one

```ts
import { beforeEach, describe, expect, it } from "vitest";
import easeeConfiguration from "../../easee-client/easee-configuration.js";
import { createMockRED, mockFetchResponses } from "../mocks/nodeRedMocks.js";

describe("feature", () => {
  beforeEach(() => {
    // arrange
  });

  it("does the thing", async () => {
    mockFetchResponses.loginSuccess();
    // act on the REAL node, not a copy of its logic — then assert
    expect(/* … */).toBe(/* … */);
  });
});
```

- Import from `"vitest"` explicitly; there are no globals.
- Import sources with the `.js` extension (`nodenext` requires it; Vite resolves the `.ts`).
- No `done` callbacks — return a Promise.
- Drive the real node. Several older tests copy the node's logic onto a mock and test the
  copy, which passes whatever `easee-client/` does; do not add more of those.
- Before claiming a test protects something, break the implementation and watch that test
  go red (see `.agents/testing.md`).
