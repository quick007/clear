# Clear video runbook

This runbook produces a scripted, rehearsed, and narrated product demonstration under three minutes. The load is deliberately manufactured and the diagnosis sequence is staged. The service requests, controlled failure, OpenTelemetry signals, WebMCP tool calls, checkout code change, Render deployment, deploy annotation, and recovery are real.

## Non-negotiable story boundary

Clear observes and presents. It never edits a repository, holds deploy credentials, or changes production. The user's agent fixes the checkout service with access it already has. Clear receives the resulting deploy event and telemetry.

Include this line in the YouTube description or end-card fine print:

> Scripted diagnosis against manufactured load. Telemetry, tool calls, checkout code change, Render deploy, and recovery recorded against the live stack.

## Recording target

- Final duration: 2:55
- Master capture: 2560 by 1440, 30 fps
- Final export: 1920 by 1080, 30 fps
- Audio: Lukas records the supplied narration after picture lock
- Captions: `video/captions.srt`
- Scenario seed: `clear-video-v1`
- Scenario traffic: 50 requests per second, 800 deterministic users
- Browser: ChatGPT's built-in browser with Clear open
- Agent: a fresh Codex task whose visible project root is only `checkout-api`

Do not show secrets, control endpoints, deployment dashboards, browser bookmarks, personal notifications, unrelated tasks, or the director brief in the final edit.

## Clean Codex project

The real shoot needs Git history, workspace dependencies, and a pushable branch. Use a fresh clone, then open only its checkout service subdirectory as the Codex project:

```sh
git clone https://github.com/quick007/clear.git clear-shoot
cd clear-shoot
git switch shoot/checkout-incident
vp install
cd apps/checkout-api
vp run test
```

The dedicated `shoot/checkout-incident` branch should begin at the known buggy commit and drive the separate checkout Render service. Because Codex opens `apps/checkout-api` as its project root, the sidebar contains only the service the agent will fix. Git still works from that subdirectory while the full clone keeps workspace dependencies available.

For an offline UI rehearsal that does not need to push, create a standalone checkout-only copy:

```sh
vp exec node video/scripts/prepare-shoot-workspace.mjs ../clear-checkout-rehearsal
cd ../clear-checkout-rehearsal
vp install
vp run test
```

## Director brief for the agent

Send this once before recording. Let the agent acknowledge it, then begin capture at the first visible audience prompt. This is direction for a staged demonstration, not hidden evidence of autonomous discovery.

```text
We are recording a rehearsed Clear product demonstration. Wait for each audience prompt and stop after completing that beat.

On the first prompt, use Clear site tools to inspect the overview and active alerts. Treat increased request volume as the leading hypothesis, record it as testing, and do not inspect retry dimensions or repository code yet.

When the next prompt challenges user volume, compare upstream request rate with distinct users from incoming checkouts, create the useful comparison panel, then inspect upstream requests by attempt and retry state. Confirm the explanation with one representative trace and correlated logs. Reject the traffic-surge hypothesis, confirm retry amplification, and stop.

On the fix prompt, inspect src/lib/retry.ts. Implement a focused production-quality repair with bounded exponential backoff, jitter, a retry budget, and a small circuit breaker. Preserve Effect v4 style and existing telemetry. Run the focused tests, commit, and push the current shoot branch. Stop after the push.

On the final prompt, return to Clear, verify the deploy annotation and recovery across the relevant metrics, add a concise incident summary, and close the incident.

Keep responses concise enough for editing. Never imply that Clear edited code or deployed the service.
```

## Visible prompt script

Use these exact prompts in the recorded task.

### Prompt 1, orient and take the decoy

```text
Investigate the active checkout incident in Clear. Start with the most likely explanation and show it on the board.
```

Expected result: the agent calls the console overview and alert tools, writes a tentative traffic-surge hypothesis, and stops. Capture the tool calls in the Codex interaction and the hypothesis on the Clear board. The website itself must not show tool names, registration state, or an agent activity feed. The claim must remain a hypothesis, not a fabricated conclusion.

### Prompt 2, challenge and diagnose

```text
If requests tripled, where are the users? Test that assumption, then follow the strongest evidence across metrics, traces, and logs.
```

Expected result: the agent creates the upstream-requests versus distinct-users comparison, discovers retries, samples one representative trace and its correlated logs, rejects traffic surge, and confirms retry amplification.

### Prompt 3, fix through the agent's own repository access

```text
Fix the root cause in this checkout service. Keep the change focused, run the retry tests, then commit and push the shoot branch.
```

Expected result: the agent reads `src/lib/retry.ts`, edits the service, runs the focused tests, commits, and pushes. Clear is not involved in this operation.

### Prompt 4, verify and close

```text
The deploy is live. Verify recovery in Clear, summarize the incident, and close it.
```

Expected result: the agent verifies the deploy marker, request and retry normalization, latency recovery, and healthy alerts. It closes the incident, which removes the incident-scoped tools.

## Live scenario rehearsal

Run these controls off-camera from a terminal with `LOAD_GENERATOR_URL` and `CONTROL_TOKEN` already present in its environment. Never display or paste the token into the filmed Codex task.

Start a deterministic take:

```sh
curl --fail-with-body \
  -H "Authorization: Bearer ${CONTROL_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"baselineDurationMs":45000,"blipDurationMs":20000,"maxDurationMs":600000,"rateRps":50,"seed":"clear-video-v1","uniqueUsers":800}' \
  "${LOAD_GENERATOR_URL}/v1/scenario/start"
```

Begin screen capture only after the scenario reports `amplification`, the alert is firing, and the incident is open. Baseline must already be visible in the selected board window.

After Render reports the fixed service healthy, first record the retry rate and latency improving while the controlled dependency fault is still active. This is the evidence that the code change bounded the amplification. Then end the manufactured dependency fault explicitly:

```sh
curl --fail-with-body \
  -X POST \
  -H "Authorization: Bearer ${CONTROL_TOKEN}" \
  "${LOAD_GENERATOR_URL}/v1/scenario/recover"
```

The narration must say that the controlled dependency fault is ending. Do not imply that the deploy itself repaired the upstream service. The final return to baseline is the combination of a checkout service that now fails safely and the manufactured upstream fault being lifted.

Stop and reset traffic after a take:

```sh
curl --fail-with-body \
  -X POST \
  -H "Authorization: Bearer ${CONTROL_TOKEN}" \
  "${LOAD_GENERATOR_URL}/v1/scenario/stop"
```

Restore the dedicated shoot branch with a normal revert commit after capturing the fixed state. Do not rewrite main and do not force-push:

```sh
git revert <fix-commit-sha>
git push origin shoot/checkout-incident
```

## Preflight gate

Do not record until every item passes:

- Clear receives current metrics, logs, and traces from the three example services.
- The selected time window includes at least 45 seconds of healthy baseline.
- P2 shows roughly 3x upstream requests, incoming checkouts and distinct users within 10 percent of baseline, and retries above 55 percent of upstream requests.
- A representative trace contains load-generator, checkout-api, and payments-stub spans.
- The checkout preview service deploys only from the dedicated shoot branch.
- Startup emits exactly one deploy event with the new commit SHA.
- The fresh Codex project can run the retry tests and push the shoot branch.
- Incident-scoped tools are absent before open, available to the agent during the incident, and absent after close. Verify this in the agent surface, never through website chrome.
- The Site access prompt appears at most once in the planned take.
- Desktop notifications, menu-bar distractions, and unrelated browser tabs are hidden.

## Narration script

Read naturally. The time labels are edit targets, not lines to speak.

**0:00 to 0:11**

Dashboards were built for human hands. Clear is an OpenTelemetry observability surface that you and your own agent can operate together.

**0:11 to 0:24**

Here, a controlled failure in a real payments service has pushed checkout latency and errors sharply upward. Real traffic is flowing through an instrumented checkout stack, and metrics, logs, and traces are arriving over OTLP.

**0:24 to 0:42**

My agent starts with Clear's typed site tools. The tool calls stay in our conversation while the website stays focused on the shared evidence, so I can see the reasoning and steer the investigation.

**0:42 to 0:57**

At first, the rising upstream request rate looks like a traffic surge. We record that as a hypothesis, not a conclusion.

**0:57 to 1:15**

But if traffic tripled, where are the users? The agent builds the comparison we need. Upstream requests are up three times while unique users stay flat.

**1:15 to 1:34**

Grouping upstream requests by attempt and retry state exposes the amplification. One trace and its correlated logs confirm three immediate retries against the failing dependency. The first hypothesis is rejected.

**1:34 to 2:03**

Now the agent uses its existing repository access. It reads the retry code, adds bounded backoff, jitter, a retry budget, and a circuit breaker, runs the tests, and pushes the dedicated shoot branch.

**2:03 to 2:23**

Render deploys the service. Clear did not touch production. It simply observes the deploy event landing on every relevant panel, then shows retries and latency falling back to baseline.

**2:23 to 2:39**

The agent writes the incident summary and closes it. Its incident-only capabilities disappear because the tool surface follows the work, without adding tool plumbing to the website.

**2:39 to 2:55**

Clear accepts standard OpenTelemetry metrics, logs, and traces. Bring your own agent, connect your own service, or try the isolated sandbox. The whole stack is open source.

## Honest release copy

Suggested YouTube description paragraph:

> Clear is an open source OpenTelemetry observability surface built for people and their agents to share. This narrated video uses a scripted diagnosis sequence against manufactured load and a controlled failure. The traffic, OTLP telemetry, WebMCP calls, checkout code change, Render deployment, annotation, and recovery were recorded against the live stack. Clear observes only. The user's agent performs the fix with its own repository access.
