# WebMCP implementation notes

Research snapshot: 2026-08-27. The WebMCP specification is a live draft. Recheck the linked sources before changing the adapter or upgrading browser typings.

## Implementation decision

Clear should use the top-level imperative `document.modelContext` API through one small adapter owned by `apps/console`. Do not spread direct `document.modelContext` calls through React components.

The first implementation should use only the intersection currently supported by ChatGPT site tools and Chrome:

- Feature-detect `document.modelContext?.registerTool`.
- Register one tool at a time with `registerTool(tool, { signal })`.
- Unregister by aborting the registration signal. There is no standard `unregisterTool()` method.
- Describe inputs with a JSON Schema object, then decode them again with the authoritative Effect Schema inside `execute`.
- Return a small JSON-serializable value directly. Do not wrap results in an MCP `content` envelope.
- Use only `readOnlyHint` and `untrustedContentHint`. No consequential, destructive, idempotent, or open-world annotation exists in the current WebMCP draft.
- Register every tool in the top-level page. ChatGPT does not currently discover tools registered in iframes.
- Skip the declarative form API for the submission. ChatGPT does not currently expose declarative tools as site tools.

This preserves the product's dynamic incident-scoped tool surface without depending on draft-only convenience APIs.

## Current platform matrix

| Capability                                      | ChatGPT built-in browser                                      | Chrome WebMCP trial                         | Clear choice                                 |
| ----------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------- |
| Imperative `document.modelContext.registerTool` | Supported                                                     | Supported                                   | Use                                          |
| Abort-signal unregistration                     | Documented                                                    | Supported                                   | Use                                          |
| `readOnlyHint`                                  | Documented                                                    | Supported                                   | Use for every non-mutating tool              |
| `untrustedContentHint`                          | Documented                                                    | Supported                                   | Use for telemetry and user-authored content  |
| Declarative form tools                          | Not supported                                                 | Available in the broader trial              | Do not ship for the hackathon                |
| Tools registered in iframes                     | Not discovered                                                | Broader iframe support exists               | Register only in the top-level document      |
| `getTools()` and `executeTool()`                | Browser-agent internals are not exposed as a product contract | Available for in-page agents and testing    | Do not use in product code                   |
| `toolchange`                                    | Browser handles discovery                                     | Available to in-page agents                 | No product dependency                        |
| `exposedTo` and `fromOrigins`                   | Irrelevant for top-level ChatGPT discovery                    | Available for secure frame trees            | Omit                                         |
| Explicit `unregisterTool()`                     | Not documented                                                | Not in the standard draft                   | Do not use                                   |
| `outputSchema`                                  | Not in the current standard tool dictionary                   | Not in the current standard tool dictionary | Validate outputs internally with Effect only |

ChatGPT currently documents site tools for GPT-5.6 Sol and GPT-5.6 Terra in the latest desktop app. GPT-5.6 Luna has WebMCP disabled. Site tools are not currently available in Enterprise or Edu workspaces, and availability still depends on rollout. Record the exact account, model, app version, and URL used in the final smoke test.

Chrome currently documents an origin trial beginning with Chrome 149 and a local development flag at `chrome://flags/#enable-webmcp-testing`. Its docs say that from Chrome 153, aborting a registration removes the tool without cancelling an already-running execution. Clear must still pass the invocation's separate cancellation signal into fetches and other long-running work.

## Exact producer API used by Clear

The current draft's producer-facing shape is effectively:

```ts
interface ModelContextTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: object;
  execute: (
    input: Record<string, unknown>,
    options: { signal: AbortSignal },
  ) => unknown | Promise<unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
}

interface ModelContext {
  registerTool(
    tool: ModelContextTool,
    options?: { signal?: AbortSignal; exposedTo?: string[] },
  ): Promise<void>;
}
```

Use the `webmcp-types` package recommended by Chrome for ambient browser types. At this research snapshot, the current package version is `0.1.5`. Pin it in the lockfile and recheck the declaration against the draft on upgrade.

Tool names must be 1 to 128 characters and contain only ASCII letters, digits, `_`, `-`, or `.`. Chrome's security guidance recommends staying under 30 characters for tool and parameter names, under 500 characters for tool descriptions, under 150 characters for parameter descriptions, and around 1,500 characters for an individual result.

Registration can reject with browser exceptions. Important cases include:

- `InvalidStateError` for duplicate names, invalid names, empty descriptions, or an inactive document.
- `NotAllowedError` when the `tools` Permissions Policy disables registration.
- `SecurityError` for an invalid origin-isolation state or an insecure `exposedTo` origin.
- The abort reason when a registration signal is already aborted.
- A serialization error for a cyclic or otherwise non-serializable input schema.

Do not send `Origin-Agent-Cluster: ?0`, do not use `document.domain`, and do not disable the `tools` Permissions Policy. WebMCP is a secure-context, origin-isolated feature. The default permissions policy is `self`, which is enough for Clear's top-level registration.

## Schemas and validation

The JSON Schema is an agent-facing description, not the authorization or validation boundary. Chrome explicitly recommends strict validation in application code because schema constraints are not guaranteed to be enforced as business logic.

Effect Schema remains the source of truth:

1. Define input and output schemas in the domain or API package.
2. Project the input schema to JSON Schema for `inputSchema`.
3. Snapshot-test the projection.
4. Decode `execute` input with Effect before calling application logic.
5. Decode or encode the result with the output Effect Schema before returning it.
6. Enforce authorization and current project/session scope on the server even after client decoding succeeds.

Use a conservative JSON Schema subset until both target browsers pass the inspector tests:

- Root `type: "object"`.
- `properties`, `required`, and `additionalProperties: false`.
- Primitive types, arrays with `items`, nested objects, and short `enum` values.
- Plain descriptions on every non-obvious field.

Avoid relying on `$ref`, recursive schemas, transforms, custom keywords, or complex compositions in the browser-facing projection. This is a compatibility policy, not a claim that the draft forbids those features. Runtime Effect decoding is authoritative either way.

No-input tools should still publish an explicit closed object schema:

```ts
const noInputSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;
```

## Annotation policy

`readOnlyHint` means the tool does not modify state. It is a hint to the agent and browser, not an authorization guarantee.

Set `readOnlyHint: true` on:

- `get_console_overview`
- `list_services`
- `list_alerts`
- `list_metrics`
- `query_metrics`
- `search_logs`
- `get_logs_sample`
- `search_traces`
- `get_trace`
- `list_deploy_events`
- `get_board_state`

All panel, timeline, hypothesis, incident, and sandbox actions must use `readOnlyHint: false` or omit it. In particular, idempotence does not make `start_sandbox_incident` read-only.

Set `untrustedContentHint: true` whenever results can include values originating outside Clear's trusted product code. At minimum this applies to logs, traces, telemetry attributes, service names derived from resource attributes, user-authored annotations, hypotheses, and timeline notes. This means it should be true for:

- `get_console_overview`
- `list_services`
- `list_metrics`
- `query_metrics` when labels are returned
- `search_logs`
- `get_logs_sample`
- `search_traces`
- `get_trace`
- `get_board_state`
- `list_deploy_events` when descriptions or URLs are external

It can remain false for results composed only from fixed enums, server-generated identifiers, and trusted product copy. When uncertain, mark the result untrusted. Continue to label telemetry text as data in the returned payload and never render it as HTML.

There is no current `consequentialHint`. Do not add one to local types. ChatGPT performs its own safety review for every invocation and applies confirmation policy to consequential actions regardless of what the site claims.

## Result and error contract

The standard callback resolves with any JSON-serializable value. The draft serializes that value. Avoid `undefined`, `BigInt`, class instances, functions, symbols, cycles, or objects with surprising `toJSON` behavior.

Use one compact application-level envelope for expected outcomes:

```ts
type ToolSuccess<T> = {
  ok: true;
  data: T;
  hint?: string;
  truncated?: boolean;
  nextCursor?: string;
};

type ToolFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
  hint?: string;
};
```

Expected validation, stale-state, quota, cursor, and not-found failures should resolve as `ToolFailure` so an agent receives a useful correction. Unexpected defects should reject, be captured by product telemetry, and show a safe generic message. The current draft can collapse rejected callbacks to a generic execution failure, so throwing a detailed domain error is not a reliable way to teach the agent how to retry.

Every mutating result should include the created or changed resource ID and enough resulting state to verify that the visible board updated. Every query result should include its effective time window, resolution, grouping, limits, and whether it was truncated. Keep raw series bounded and prefer summaries plus a cursor or a follow-up hint.

Do not return an MCP-shaped value such as `{ content: [{ type: "text", text: ... }] }`. That shape appears in older explainers and MCP examples, but the current browser API returns the callback's JSON-serializable value directly.

## Dynamic scope model

Clear has three registration scopes:

1. Session scope exists for the life of the top-level document.
2. Sandbox scope exists for the life of an anonymous sandbox session and never exists in real mode.
3. Incident scope exists only while the current incident is open.

Use one `AbortController` per active scope. Sharing a signal across all tools in a scope makes teardown atomic from application code. The browser can emit tool-list changes asynchronously, so serialize scope reconciliation and do not immediately register the same names from two React effects.

The registry should live outside React's component lifecycle. Start it once from the application bootstrap after the session store exists. React Strict Mode intentionally remounts effects in development and can otherwise create duplicate-name races.

Incident transitions:

- Closed to open: create a fresh incident controller and register all incident tools.
- Open to open with the same incident: do nothing. Execute handlers read the current store and server state, not a captured incident snapshot.
- Open incident A to open incident B: abort A's controller, await the serialized reconciliation turn, then register B's tools with a fresh controller.
- Open to closed: abort the incident controller and clear it.
- Page teardown: abort all controllers.

If an incident closes while registration is still pending, abort that generation's controller. After all registration promises settle, compare the generation token with current state before publishing local registry status.

## Concrete TypeScript adapter sketch

This sketch keeps the unstable browser boundary in one module. The Effect helper names are intentionally adapter functions, because the project should bind them to the exact pinned Effect v4 APIs rather than copying a stale beta call signature into every tool.

```ts
import type {} from "webmcp-types";

type JsonObject = Readonly<Record<string, unknown>>;

type ToolContract<Input, Output> = {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputJsonSchema: object;
  readonly readOnly: boolean;
  readonly returnsUntrustedContent: boolean;
  readonly decodeInput: (value: unknown) => Promise<Input>;
  readonly encodeOutput: (value: Output) => Promise<JsonObject>;
  readonly run: (input: Input, signal: AbortSignal) => Promise<Output>;
};

const register = async <Input, Output>(
  contract: ToolContract<Input, Output>,
  registrationSignal: AbortSignal,
) => {
  const modelContext = document.modelContext;

  if (typeof modelContext?.registerTool !== "function") {
    return { supported: false as const };
  }

  await modelContext.registerTool(
    {
      name: contract.name,
      title: contract.title,
      description: contract.description,
      inputSchema: contract.inputJsonSchema,
      annotations: {
        readOnlyHint: contract.readOnly,
        untrustedContentHint: contract.returnsUntrustedContent,
      },
      execute: async (unknownInput, { signal }) => {
        const input = await contract.decodeInput(unknownInput);
        const output = await contract.run(input, signal);
        return contract.encodeOutput(output);
      },
    },
    { signal: registrationSignal },
  );

  return { supported: true as const };
};

type RegisterableTool = {
  readonly name: string;
  readonly register: (signal: AbortSignal) => Promise<{ supported: boolean }>;
};

const defineTool = <Input, Output>(contract: ToolContract<Input, Output>): RegisterableTool => ({
  name: contract.name,
  register: (signal) => register(contract, signal),
});

type Scope = "session" | "sandbox" | "incident";

class WebMcpRegistry {
  readonly #controllers = new Map<Scope, AbortController>();
  #reconcile = Promise.resolve();
  #incidentId: string | undefined;
  #disposed = false;

  replaceScope(scope: Scope, tools: ReadonlyArray<RegisterableTool>) {
    const prior = this.#reconcile.catch(() => undefined);

    this.#reconcile = prior.then(async () => {
      if (this.#disposed) return;
      this.#controllers.get(scope)?.abort();

      if (tools.length === 0) {
        this.#controllers.delete(scope);
        return;
      }

      const controller = new AbortController();
      this.#controllers.set(scope, controller);

      const outcomes = await Promise.allSettled(
        tools.map((tool) => tool.register(controller.signal)),
      );

      const failure = outcomes.find(
        (outcome): outcome is PromiseRejectedResult => outcome.status === "rejected",
      );

      if (failure && !controller.signal.aborted) {
        controller.abort();
        this.#controllers.delete(scope);
        throw failure.reason;
      }
    });

    return this.#reconcile;
  }

  setIncident(incidentId: string | undefined, tools: ReadonlyArray<RegisterableTool>) {
    if (incidentId === this.#incidentId) return this.#reconcile;
    this.#incidentId = incidentId;

    return this.replaceScope("incident", incidentId ? tools : []).catch((error: unknown) => {
      if (this.#incidentId === incidentId) this.#incidentId = undefined;
      throw error;
    });
  }

  dispose() {
    this.#disposed = true;
    for (const controller of this.#controllers.values()) controller.abort();
    this.#controllers.clear();
    this.#incidentId = undefined;
  }
}
```

`defineTool` closes over each tool's specific input and output contract before the registry stores the non-generic registration operation. This preserves the relationship without `any` or unsafe casts.

Each handler should call the existing typed Effect API client and pass the invocation signal through to its request. Tool names, registration state, raw arguments, and execution plumbing stay in the agent interaction. The Clear website renders only product state such as telemetry, hypotheses, annotations, and timeline entries. Never mirror raw log bodies, span attributes, ingest keys, cookies, or handoff codes into browser-visible diagnostics.

## ChatGPT Sites integration facts

The current public Sites documentation supports:

- Public Sites with optional Sign in with ChatGPT.
- `/signin-with-chatgpt` and `/signout-with-chatgpt` platform routes.
- A stable server-side user identifier plus authenticated email and optional full name.
- Hosted environment variables and secrets configured in Site settings, not in `.openai/hosting.json`.
- Custom apex domains and subdomains where the feature is available.
- HTTP, HTTPS, and WebSockets, but not raw TCP.

Use the stable Sites user identifier as the hosted account key. Email and display name are presentation data, never identity keys. Verify the exact header names and values in the deployed runtime before submission, and fail closed when the stable identifier is absent. Do not add a second identity provider for the hackathon.

The public Sites page also does not document the exact server-handler framework API for a local Vite project. It only states that the authenticated identity arrives at the Site's server in request headers. Therefore:

- Never read or trust `oai-authenticated-user-*` headers in browser JavaScript.
- Confirm the actual Sites server entry point produced for this project before implementing the Render handoff.
- Put the Sites-to-Render credential in hosted Site secrets.
- Create a short-lived, single-use handoff server-side, then use a top-level redirect to the Render callback.
- Set the Render session as a host-only `HttpOnly`, `Secure`, `SameSite=Lax` cookie.
- Call `https://api.clear.seufert.sh` with `credentials: "include"` and exact credentialed CORS for `https://clear.seufert.sh`.
- Verify cookie behavior in the actual ChatGPT browser. Sharing `seufert.sh` makes the two HTTPS origins same-site, but they remain cross-origin and still require CORS.

Custom domains and Sign in with ChatGPT are availability-gated beta features. Keep the generated `*.chatgpt.site` URL as a fallback until `clear.seufert.sh` is verified from a signed-out browser and a fresh ChatGPT browser profile.

## Test plan

### Contract tests

- Snapshot every projected input JSON Schema.
- Decode valid, invalid, missing, and extra inputs with Effect.
- Prove every successful result is JSON-serializable and below its result budget.
- Prove expected failures return the typed failure envelope.
- Prove cursor, point, log, span, and panel limits are enforced server-side.
- Prove telemetry-derived results set `untrustedContentHint`.
- Prove all search, get, list, and query tools are read-only and every mutation is not.

### Registry tests with a fake `ModelContext`

- Unsupported browsers leave the normal UI fully functional.
- Session tools register once.
- Sandbox tools never register in real mode.
- Incident tools appear on open and their signal aborts on close.
- Rapid open, close, and reopen does not leave duplicate names or stale controllers.
- Partial registration failure aborts the whole affected scope.
- Invocation cancellation reaches the Effect HTTP request.
- Page disposal aborts all registrations.

### Chrome test

1. Enable `chrome://flags/#enable-webmcp-testing` and relaunch Chrome.
2. Open the top-level local console directly, not in an iframe.
3. Use the Model Context Tool Inspector extension to inspect registrations, call each tool manually, verify schema parsing, and inspect structured results.
4. Confirm the tool list changes when an incident opens and closes.
5. Confirm no tool result exceeds its bounded contract.
6. Run a small prompt suite that tests first-call orientation, metric investigation, log and trace correlation, panel composition, and incident close.

### ChatGPT built-in browser test

1. Use the latest desktop app with GPT-5.6 Sol or Terra in a supported non-Enterprise, non-Edu workspace.
2. Open the deployed Site at the top level and accept the one-time site-access prompt.
3. Open **Site tools** in the address bar and record the exact available names.
4. Confirm incident tools are absent before an incident, present while open, and absent after close.
5. Invoke every core tool through the agent, then inspect **Recently used** and **Sources**.
6. Confirm a reload restores the right scope from server state.
7. Confirm normal UI operation when site tools are disabled in Browser settings.
8. Test signed-out sandbox, signed-in real mode, and a fresh browser profile.

Do this smoke test before polishing the full tool catalog. The actual judging surface takes precedence over draft text.

## Moving or unknown surfaces

Treat these as explicit revalidation points:

- The WebMCP draft is not stable and had changes the day before this research snapshot.
- Chrome documentation and the draft currently disagree on the testing shape of `executeTool()` input. Clear does not call `executeTool()`, so isolate this from product code.
- Chrome 153 changed how registration abort interacts with in-flight execution. Keep registration and invocation cancellation as separate signals.
- ChatGPT supports only a subset of the broader draft, specifically no declarative tools and no iframe discovery at this snapshot.
- There is no standard consequential or destructive annotation at this snapshot.
- There is no standard `outputSchema` at this snapshot.
- The exact JSON Schema dialect and supported keyword subset are not stated as a cross-browser compatibility guarantee.
- The exact Sites server-handler API for this Vite project is not described in the public Sites page.
- No stable Sites subject header is documented publicly at this snapshot.
- Custom-domain and Sign in with ChatGPT availability must be verified in the account used for submission.

## Official sources

- [OpenAI: Site tools](https://learn.chatgpt.com/docs/webmcp)
- [OpenAI: Sites](https://learn.chatgpt.com/docs/sites)
- [OpenAI: Browser](https://learn.chatgpt.com/docs/browser)
- [Chrome: WebMCP overview](https://developer.chrome.com/docs/ai/webmcp)
- [Chrome: Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
- [Chrome: WebMCP best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices)
- [Chrome: WebMCP tool security](https://developer.chrome.com/docs/ai/webmcp/secure-tools)
- [WebMCP draft specification](https://webmachinelearning.github.io/webmcp/)
- [WebMCP draft source at the researched revision](https://github.com/webmachinelearning/webmcp/tree/41d12f057167ccf5954dbcf49d99502cb6c84491)
