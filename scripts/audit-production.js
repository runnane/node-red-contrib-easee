#!/usr/bin/env node
/**
 * Blocking security audit for the dependencies that actually ship.
 *
 * `npm audit --audit-level=moderate` fails on any advisory anywhere in the
 * tree, including devDependencies that never reach a user. That is why the
 * Security Audit job was red on main continuously from 2025-09-13 to 2026-08-30
 * (EASEE-9) — and why a genuine high-severity advisory in the one production
 * dependency sat unread inside the noise for months (EASEE-8).
 *
 * So this checks `--omit=dev` only: the tree an npm consumer installs. That is
 * small enough to hold at zero, which is what makes a red run mean something.
 *
 * npm has no native way to accept a known advisory, so the allowlist below is
 * it. Two rules keep it from rotting:
 *
 *   1. An advisory that is NOT allowlisted fails the build.
 *   2. An allowlist entry that matches nothing ALSO fails the build, so an
 *      entry that upstream has fixed must be deleted rather than left to
 *      accumulate.
 *
 * The `review` date is deliberately NOT enforced. A gate that goes red on a
 * calendar day with no change to the code is exactly the unreadable-signal
 * failure this script exists to remove; the date is documentation for whoever
 * reads the output.
 */

const { spawnSync } = require("child_process");

const SEVERITY_ORDER = ["info", "low", "moderate", "high", "critical"];
const MINIMUM_SEVERITY = "moderate";

/**
 * Advisories accepted as known risk. Every entry needs a reason and an issue
 * key — an unexplained entry is indistinguishable from someone silencing a
 * failure, which is the thing this file is trying to prevent.
 */
const ALLOWLIST = [
  {
    id: "GHSA-96hv-2xvq-fx4p",
    package: "ws",
    issue: "EASEE-8",
    review: "2026-11-30",
    reason:
      "ws memory-exhaustion DoS, reached via @microsoft/signalr. Not fixable " +
      "from this repo: every published @microsoft/signalr up to 10.0.11 " +
      "declares ws ^7.5.10, and 7.5.10 is both the highest 7.x and the top of " +
      "the vulnerable range, so no bump clears it and npm audit fix cannot " +
      "either. Exposure is limited: the socket is an outbound client " +
      "connection to Easee's SignalR endpoint, not a listening server, so " +
      "reaching it requires a malicious or compromised upstream rather than " +
      "arbitrary internet traffic. EASEE-8 tracks forcing ws@8 via overrides, " +
      "which needs real transport testing before it can ship."
  }
];

function meetsMinimumSeverity(severity) {
  return (
    SEVERITY_ORDER.indexOf(severity) >= SEVERITY_ORDER.indexOf(MINIMUM_SEVERITY)
  );
}

function advisoryId(url) {
  const match = /GHSA-[0-9a-z-]+/i.exec(url || "");
  return match ? match[0] : null;
}

function runAudit() {
  // npm audit exits non-zero whenever it finds anything, so the exit code is
  // not an error signal here — the JSON on stdout is what matters.
  const result = spawnSync("npm", ["audit", "--json", "--omit=dev"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });

  if (result.error) {
    throw new Error(`could not run npm audit: ${result.error.message}`);
  }
  if (!result.stdout) {
    throw new Error(
      `npm audit produced no output (exit ${result.status}): ${result.stderr}`
    );
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`could not parse npm audit output: ${error.message}`);
  }
}

/** Flatten the report into one entry per distinct advisory. */
function collectAdvisories(report) {
  const vulnerabilities = report.vulnerabilities || {};
  const found = new Map();

  for (const vulnerability of Object.values(vulnerabilities)) {
    for (const via of vulnerability.via || []) {
      // `via` holds advisory objects for direct causes and plain package-name
      // strings for transitive ones; only the objects carry an advisory.
      if (typeof via !== "object" || !via.url) {
        continue;
      }
      if (!meetsMinimumSeverity(via.severity)) {
        continue;
      }
      const id = advisoryId(via.url);
      if (id && !found.has(id)) {
        found.set(id, {
          id,
          package: via.name,
          severity: via.severity,
          title: via.title,
          url: via.url
        });
      }
    }
  }

  return [...found.values()];
}

function main() {
  const report = runAudit();
  const advisories = collectAdvisories(report);
  const allowedIds = new Set(ALLOWLIST.map((entry) => entry.id));

  const blocking = advisories.filter((a) => !allowedIds.has(a.id));
  const accepted = advisories.filter((a) => allowedIds.has(a.id));
  const foundIds = new Set(advisories.map((a) => a.id));
  const stale = ALLOWLIST.filter((entry) => !foundIds.has(entry.id));

  console.log(
    `Production dependency audit (--omit=dev), minimum severity ${MINIMUM_SEVERITY}.`
  );
  console.log(
    `${advisories.length} advisor${advisories.length === 1 ? "y" : "ies"} found, ` +
      `${accepted.length} accepted, ${blocking.length} blocking.\n`
  );

  for (const entry of accepted) {
    const allowed = ALLOWLIST.find((a) => a.id === entry.id);
    console.log(
      `  ACCEPTED  ${entry.severity.padEnd(8)} ${entry.package} — ${entry.id}`
    );
    console.log(`            tracked by ${allowed.issue}, review ${allowed.review}`);
  }

  for (const entry of blocking) {
    console.error(
      `  BLOCKING  ${entry.severity.padEnd(8)} ${entry.package} — ${entry.title}`
    );
    console.error(`            ${entry.url}`);
  }

  for (const entry of stale) {
    console.error(
      `  STALE     allowlist entry ${entry.id} (${entry.package}) matches nothing`
    );
    console.error(
      "            Upstream appears to have fixed it — delete the entry " +
        `and close ${entry.issue}.`
    );
  }

  if (blocking.length > 0 || stale.length > 0) {
    console.error(
      "\nProduction audit failed. Fix the advisory, or add it to ALLOWLIST in " +
        "this file with a reason and a tracking issue."
    );
    process.exitCode = 1;
    return;
  }

  console.log("\nNo unaccepted advisories in the shipped dependency tree.");
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
