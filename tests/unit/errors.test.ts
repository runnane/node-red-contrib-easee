/**
 * The error classifier and reporter shared by the three nodes (EASEE-26), for
 * the shapes the real-node tests in tests/integration/error-messages.test.ts do
 * not reach: SignalR's `statusCode`, untagged errors, non-Error values, and
 * tags that must not be overwritten.
 */

import { describe, expect, it, vi } from "vitest";
import {
  categorizedError,
  classifyError,
  describeError,
  httpStatusError,
  redactSecrets,
  reportError,
  tagError,
} from "../../easee-client/errors.js";

describe("classifyError", () => {
  it("treats 400/401/403 from login as credentials, any other status as api, and no status as unknown", () => {
    expect(classifyError(httpStatusError("x", 400))).toBe("credentials");
    expect(classifyError(httpStatusError("x", 401))).toBe("credentials");
    expect(classifyError(httpStatusError("x", 403))).toBe("credentials");
    expect(classifyError(httpStatusError("x", 503))).toBe("api");
    expect(classifyError(new Error("x"))).toBe("unknown");
    expect(classifyError("a string")).toBe("unknown");
    expect(classifyError(null)).toBe("unknown");
  });

  it("reads SignalR's statusCode like status", () => {
    expect(classifyError(Object.assign(new Error("Unauthorized"), { statusCode: 401 }))).toBe("credentials");
    expect(classifyError(Object.assign(new Error("Not Found"), { statusCode: 404 }))).toBe("api");
  });

  it("lets an explicit tag win over the status", () => {
    expect(classifyError(categorizedError("x", "api", { status: 401 }))).toBe("api");
  });
});

describe("tagError", () => {
  it("tags in place, keeping the message and identity, and never overwrites an existing tag", () => {
    const error = new Error("fetch failed");
    expect(tagError(error, "network")).toBe(error);
    expect(error.message).toBe("fetch failed");
    expect(classifyError(error)).toBe("network");
    tagError(error, "api");
    expect(classifyError(error)).toBe("network");
  });

  it("passes a non-object through untouched", () => {
    expect(tagError("text", "network")).toBe("text");
  });
});

describe("describeError", () => {
  it("gives each category its status text and hint", () => {
    expect(describeError(categorizedError("x", "network"))).toMatchObject({
      statusText: "Easee unreachable – retrying",
    });
    expect(describeError(categorizedError("x", "config")).statusText).toBe("No configuration node");
    expect(describeError(categorizedError("x", "input")).statusText).toBe("Invalid input");
    expect(describeError(categorizedError("x", "api")).statusText).toBe("API error");
    expect(describeError(categorizedError("x", "api", { status: 429 })).message).toBe(
      "x. Easee is rate-limiting requests; send them less often.",
    );
    expect(describeError(categorizedError("x", "api", { status: 500 })).message).toContain("server error");
    expect(describeError(categorizedError("x", "api", { status: 401 })).message).toContain("Re-login");
    expect(describeError(categorizedError("x", "api", { status: 409 })).message).toContain("check the request");
  });

  it("uses an unknown error's own text as the status, shortened", () => {
    expect(describeError("Disconnected")).toEqual({
      category: "unknown",
      statusText: "Disconnected",
      message: "Disconnected",
    });
    expect(describeError("y".repeat(80)).statusText).toBe(`${"y".repeat(57)}...`);
  });

  it("includes the cause, and reads the text of non-Error values", () => {
    const error = categorizedError("request did not complete", "network", { cause: new Error("ECONNREFUSED") });
    expect(describeError(error).message).toMatch(
      /^request did not complete \(ECONNREFUSED\)\. Easee could not be reached/,
    );
    expect(describeError({ message: "plain object" }).message).toBe("plain object");
    expect(describeError({ code: 7 }).message).toBe('{"code":7}');
    expect(describeError(42).message).toBe("42");
  });

  it("redacts secrets from both the message and the status text", () => {
    const description = describeError("token abc123 leaked", { secrets: ["abc123", "", null] });
    expect(description.message).toBe("token [redacted] leaked");
    expect(description.statusText).toBe("token [redacted] leaked");
  });
});

describe("redactSecrets", () => {
  it("replaces every occurrence of each non-empty string secret", () => {
    expect(redactSecrets("a-s3cret-b-s3cret", ["s3cret", undefined, false])).toBe("a-[redacted]-b-[redacted]");
  });
});

describe("reportError", () => {
  it("passes the msg to node.error() when there is one, and merges status extras", () => {
    const node = { error: vi.fn(), status: vi.fn() };
    const msg = { _msgid: "m1" };

    reportError(node, "Doing it", categorizedError("x", "network"), { msg, statusExtra: { event: "error" } });

    expect(node.error).toHaveBeenCalledWith(
      "[easee] Doing it: x. Easee could not be reached; check this machine's network connection. It will retry.",
      msg,
    );
    expect(node.status).toHaveBeenCalledWith({
      fill: "red",
      shape: "ring",
      text: "Easee unreachable – retrying",
      event: "error",
    });
  });

  it("calls node.error() with the text alone when there is no msg", () => {
    const node = { error: vi.fn(), status: vi.fn() };

    reportError(node, "Doing it", "plain");

    expect(node.error).toHaveBeenCalledWith("[easee] Doing it: plain");
    expect(node.error.mock.calls[0]).toHaveLength(1);
  });
});
