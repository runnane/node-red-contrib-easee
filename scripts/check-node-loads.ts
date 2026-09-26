#!/usr/bin/env node
/**
 * Node-RED compatibility check.
 *
 * Loads every node this package registers into a real Node-RED runtime and
 * fails if any of them cannot be registered. This catches the "package
 * installs but the node won't load" failure that the unit tests miss, because
 * they import the node factories directly rather than through the runtime.
 *
 * The node files are read from the package's own `node-red.nodes` block — the
 * same map Node-RED reads — rather than from a list kept here, so a path in
 * package.json that points at nothing (say, a `dist/` file the build did not
 * emit) fails this check instead of passing it.
 *
 * This file is TypeScript, compiled by `pnpm build` to
 * dist/scripts/check-node-loads.js, and run from there as plain JavaScript so it
 * works on every Node version `engines` claims — including the ones Vitest and
 * type stripping cannot run on.
 *
 * By default it checks the working tree (after `pnpm build`). Pass --package-dir
 * to point it at an installed copy instead, which is how CI checks the packed
 * tarball:
 *
 *   pnpm pack --pack-destination /tmp
 *   npm install --prefix /tmp/compat --no-package-lock /tmp/runnane-node-red-contrib-easee-*.tgz
 *   node dist/scripts/check-node-loads.js --package-dir \
 *     /tmp/compat/node_modules/@runnane/node-red-contrib-easee
 *
 * The consumer install uses npm, not pnpm, on purpose: the Node-RED palette
 * manager installs contributed nodes with npm, so that is the layout a user gets.
 *
 * By default the Node-RED *runtime* booted for the load itself (via
 * node-red-node-test-helper) is this repo's own `node-red` devDependency,
 * resolved the normal Node.js way relative to this script. Pass --node-red-dir
 * to boot a different installed node-red instead — this is how the Node-RED 5
 * compatibility leg reuses this same check without touching the repo's own
 * devDependency (kept on node-red ^4.x, which is what most users still run):
 *
 *   npm install --prefix /tmp/nr5 --no-package-lock node-red@5
 *   node dist/scripts/check-node-loads.js --package-dir \
 *     /tmp/compat/node_modules/@runnane/node-red-contrib-easee \
 *     --node-red-dir /tmp/nr5
 *
 * --node-red-dir takes the npm --prefix directory (the one holding
 * node_modules/node-red), not the node-red package directory itself — Node's
 * own require.resolve() paths option walks up from there looking for
 * node_modules, the same way it would from a real caller sitting in that
 * directory.
 *
 * Note that requiring the node factory with a bare `require("node-red/lib/red")`
 * does not work: on an uninitialised runtime `RED.runtime.log` is undefined and
 * `registerType` throws. The runtime has to be booted, which is what
 * node-red-node-test-helper does here.
 */

import fs from "node:fs";
import path from "node:path";
import type { NodeInitializer } from "node-red";
import helper from "node-red-node-test-helper";

/**
 * The node type names are a frozen compatibility surface: they are written into
 * every saved flow, and a renamed or missing one silently breaks a user's flow on
 * upgrade (see .agents/compatibility.md). So the check insists on exactly these.
 */
const EXPECTED_NODE_TYPES = ["charger-streaming-client", "easee-configuration", "easee-rest-client"];

function parseDirFlag(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`${flag} requires a directory argument`);
  }
  return path.resolve(value);
}

function parsePackageDir(argv: string[]): string {
  // dist/scripts/check-node-loads.js → the package root is two levels up.
  return parseDirFlag(argv, "--package-dir") ?? path.resolve(__dirname, "..", "..");
}

/**
 * Resolve the node-red runtime to boot. Defaults to this repo's own
 * devDependency; --node-red-dir points at a separately installed node-red
 * (see the module doc comment above) so the same check can be run against a
 * Node-RED major this repo does not depend on.
 */
function resolveNodeRedRuntimePath(argv: string[]): string {
  const nodeRedDir = parseDirFlag(argv, "--node-red-dir");
  return nodeRedDir ? require.resolve("node-red", { paths: [nodeRedDir] }) : require.resolve("node-red");
}

/** Read `node-red.nodes` from the package, failing loudly if it is not usable. */
function readNodeFiles(packageDir: string): Record<string, string> {
  const manifestPath = path.join(packageDir, "package.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    "node-red"?: { nodes?: Record<string, unknown> };
  };
  const nodes = manifest["node-red"]?.nodes;
  if (!nodes || typeof nodes !== "object" || Object.keys(nodes).length === 0) {
    throw new Error(`${manifestPath} has no "node-red.nodes" block — Node-RED would register nothing`);
  }

  const registered = Object.keys(nodes).sort();
  if (registered.join(",") !== EXPECTED_NODE_TYPES.join(",")) {
    throw new Error(
      `"node-red.nodes" registers [${registered.join(", ")}], expected exactly ` +
        `[${EXPECTED_NODE_TYPES.join(", ")}]. Node type names are a compatibility surface.`,
    );
  }

  const files: Record<string, string> = {};
  for (const [type, file] of Object.entries(nodes)) {
    if (typeof file !== "string" || file === "") {
      throw new Error(`"node-red.nodes"."${type}" is not a file path`);
    }
    files[type] = file;
  }
  return files;
}

function loadNode(nodeModule: NodeInitializer): Promise<void> {
  // An empty flow registers the node type without instantiating it, so the
  // check never opens a socket or authenticates against the Easee API.
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out after 20000ms")), 20000);
    try {
      helper.load(nodeModule, [], () => {
        clearTimeout(timer);
        resolve();
      });
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const packageDir = parsePackageDir(argv);
  console.log(`Checking Node-RED compatibility of ${packageDir}`);

  const nodeFiles = readNodeFiles(packageDir);

  const runtimePath = resolveNodeRedRuntimePath(argv);
  const runtimePackage = JSON.parse(
    fs.readFileSync(path.join(path.dirname(runtimePath), "..", "package.json"), "utf8"),
  ) as {
    version?: string;
  };
  console.log(`Against node-red ${runtimePackage.version ?? "(unknown version)"} (${runtimePath})`);

  helper.init(runtimePath);

  const failures: { nodeFile: string; error: unknown }[] = [];
  for (const nodeFile of Object.values(nodeFiles)) {
    const nodePath = path.join(packageDir, nodeFile);
    try {
      const nodeModule: unknown = require(nodePath);
      if (typeof nodeModule !== "function") {
        throw new Error(`expected the module to export a function, got ${typeof nodeModule}`);
      }
      await loadNode(nodeModule as NodeInitializer);
      console.log(`  ok   ${nodeFile}`);
    } catch (error) {
      failures.push({ nodeFile, error });
      console.error(`  FAIL ${nodeFile}: ${messageOf(error)}`);
    } finally {
      await helper.unload();
    }
  }

  const total = Object.keys(nodeFiles).length;
  if (failures.length > 0) {
    console.error(`\n${failures.length} of ${total} nodes failed to load.`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nAll ${total} nodes loaded successfully.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
