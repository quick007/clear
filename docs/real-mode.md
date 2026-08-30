# Connect a real project

Real mode connects an existing OpenTelemetry-instrumented system to a durable Clear project. Clear accepts standard OTLP from official OpenTelemetry SDKs and Collectors. There is no Clear-specific SDK to install.

## Hosted status

The Clear console and anonymous incident experience are live at [clear.seufert.sh](https://clear.seufert.sh/).

The API is live at `https://api.clear.seufert.sh`, and OTLP/HTTP ingest is live at `https://otlp.clear.seufert.sh`. The interactive API reference is at [`api.clear.seufert.sh/docs`](https://api.clear.seufert.sh/docs), and the OpenAPI document is at [`api.clear.seufert.sh/openapi.json`](https://api.clear.seufert.sh/openapi.json).

Sign in with ChatGPT to create a durable project and ingest key, then use the steps below to connect your telemetry.

## Boundary

Clear needs a telemetry ingest key, not execution credentials.

Give Clear an ingest key through your OpenTelemetry exporter. Do not give it source-control tokens, cloud credentials, SSH keys, deployment keys, or access to your agent. Your own agent keeps using the repository and infrastructure access you already configured.

## 1. Create an ingest key

1. Open `https://clear.seufert.sh` and sign in with ChatGPT.
2. Open **Settings**, then **Ingest keys**.
3. Create a named ingest key.
4. Copy the secret once and store it in your application's secret manager.

The API stores only a hash of the secret. Listing keys returns metadata, not the original value. Each hosted account owns one durable project and may keep up to three ingest keys active. Use separate keys for separate environments or Collectors so one can be revoked without interrupting every source.

For isolated local development, the project slug is `local` and the development key defaults to `local-demo-ingest-key`. The local stack bootstraps that project for telemetry development, but it does not expose a supported browser login for the durable project.

## 2. Point OTLP at Clear

Set the standard OpenTelemetry variables on your service or upstream Collector:

```sh
export CLEAR_INGEST_KEY=<your-ingest-key>
export OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.clear.seufert.sh
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
export OTEL_EXPORTER_OTLP_HEADERS="x-clear-ingest-key=${CLEAR_INGEST_KEY}"
export OTEL_SERVICE_NAME=<stable-service-name>
```

For local development, use `http://localhost:4318` instead. Hosted ingest supports OTLP/HTTP protobuf and JSON for metrics, logs, and traces. Public OTLP/gRPC is not part of the hackathon release.

If applications already send to an OpenTelemetry Collector, add a Clear OTLP/HTTP exporter there instead of editing each SDK. See [otel-quickstart.md](otel-quickstart.md).

## 3. Verify each signal

Send and verify signals separately:

1. A metric with a stable name and useful unit.
2. A structured log that carries its trace and span IDs.
3. A trace with at least one server span.

Confirm that all three appear under the expected `service.name`. Clear creates the first useful overview from the signals it receives. Service and environment selectors remain hidden until there is more than one useful value.

Avoid secrets and sensitive personal data in attributes, log bodies, span events, or resource metadata. Clear treats telemetry as untrusted content, but it cannot remove information that should never have been exported.

## 4. Add deploy annotations

Deploy events let the board show when a change landed without giving Clear control of the deployment.

Send an authenticated event after a successful deploy:

```sh
curl --fail-with-body \
  -X POST https://api.clear.seufert.sh/v1/events/deploy \
  -H 'content-type: application/json' \
  -H "x-clear-ingest-key: ${CLEAR_INGEST_KEY}" \
  --data '{
    "service": "checkout-api",
    "sha": "0123456789abcdef",
    "description": "Add bounded retry policy",
    "deployedAt": "2026-08-29T18:30:00Z"
  }'
```

The request contract is:

- `service`: required, non-empty, trimmed text. It must exactly match the telemetry resource attribute `service.name` for Clear to annotate that service's panels.
- `sha`: required, 7 to 64 lowercase hexadecimal characters.
- `description`: optional, non-empty text.
- `url`: optional `http` or `https` URL, such as a commit, release, or build page that is safe to open.
- `deployedAt`: optional UTC timestamp. Clear uses receipt time when it is omitted.

A successful request returns `201 Created` with the recorded deploy event. Common failure responses are `400` for an invalid body, `401` for a missing or rejected ingest key, `429` when the project quota is exceeded, and `503` when a required service is unavailable.

This endpoint is not idempotent. Repeating the same request records another event. Do not blindly retry after a timeout or lost response. Check the project's deploy events first, then retry only when you know the event was not recorded. For an explicit retryable rejection, use capped exponential backoff and a small attempt limit.

Clear records and displays this event. It does not trigger the deployment.

For local development, the API base URL is `http://localhost:3000`.

## 5. Investigate with your agent

Open the project in ChatGPT's in-app browser or Chrome with WebMCP enabled. The page advertises only the capabilities valid for the current session and incident state. Let the agent discover that tool surface instead of pasting a static tool list into the conversation.

A useful opening prompt is:

> Investigate the current alerts. Build the minimum view needed to test your leading hypothesis, and explain what evidence would disprove it.

Attach or open your own repository in the agent's normal coding environment when you want it to inspect or change code. A typical workflow is:

1. The agent queries Clear and updates the shared board.
2. You challenge or refine its hypothesis.
3. The agent reads and fixes code through its existing repository access.
4. Your deployment system deploys the change.
5. A deploy event and recovering telemetry flow back into Clear as data.

Clear never becomes the executor in that loop.

## 6. Rotate and revoke keys

- Create a replacement before removing a key used by a live Collector.
- Update the application or Collector secret manager.
- Confirm exports with the replacement.
- Revoke the old key in Clear.
- Treat any key that appears in source control, screenshots, logs, or shell history as compromised.

Anonymous sandbox sessions are separate from real projects and use short-lived session identifiers rather than ingest keys. They support investigation and diagnosis only. They never synthesize a code change or deployment.
