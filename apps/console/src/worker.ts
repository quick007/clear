const authPath = "/auth/chatgpt";
const callbackPath = "/v1/auth/chatgpt/callback";
const handoffPath = "/v1/auth/handoffs";
const signInPath = "/signin-with-chatgpt";
const handoffNonceCookieName = "groundtruth_handoff_nonce";
const handoffNonceMaxAgeSeconds = 60; // 1 minute
const backendTimeoutMillis = 8 * 1000; // 8 seconds

interface AuthEnv {
  readonly ASSETS: Fetcher;
  readonly GROUNDTRUTH_API_ORIGIN: string;
  readonly GROUNDTRUTH_SITE_HANDOFF_SECRET: string;
}

const securityHeaders = (initial?: HeadersInit) => {
  const headers = new Headers(initial);
  headers.set("cache-control", "no-store, private");
  headers.set("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
  headers.set("permissions-policy", "camera=(), geolocation=(), microphone=()");
  headers.set("referrer-policy", "no-referrer");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  return headers;
};

const jsonError = (code: string, message: string, status: number, headers?: HeadersInit) =>
  Response.json(
    { code, message },
    {
      status,
      headers: securityHeaders(headers),
    },
  );

const isApiPath = (pathname: string) => pathname === "/v1" || pathname.startsWith("/v1/");

const looksLikeAssetPath = (pathname: string) => pathname.split("/").at(-1)?.includes(".") === true;

const isDocumentRequest = (request: Request, url: URL) =>
  (request.method === "GET" || request.method === "HEAD") &&
  request.headers.get("accept")?.includes("text/html") === true &&
  !looksLikeAssetPath(url.pathname);

const serveApplication = async (request: Request, env: AuthEnv, url: URL) => {
  const response = await env.ASSETS.fetch(request);
  if (response.status !== 404 || !isDocumentRequest(request, url)) return response;

  const indexRequest = new Request(new URL("/", url), request);
  return env.ASSETS.fetch(indexRequest);
};

const redirect = (location: string, initial?: HeadersInit) =>
  new Response(null, {
    status: 303,
    headers: securityHeaders({ ...Object.fromEntries(new Headers(initial)), location }),
  });

const randomBrowserNonce = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

const isLocalHostname = (hostname: string) =>
  hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";

const handoffCookie = (requestUrl: URL, apiOrigin: string, browserNonce: string) => {
  const apiUrl = new URL(apiOrigin);
  const sameHost = requestUrl.hostname === apiUrl.hostname;
  const consoleIsApiParent = apiUrl.hostname.endsWith(`.${requestUrl.hostname}`);
  if (!sameHost && !consoleIsApiParent) return undefined;

  const attributes = [
    `${handoffNonceCookieName}=${encodeURIComponent(browserNonce)}`,
    `Max-Age=${handoffNonceMaxAgeSeconds}`,
    `Path=${callbackPath}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (requestUrl.protocol === "https:") attributes.push("Secure");
  if (consoleIsApiParent && !isLocalHostname(requestUrl.hostname)) {
    attributes.push(`Domain=${requestUrl.hostname}`);
  }
  return attributes.join("; ");
};

const hasControlCharacter = (value: string) =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });

const validReturnPath = (value: string) =>
  value.length >= 1 &&
  value.length <= 512 &&
  value.startsWith("/") &&
  !value.startsWith("//") &&
  !value.includes("\\") &&
  !hasControlCharacter(value);

const readReturnPath = (url: URL) => {
  const values = url.searchParams.getAll("returnPath");
  if (values.length === 0) return "/";
  if (values.length !== 1 || !validReturnPath(values[0] ?? "")) return undefined;
  return values[0];
};

const readDisplayName = (headers: Headers) => {
  if (headers.get("oai-authenticated-user-full-name-encoding") !== "percent-encoded-utf-8") {
    return undefined;
  }

  const encoded = headers.get("oai-authenticated-user-full-name");
  if (encoded === null) return undefined;

  try {
    const displayName = decodeURIComponent(encoded).trim();
    return displayName.length > 0 ? displayName : undefined;
  } catch {
    return undefined;
  }
};

const signInRedirect = (returnPath: string) => {
  const returnTo = new URL(authPath, "https://groundtruth.invalid");
  returnTo.searchParams.set("returnPath", returnPath);

  const signIn = new URL(signInPath, "https://groundtruth.invalid");
  signIn.searchParams.set("return_to", `${returnTo.pathname}${returnTo.search}`);
  return redirect(`${signIn.pathname}${signIn.search}`);
};

const isHandoffCreated = (value: unknown): value is { readonly code: string } =>
  typeof value === "object" &&
  value !== null &&
  "code" in value &&
  typeof value.code === "string" &&
  value.code.length >= 32 &&
  value.code.length <= 512;

const createHandoff = async (
  env: AuthEnv,
  subject: string,
  email: string,
  displayName: string | undefined,
  returnPath: string,
  browserNonce: string,
) => {
  const endpoint = new URL(handoffPath, env.GROUNDTRUTH_API_ORIGIN);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.GROUNDTRUTH_SITE_HANDOFF_SECRET}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      subject,
      email,
      ...(displayName === undefined ? {} : { displayName }),
      returnPath,
      browserNonce,
    }),
    redirect: "error",
    signal: AbortSignal.timeout(backendTimeoutMillis),
  });

  if (response.status !== 201) return undefined;
  const result: unknown = await response.json();
  return isHandoffCreated(result) ? result : undefined;
};

const handleAuth = async (request: Request, env: AuthEnv, url: URL) => {
  if (request.method !== "GET") {
    return jsonError("method_not_allowed", "Use GET for this route.", 405, { allow: "GET" });
  }

  const returnPath = readReturnPath(url);
  if (returnPath === undefined) {
    return jsonError("invalid_return_path", "The return path must be a local path.", 400);
  }

  const subject = request.headers.get("oai-authenticated-user-id")?.trim();
  const email = request.headers.get("oai-authenticated-user-email")?.trim();
  if (!subject || !email) return signInRedirect(returnPath);

  try {
    const browserNonce = randomBrowserNonce();
    const nonceCookie = handoffCookie(url, env.GROUNDTRUTH_API_ORIGIN, browserNonce);
    if (nonceCookie === undefined) {
      return jsonError(
        "authentication_unavailable",
        "Clear authentication origins are not configured safely.",
        502,
      );
    }
    const handoff = await createHandoff(
      env,
      subject,
      email,
      readDisplayName(request.headers),
      returnPath,
      browserNonce,
    );
    if (handoff === undefined) {
      return jsonError(
        "authentication_unavailable",
        "Clear could not start a signed-in session.",
        502,
      );
    }

    const callback = new URL(callbackPath, env.GROUNDTRUTH_API_ORIGIN);
    callback.searchParams.set("code", handoff.code);
    return redirect(callback.toString(), { "set-cookie": nonceCookie });
  } catch {
    return jsonError(
      "authentication_unavailable",
      "Clear could not start a signed-in session.",
      502,
    );
  }
};

export const handleRequest = async (request: Request, env: AuthEnv) => {
  const url = new URL(request.url);

  if (url.pathname === "/health") {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return jsonError("method_not_allowed", "Use GET for this route.", 405, {
        allow: "GET, HEAD",
      });
    }
    if (request.method === "HEAD") {
      return new Response(null, { status: 200, headers: securityHeaders() });
    }
    return Response.json(
      { status: "ok", service: "clear-console" },
      { headers: securityHeaders() },
    );
  }

  if (url.pathname === authPath) return handleAuth(request, env, url);

  if (!isApiPath(url.pathname)) return serveApplication(request, env, url);

  return jsonError("not_found", "Route not found.", 404);
};

export default {
  fetch: handleRequest,
} satisfies ExportedHandler<Env>;
