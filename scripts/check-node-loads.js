#!/usr/bin/env node
/**
 * Node-RED compatibility check.
 *
 * Loads every node this package registers into a real Node-RED runtime and
 * fails if any of them cannot be registered. This catches the "package
 * installs but the node won't load" failure that the unit tests miss, because
 * they import the node factories directly rather than through the runtime.
 *
 * By default it checks the working tree. Pass --package-dir to point it at an
 * installed copy instead, which is how CI checks the packed tarball:
 *
 *   npm pack
 *   npm install --prefix /tmp/compat ./runnane-node-red-contrib-easee-*.tgz
 *   node scripts/check-node-loads.js --package-dir \
 *     /tmp/compat/node_modules/@runnane/node-red-contrib-easee
 *
 * Note that requiring the node factory with a bare `require("node-red/lib/red")`
 * does not work: on an uninitialised runtime `RED.runtime.log` is undefined and
 * `registerType` throws. The runtime has to be booted, which is what
 * node-red-node-test-helper does here.
 */

const path = require("path");
const helper = require("node-red-node-test-helper");

const NODE_FILES = [
  "easee-client/easee-configuration.js",
  "easee-client/easee-rest-client.js",
  "easee-client/charger-streaming-client.js"
];

function parsePackageDir(argv) {
  const flag = "--package-dir";
  const index = argv.indexOf(flag);
  if (index === -1) {
    return path.resolve(__dirname, "..");
  }
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`${flag} requires a directory argument`);
  }
  return path.resolve(value);
}

function loadNode(nodeModule) {
  // An empty flow registers the node type without instantiating it, so the
  // check never opens a socket or authenticates against the Easee API.
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("timed out after 20000ms")),
      20000
    );
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

async function main() {
  const packageDir = parsePackageDir(process.argv.slice(2));
  console.log(`Checking Node-RED compatibility of ${packageDir}`);

  helper.init(require.resolve("node-red"));

  const failures = [];
  for (const nodeFile of NODE_FILES) {
    const nodePath = path.join(packageDir, nodeFile);
    try {
      const nodeModule = require(nodePath);
      if (typeof nodeModule !== "function") {
        throw new Error(
          `expected the module to export a function, got ${typeof nodeModule}`
        );
      }
      await loadNode(nodeModule);
      console.log(`  ok   ${nodeFile}`);
    } catch (error) {
      failures.push({ nodeFile, error });
      console.error(`  FAIL ${nodeFile}: ${error.message}`);
    } finally {
      await helper.unload();
    }
  }

  if (failures.length > 0) {
    console.error(
      `\n${failures.length} of ${NODE_FILES.length} nodes failed to load.`
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\nAll ${NODE_FILES.length} nodes loaded successfully.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
