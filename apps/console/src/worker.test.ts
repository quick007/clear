import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { handleRequest } from "./worker";

const env = {
  ASSETS: {
    fetch: vi.fn(async () => new Response("console asset")),
  } as unknown as Fetcher,
  GROUNDTRUTH_API_ORIGIN: "https://api.clear.test",
  GROUNDTRUTH_SITE_HANDOFF_SECRET: "sites-handoff-secret",
} as const;

const request = (path: string, init?: RequestInit) =>
  new Request(`https://clear.test${path}`, init);

const authenticatedHeaders = {
  "oai-authenticated-user-id": "chatgpt-user-1",
  "oai-authenticated-user-email": "operator@example.com",
} as const;

const requestUrl = (input: string | URL | Request) =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

const jsonBody = (body: BodyInit | null | undefined) => {
  if (typeof body !== "string") throw new TypeError("Expected a JSON request body");
  const value: unknown = JSON.parse(body);
  return value;
};

describe("Sites authentication Worker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("leaves sign-in optional for anonymous visitors", async () => {
    const response = await handleRequest(request("/sign-in?returnPath=%2Fboard"), env);

    expect(response.status).toBe(303);
    const location = response.headers.get("location");
    expect(location).toContain("/signin-with-chatgpt?return_to=");
    expect(decodeURIComponent(location ?? "")).toContain("/sign-in?returnPath=%2Fboard");
    expect(response.headers.get("cache-control")).toBe("no-store, private");
  });

  it.each(["https://attacker.test", "//attacker.test", "/safe\\escape", "/a\nb"])(
    "rejects the unsafe return path %s before contacting the backend",
    async (returnPath) => {
      const backendFetch = vi.fn();
      vi.stubGlobal("fetch", backendFetch);

      const response = await handleRequest(
        request(`/sign-in?returnPath=${encodeURIComponent(returnPath)}`, {
          headers: authenticatedHeaders,
        }),
        env,
      );

      expect(response.status).toBe(400);
      expect(backendFetch).not.toHaveBeenCalled();
    },
  );

  it("falls back to the public origin and redirects only the opaque code", async () => {
    const handoffCode = "handoff-code-123456789012345678901234";
    let browserNonce: string | undefined;
    const backendFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(requestUrl(input)).toBe("https://api.clear.test/v1/auth/handoffs");
      expect(init?.method).toBe("POST");
      expect(init?.redirect).toBe("error");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer sites-handoff-secret");
      const body = jsonBody(init?.body);
      expect(body).toMatchObject({
        subject: "chatgpt-user-1",
        email: "operator@example.com",
        displayName: "Lukas Seufert",
        returnPath: "/traces?service=checkout-api",
      });
      expect(body).toHaveProperty("browserNonce");
      browserNonce = (body as { readonly browserNonce: string }).browserNonce;
      expect(browserNonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
      return Response.json(
        { code: handoffCode, expiresAt: "2026-08-28T07:00:30.000Z" },
        { status: 201 },
      );
    });
    vi.stubGlobal("fetch", backendFetch);

    const response = await handleRequest(
      request("/sign-in?returnPath=%2Ftraces%3Fservice%3Dcheckout-api", {
        headers: {
          "oai-authenticated-user-id": "chatgpt-user-1",
          "oai-authenticated-user-email": " operator@example.com ",
          "oai-authenticated-user-full-name": "Lukas%20Seufert",
          "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
        },
      }),
      env,
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `https://api.clear.test/v1/auth/chatgpt/callback?code=${handoffCode}`,
    );
    expect(response.headers.get("location")).not.toContain("returnPath");
    expect(response.headers.get("location")).not.toContain(browserNonce ?? "missing-nonce");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const nonceCookie = response.headers.get("set-cookie") ?? "";
    expect(nonceCookie).toContain(`groundtruth_handoff_nonce=${browserNonce}`);
    expect(nonceCookie).toContain("Max-Age=60");
    expect(nonceCookie).toContain("Domain=clear.test");
    expect(nonceCookie).toContain("Path=/v1/auth/chatgpt/callback");
    expect(nonceCookie).toContain("HttpOnly");
    expect(nonceCookie).toContain("Secure");
    expect(nonceCookie).toContain("SameSite=Lax");
    expect(backendFetch).toHaveBeenCalledOnce();
  });

  it("uses the internal origin only for the server-side handoff request", async () => {
    const handoffCode = "handoff-code-123456789012345678901234";
    const backendFetch = vi.fn(async (input: string | URL | Request) => {
      expect(requestUrl(input)).toBe("https://clear-runtime.internal.test/v1/auth/handoffs");
      return Response.json({ code: handoffCode }, { status: 201 });
    });
    vi.stubGlobal("fetch", backendFetch);

    const response = await handleRequest(
      request("/sign-in?returnPath=%2Fconnect", { headers: authenticatedHeaders }),
      {
        ...env,
        GROUNDTRUTH_INTERNAL_API_ORIGIN: "https://clear-runtime.internal.test",
      },
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `https://api.clear.test/v1/auth/chatgpt/callback?code=${handoffCode}`,
    );
    expect(response.headers.get("set-cookie")).toContain("Domain=clear.test");
  });

  it("omits an unverified or malformed display name", async () => {
    const backendFetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(jsonBody(init?.body)).toMatchObject({
        subject: "chatgpt-user-1",
        email: "operator@example.com",
        returnPath: "/",
      });
      return Response.json(
        { code: "handoff-code-123456789012345678901234", expiresAt: "unused" },
        { status: 201 },
      );
    });
    vi.stubGlobal("fetch", backendFetch);

    const response = await handleRequest(
      request("/sign-in", {
        headers: {
          ...authenticatedHeaders,
          "oai-authenticated-user-full-name": "%E0%A4%A",
          "oai-authenticated-user-full-name-encoding": "percent-encoded-utf-8",
        },
      }),
      env,
    );

    expect(response.status).toBe(303);
  });

  it("creates a unique browser nonce for each handoff", async () => {
    const nonces: Array<string> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        const body = jsonBody(init?.body) as { readonly browserNonce: string };
        nonces.push(body.browserNonce);
        return Response.json(
          {
            code: `handoff-code-${"x".repeat(24)}-${nonces.length}`,
            expiresAt: "2026-08-28T07:00:30.000Z",
          },
          { status: 201 },
        );
      }),
    );

    const authenticated = { headers: authenticatedHeaders };
    const first = await handleRequest(request("/sign-in", authenticated), env);
    const second = await handleRequest(request("/sign-in", authenticated), env);

    expect(nonces).toHaveLength(2);
    expect(nonces[0]).not.toBe(nonces[1]);
    expect(first.headers.get("set-cookie")).toContain(nonces[0]);
    expect(second.headers.get("set-cookie")).toContain(nonces[1]);
  });

  it("keeps same-host localhost handoffs usable without a Domain or Secure attribute", async () => {
    const localEnv = {
      ASSETS: env.ASSETS,
      GROUNDTRUTH_API_ORIGIN: "http://localhost:3000",
      GROUNDTRUTH_SITE_HANDOFF_SECRET: "sites-handoff-secret",
    } as const;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            code: `handoff-code-${"x".repeat(24)}`,
            expiresAt: "2026-08-28T07:00:30.000Z",
          },
          { status: 201 },
        ),
      ),
    );

    const response = await handleRequest(
      new Request("http://localhost:5173/sign-in", {
        headers: authenticatedHeaders,
      }),
      localEnv,
    );
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(303);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).not.toContain("Domain=");
    expect(cookie).not.toContain("Secure");
  });

  it("fails closed without exposing backend details", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ message: "Sites service credential is invalid" }, { status: 401 }),
      ),
    );

    const response = await handleRequest(
      request("/sign-in", {
        headers: authenticatedHeaders,
      }),
      env,
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      code: "authentication_unavailable",
      message: "Clear could not start a signed-in session.",
    });
    expect(consoleError).toHaveBeenCalledWith("[Clear] authentication handoff failed", {
      failureClass: "HandoffStatusFailure",
      origin: "https://api.clear.test",
      status: 401,
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("Sites service credential");
  });

  it("classifies transport failures without logging request secrets or identity", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error(
          "sites-handoff-secret chatgpt-user-1 operator@example.com private-handoff-code",
        );
      }),
    );

    const response = await handleRequest(request("/sign-in", { headers: authenticatedHeaders }), {
      ...env,
      GROUNDTRUTH_INTERNAL_API_ORIGIN: "https://clear-runtime.internal.test/private-path",
    });

    expect(response.status).toBe(502);
    expect(consoleError).toHaveBeenCalledWith("[Clear] authentication handoff failed", {
      failureClass: "HandoffTransportFailure",
      origin: "https://clear-runtime.internal.test",
    });
    const diagnostic = JSON.stringify(consoleError.mock.calls);
    expect(diagnostic).not.toContain("sites-handoff-secret");
    expect(diagnostic).not.toContain("chatgpt-user-1");
    expect(diagnostic).not.toContain("operator@example.com");
    expect(diagnostic).not.toContain("private-handoff-code");
    expect(diagnostic).not.toContain("private-path");
  });

  it("does not proxy arbitrary application routes", async () => {
    const response = await handleRequest(request("/v1/metrics"), env);

    expect(response.status).toBe(404);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("serves application routes through the asset binding", async () => {
    const response = await handleRequest(request("/board"), env);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("console asset");
  });

  it("serves the application shell for a direct client-route navigation", async () => {
    const assets = vi.fn(async (input: Request) =>
      new URL(input.url).pathname === "/"
        ? new Response("application shell", {
            headers: { "content-type": "text/html; charset=utf-8" },
          })
        : new Response("missing", { status: 404 }),
    );
    const directRouteEnv = { ...env, ASSETS: { fetch: assets } as unknown as Fetcher };

    const response = await handleRequest(
      request("/board?guide=true", { headers: { accept: "text/html,application/xhtml+xml" } }),
      directRouteEnv,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("application shell");
    expect(assets).toHaveBeenCalledTimes(2);
    expect(new URL(assets.mock.calls[1]?.[0].url ?? "https://invalid.test").pathname).toBe("/");
  });

  it("preserves missing asset responses instead of returning HTML", async () => {
    const assets = vi.fn(async () => new Response("missing", { status: 404 }));
    const missingAssetEnv = { ...env, ASSETS: { fetch: assets } as unknown as Fetcher };

    const response = await handleRequest(
      request("/assets/missing.js", { headers: { accept: "text/html,*/*" } }),
      missingAssetEnv,
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("missing");
    expect(assets).toHaveBeenCalledOnce();
  });

  it("preserves missing public-file responses instead of returning HTML", async () => {
    const assets = vi.fn(async () => new Response("missing", { status: 404 }));
    const missingAssetEnv = { ...env, ASSETS: { fetch: assets } as unknown as Fetcher };

    const response = await handleRequest(
      request("/favicon.svg", { headers: { accept: "text/html,*/*" } }),
      missingAssetEnv,
    );

    expect(response.status).toBe(404);
    expect(assets).toHaveBeenCalledOnce();
  });

  it("does not rewrite non-navigation client-route requests", async () => {
    const assets = vi.fn(async () => new Response("missing", { status: 404 }));
    const nonNavigationEnv = { ...env, ASSETS: { fetch: assets } as unknown as Fetcher };

    const response = await handleRequest(
      request("/board", { headers: { accept: "application/json" } }),
      nonNavigationEnv,
    );

    expect(response.status).toBe(404);
    expect(assets).toHaveBeenCalledOnce();
  });

  it("does not rewrite client-route mutations", async () => {
    const assets = vi.fn(async () => new Response("missing", { status: 404 }));
    const mutationEnv = { ...env, ASSETS: { fetch: assets } as unknown as Fetcher };

    const response = await handleRequest(
      request("/board", { method: "POST", headers: { accept: "text/html" } }),
      mutationEnv,
    );

    expect(response.status).toBe(404);
    expect(assets).toHaveBeenCalledOnce();
  });

  it("keeps the exact API root out of the application shell", async () => {
    const assets = vi.fn(async () => new Response("console asset"));
    const apiEnv = { ...env, ASSETS: { fetch: assets } as unknown as Fetcher };

    const response = await handleRequest(
      request("/v1", { headers: { accept: "text/html" } }),
      apiEnv,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ code: "not_found", message: "Route not found." });
    expect(assets).not.toHaveBeenCalled();
  });

  it("serves a no-store health response", async () => {
    const response = await handleRequest(request("/health"), env);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(await response.json()).toEqual({
      status: "ok",
      service: "clear-console",
    });
  });
});
