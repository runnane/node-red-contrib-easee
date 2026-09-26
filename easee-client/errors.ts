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

/**
 * Error classification and reporting shared by the three nodes (EASEE-26).
 *
 * Every failure a user can see is sorted into one of a few categories, each with
 * a short `node.status` text and a hint saying what the user can do about it.
 * reportError() is the one place a node turns an error into `node.error()` +
 * `node.status()`, and it passes the triggering `msg` to `node.error()` whenever
 * there is one, so a Catch node sees it.
 */

/**
 * - `credentials`: Easee rejected the username/password (400/401/403 on login or
 *   token refresh), or the stream rejected the token.
 * - `network`: no answer from Easee at all.
 * - `api`: Easee answered a specific call with a non-2xx status.
 * - `config`: this node or its configuration node is missing something
 *   (no configuration node, no username/password, no charger id…).
 * - `input`: the incoming message asks for something this node cannot do.
 * - `unknown`: anything else; reported with its own text.
 */
export type ErrorCategory = "credentials" | "network" | "api" | "config" | "input" | "unknown";

/** An Error that carries the HTTP status the Easee API answered with, if it answered at all. */
export type HttpStatusError = Error & { status?: number };

/**
 * An Error tagged with how it should be reported. `category` wins over anything
 * classifyError() would infer; `statusText` replaces the category's default
 * status text.
 */
export type EaseeError = HttpStatusError & { category?: ErrorCategory; statusText?: string; hint?: string };

export function httpStatusError(message: string, status: number): HttpStatusError {
  const error: HttpStatusError = new Error(message);
  error.status = status;
  return error;
}

/** A new Error tagged with a category (and optionally a status text and HTTP status). */
export function categorizedError(
  message: string,
  category: ErrorCategory,
  options: { statusText?: string; status?: number; hint?: string; cause?: unknown } = {},
): EaseeError {
  const error: EaseeError =
    options.cause !== undefined ? new Error(message, { cause: options.cause }) : new Error(message);
  error.category = category;
  if (options.statusText !== undefined) {
    error.statusText = options.statusText;
  }
  if (options.hint !== undefined) {
    error.hint = options.hint;
  }
  if (options.status !== undefined) {
    error.status = options.status;
  }
  return error;
}

/**
 * Tag an existing error with a category, in place, and return it. Its message,
 * type and identity are kept: callers put the same object in an output `msg`,
 * and output payloads are a compatibility surface.
 */
export function tagError(error: unknown, category: ErrorCategory): unknown {
  if (error !== null && typeof error === "object") {
    const tagged = error as { category?: ErrorCategory };
    if (tagged.category === undefined) {
      tagged.category = category;
    }
  }
  return error;
}

/**
 * True only for a definite credential rejection: `accounts/login` (or the
 * SignalR hub, which answers with `statusCode`) answered 400, 401 or 403. A
 * rejected fetch (no response), a 5xx or anything else is a transport or
 * server failure and says nothing about the credentials (EASEE-38).
 */
export function isCredentialRejection(error: unknown): boolean {
  const status = httpStatusOf(error);
  return status === 400 || status === 401 || status === 403;
}

/** The HTTP status an error carries: ours use `status`, SignalR's HttpError `statusCode`. */
function httpStatusOf(error: unknown): number | undefined {
  if (error === null || typeof error !== "object") {
    return undefined;
  }
  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
  if (typeof status === "number") {
    return status;
  }
  if (typeof statusCode === "number") {
    return statusCode;
  }
  return undefined;
}

/**
 * Sort an error into a category. An explicit tag (categorizedError / tagError)
 * wins; otherwise a credential rejection (isCredentialRejection — only ever
 * thrown untagged by login and token refresh) is `credentials`, any other HTTP
 * status is `api`, and the rest is `unknown`.
 */
export function classifyError(error: unknown): ErrorCategory {
  const tagged = (error as EaseeError | null | undefined)?.category;
  if (tagged !== undefined && error !== null && typeof error === "object") {
    return tagged;
  }
  if (isCredentialRejection(error)) {
    return "credentials";
  }
  if (httpStatusOf(error) !== undefined) {
    return "api";
  }
  return "unknown";
}

/** A REST or streaming node whose configuration node is missing (or is not an easee-configuration node). */
export function missingConfigurationError(): EaseeError {
  return categorizedError("No easee-configuration node is selected", "config", {
    statusText: "No configuration node",
    hint: "Open this node, select or add an easee-configuration node, then deploy.",
  });
}

/** A REST or streaming node whose configuration node has no username or password. */
export function incompleteConfigurationError(): EaseeError {
  return categorizedError("The easee-configuration node has no username or password", "config", {
    statusText: "Configuration incomplete",
    hint: "Open the easee-configuration node, enter both username and password, then deploy.",
  });
}

/** What reportError() puts in `node.error()` and `node.status()`. */
export interface ErrorDescription {
  category: ErrorCategory;
  /** The HTTP status Easee answered with, when there was one. */
  httpStatus?: number;
  /** A few words for `node.status()`. */
  statusText: string;
  /** What failed (the error's own, redacted text) and what the user can do. */
  message: string;
}

const CREDENTIALS_HINT = "Check the username and password in the easee-configuration node, then press Re-login there.";
const NETWORK_HINT = "Easee could not be reached; check this machine's network connection. It will retry.";
const CONFIG_HINT = "Select an easee-configuration node in this node and give it a username and password, then deploy.";

function apiHint(status: number | undefined): string {
  if (status === 401) {
    return "Easee did not accept the login for this request; press Re-login in the easee-configuration node if it persists.";
  }
  if (status === 403) {
    return "The Easee account has no access to this charger, site or circuit; check the id.";
  }
  if (status === 404) {
    return "Easee does not know this resource; check the charger, site or circuit id and the path.";
  }
  if (status === 429) {
    return "Easee is rate-limiting requests; send them less often.";
  }
  if (status !== undefined && status >= 500) {
    return "Easee had a server error; try again later.";
  }
  return "Easee rejected the request; check the request and its ids.";
}

function defaultStatusText(category: ErrorCategory, status: number | undefined, message: string): string {
  switch (category) {
    case "credentials":
      return "Login rejected – check credentials";
    case "network":
      return "Easee unreachable – retrying";
    case "api":
      return status !== undefined ? `API error ${status}` : "API error";
    case "config":
      return "No configuration node";
    case "input":
      return "Invalid input";
    default:
      return message.length > 60 ? `${message.slice(0, 57)}...` : message;
  }
}

function hintFor(category: ErrorCategory, status: number | undefined): string | null {
  switch (category) {
    case "credentials":
      return CREDENTIALS_HINT;
    case "network":
      return NETWORK_HINT;
    case "api":
      return apiHint(status);
    case "config":
      return CONFIG_HINT;
    default:
      return null;
  }
}

/** The text of an error, whatever was thrown, with its cause's when it has one. */
function errorText(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as { cause?: unknown }).cause;
    return cause instanceof Error && cause.message ? `${error.message} (${cause.message})` : error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error !== null && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

/**
 * Replace every occurrence of each non-empty secret in `text` with a marker.
 * Error texts embed Easee API response bodies, which could echo anything that
 * was sent — a username, a serial, a token.
 */
export function redactSecrets(text: string, secrets: unknown[]): string {
  let out = text;
  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length > 0) {
      out = out.split(secret).join("[redacted]");
    }
  }
  return out;
}

export interface DescribeOptions {
  /** Strings that must never appear in the result (password, tokens, username, serial). */
  secrets?: unknown[];
  /** Overrides classifyError(). */
  category?: ErrorCategory;
  /** Overrides the category's default status text. */
  statusText?: string;
  /** Overrides the category's default hint. */
  hint?: string;
}

/** Classify an error and build its user-facing message and status text. */
export function describeError(error: unknown, options: DescribeOptions = {}): ErrorDescription {
  const category = options.category ?? classifyError(error);
  const httpStatus = httpStatusOf(error);
  const secrets = options.secrets ?? [];
  const text = redactSecrets(errorText(error), secrets);
  const tags: EaseeError = error !== null && typeof error === "object" ? (error as EaseeError) : ({} as EaseeError);
  const hint = options.hint ?? tags.hint ?? hintFor(category, httpStatus);
  const statusText = redactSecrets(
    options.statusText ?? tags.statusText ?? defaultStatusText(category, httpStatus, text),
    secrets,
  );
  const message = hint ? `${text.replace(/[.\s]+$/, "")}. ${hint}` : text;
  return { category, httpStatus, statusText, message };
}

/** The subset of a Node-RED node reportError() writes to. */
export interface ErrorReportTarget {
  // biome-ignore lint/suspicious/noExplicitAny: Node-RED's own signature takes any value and an optional msg
  error(text: any, msg?: any): void;
  // biome-ignore lint/suspicious/noExplicitAny: the streaming client's status carries extra session fields
  status(status: any): void;
}

export interface ReportOptions extends DescribeOptions {
  /** The input message being handled, passed to node.error() so Catch nodes see it. */
  msg?: object | null;
  /** Extra fields merged into the status object (the streaming client's event/_session). */
  statusExtra?: Record<string, unknown>;
}

/**
 * Report a failure: one `node.error()` saying what failed and what to do,
 * with the triggering `msg` when there is one, and a red `node.status()` whose
 * text names the category. `context` says what was being attempted.
 */
export function reportError(
  node: ErrorReportTarget,
  context: string,
  error: unknown,
  options: ReportOptions = {},
): ErrorDescription {
  const description = describeError(error, options);
  const text = `[easee] ${context}: ${description.message}`;
  if (options.msg) {
    node.error(text, options.msg);
  } else {
    node.error(text);
  }
  node.status({ fill: "red", shape: "ring", text: description.statusText, ...options.statusExtra });
  return description;
}
