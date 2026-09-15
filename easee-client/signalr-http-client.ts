/**
 * The HTTP client the streaming node hands SignalR (EASEE-35, GitHub #12 and #62).
 *
 * SignalR's own Node client, FetchHttpClient, does `require("tough-cookie")` without
 * declaring tough-cookie as a dependency, and passes that jar to fetch-cookie, which
 * calls the promise API only tough-cookie >= 4 has. Which tough-cookie the require
 * finds depends on what else npm hoisted into the Node-RED user directory: another
 * contrib package bringing tough-cookie 2.x or 3.x (via `request`, commonly) makes
 * every negotiation fail with
 *
 *   Failed to complete negotiation with the server:
 *   TypeError: Cannot read properties of undefined (reading 'secure')
 *
 * Measured with SignalR 9.0.19: tough-cookie 2.5.0 and 3.0.1 hoisted beside it fail
 * exactly so; 4.1.4 and 5.1.2 negotiate. SignalR 10.0.11 has the same require.
 * Declaring tough-cookie ourselves would not help: npm nests our copy when another
 * version already sits at the top, and SignalR still resolves that one.
 *
 * Passing `httpClient` to withUrl() means SignalR never constructs its default
 * client, so nothing requires tough-cookie at all. This one uses Node's global fetch
 * (Node >= 18, which `engines` already requires) and keeps a small per-host cookie
 * store, so a load balancer's affinity cookie set during negotiation still reaches
 * the WebSocket — SignalR reads it back through getCookieString().
 */
import { AbortError, HttpClient, HttpError, type HttpRequest, HttpResponse, TimeoutError } from "@microsoft/signalr";

interface StoredCookie {
  value: string;
  secure: boolean;
}

/**
 * Split a combined `Set-Cookie` header into one entry per cookie. Only used where
 * Headers.getSetCookie() is missing (Node 18 before 18.14.1); a plain split on ","
 * would break inside `Expires=Wed, 21 Oct 2015 …`.
 */
export function splitSetCookieHeader(combined: string | null): string[] {
  if (!combined) {
    return [];
  }
  return combined.split(/,(?=\s*[^;,=\s]+=)/).map((entry) => entry.trim());
}

function parseUrl(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

export class EaseeSignalRHttpClient extends HttpClient {
  /** hostname → cookie name → cookie. Host-only: Domain and Path are not honoured. */
  private readonly cookies = new Map<string, Map<string, StoredCookie>>();

  override async send(request: HttpRequest): Promise<HttpResponse> {
    if (request.abortSignal?.aborted) {
      throw new AbortError();
    }
    if (!request.method) {
      throw new Error("No method defined.");
    }
    if (!request.url) {
      throw new Error("No url defined.");
    }
    if (request.responseType && request.responseType !== "text" && request.responseType !== "arraybuffer") {
      throw new Error(`${request.responseType} is not supported.`);
    }

    const abortController = new AbortController();
    // Set when the abort was ours, so the fetch rejection is reported as what caused it.
    let error: Error | undefined;
    if (request.abortSignal) {
      request.abortSignal.onabort = () => {
        abortController.abort();
        error = new AbortError();
      };
    }
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (request.timeout) {
      timeoutId = setTimeout(() => {
        abortController.abort();
        error = new TimeoutError();
      }, request.timeout);
    }

    const body = request.content === "" ? undefined : request.content;
    const headers: Record<string, string> = { "X-Requested-With": "XMLHttpRequest", ...request.headers };
    if (body !== undefined) {
      headers["Content-Type"] = typeof body === "string" ? "text/plain;charset=UTF-8" : "application/octet-stream";
    }
    const cookie = this.getCookieString(request.url);
    if (cookie) {
      headers.Cookie = cookie;
    }

    let response: Response;
    try {
      response = await fetch(request.url, {
        body,
        headers,
        method: request.method,
        redirect: "follow",
        signal: abortController.signal,
      });
    } catch (e) {
      throw error ?? e;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (request.abortSignal) {
        request.abortSignal.onabort = null;
      }
    }

    // Cookies set on an intermediate redirect are not seen: fetch follows it
    // internally. SignalR's negotiate redirect is a 200 with a URL in the body.
    this.storeCookies(response.url || request.url, response.headers);

    if (!response.ok) {
      const message = await response.text();
      throw new HttpError(message || response.statusText, response.status);
    }
    const content = request.responseType === "arraybuffer" ? await response.arrayBuffer() : await response.text();
    return new HttpResponse(response.status, response.statusText, content);
  }

  override getCookieString(url: string): string {
    const target = parseUrl(url);
    const jar = target && this.cookies.get(target.hostname);
    if (!target || !jar) {
      return "";
    }
    const secureChannel = target.protocol === "https:" || target.protocol === "wss:";
    return [...jar]
      .filter(([, stored]) => secureChannel || !stored.secure)
      .map(([name, stored]) => `${name}=${stored.value}`)
      .join("; ");
  }

  private storeCookies(url: string, headers: Headers): void {
    const target = parseUrl(url);
    if (!target) {
      return;
    }
    const lines =
      typeof headers.getSetCookie === "function"
        ? headers.getSetCookie()
        : splitSetCookieHeader(headers.get("set-cookie"));

    for (const line of lines) {
      const [pair, ...attributes] = line.split(";");
      const separator = pair.indexOf("=");
      if (separator <= 0) {
        continue;
      }
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();

      let secure = false;
      let maxAge: number | undefined;
      let expires: number | undefined;
      for (const attribute of attributes) {
        const [rawKey, ...rest] = attribute.split("=");
        const key = rawKey.trim().toLowerCase();
        const attributeValue = rest.join("=").trim();
        if (key === "secure") {
          secure = true;
        } else if (key === "max-age" && attributeValue !== "" && !Number.isNaN(Number(attributeValue))) {
          maxAge = Number(attributeValue);
        } else if (key === "expires" && !Number.isNaN(Date.parse(attributeValue))) {
          expires = Date.parse(attributeValue);
        }
      }
      // Max-Age wins over Expires (RFC 6265 §5.3); either in the past deletes.
      const expired = maxAge !== undefined ? maxAge <= 0 : expires !== undefined && expires <= Date.now();

      let jar = this.cookies.get(target.hostname);
      if (expired) {
        jar?.delete(name);
        continue;
      }
      if (!jar) {
        jar = new Map();
        this.cookies.set(target.hostname, jar);
      }
      jar.set(name, { value, secure });
    }
  }
}
