# Clear product decisions

The high-level product and deployment questions are settled for the hackathon release. This file records the decisions that should guide implementation. Remaining work should be handled as normal implementation detail unless it changes one of these boundaries.

## Product boundary

- Clear reads, queries, organizes, and displays telemetry. It never edits repositories, holds deployment credentials, or executes infrastructure actions.
- Users bring their own repository and their own agent. The agent fixes code with access it already has.
- The website does not expose WebMCP tool names, registration state, activity feeds, or other implementation plumbing.
- The submission video is rehearsed and narrated. The overload is manufactured, but the telemetry, WebMCP calls, code change, Render deployment, deploy event, and recovery are real.

## Hosted product

- Public name: Clear.
- Console: `clear.seufert.sh` on ChatGPT Sites.
- API: `api.clear.seufert.sh` on Render.
- OTLP/HTTP: `otlp.clear.seufert.sh` on Render.
- Storefront: `checkout.clear.seufert.sh` on ChatGPT Sites.
- Checkout API: `checkout-api.clear.seufert.sh` on Render.
- Authentication: Sign in with ChatGPT through the Sites identity handoff. No Clerk or second login provider for the hackathon.
- Ownership: one account owns one durable project. Team membership is deferred.
- Keys: at most three active ingest keys per project.
- Retention: 24 hours for raw metrics, logs, and traces, plus 7 days for metric rollups.
- Hosted ingest: OTLP/HTTP protobuf and JSON for metrics, logs, and traces. Public OTLP/gRPC is deferred.
- Availability: one stateful instance, no horizontal scaling, no high-availability claim, and no off-host backups for the hackathon.
- Self-hosting: not a supported hackathon product surface. Compose remains a contributor-only local environment.

## Deployment

- Use the Render hackathon credit and keep the recurring footprint within it.
- Run the stateful Clear stack on one Render 1 CPU, 2 GB service with a 10 GB persistent disk.
- Keep the checkout API on a separate Render service so a checkout-only commit produces a clean real deployment in the video.
- Publish the console and storefront with ChatGPT Sites.
- Do not add Cloudflare, Fly.io, or another host unless a verified platform limitation blocks the chosen topology.

## Sandbox and judge path

- The homepage has two primary choices: **Demo incident** and **Log in to create a project**.
- Each anonymous demo is isolated, lasts two hours, and can be reset.
- The sandbox supports investigation and diagnosis. It does not expose a synthetic fix or fake a code deployment.
- The submission video provides the complete real fix and recovery arc.

## Alerts and incidents

- Threshold rules fire and resolve independently from incidents.
- A firing alert does not automatically open an incident.
- Humans and agents can start and close investigations.
- Humans can create a simple alert through a focused modal.
- Agents own panel composition, hypotheses, notes, and annotations. There is no human panel editor.

## Interface

- Use a sidebar for Board, Explore, Alerts, Incidents, and Settings. Keep the account control at the bottom.
- Explore contains Metrics, Logs, and Traces with shared time, service, and environment context.
- Hide service and environment selectors until there is more than one relevant value.
- Show connection failures only when they happen. Do not render persistent connection-status chrome.
- Keep the homepage simple and spacious, with one subtle shader treatment and no product implementation copy.
- Continue using the local StyleX, Base UI, and Hugeicons component system.

## No blocking high-level questions

There are no remaining high-level questions that require the project owner's input. If a new choice would materially change one of the decisions above, add it here before expanding scope.
