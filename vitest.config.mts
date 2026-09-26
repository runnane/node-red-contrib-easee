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
      // Raised 2026-09-26 (EASEE-27), 138 tests, after the User-Agent helper and
      // its tests (doAuthRestCall/doLogin/SignalR withUrl() header assertions):
      // statements 60.86% (504/828), branches 54.36% (249/458), functions 52.33%
      // (56/107), lines 60.7% (496/817).
      //
      // Vitest applies these to the files matched by `include` as one global
      // group. Do NOT add a per-path group (e.g. "easee-client/**") without
      // re-checking that the global numbers are still enforced: under Jest a path
      // group silently emptied the global group, and a 99% floor passed (EASEE-1).
      thresholds: {
        statements: 60.8,
        branches: 54.3,
        functions: 52.3,
        lines: 60.6,
      },
    },
  },
});
