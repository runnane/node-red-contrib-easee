/**
 * Provenance for the node-red runtime the helper-based suite actually boots
 * (EASEE-41). A green run only proves *some* runtime loaded; when a leg sets
 * EASEE_NODE_RED_EXPECT_MAJOR (see `pnpm test:node-red-5`), this pins the
 * resolved version's major against it, so a broken EASEE_NODE_RED_PATH
 * resolution that silently falls back to the node-red 4 devDependency
 * cannot pass as node-red 5 coverage.
 */
import { describe, expect, it } from "vitest";
import { resolveNodeRedVersion } from "../helpers/node-red-runtime.js";

describe("node-red runtime provenance", () => {
  it("resolves a real node-red version", () => {
    const version = resolveNodeRedVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("boots the major version EASEE_NODE_RED_EXPECT_MAJOR names, when set", () => {
    const expectedMajor = process.env.EASEE_NODE_RED_EXPECT_MAJOR;
    if (!expectedMajor) {
      // No expectation configured — the default node-red 4 leg, or a plain
      // local `pnpm test` — so there is nothing to pin against.
      return;
    }
    const version = resolveNodeRedVersion();
    const actualMajor = version.split(".")[0];
    expect(actualMajor).toBe(expectedMajor);
  });
});
