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
      // Raised 2026-09-26 (EASEE-31), 131 tests, after replacing the four files
      // that re-implemented doLogin / doRefreshToken / checkToken inline with
      // integration/configuration-auth.test.ts, which drives the real
      // configuration node: statements 76.59% (674/880), branches 69.06%
      // (346/501), functions 60.71% (68/112), lines 76.61% (665/868).
      //
      // Re-measured 2026-09-26 after merging main (EASEE-38, -24, -33) into
      // EASEE-31's branch, 136 tests: statements 78.39% (704/898), branches
      // 70.03% (353/504), functions 61.73% (71/115), lines 78.44% (695/886).
      //
      // Raised 2026-09-26 (EASEE-39), 139 tests, after the doRefreshToken()
      // no-token-branch test and the new rest-client-refresh-token.test.ts
      // (the other doRefreshToken() caller's explicit-login path, previously
      // untested): statements 79.44% (711/895), branches 70.47% (358/508),
      // functions 64.34% (74/115), lines 79.5% (702/883).
      //
      // Raised 2026-09-26 (EASEE-44), 169 tests total (EASEE-44's branch rebased
      // onto EASEE-39's), after tests/integration/rest-client.test.ts drove the
      // rest client's predefined topics, the custom-path/method path, and its
      // error paths (non-2xx JSON error surfacing, network error, missing/invalid
      // configuration node) through the real node. easee-rest-client.ts alone
      // rose from 46.89%/35.55%/31.81% statements/branches/functions to
      // 95.23%/83.69%/81.81%. Global: statements 86.14% (771/895), branches
      // 78.93% (401/508), functions 71.3% (82/115), lines 86.18% (761/883).
      //
      // Re-measured 2026-09-26 (EASEE-40), 170 tests, after doRefreshToken()'s
      // catch classified by HTTP status (httpStatusError/isCredentialRejection)
      // instead of message substrings. Collapsing the old 3-term message OR
      // removed 3 already-covered branches (508 -> 505 total), which alone would
      // have DROPPED the ratio to 78.81% (398/505) despite nothing regressing;
      // the new 5xx test's fixture deliberately omits title/detail so the
      // errorCodeName/"" fallbacks at the refresh error site (previously
      // exercised by no test) are covered too, netting branches back up.
      // Global: statements 86.14% (771/895), branches 79.4% (401/505), functions
      // 71.3% (82/115), lines 86.18% (761/883).
      //
      // Raised 2026-09-26 (EASEE-45), 194 tests, after driving
      // charger-streaming-client.ts through the real node with
      // @microsoft/signalr's HubConnectionBuilder stubbed at the module
      // boundary: startconn()/handleConnection()/reconnect(), the
      // hub-initiated "closed" event's two status branches, the
      // CommandResponse output (output 6), the accessTokenFactory closure,
      // the logging fallbacks, the config-node "update" forwarder, the
      // "input" topic, and startconn()'s charger/accessToken guards were
      // previously untested. charger-streaming-client.ts alone rose from
      // 63.87%/42.85%/40% statements/branches/functions to
      // 98.7%/91.07%/93.33%. Global: statements 92.17% (825/895), branches
      // 84.75% (428/505), functions 85.21% (98/115), lines 92.29% (815/883).
      //
      // Raised 2026-09-26 (EASEE-42), 196 tests, after resetAuthenticationState()
      // was wired into relogin() (deduplicating relogin()'s inline reset) and its
      // misleading status/emit calls were dropped, plus two previously-untested
      // doLogin() branches (an explicit username with no configured password, and
      // vice versa) were covered: statements 93% (824/886), branches 85.14%
      // (430/505), functions 85.21% (98/115, unchanged), lines 93.13% (814/874).
      //
      // Vitest applies these to the files matched by `include` as one global
      // group. Do NOT add a per-path group (e.g. "easee-client/**") without
      // re-checking that the global numbers are still enforced: under Jest a path
      // group silently emptied the global group, and a 99% floor passed (EASEE-1).
      thresholds: {
        statements: 92.9,
        branches: 85.1,
        functions: 85.2,
        lines: 93.1,
      },
    },
  },
});
