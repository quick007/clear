# Connect a real project

Real mode connects an existing OpenTelemetry-instrumented system to a durable Clear project.

## Boundary

Clear needs telemetry credentials, not execution credentials.

Give Clear an ingest key through your OpenTelemetry exporter. Do not give it source-control tokens, cloud credentials, SSH keys, deployment keys, or access to your agent. Your own agent keeps using the repository and infrastructure access you already configured.

## 1. Create an ingest key

1. Open [clear.seufert.sh](https://clear.seufert.sh) and sign in with ChatGPT.
2. Open **Settings**, then **Ingest keys**.
3. Create a named ingest key.
4. Copy the secret once and store it in your application's secret manager.

The API stores only a hash of the secret. Listing keys returns metadata, not the original value. Each hosted account owns one durable project and may keep up to three ingest keys active. Use separate keys for separate environments or collectors so one can be revoked without interrupting every source.

For the local contributor stack, the project slug is `local` and the development key defaults to `local-demo-ingest-key`. That path exists only for isolated local development.

## 2. Point OTLP at Clear

Set the standard OpenTelemetry variables on your service or upstream Collector:

```sh
export OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.clear.seufert.sh
export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
export OTEL_EXPORTER_OTLP_HEADERS=x-clear-ingest-key=<your-ingest-key>
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
  -H 'x-clear-ingest-key: <your-ingest-key>' \
  --data '{
    "service": "checkout-api",
    "sha": "0123456789abcdef",
    "description": "Add bounded retry policy"
  }'
```

`url` and `deployedAt` are optional fields. Use a commit, release, or build URL that is safe to open. Clear records and displays the event. It does not trigger the deploy.

For local development, the API base URL is `http://localhost:3000`.

## 5. Investigate with your agent

Open the project in ChatGPT's in-app browser or Chrome with WebMCP enabled. The page advertises the capabilities valid for the current session and incident state. Let the agent discover that tool surface instead of pasting a static tool list into the conversation.

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

## Hosted authentication

The console Worker reads ChatGPT Sites identity only at the server boundary, exchanges it with the API through a one-time handoff, and redirects the browser into a cookie-backed Clear session. The final flow must be verified in a fresh ChatGPT browser session before submission.

Anonymous sandbox sessions are separate from real projects and use short-lived session identifiers rather than ingest keys. They support investigation and diagnosis only. They never synthesize a code change or deployment.
