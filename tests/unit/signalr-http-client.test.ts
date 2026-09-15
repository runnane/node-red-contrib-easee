/**
 * The HTTP client the streaming node hands SignalR (EASEE-35).
 *
 * Driven against a real local HTTP server on an ephemeral port, and once through a
 * real SignalR HubConnection, because the client's whole job is to behave like
 * SignalR's own FetchHttpClient without requiring tough-cookie. That the node
 * actually passes it to SignalR is pinned in streaming-client-lifecycle.test.ts.
 */

import { createServer, type IncomingHttpHeaders, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { AbortError, HttpError, HubConnectionBuilder, LogLevel, TimeoutError } from "@microsoft/signalr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EaseeSignalRHttpClient, splitSetCookieHeader } from "../../easee-client/signalr-http-client.js";

interface Seen {
  method?: string;
  url?: string;
  headers: IncomingHttpHeaders;
  body: string;
}

let server: Server;
let base: string;
let port: number;
let seen: Seen[];
let respond: (res: ServerResponse, request: Seen) => void;

// tests/setup.ts replaces fetch with a mock and leaves fake timers installed
// between tests. This client needs the real fetch, and real timers for its timeout.
const mockedFetch = globalThis.fetch;

beforeEach(async () => {
  vi.useRealTimers();
  globalThis.fetch = testHelpers.realFetch;
  seen = [];
  respond = (res) => res.end("ok");
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const request = { method: req.method, url: req.url, headers: req.headers, body };
      seen.push(request);
      respond(res, request);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  globalThis.fetch = mockedFetch;
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

describe("EaseeSignalRHttpClient requests", () => {
  it("sends the method, body and SignalR's headers, and returns status and text", async () => {
    const client = new EaseeSignalRHttpClient();

    const response = await client.post(`${base}/hubs/chargers/negotiate`, {
      content: "hello",
      headers: { Authorization: "Bearer token-1" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.content).toBe("ok");
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("POST");
    expect(seen[0].url).toBe("/hubs/chargers/negotiate");
    expect(seen[0].body).toBe("hello");
    expect(seen[0].headers.authorization).toBe("Bearer token-1");
    expect(seen[0].headers["content-type"]).toBe("text/plain;charset=UTF-8");
    expect(seen[0].headers["x-requested-with"]).toBe("XMLHttpRequest");
  });

  it("sends binary content as octet-stream and returns an ArrayBuffer when asked", async () => {
    respond = (res) => res.end(Buffer.from([1, 2, 3]));
    const client = new EaseeSignalRHttpClient();

    const response = await client.post(`${base}/poll`, {
      content: new Uint8Array([9, 8]).buffer,
      responseType: "arraybuffer",
    });

    expect(response.content).toBeInstanceOf(ArrayBuffer);
    expect([...new Uint8Array(response.content as ArrayBuffer)]).toEqual([1, 2, 3]);
    expect(seen[0].headers["content-type"]).toBe("application/octet-stream");
  });

  it("sends no body and no content type for empty content", async () => {
    const client = new EaseeSignalRHttpClient();

    await client.delete(`${base}/hubs/chargers`, { content: "" });

    expect(seen[0].method).toBe("DELETE");
    expect(seen[0].body).toBe("");
    expect(seen[0].headers["content-type"]).toBeUndefined();
  });

  it("throws HttpError carrying the status and the response body", async () => {
    respond = (res) => {
      res.statusCode = 403;
      res.end("not your charger");
    };
    const client = new EaseeSignalRHttpClient();

    const error = await client.get(`${base}/x`).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).statusCode).toBe(403);
    // HttpError's own constructor appends the status, as for SignalR's default client.
    expect((error as HttpError).message).toBe("not your charger: Status code '403'");
  });

  it("falls back to the status text for an error with an empty body", async () => {
    respond = (res) => {
      res.statusCode = 404;
      res.end();
    };
    const client = new EaseeSignalRHttpClient();

    const error = await client.get(`${base}/x`).catch((e: unknown) => e);

    expect((error as HttpError).message).toBe("Not Found: Status code '404'");
  });

  it("throws TimeoutError when the server does not answer in time", async () => {
    respond = () => {
      // never answers
    };
    const client = new EaseeSignalRHttpClient();

    await expect(client.get(`${base}/slow`, { timeout: 50 })).rejects.toBeInstanceOf(TimeoutError);
  });

  it("throws AbortError when SignalR aborts the request", async () => {
    respond = () => {
      // never answers
    };
    const client = new EaseeSignalRHttpClient();
    const abortSignal: { aborted: boolean; onabort: (() => void) | null } = { aborted: false, onabort: null };

    const pending = client.get(`${base}/poll`, { abortSignal });
    setTimeout(() => abortSignal.onabort?.(), 20);

    await expect(pending).rejects.toBeInstanceOf(AbortError);
    expect(abortSignal.onabort).toBeNull();
  });

  it("does not send a request that was aborted before it started", async () => {
    const client = new EaseeSignalRHttpClient();

    await expect(client.get(`${base}/poll`, { abortSignal: { aborted: true, onabort: null } })).rejects.toBeInstanceOf(
      AbortError,
    );
    expect(seen).toHaveLength(0);
  });

  it("refuses requests SignalR's own client refuses", async () => {
    const client = new EaseeSignalRHttpClient();

    await expect(client.send({ url: `${base}/x` })).rejects.toThrow("No method defined.");
    await expect(client.send({ method: "GET" })).rejects.toThrow("No url defined.");
    await expect(client.get(`${base}/x`, { responseType: "json" })).rejects.toThrow("json is not supported.");
    expect(seen).toHaveLength(0);
  });

  it("rethrows a network failure it did not cause", async () => {
    const client = new EaseeSignalRHttpClient();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

    await expect(client.get(`http://127.0.0.1:${port}/gone`)).rejects.toThrow("fetch failed");
  });
});

describe("EaseeSignalRHttpClient cookies", () => {
  it("returns a load balancer's cookie on later requests and to the WebSocket, per host", async () => {
    respond = (res) => {
      res.setHeader("Set-Cookie", ["ARRAffinity=abc123; Path=/; HttpOnly", "session=s1; Secure; Path=/"]);
      res.end("ok");
    };
    const client = new EaseeSignalRHttpClient();

    await client.post(`${base}/hubs/chargers/negotiate`);
    await client.get(`${base}/hubs/chargers`);

    expect(seen[0].headers.cookie).toBeUndefined();
    // The Secure cookie is withheld on a plain http request...
    expect(seen[1].headers.cookie).toBe("ARRAffinity=abc123");
    expect(client.getCookieString(`ws://127.0.0.1:${port}/hubs/chargers`)).toBe("ARRAffinity=abc123");
    // ...and sent on a secure one, which is what streams.easee.com is.
    expect(client.getCookieString(`wss://127.0.0.1:${port}/hubs/chargers`)).toBe("ARRAffinity=abc123; session=s1");
    // Never to another host.
    expect(client.getCookieString(`wss://localhost:${port}/hubs/chargers`)).toBe("");
    expect(client.getCookieString("not a url")).toBe("");
  });

  it("forgets a cookie the server expires, and lets Max-Age win over Expires", async () => {
    const past = "Thu, 01 Jan 1970 00:00:00 GMT";
    const cookies = [
      ["a=1", "b=2", "c=3", "d=4", "junk"],
      ["a=; Max-Age=0", `b=2; Expires=${past}`, `c=3; Expires=${past}; Max-Age=60`, "d=5; Max-Age=soon"],
    ];
    let call = 0;
    respond = (res) => {
      res.setHeader("Set-Cookie", cookies[call++]);
      res.end("ok");
    };
    const client = new EaseeSignalRHttpClient();

    await client.get(`${base}/one`);
    expect(client.getCookieString(base)).toBe("a=1; b=2; c=3; d=4");
    await client.get(`${base}/two`);
    expect(client.getCookieString(base)).toBe("c=3; d=5");
  });

  it("splits a combined Set-Cookie header without breaking inside Expires", () => {
    expect(splitSetCookieHeader("a=1; Expires=Wed, 21 Oct 2015 07:28:00 GMT, b=2; Path=/")).toEqual([
      "a=1; Expires=Wed, 21 Oct 2015 07:28:00 GMT",
      "b=2; Path=/",
    ]);
    expect(splitSetCookieHeader(null)).toEqual([]);
  });
});

describe("EaseeSignalRHttpClient inside SignalR", () => {
  it("completes a real SignalR negotiation, with the access token on it", async () => {
    respond = (res) => {
      res.setHeader("Content-Type", "application/json");
      // No transports offered, so start() fails AFTER negotiation succeeded — the
      // message it fails with is the proof negotiation got that far.
      res.end(
        JSON.stringify({ negotiateVersion: 1, connectionId: "c", connectionToken: "t", availableTransports: [] }),
      );
    };
    const connection = new HubConnectionBuilder()
      .withUrl(`${base}/hubs/chargers`, {
        accessTokenFactory: () => "token-1",
        httpClient: new EaseeSignalRHttpClient(),
      })
      .configureLogging(LogLevel.None)
      .build();

    await expect(connection.start()).rejects.toThrow(
      "None of the transports supported by the client are supported by the server.",
    );
    expect(seen[0].url).toMatch(/^\/hubs\/chargers\/negotiate/);
    expect(seen[0].headers.authorization).toBe("Bearer token-1");
  });
});
