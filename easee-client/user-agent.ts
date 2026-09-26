/**
 * MIT License
 *
 * Copyright (c) 2025 Jon Tungland
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 **/
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * The User-Agent this package sends on every Easee REST and SignalR request
 * (EASEE-27), so Easee can attribute misbehaving traffic — or a sunset endpoint,
 * as with EASEE-13 — to this package and version instead of to anonymous
 * Node.js `fetch`/SignalR.
 *
 * Nothing user-identifying goes in this string: no username, host name, or
 * charger id. Only the package name/version, the Node-RED runtime version and
 * the Node.js version.
 */

/** The scoped name this package publishes under (package.json's own "name"). */
const PACKAGE_NAME = "@runnane/node-red-contrib-easee";
/** The unscoped product token used in the User-Agent string itself. */
const PRODUCT_NAME = "node-red-contrib-easee";

/**
 * Read this package's own version from its package.json, by walking up from a
 * starting directory until one is found whose "name" matches.
 *
 * This has to walk rather than use a fixed relative path because the shipped
 * file lives at `dist/easee-client/user-agent.js` (two directories below the
 * package root, which also holds package.json when installed from npm) while
 * tests run the source `easee-client/user-agent.ts` directly (one directory
 * below the same root) — a single hard-coded `../package.json` or
 * `../../package.json` is right for exactly one of those two shapes.
 *
 * Exported for the unit test; falls back to "unknown" rather than throwing, so
 * a request is never blocked by a User-Agent that could not resolve.
 */
export function readPackageVersion(startDir: string): string {
  let dir = startDir;
  // Bounded so an unrelated ancestor package.json (an enclosing workspace, an
  // npm store, ...) is never mistaken for this package's own.
  for (let i = 0; i < 8; i++) {
    try {
      const raw = readFileSync(join(dir, "package.json"), "utf8");
      const pkg = JSON.parse(raw) as { name?: string; version?: string };
      if (pkg.name === PACKAGE_NAME) {
        return pkg.version || "unknown";
      }
    } catch {
      // No package.json at this level, or it did not parse as JSON with the
      // shape expected — keep walking up.
    }
    const parent = dirname(dir);
    if (parent === dir) {
      // Reached the filesystem root without finding it.
      break;
    }
    dir = parent;
  }
  return "unknown";
}

/**
 * Read the Node-RED runtime version off the RED API object handed to every
 * node's factory function.
 *
 * `RED.version` is a FUNCTION on the object nodes actually receive, not a
 * string — verified against the running code, not just its published types:
 * `@node-red/registry`'s `createNodeApi()` sets `version: runtime.version`,
 * where `@node-red/runtime` exports `version: getVersion` (a function
 * reference, never invoked at that point); `node-red-node-test-helper` itself
 * calls it as `RED.version()`. @types/node-red's `readonly version: string`
 * describes a *different* RED object (the one `require("node-red")` returns
 * for the admin HTTP API) and does not apply to what a node factory receives
 * — hence `RED` is typed `unknown` here rather than trusted against that
 * declaration.
 *
 * A string is still accepted, in case a future runtime or an embedder exposes
 * it that way, and `RED.version` is entirely absent in some environments —
 * measured directly: node-red-node-test-helper's own `helper.load()` boots
 * node modules against a fabricated `mockRuntime` that never sets `version`
 * at all, so every test in this repo that loads a node through it sees
 * "Node-RED/unknown" here, correctly. Nothing in this function is allowed to
 * throw.
 */
function readRedVersion(RED: unknown): string {
  try {
    const candidate = (RED as { version?: unknown } | undefined)?.version;
    if (typeof candidate === "function") {
      const result = (candidate as () => unknown).call(RED);
      if (result) {
        return String(result);
      }
    } else if (typeof candidate === "string" && candidate) {
      return candidate;
    }
  } catch {
    // A misbehaving RED.version must never break the User-Agent, or the
    // request it is attached to.
  }
  return "unknown";
}

/**
 * Build the User-Agent string this package sends on every request:
 * `node-red-contrib-easee/<version> (Node-RED/<redVersion>; Node/<node version>)`.
 *
 * `RED` is whatever the node's factory function received as its `RED: NodeAPI`
 * parameter; it is read defensively (see readRedVersion) since older runtimes
 * and test mocks may not carry a `version` at all.
 */
export function buildUserAgent(RED: unknown, startDir: string = __dirname): string {
  const version = readPackageVersion(startDir);
  const redVersion = readRedVersion(RED);
  return `${PRODUCT_NAME}/${version} (Node-RED/${redVersion}; Node/${process.version})`;
}
