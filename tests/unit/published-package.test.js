/**
 * Guards what the published npm tarball contains (EASEE-3).
 *
 * `.npmignore` is a DENYLIST and there is no "files" block in package.json, so
 * every new path in the tree ships to npm unless something excludes it. That is
 * the wrong default for a repo that now carries agent instructions: measured
 * before EASEE-3 added the exclusions, `npm pack --dry-run` listed both
 * AGENTS.md and .agents/** among the files installed by every user.
 *
 * A comment in .npmignore cannot fail. This can.
 */

const { execFileSync } = require("child_process");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");

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
  ".github/"
];

/**
 * Files without which the package is broken. Included so this test fails in
 * BOTH directions: an over-broad .npmignore that drops a node is as bad as one
 * that ships an instruction file, and a test that only ever checks for absence
 * would pass on an empty tarball.
 *
 * `package.json`, `README.md` and `LICENSE` are deliberately NOT listed. npm
 * force-includes all three whatever `.npmignore` says — measured by appending
 * `README.md` to `.npmignore`, which changed nothing — so asserting on them
 * would be an assertion that cannot fail.
 */
const MUST_SHIP = [
  "easee-client/easee-configuration.js",
  "easee-client/easee-configuration.html",
  "easee-client/easee-rest-client.js",
  "easee-client/easee-rest-client.html",
  "easee-client/charger-streaming-client.js",
  "easee-client/charger-streaming-client.html",
  "easee-client/locales/en-US/charger-streaming-client.json"
];

/**
 * Ask npm what it would publish. --dry-run writes nothing and needs no network.
 *
 * The JSON shape is NOT stable across the versions CI runs, and this repo's
 * matrix spans four of them. Measured on npm 12.0.1 the top level is an OBJECT
 * keyed by package name; on the npm bundled with Node 18/20/22 it is an ARRAY
 * of one entry. Both carry the same `files: [{path, size, mode}]` underneath,
 * so normalise to the entry rather than indexing one shape and hoping.
 */
function packedFiles() {
  const stdout = execFileSync(
    "npm",
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    { cwd: REPO_ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
  );

  const parsed = JSON.parse(stdout);
  const entries = Array.isArray(parsed) ? parsed : Object.values(parsed);
  const entry = entries.find((candidate) => candidate && Array.isArray(candidate.files));

  if (!entry) {
    throw new Error(
      `npm pack --dry-run --json returned no file list: ${stdout.slice(0, 300)}`
    );
  }

  return entry.files.map((file) => file.path);
}

describe("published package contents", () => {
  let files;

  beforeAll(() => {
    files = packedFiles();
  });

  test("npm pack reports a non-empty file list", () => {
    // Without this, every "does not ship" assertion below would pass vacuously
    // on an empty or malformed list.
    expect(files.length).toBeGreaterThan(5);
  });

  test.each(MUST_NOT_SHIP)("does not ship %s", (excluded) => {
    const leaked = files.filter(
      (file) => file === excluded || file.startsWith(excluded)
    );

    expect(leaked).toEqual([]);
  });

  test.each(MUST_SHIP)("ships %s", (required) => {
    expect(files).toContain(required);
  });
});
