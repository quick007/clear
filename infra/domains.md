# Production domains

The core Clear domains are active. The API is a child of the console hostname, so the short-lived Sites handoff nonce can be scoped to `clear.seufert.sh` while the long-lived API session cookie remains host-only. Platform-provided hostnames stay enabled as secondary operational fallbacks.

| Hostname                        | Status  | Platform      | Purpose                        |
| ------------------------------- | ------- | ------------- | ------------------------------ |
| `clear.seufert.sh`              | active  | ChatGPT Sites | Clear console                  |
| `api.clear.seufert.sh`          | active  | Render        | Effect API, SSE, auth callback |
| `otlp.clear.seufert.sh`         | active  | Render        | Public OTLP/HTTP receiver      |
| `checkout-api.clear.seufert.sh` | planned | Render        | Broken checkout API            |
| `checkout.clear.seufert.sh`     | planned | ChatGPT Sites | Checkout storefront            |

Secondary provider fallbacks remain enabled for operations:

- console: `https://clear-observability.seufert.chatgpt.site`
- API and OTLP/HTTP: `https://clear-runtime.onrender.com`

Do not guess or commit platform-generated CNAME targets. Add each custom domain in its owning platform first, then copy the exact DNS record it provides. Keep each platform's default hostname enabled until the custom hostname serves a valid certificate and passes its health check.

Use a 300-second DNS TTL while preparing the submission. Verify active records and certificates with:

```sh
dig +short clear.seufert.sh
dig +short api.clear.seufert.sh
dig +short otlp.clear.seufert.sh
curl --fail https://api.clear.seufert.sh/health
```

Verify the checkout hostnames separately when they are attached. Until then, the storefront and checkout API remain available through their provider hostnames.

The browser calls the API with credentials and the API allows only the exact `https://clear.seufert.sh` origin. Same-site cookies do not remove the need for explicit credentialed CORS and origin checks on state-changing requests.

Hosted v1 does not create a gRPC hostname. OTLP/gRPC remains a local development feature for the hackathon release.
