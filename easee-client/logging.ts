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
import type { LogFn } from "./types";

/**
 * Logging plumbing shared by the three nodes (EASEE-29).
 *
 * Every line goes to Node-RED's own per-node logger (`node.log()`,
 * `node.debug()`, `node.warn()`, `node.error()`), never straight to `console`.
 * That logger honours the runtime's `logging.console.level` in settings.js and
 * tags each line with the node's type, id and name.
 */

/** The subset of a Node-RED node the logging helpers write to. */
export interface NodeLogger {
  log(msg: string): void;
  debug(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

/** The four helpers each node exposes as logInfo/logDebug/logError/logWarn. */
export interface LogHelpers {
  logInfo: LogFn;
  logDebug: LogFn;
  logError: LogFn;
  logWarn: LogFn;
}

/**
 * Append `data` to `message` as one string: Node-RED's logger takes a single
 * value, where `console.log(message, data)` took two. `null`/`undefined` mean
 * "no data"; an Error contributes its message; an object is JSON, falling back
 * to String() for one JSON cannot encode (a cycle, a BigInt).
 */
export function formatLogMessage(message: string, data: unknown): string {
  if (data === null || data === undefined) {
    return message;
  }
  if (data instanceof Error) {
    return `${message} ${data.message}`;
  }
  if (typeof data === "object") {
    try {
      return `${message} ${JSON.stringify(data)}`;
    } catch {
      return `${message} ${String(data)}`;
    }
  }
  return `${message} ${String(data)}`;
}

/**
 * The helpers a REST or streaming node uses when its configuration node supplies
 * none (it is missing, or is not a real easee-configuration node): the node's
 * own Node-RED logger, with debug output gated on `isDebugEnabled()`, which is
 * read on every call so a flag change is honoured.
 */
export function createFallbackLogHelpers(node: NodeLogger, isDebugEnabled: () => boolean): LogHelpers {
  return {
    logInfo: (msg, data) => {
      node.log(formatLogMessage(`[easee] ${msg}`, data));
    },
    logDebug: (msg, data) => {
      if (isDebugEnabled()) {
        node.debug(formatLogMessage(`[easee] DEBUG: ${msg}`, data));
      }
    },
    logError: (msg, error) => {
      node.error(formatLogMessage(`[easee] ERROR: ${msg}`, error));
    },
    logWarn: (msg, data) => {
      node.warn(formatLogMessage(`[easee] WARN: ${msg}`, data));
    },
  };
}
