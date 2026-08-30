# Clear Devpost media

This folder turns real Clear and Codex captures into the final Devpost gallery set. Product interfaces always come from screenshots. The renderer adds only restrained framing, labels, and evidence callouts declared in `manifest.json`.

## Capture sources

Capture every source at 2560 by 1440 without browser chrome. Keep the same sandbox session and incident window across the board, trace, log, and recovery images.

| File                            | Capture                                                     |
| ------------------------------- | ----------------------------------------------------------- |
| `sources/homepage.png`          | Signed-out homepage after the paper shader settles          |
| `sources/homepage-material.png` | Shader-only lower edge derived from `homepage.png`          |
| `sources/board-reveal.png`      | Requests elevated, users flat, retries visible              |
| `sources/codex-agent.png`       | Clean Codex task with only the checkout repository attached |
| `sources/board-agent.png`       | Clear at the same moment as the Codex capture               |
| `sources/trace-detail.png`      | Real retrying checkout trace with an upstream failure       |
| `sources/log-detail.png`        | Correlated logs for the same service and time window        |
| `sources/recovery-board.png`    | Real deploy marker with latency and retries recovering      |

Do not include keys, tokens, local paths, unrelated browser tabs, or unfinished UI. Use the real deployed app and a real Codex task. If a callout disagrees with the captured value or points at the wrong evidence, adjust the manifest before rendering.

`homepage-material.png` is a deterministic crop and resize of the real homepage capture. Regenerate it from `homepage.png`; do not repaint or hand-edit the shader.

## Final outputs

| File                                      | Size         | Purpose                            |
| ----------------------------------------- | ------------ | ---------------------------------- |
| `outputs/clear-devpost-thumbnail.jpg`     | 1800 by 1200 | Project card and gallery thumbnail |
| `outputs/clear-devpost-hero.png`          | 1800 by 1200 | Clear dashboard hero               |
| `outputs/clear-board-reveal.png`          | 1920 by 1080 | Retry-storm evidence               |
| `outputs/clear-agent-collaboration.png`   | 1920 by 1080 | Shared human-agent investigation   |
| `outputs/clear-trace-log-correlation.png` | 1920 by 1080 | Correlated trace and log evidence  |
| `outputs/clear-deploy-recovery.png`       | 1920 by 1080 | Real deploy and service recovery   |

## Render workflow

From the repository root:

```bash
vp run media:validate:manifest
vp run media:render
vp run media:validate
```

While captures are still arriving, render one ready asset at a time:

```bash
vp run media:render --only board-reveal
```

The renderer fails with the exact missing source and its capture instructions. It also checks output dimensions, file format, and upload size.

## Composition rules

- Keep evidence captures fully opaque and at their natural aspect ratio. The hero dashboard may use restrained transparency for its glass treatment.
- Tone down only the homepage shader material used behind the captures.
- Keep the hero to one headline and one dashboard. Do not add a separate logo, agent capture, subtitle, or callout.
- Use no more than one headline and three evidence callouts on evidence images.
- Keep labels factual. The screenshot is the source of truth.
- Point at the exact chart line, trace span, log row, or deploy marker being described.
- Prefer a focused crop over shrinking an entire interface until it is unreadable.
- Recheck every asset at thumbnail size before uploading it to Devpost.
