import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Explicit, as it was under Jest: a test placed anywhere else is not run.
    include: ["tests/unit/*.test.ts", "tests/integration/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["easee-client/**/*.ts"],
      reporter: ["text", "text-summary", "lcov", "html", "json-summary"],
      reportsDirectory: "coverage",
      // A floor that only ever goes up. These sit just under the measured
      // coverage, so any change that reduces it fails `pnpm gates`. When coverage
      // rises, raise the floor to just under the new number in the same change;
      // never lower it to make a build pass.
      //
      // Measured 2026-09-15 (EASEE-19), v8 provider, 105 tests: statements 47.33%
      // (337/712), branches 39.23% (144/367), functions 41.93% (39/93), lines
      // 47.08% (331/703). The floor moved to the v8 provider first — Jest's
      // istanbul instrumentation counted differently (branches 29.11% over 395
      // for the same code), so its numbers do not carry across — and was then
      // raised by the tests EASEE-19 added for the fixes the conversion forced.
      //
      // Raised 2026-09-15 (EASEE-35), 125 tests, after the SignalR HTTP client and
      // subscription tests: statements 56.82% (454/799), branches 51.91% (230/443),
      // functions 49.03% (51/104), lines 56.65% (447/789).
      //
      // Raised 2026-09-26 (EASEE-10), 126 tests, after
      // streaming-client-missing-config.test.ts covered the constructor's guard
      // for a configuration node that does not resolve (previously untested):
      // statements 57.08% (455/797), branches 52.14% (231/443), functions 49.03%
      // (51/104, unchanged), lines 56.92% (448/787). (The denominators dropped
      // from EASEE-35's 799/789 to 797/787 in the same change, from deleting the
      // two dead `responses` assignments — see the PR; that alone would have
      // needed a re-baseline, but this test covers more than enough to raise
      // through it instead.)
      //
      // Raised 2026-09-26 (EASEE-20), 130 tests, after the doAuthRestCall JSON
      // error-message tests: statements 57.24% (462/807), branches 53.34%
      // (247/463), functions 49.52% (52/105), lines 57.08% (455/797).
      //
      // Re-measured 2026-09-26 after merging main into EASEE-20's branch (the sweep's
      // PRs combined): statements 57.51% (463/805), branches 53.56% (248/463), functions 49.52% (52/105), lines 57.35% (456/795).
      //
      // Raised 2026-09-26 (EASEE-28), 135 tests, after the re-login admin route
      // tests: statements 62.95% (532/845), branches 57.51% (268/466), functions
      // 53.70% (58/108), lines 62.82% (524/834).
      //
      // Re-measured 2026-09-26 after merging main into EASEE-28's branch (the sweep's
      // PRs combined): statements 63.57% (541/851), branches 58.84% (286/486), functions 54.12% (59/109), lines 63.45% (533/840).
      //
      // Raised 2026-09-26 (EASEE-27), 138 tests, after the User-Agent helper and
      // its tests (doAuthRestCall/doLogin/SignalR withUrl() header assertions):
      // statements 60.86% (504/828), branches 54.36% (249/458), functions 52.33%
      // (56/107), lines 60.7% (496/817).
      //
      // Re-measured 2026-09-26 after merging main into EASEE-27's branch (the sweep's
      // PRs combined): statements 64.77% (570/880), branches 59.68% (299/501), functions 55.35% (62/112), lines 64.63% (561/868).
      //
      // Re-measured 2026-09-26 with EASEE-38's token-check backoff tests: statements
      // 66.81% (600/898), branches 61.11% (308/504), functions 56.52% (65/115), lines
      // 66.7% (591/886).
      //
      // Vitest applies these to the files matched by `include` as one global
      // group. Do NOT add a per-path group (e.g. "easee-client/**") without
      // re-checking that the global numbers are still enforced: under Jest a path
      // group silently emptied the global group, and a 99% floor passed (EASEE-1).
      thresholds: {
        statements: 66.8,
        branches: 61.1,
        functions: 56.5,
        lines: 66.7,
      },
    },
  },
});
