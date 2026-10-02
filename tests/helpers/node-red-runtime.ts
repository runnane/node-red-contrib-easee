/**
 * Which node-red runtime every helper-based test file boots via
 * node-red-node-test-helper's `helper.init()`.
 *
 * Defaults to this repo's own `node-red` devDependency (^4.x — what most
 * users still run). Setting `EASEE_NODE_RED_PATH` to a different installed
 * node-red — a bare module specifier, or a `./` path resolved against the
 * repo root (the working directory Vitest runs in) — swaps every helper-based
 * test file's runtime without touching any of their sources. `pnpm
 * test:node-red-5` (EASEE-41) points it at
 * `./tests/node-red-5/node_modules/node-red`, which the `tests/node-red-5`
 * workspace package installs. That was an `npm:node-red@^5` alias
 * devDependency until EASEE-48: pnpm audit keys its request tree by package
 * name, so the alias overwrote the root's node-red 4 entry and node-red 4's
 * whole subtree never reached the audit.
 *
 * Provenance, not just a green run: importing this module (via
 * `initHelperWithResolvedRuntime`) prints the version of the runtime it
 * actually resolved, and `tests/integration/node-red-runtime-provenance.test.ts`
 * pins it against `EASEE_NODE_RED_EXPECT_MAJOR` when that is set — that
 * assertion is the evidence a leg booted the runtime it claims to, not the
 * print line, which `tests/setup.ts` mocks `console.log` under anyway (this
 * writes to stdout directly so it survives that).
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

function nodeRedSpecifier(): string {
  return process.env.EASEE_NODE_RED_PATH || "node-red";
}

/** The node-red entry file `helper.init()` should be pointed at. */
export function resolveNodeRedRuntimePath(): string {
  return require.resolve(nodeRedSpecifier(), { paths: [process.cwd()] });
}

/**
 * The resolved node-red package's own `version` field. `runtimePath` is
 * node-red's main entry (e.g. `.../node-red/lib/red.js`); its package.json
 * sits one directory above that file's directory — the same assumption
 * `scripts/check-node-loads.ts` makes for the packed-tarball load check.
 */
export function resolveNodeRedVersion(): string {
  const runtimePath = resolveNodeRedRuntimePath();
  const packageJsonPath = path.join(path.dirname(runtimePath), "..", "package.json");
  const manifest = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { version?: string };
  if (!manifest.version) {
    throw new Error(`${packageJsonPath} has no "version"`);
  }
  return manifest.version;
}

let reported = false;

/** Print the resolved runtime's version once per test file. */
function reportNodeRedRuntimeOnce(): void {
  if (reported) {
    return;
  }
  reported = true;
  const version = resolveNodeRedVersion();
  const specifier = nodeRedSpecifier();
  process.stdout.write(`[node-red-runtime] booting node-red ${version} (via "${specifier}")\n`);
}

/** `helper.init()` through the resolved runtime, reporting its version once. */
export function initHelperWithResolvedRuntime(helperModule: { init: (runtimePath: string) => void }): void {
  reportNodeRedRuntimeOnce();
  helperModule.init(resolveNodeRedRuntimePath());
}
