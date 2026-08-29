# Domain plan

All hosted endpoints use subdomains of `seufert.sh`. The API is a child of the console hostname, so the short-lived Sites handoff nonce can be scoped to `clear.seufert.sh` while the long-lived API session cookie remains host-only.

| Hostname                        | Platform      | Purpose                        | DNS target source                  |
| ------------------------------- | ------------- | ------------------------------ | ---------------------------------- |
| `clear.seufert.sh`              | ChatGPT Sites | Clear console                  | Sites custom-domain setup          |
| `api.clear.seufert.sh`          | Render        | Effect API, SSE, auth callback | `clear-runtime` custom-domain page |
| `otlp.clear.seufert.sh`         | Render        | Public OTLP/HTTP receiver      | `clear-runtime` custom-domain page |
| `checkout-api.clear.seufert.sh` | Render        | Broken checkout API            | `clear-checkout-api` domain page   |
| `checkout.clear.seufert.sh`     | ChatGPT Sites | Checkout storefront            | Sites custom-domain setup          |

Do not guess or commit platform-generated CNAME targets. Add each custom domain in its owning platform first, then copy the exact DNS record it provides. Keep each platform's default hostname enabled until the custom hostname serves a valid certificate and passes its health check.

Use a 300-second DNS TTL while preparing the submission. Verify the final records and certificates with:

```sh
dig +short clear.seufert.sh
dig +short api.clear.seufert.sh
dig +short otlp.clear.seufert.sh
dig +short checkout.clear.seufert.sh
dig +short checkout-api.clear.seufert.sh
curl --fail https://api.clear.seufert.sh/health
curl --fail https://checkout-api.clear.seufert.sh/readyz
```

The browser calls the API with credentials and the API allows only the exact `https://clear.seufert.sh` origin. Same-site cookies do not remove the need for explicit credentialed CORS and origin checks on state-changing requests.

Hosted v1 does not create a gRPC hostname. OTLP/gRPC remains a local development feature for the hackathon release.
