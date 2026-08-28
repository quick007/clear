# Domain plan

All hosted product endpoints are subdomains of `seufert.sh`. This makes the Sites console and Render API same-site while preserving separate origins and host-only API cookies.

| Hostname | Platform | Purpose | DNS target source |
| --- | --- | --- | --- |
| `groundtruth.seufert.sh` | ChatGPT Sites | Groundtruth console | Value shown by Sites custom-domain setup |
| `api.groundtruth.seufert.sh` | Render | Effect API, SSE, auth callback | `groundtruth-api` custom-domain page |
| `otlp.groundtruth.seufert.sh` | Render | Public OTLP/HTTP receiver | `groundtruth-otlp-http` custom-domain page |
| `checkout-api.groundtruth.seufert.sh` | Render | Broken checkout API | `groundtruth-checkout-api` custom-domain page |
| `checkout.groundtruth.seufert.sh` | ChatGPT Sites | Checkout storefront | Value shown by Sites custom-domain setup |

Do not guess or commit platform-generated CNAME targets. Add each custom domain in its owning platform first, then copy the exact DNS record it provides. Keep the platform's default hostname enabled until the custom hostname serves a valid certificate and passes its health check.

During the hackathon, a DNS TTL of 300 seconds keeps corrections reasonably quick. Raise it after the topology settles. Verify the final records and certificates with:

```sh
dig +short groundtruth.seufert.sh
dig +short api.groundtruth.seufert.sh
dig +short otlp.groundtruth.seufert.sh
dig +short checkout-api.groundtruth.seufert.sh
curl --fail https://api.groundtruth.seufert.sh/health
```

The browser calls the API with credentials and the API allows only the exact `https://groundtruth.seufert.sh` origin. Same-site cookies do not remove the need for explicit credentialed CORS and origin checks on state-changing requests.

Hosted v1 does not create a `grpc.groundtruth.seufert.sh` record. OTLP/gRPC remains available in the local and self-hosted Collector configuration until a compatible paid ingress is justified.
