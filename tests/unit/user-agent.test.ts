/**
 * The User-Agent sent on every Easee REST and SignalR request (EASEE-27).
 *
 * readPackageVersion() has to resolve correctly from two different directory
 * depths relative to the package root — easee-client/ (source, one level down)
 * and dist/easee-client/ (built, still one level down but a different tree) —
 * and, most importantly, from dist/easee-client/'s OWN `__dirname` once loaded
 * as a real module, which is the shape gate 5 and every published tarball
 * actually run. `pnpm gates` runs `pnpm build` before the tests, so dist/
 * exists by the time this runs; run `pnpm build` first if running this file
 * alone.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { buildUserAgent, readPackageVersion } from "../../easee-client/user-agent.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const REAL_VERSION = (JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as { version: string }).version;

describe("readPackageVersion", () => {
  it("finds the real version walking up from the source directory (easee-client/)", () => {
    expect(readPackageVersion(join(REPO_ROOT, "easee-client"))).toBe(REAL_VERSION);
  });

  it("finds the real version walking up from the built directory (dist/easee-client/)", () => {
    expect(readPackageVersion(join(REPO_ROOT, "dist", "easee-client"))).toBe(REAL_VERSION);
  });

  it('falls back to "unknown" rather than throwing when no ancestor package.json matches', () => {
    // The filesystem root has no package.json named @runnane/node-red-contrib-easee
    // (and may have no package.json at all) — either way this must not throw.
    expect(readPackageVersion("/")).toBe("unknown");
  });
});

describe("buildUserAgent", () => {
  it("includes the real package version, the given Node-RED version, and the Node.js version", () => {
    const ua = buildUserAgent({ version: "4.1.15" }, join(REPO_ROOT, "easee-client"));
    expect(ua).toBe(`node-red-contrib-easee/${REAL_VERSION} (Node-RED/4.1.15; Node/${process.version})`);
  });

  it("calls RED.version() when it is a function, matching the real per-node RED API", () => {
    // The object a node's factory function actually receives exposes `version`
    // as a function reference (see readRedVersion's comment in user-agent.ts,
    // and node_modules/@node-red/registry/lib/util.js's createNodeApi), not as
    // a string — unlike what @types/node-red declares for a different RED
    // object. This is the shape that matters in production.
    const ua = buildUserAgent({ version: () => "5.1.2" }, join(REPO_ROOT, "easee-client"));
    expect(ua).toBe(`node-red-contrib-easee/${REAL_VERSION} (Node-RED/5.1.2; Node/${process.version})`);
  });

  it("falls back to Node-RED/unknown when RED has no version (older runtimes, test mocks)", () => {
    const ua = buildUserAgent({}, join(REPO_ROOT, "easee-client"));
    expect(ua).toContain("(Node-RED/unknown; Node/");
  });

  it("falls back to Node-RED/unknown when RED itself is undefined", () => {
    const ua = buildUserAgent(undefined, join(REPO_ROOT, "easee-client"));
    expect(ua).toContain("(Node-RED/unknown; Node/");
  });

  it("never throws when RED.version is a getter that throws", () => {
    const hostile = {
      get version(): string {
        throw new Error("boom");
      },
    };
    expect(() => buildUserAgent(hostile, join(REPO_ROOT, "easee-client"))).not.toThrow();
  });

  it("contains no username, credential or other user-identifying data", () => {
    const ua = buildUserAgent({ version: "4.1.15" }, join(REPO_ROOT, "easee-client"));
    // The synthetic fixtures' own credential shapes, as a sanity check that
    // nothing from a node's configuration ever reaches this string.
    expect(ua).not.toContain("@");
    expect(ua.toLowerCase()).not.toContain("password");
    expect(ua.toLowerCase()).not.toContain("username");
  });
});

describe("buildUserAgent loaded from the built dist output", () => {
  const distEntry = join(REPO_ROOT, "dist", "easee-client", "user-agent.js");

  it("resolves the real version using its own __dirname once required from dist/", async () => {
    if (!existsSync(distEntry)) {
      throw new Error(`${distEntry} does not exist — run \`pnpm build\` first (pnpm gates does this itself).`);
    }
    // A real import of the compiled file, exactly as easee-configuration.js and
    // charger-streaming-client.js require it at load time — no startDir override,
    // so this exercises the emitted module's own `__dirname`. The specifier is
    // built from a runtime file URL rather than written as a literal, because a
    // literal "../../dist/..." specifier sends tsc looking for dist/'s (never
    // emitted) declaration files and fails typecheck even though dist/ is
    // excluded from tsconfig.json's `include`.
    const dist = (await import(pathToFileURL(distEntry).href)) as typeof import("../../easee-client/user-agent.js");
    const ua = dist.buildUserAgent({ version: "4.1.15" });
    expect(ua).toBe(`node-red-contrib-easee/${REAL_VERSION} (Node-RED/4.1.15; Node/${process.version})`);
  });
});
