# Sites authentication handoff

The thin Sites Worker is the only component allowed to translate trusted ChatGPT identity into a Clear browser session. It must read identity from platform-provided, verified request context. It must never accept an email or display name supplied by browser JavaScript as proof of identity.

## 1. Create the handoff

The Worker sends a server-to-server request to the backend:

```http
POST /v1/auth/handoffs HTTP/1.1
Authorization: Bearer <GROUNDTRUTH_SITE_HANDOFF_SECRET>
Content-Type: application/json

{
  "subject": "chatgpt-user-01H...",
  "email": "operator@example.com",
  "displayName": "Operator",
  "returnPath": "/connect",
  "browserNonce": "<32 random bytes encoded as base64url>"
}
```

`subject` is the stable Sites user identifier and is the hosted account key. It must come from the trusted `oai-authenticated-user-id` request header, never from browser JavaScript. `email` is a verified presentation field and may change without changing account identity. `displayName` is optional presentation data. `returnPath` is optional and defaults to `/`. The Worker generates a fresh browser nonce for every handoff.

The backend returns `201 Created`:

```json
{
  "code": "<single-use opaque code>",
  "expiresAt": "2026-08-28T07:00:30.000Z"
}
```

The code expires after 30 seconds. The backend stores one SHA-256 digest binding the code and browser nonce together. It stores neither value in plaintext.

## 2. Redirect the browser to the callback

The Worker responds to the browser with a top-level redirect and a short-lived nonce cookie:

```http
HTTP/1.1 303 See Other
Location: https://api.clear.seufert.sh/v1/auth/chatgpt/callback?code=<url-encoded-code>
Set-Cookie: groundtruth_handoff_nonce=<browser-nonce>; Domain=clear.seufert.sh; Path=/v1/auth/chatgpt/callback; Max-Age=60; HttpOnly; Secure; SameSite=Lax
```

The callback URL contains only the opaque code. The nonce stays in the `HttpOnly` cookie. The parent-domain attribute is used only when the console hostname is a valid parent of the API hostname. Same-host localhost development uses a host-only cookie without `Secure`.

The callback also accepts `returnPath`, but the Worker should omit it. When present, it must exactly match the path bound into the handoff. The backend requires the matching nonce cookie, atomically redeems the bound digest once, creates a seven-day hosted session, clears the nonce cookie, and returns `303 See Other` with:

```http
Location: https://clear.seufert.sh/connect
Set-Cookie: groundtruth_session=<opaque-token>; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax
Set-Cookie: groundtruth_handoff_nonce=; Domain=clear.seufert.sh; Path=/v1/auth/chatgpt/callback; Max-Age=0; HttpOnly; Secure; SameSite=Lax
```

The cookie has no `Domain` attribute, so it is host-only for the API origin. The backend stores only the session token's SHA-256 hash. Browser requests to the API, including SSE connections, use `credentials: "include"`. The backend allows credentials only from the configured console origins.

## Return path rules

A return path must:

- contain between 1 and 512 characters
- begin with exactly one `/`
- not begin with `//`
- not contain a backslash

Absolute URLs and protocol-relative URLs are rejected. The backend resolves the accepted path against its configured console origin, so the handoff cannot redirect to another origin.

## Failure behavior

- Missing or invalid Worker bearer credentials return `401 Unauthorized`.
- Invalid return paths return `400 Bad Request`.
- Missing or mismatched browser nonces return `400 Bad Request` without consuming a valid handoff.
- Unknown, expired, or already-redeemed codes return `400 Bad Request`.
- Persistence failures return `503 Service Unavailable` and must not be rewritten as credential failures.

The Worker should fail closed. It must not log the handoff code, browser nonce, Worker bearer secret, session cookie, or trusted identity headers.
