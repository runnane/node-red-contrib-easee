/**
 * Guards what the release workflow depends on but cannot check itself (EASEE-16).
 *
 * `.github/workflows/release.yml` publishes to npm with trusted publishing
 * (OIDC). That makes three things in this repo part of an external contract
 * with npmjs.com, and breaking any of them fails only at publish time — on the
 * one run that matters, with an auth or provenance error that names nothing in
 * this tree:
 *
 * 1. the workflow FILENAME, which the npm trusted publisher is bound to;
 * 2. the `id-token: write` permission on the publish job, without which there
 *    is no OIDC token to exchange;
 * 3. `repository.url` in package.json, which npm checks against the repository
 *    the provenance statement says the package was built from.
 *
 * And one thing the design depends on: no token secret. A workflow that grows
 * an NPM_TOKEN "to make it work" has quietly replaced trusted publishing with
 * a long-lived credential.
 */

const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const WORKFLOW_PATH = path.join(REPO_ROOT, ".github", "workflows", "release.yml");

/** The workflow with comment lines removed, so prose about tokens cannot match. */
function workflowCode() {
  return fs
    .readFileSync(WORKFLOW_PATH, "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
}

/**
 * The body of one top-level job: from `  <name>:` to the next line indented by
 * exactly two spaces. Textual on purpose — the repo has no YAML parser as a
 * direct dependency, and the jobs block is flat.
 */
function jobBlock(code, name) {
  const lines = code.split("\n");
  const start = lines.indexOf(`  ${name}:`);
  if (start === -1) {
    throw new Error(`release.yml has no job named "${name}"`);
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}\S/.test(line));
  return rest.slice(0, end === -1 ? rest.length : end).join("\n");
}

describe("release workflow", () => {
  test("lives at .github/workflows/release.yml, the filename npm's trusted publisher is bound to", () => {
    // If you are renaming the workflow: the npm trusted publisher for this
    // package must be re-pointed at the new filename in the same change, or
    // every publish fails. See the Release section of AGENTS.md.
    expect(fs.existsSync(WORKFLOW_PATH)).toBe(true);
  });

  test("the publish job is granted id-token: write and runs npm publish", () => {
    const publish = jobBlock(workflowCode(), "publish");

    expect(publish).toMatch(/^\s+id-token:\s*write\s*$/m);
    expect(publish).toMatch(/\bnpm publish\b/);
  });

  test("publishes only after prepare has gated and tagged", () => {
    const publish = jobBlock(workflowCode(), "publish");

    expect(publish).toMatch(/^\s+needs:\s*prepare\s*$/m);
  });

  test("the gates run before anything is pushed", () => {
    const prepare = jobBlock(workflowCode(), "prepare");
    const gates = prepare.indexOf("npm run gates");
    const push = prepare.indexOf("git push");

    expect(gates).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(gates);
  });

  test("reads no secrets — publishing is OIDC, not a token", () => {
    expect(workflowCode()).not.toMatch(/\bsecrets\./);
  });
});

describe("package.json for provenance", () => {
  test("repository.url is this GitHub repository", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
    const url = pkg.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");

    // Pinned rather than derived: npm compares it with the repository the
    // workflow ran in, and deriving the expected value from package.json
    // would make this test agree with whatever the field drifted to.
    expect(url).toBe("https://github.com/runnane/node-red-contrib-easee");
  });
});
