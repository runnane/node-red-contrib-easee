/**
 * Keeps `pnpm audit` able to see the whole dependency tree (EASEE-48).
 *
 * pnpm builds its audit request from the lockfile and keys every node of that
 * request by PACKAGE NAME, not by the alias a manifest installed it under. So
 * an npm-alias devDependency (`"node-red-5": "npm:node-red@^5"`) beside
 * `node-red` is two entries with one key: the second overwrites the first, and
 * the overwritten line's whole subtree never leaves the machine. Measured on
 * pnpm 10.34.5 while node-red 5 was installed that way (EASEE-41): the request
 * carried 227 of the lockfile's 484 packages, and a `multer` pinned to a
 * version with a published advisory audited clean. Moving node-red 5 into its
 * own workspace package (`tests/node-red-5`) gives it its own importer key, and
 * the same request carries all 484.
 *
 * Nothing else would notice a regression: the audit simply reports fewer
 * packages and "No known vulnerabilities found". Hence this guard on the
 * manifests themselves.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

type Manifest = Record<string, unknown> & {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "optionalDependencies"] as const;

function readManifest(dir: string): Manifest {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, dir, "package.json"), "utf8")) as Manifest;
}

/** The `packages:` entries of pnpm-workspace.yaml — plain paths, one per `  - ` line. */
function workspacePackageDirs(): string[] {
  const lines = fs.readFileSync(path.join(REPO_ROOT, "pnpm-workspace.yaml"), "utf8").split("\n");
  const start = lines.findIndex((line) => line.trim() === "packages:");
  if (start === -1) {
    throw new Error("pnpm-workspace.yaml has no `packages:` list");
  }
  const dirs: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const match = /^\s+-\s+['"]?([^'"#\s]+)['"]?\s*$/.exec(line);
    if (!match) {
      break;
    }
    dirs.push(match[1]);
  }
  return dirs;
}

describe("pnpm audit sees the whole tree (EASEE-48)", () => {
  const manifests = [".", ...workspacePackageDirs()].map((dir) => ({ dir, manifest: readManifest(dir) }));

  test("the workspace includes the node-red 5 test package", () => {
    expect(workspacePackageDirs()).toContain("tests/node-red-5");
  });

  test("no manifest installs a package under an npm alias", () => {
    const aliases = manifests.flatMap(({ dir, manifest }) =>
      DEPENDENCY_FIELDS.flatMap((field) =>
        Object.entries(manifest[field] ?? {})
          .filter(([, spec]) => spec.startsWith("npm:"))
          .map(([name, spec]) => `${dir}/package.json ${field}.${name} = ${spec}`),
      ),
    );
    expect(aliases).toEqual([]);
  });

  test("the node-red 5 test package installs node-red 5 as a devDependency only", () => {
    const manifest = readManifest("tests/node-red-5");
    // A `dependencies` entry would pull node-red 5's tree into `pnpm audit --prod`,
    // which is meant to be exactly what a consumer of this package installs.
    expect(manifest.dependencies ?? {}).toEqual({});
    expect(manifest.devDependencies?.["node-red"]).toMatch(/^\^5\./);
  });
});
