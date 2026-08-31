# Submission guide

Clear is an OpenTelemetry investigation surface for an operator and the coding agent they already use. This guide points reviewers to the concrete implementation behind the submission criteria. It does not treat a staged sandbox as a real deployment workflow.

## Start here

1. Open [the live console](https://clear.seufert.sh) in ChatGPT's in-app browser with site tools available, or in Chrome with WebMCP enabled.
2. Choose **Investigate an incident** to enter an isolated two-hour sandbox.
3. Ask the agent to inspect the active alert, test a hypothesis with the smallest useful metric, log, and trace queries, and compose a panel if it clarifies the diagnosis.
4. Inspect the board after each tool call. The board is the shared evidence surface, not a chat transcript.

The anonymous sandbox is for investigation only. It can start and reset a deterministic incident, but it does not simulate a repository change or deployment. The recorded walkthrough is the separate real checkout-stack recovery path described in [the video runbook](video-runbook.md).

## WebMCP leverage

WebMCP is the agent interface for the same product operations the console renders. It is not a chat widget or a static list of commands.

- [`apps/console/src/webmcp/registry.ts`](../apps/console/src/webmcp/registry.ts) owns one top-level `document.modelContext` registry with explicit session, sandbox, and incident lifecycles.
- [`apps/console/src/webmcp/always-tools.ts`](../apps/console/src/webmcp/always-tools.ts) provides typed, bounded operations for overview, services, alerts, metrics, logs, traces, deploy annotations, and board state, plus board composition.
- [`apps/console/src/webmcp/incident-tools.ts`](../apps/console/src/webmcp/incident-tools.ts) adds hypothesis, timeline, and incident-close capabilities only while an incident is open. [`apps/console/src/webmcp/sandbox-tools.ts`](../apps/console/src/webmcp/sandbox-tools.ts) adds deterministic start and reset controls only for a sandbox session.
- [`apps/console/src/webmcp/tool-contract.ts`](../apps/console/src/webmcp/tool-contract.ts), [`schemas.ts`](../apps/console/src/webmcp/schemas.ts), and [`registry.test.ts`](../apps/console/src/webmcp/registry.test.ts) keep the browser-facing schema, bounded result contract, validation, cancellation, and dynamic registration behavior explicit.

The full browser compatibility and safety rationale is in [WebMCP implementation notes](webmcp-implementation-notes.md). Tool results treat telemetry and user-authored content as untrusted data, and the server repeats authorization and project-scope checks.

## Execution and a fresh clone

Clear accepts standard OpenTelemetry metrics, logs, and traces over OTLP. The repository includes the Effect API, an OpenTelemetry Collector distribution, PostgreSQL and ClickHouse persistence, a React console, a deterministic sandbox, and an instrumented checkout incident stack. See [the architecture](architecture.md) and [OTLP quickstart](otel-quickstart.md).

For a fresh-clone verification, install Node.js 24 or newer, Vite+ 0.3.x, Docker Engine with Compose v2, and at least 4 GB available to Docker. Then run:

```sh
vp install
vp run ready
```

The readiness gate is intentionally environment-free. Before running the console or local services, create the runtime configuration files:

```sh
cp .env.example .env
cp apps/console/.env.example apps/console/.env.local
cp apps/checkout-web/.env.example apps/checkout-web/.env.local
```

`vp run ready` runs format, lint, and type checks, then the fast workspace test suites and builds. Database integration tests are opt-in because they start PostgreSQL and ClickHouse; CI runs them in the [dedicated persistence job](../.github/workflows/ci.yml). To start the local services after that gate, follow [the local stack guide](self-hosting.md).

The public console and API health endpoint were reachable when this guide was last checked. Hosted availability, browser WebMCP support, and identity handoff remain deployment-time checks, not guarantees made by the source tree.

## Potential impact

The concrete problem is an operational gap: coding agents can inspect code, but without production evidence they can confidently pursue the wrong explanation. Clear lets the operator and that agent work from the same OpenTelemetry evidence and retain the useful view on the board.

The included incident makes that failure mode testable. The checkout API records one incoming checkout while each immediate retry creates a separate upstream request. Under a controlled payments failure, upstream volume rises while incoming checkout volume and the user cohort stay flat. A metric comparison, retry grouping, trace, and correlated logs distinguish retry amplification from a traffic surge. The implementation and scenario details are in [`apps/checkout-api/README.md`](../apps/checkout-api/README.md), [`examples/load-generator/README.md`](../examples/load-generator/README.md), and [`packages/telemetry-gen/README.md`](../packages/telemetry-gen/README.md).

Clear deliberately stops at observability. It does not hold repository or deployment credentials, change infrastructure, merge code, or deploy. The external coding agent owns code and deployment access; Clear receives the resulting deploy event and recovery telemetry as data. See [the product boundary](architecture.md#product-boundary) and [real-project workflow](real-mode.md).

## Creativity and ambition

Clear changes the division of labor instead of adding a vendor copilot beside a dashboard. The agent can create a durable, shared evidence view, while the human can see and steer the investigation in the browser. Tool availability follows the live work state: general investigation tools persist, sandbox controls exist only in sandboxes, and incident tools disappear after the incident closes.

The sandbox-only `simulate_fix_deploy` recovery transition, named `simulateFixDeploy` in the generator, exists for scenario testing. It is not a WebMCP tool or a `/v1/sandbox/fix` API route: the public sandbox API exposes only session creation, incident trigger, and reset. This keeps the judge sandbox honest while allowing controlled scenario tests. See [`packages/telemetry-gen/src/engine.ts`](../packages/telemetry-gen/src/engine.ts), [`packages/api-contract/src/groups/sandbox.ts`](../packages/api-contract/src/groups/sandbox.ts), and [`packages/api-contract/test/api.test.ts`](../packages/api-contract/test/api.test.ts).

## Evidence map

| Criterion               | What to inspect                                                                                                                           | What it establishes                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| WebMCP leverage         | `apps/console/src/webmcp/`, its registry tests, and [the browser notes](webmcp-implementation-notes.md)                                   | Typed operations, schema validation, result bounding, untrusted-content handling, cancellation, and state-scoped registration |
| Execution               | [fresh-clone command](#execution-and-a-fresh-clone), `infra/compose.yaml`, `apps/collector/`, `apps/backend/`, and `apps/console/`        | A runnable local stack with data plane, control plane, storage, and console rather than a standalone interface mock           |
| Potential impact        | `apps/checkout-api/`, `apps/payments-stub/`, `examples/load-generator/`, and the incident docs above                                      | A specific retry-amplification diagnosis that requires comparing signals rather than trusting one chart                       |
| Creativity and ambition | [product boundary](architecture.md#product-boundary), WebMCP registry scopes, board operations, and [the video runbook](video-runbook.md) | A shared human-agent investigation surface that keeps execution authority outside the telemetry product                       |

## Reviewer boundaries

- Sandbox data and controls are isolated per session and expire. They prove investigation behavior, not a real code-change or deploy loop.
- The video is rehearsed against a manufactured fault. Its runbook distinguishes the real traffic, telemetry, WebMCP calls, code change, deploy event, and recovery from the controlled fault itself.
- The hackathon service is single-instance and is not presented as a high-availability or independently security-audited production offering.
