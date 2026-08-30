import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { handleRequest } from "./worker";

const env = {
  ASSETS: {
    fetch: vi.fn(async () => new Response("console asset")),
  } as unknown as Fetcher,
  GROUNDTRUTH_API_ORIGIN: "https://api.clear.seufert.sh",
  GROUNDTRUTH_SITE_HANDOFF_SECRET: "sites-handoff-secret",
} as const;

const request = (path: string, init?: RequestInit) =>
  new Request(`https://clear.seufert.sh${path}`, init);

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
  afterEach(() => vi.unstubAllGlobals());

  it("leaves sign-in optional for anonymous visitors", async () => {
    const response = await handleRequest(request("/auth/chatgpt?returnPath=%2Fboard"), env);

    expect(response.status).toBe(303);
    const location = response.headers.get("location");
    expect(location).toContain("/signin-with-chatgpt?return_to=");
    expect(decodeURIComponent(location ?? "")).toContain("/auth/chatgpt?returnPath=%2Fboard");
    expect(response.headers.get("cache-control")).toBe("no-store, private");
  });

  it.each(["https://attacker.test", "//attacker.test", "/safe\\escape", "/a\nb"])(
    "rejects the unsafe return path %s before contacting the backend",
    async (returnPath) => {
      const backendFetch = vi.fn();
      vi.stubGlobal("fetch", backendFetch);

      const response = await handleRequest(
        request(`/auth/chatgpt?returnPath=${encodeURIComponent(returnPath)}`, {
          headers: authenticatedHeaders,
        }),
        env,
      );

      expect(response.status).toBe(400);
      expect(backendFetch).not.toHaveBeenCalled();
    },
  );

  it("creates a server-side handoff and redirects only the opaque code", async () => {
    const handoffCode = "handoff-code-123456789012345678901234";
    let browserNonce: string | undefined;
    const backendFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(requestUrl(input)).toBe("https://api.clear.seufert.sh/v1/auth/handoffs");
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
      request("/auth/chatgpt?returnPath=%2Ftraces%3Fservice%3Dcheckout-api", {
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
      `https://api.clear.seufert.sh/v1/auth/chatgpt/callback?code=${handoffCode}`,
    );
    expect(response.headers.get("location")).not.toContain("returnPath");
    expect(response.headers.get("location")).not.toContain(browserNonce ?? "missing-nonce");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const nonceCookie = response.headers.get("set-cookie") ?? "";
    expect(nonceCookie).toContain(`groundtruth_handoff_nonce=${browserNonce}`);
    expect(nonceCookie).toContain("Max-Age=60");
    expect(nonceCookie).toContain("Domain=clear.seufert.sh");
    expect(nonceCookie).toContain("Path=/v1/auth/chatgpt/callback");
    expect(nonceCookie).toContain("HttpOnly");
    expect(nonceCookie).toContain("Secure");
    expect(nonceCookie).toContain("SameSite=Lax");
    expect(backendFetch).toHaveBeenCalledOnce();
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
      request("/auth/chatgpt", {
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
    const first = await handleRequest(request("/auth/chatgpt", authenticated), env);
    const second = await handleRequest(request("/auth/chatgpt", authenticated), env);

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
      new Request("http://localhost:5173/auth/chatgpt", {
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
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ message: "Sites service credential is invalid" }, { status: 401 }),
      ),
    );

    const response = await handleRequest(
      request("/auth/chatgpt", {
        headers: authenticatedHeaders,
      }),
      env,
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      code: "authentication_unavailable",
      message: "Clear could not start a signed-in session.",
    });
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
