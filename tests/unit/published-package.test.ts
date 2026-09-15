/**
 * Guards what the published npm tarball contains (EASEE-3, EASEE-19).
 *
 * package.json's "files" block is an ALLOWLIST: only dist/easee-client/ ships,
 * plus the three files pnpm and npm force-include (package.json, README.md,
 * LICENSE). That replaced a .npmignore denylist under which every new path in
 * the tree shipped unless something excluded it — measured before EASEE-3 added
 * the exclusions, the tarball carried AGENTS.md and .agents/**.
 *
 * An allowlist is the safer default, but it can still be widened by one careless
 * entry ("dist" instead of "dist/easee-client" ships the compiled scripts; "."
 * ships everything), and it can be narrowed until a node file stops shipping.
 * A comment in package.json cannot fail. This can.
 *
 * It reads the built tree: dist/ must exist, which `pnpm gates` guarantees by
 * running `pnpm build` before the tests.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/**
 * Paths that must never reach a user's node_modules. Each entry is a prefix
 * match against the packed path, so a directory covers everything under it.
 */
const MUST_NOT_SHIP = [
  "AGENTS.md",
  "CLAUDE.md",
  ".agents/",
  ".claude/",
  ".mcp.json",
  "tests/",
  ".github/",
  // The TypeScript sources and the tooling that builds and checks them. The
  // compiled nodes ship from dist/easee-client/; none of these are needed there.
  "easee-client/",
  "dist/scripts/",
  "scripts/",
  "tsconfig.json",
  "biome.json",
  "pnpm-lock.yaml",
];

/**
 * Files without which the package is broken. Included so this test fails in
 * BOTH directions: an over-narrow allowlist that drops a node is as bad as one
 * that ships an instruction file, and a test that only ever checks for absence
 * would pass on an empty tarball.
 *
 * The .html editor halves and locales/ are copied into dist/ by `pnpm build`
 * rather than emitted by the compiler, so they are the likeliest to go missing.
 *
 * `package.json`, `README.md` and `LICENSE` are deliberately NOT listed. pnpm
 * pack force-includes all three even though "files" names none of them —
 * measured with "files": ["dist/easee-client"] — so asserting on them would be
 * an assertion that cannot fail.
 */
const MUST_SHIP = [
  "dist/easee-client/easee-configuration.js",
  "dist/easee-client/easee-configuration.html",
  "dist/easee-client/easee-rest-client.js",
  "dist/easee-client/easee-rest-client.html",
  "dist/easee-client/charger-streaming-client.js",
  "dist/easee-client/charger-streaming-client.html",
  "dist/easee-client/locales/en-US/charger-streaming-client.json",
];

/**
 * Ask pnpm what it would publish. --dry-run writes no tarball and needs no network.
 *
 * pnpm pack runs the `prepack` lifecycle even with --dry-run, and prepack here is
 * `pnpm build` — a full clean + compile from inside a test, racing any other run
 * that reads dist/. npm_config_ignore_scripts=true skips it (measured), so this
 * inspects the dist/ that already exists instead of rebuilding it.
 *
 * pnpm prints a single object with `files: [{path}]`; npm prints an array, or an
 * object keyed by package name, depending on its version. Normalise to the entry
 * rather than indexing one shape and hoping.
 */
function packedFiles(): string[] {
  const stdout = execFileSync("pnpm", ["pack", "--dry-run", "--json"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    env: { ...process.env, npm_config_ignore_scripts: "true" },
  });

  const parsed = JSON.parse(stdout);
  const entries = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.files) ? [parsed] : Object.values(parsed);
  const entry = entries.find((candidate: any) => candidate && Array.isArray(candidate.files)) as
    | { files: Array<{ path: string }> }
    | undefined;

  if (!entry) {
    throw new Error(`pnpm pack --dry-run --json returned no file list: ${stdout.slice(0, 300)}`);
  }

  return entry.files.map((file) => file.path);
}

describe("published package contents", () => {
  let files: string[];

  beforeAll(() => {
    if (!existsSync(join(REPO_ROOT, "dist", "easee-client"))) {
      throw new Error(
        "dist/easee-client/ does not exist — run `pnpm build` first. The tarball ships the built tree, so this test inspects it; `pnpm gates` builds before testing.",
      );
    }
    files = packedFiles();
  });

  test("pnpm pack reports a non-empty file list", () => {
    // Without this, every "does not ship" assertion below would pass vacuously
    // on an empty or malformed list.
    expect(files.length).toBeGreaterThan(5);
  });

  test.each(MUST_NOT_SHIP)("does not ship %s", (excluded) => {
    const leaked = files.filter((file) => file === excluded || file.startsWith(excluded));

    expect(leaked).toEqual([]);
  });

  test.each(MUST_SHIP)("ships %s", (required) => {
    expect(files).toContain(required);
  });
});
