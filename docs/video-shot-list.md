# Clear exact shot list

The master timeline is 2:55. Record longer source clips, then cut to these exact durations. Prefer one confident composition per beat over constant motion.

## Capture layout

- Record at 2560 by 1440 with the macOS display scale set for readable interface text.
- Keep Codex and the in-app browser in the same clean task when both matter.
- Use the Clear board full frame for evidence and recovery.
- Open the source file full frame for the code edit.
- Hide the Dock, desktop icons, notifications, unrelated tabs, and menu extras.
- Keep cursor movement slow and purposeful. Park it outside charts while data moves.
- Do not change browser zoom during a take. Apply crops in the edit.

## Timeline

| Time         | Length | Picture                      | Action                                                                                                                                               | Crop and motion                                                                                                   |
| ------------ | -----: | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 0:00 to 0:11 |    11s | Clear board                  | Start on the active incident with the primary panel moving. Brand stays visible.                                                                     | Fade in over 8 frames. Begin at 100 percent, ease to 106 percent on the chart.                                    |
| 0:11 to 0:24 |    13s | Checkout, then board         | Show one successful checkout, then hard cut to firing alerts and rising volume.                                                                      | Two clips. Static storefront, then 108 percent crop on alert and primary chart.                                   |
| 0:24 to 0:42 |    18s | Codex with board             | Type Prompt 1. Keep the first site-access confirmation. Show the overview and alert tool calls in the Codex interaction.                             | Start wide. Step to a 112 percent crop that keeps chat and the resulting board hypothesis in frame.               |
| 0:42 to 0:57 |    15s | Board incident header        | The tentative traffic-surge hypothesis appears beside the active alerts. No tool names or registration state appear on the website.                  | Hold 110 percent on the hypothesis and alert context, then return wide.                                           |
| 0:57 to 1:15 |    18s | Codex, then board            | Type Prompt 2. Cut directly to the newly created upstream requests versus users panel.                                                               | Hard cut on Enter. Slow 104 to 111 percent push into the divergence.                                              |
| 1:15 to 1:34 |    19s | Board, trace detail, logs    | Show retries above 55 percent, one trace waterfall, and two correlated log lines. Hypothesis flips to rejected and retry amplification to confirmed. | Three short clips. Use static crops, no more than 114 percent. Match cut on the trace ID.                         |
| 1:34 to 2:03 |    29s | Codex source view            | Type Prompt 3. Show `retry.ts` before, the focused edit, the test passing, and the push result.                                                      | Full source view. Use jump cuts through agent latency. Keep test and push outputs on screen for 1.5 seconds each. |
| 2:03 to 2:23 |    20s | Clear board                  | Deploy annotation lands. Retry volume, p95, and errors fall.                                                                                         | Start at 112 percent on the deploy marker, then ease back to 100 percent as the board recovers.                   |
| 2:23 to 2:39 |    16s | Codex with board             | Type Prompt 4. The close tool call appears in Codex, the timeline summary appears on the board, and the incident closes.                             | Wide enough to show the interaction and timeline. End on a clean closed-incident state.                           |
| 2:39 to 2:55 |    16s | Healthy board, then end card | Show metrics, logs, and traces healthy. End on product name, live URL, GitHub, and sandbox prompt.                                                   | Slow return to full frame. Cut to static end card for final 6 seconds.                                            |

## Required inserts

Capture these as separate safety clips even if the main take succeeds:

1. Clean healthy baseline board for 15 seconds.
2. Firing alerts and P2 board for 15 seconds.
3. Codex site-tool calls during the incident and a clean closed-incident interaction, 5 seconds each.
4. Upstream requests versus users tooltip at baseline and peak.
5. Retry grouping tooltip above 55 percent.
6. Trace waterfall with all three services.
7. Correlated logs with the trace ID visible.
8. `retry.ts` before edit and after edit.
9. Focused test pass and Git push result.
10. Deploy annotation landing and 20 seconds of recovery.
11. Closed incident timeline.
12. Checkout storefront success before and after recovery.

## Edit rhythm

- Use hard cuts for cause and effect.
- Use a short dissolve only for the opening and final card.
- Speed up waiting, typing, tests, and deployment between 175 and 250 percent.
- Never speed up live chart recovery. The audience needs to see it breathe.
- Keep zooms between 100 and 116 percent. One zoom per idea is enough.
- Keep UI labels readable for at least 1.5 seconds.
- Do not add decorative glitch, scanline, gradient, or terminal effects.
- Keep tool names and registration state inside the Codex or ChatGPT interaction. The Clear website never renders an activity feed or tool tokens.

## End card

Use a plain warm-dark card matching the console:

```text
Clear
OpenTelemetry, shared with your agent

clear.seufert.sh
github.com/quick007/clear

Try the isolated sandbox
```

Small footer:

```text
Rehearsed diagnosis. Real telemetry, tools, code, deploy, and recovery.
```

## Continuity checks

- Every visible time range uses the same incident and scenario seed.
- The commit SHA in Codex, the deploy event, and Render's deployed revision match.
- The deploy marker appears after the push, never before.
- Show retry pressure falling with the fix while the dependency fault remains, then say when the controlled dependency fault is lifted and the full system returns to baseline.
- The traffic-surge hypothesis is tentative before evidence and visibly rejected after evidence.
- Clear never shows a deploy, repository, approval, or execution control.
- The agent tool-call cards do not expose secrets or raw sensitive telemetry.
- The final card URL and repository resolve from a clean session.
