# Clear Devpost media

This folder turns real Clear and Codex captures into the final Devpost gallery set. Product interfaces always come from screenshots. The renderer adds only a quiet background, rounded clipping, and a soft shadow declared in the asset files.

## Capture sources

Capture product sources at 2560 by 1440 without browser chrome when the surface allows it. Keep the same sandbox session and incident window across the board, trace, log, and recovery images. Reference and derived sources retain the dimensions recorded in the manifest.

| File                                         | Capture                                                          |
| -------------------------------------------- | ---------------------------------------------------------------- |
| `sources/homepage.png`                       | Signed-out homepage after the paper shader settles               |
| `sources/homepage-material.png`              | Shader-only lower edge derived from `homepage.png`               |
| `sources/homepage-background.png`            | Atmosphere-only homepage at the final 1800 by 1200 canvas        |
| `sources/board-diagnosis-v3.png`             | Payment requests, failures, and latency crossing thresholds      |
| `sources/board-agent-pane.png`               | Diagnosed board at the final responsive pane size                |
| `sources/codex-board-fix.png`                | Real Codex and Clear board screenshot supplied by the user       |
| `sources/codex-board-fix-hero.png`           | Editorial crop with the original composer moved below the answer |
| `sources/codex-trace-investigation.png`      | Real Codex and Clear trace screenshot supplied by the user       |
| `sources/codex-trace-investigation-hero.png` | Trace screenshot with its original composer moved into the crop  |
| `sources/trace-detail-v3.png`                | Three causal attempts in one failed checkout trace               |
| `sources/log-correlation-v2.png`             | Three logs filtered by the exact selected trace                  |
| `sources/board-resolved-v3.png`              | Closed incident with request and latency recovery visible        |

Do not include keys, tokens, local paths, unrelated browser tabs, or unfinished UI. If a label disagrees with the captured value or points at the wrong evidence, adjust the source before rendering.

The prepared Codex sources preserve the supplied Codex and Clear pixels. They move the original composer upward over the conversation so it remains visible in the final 16:9 crop. They do not recreate Codex chrome, controls, typography, or messages.

## Final outputs

| File                                      | Size         | Purpose                            |
| ----------------------------------------- | ------------ | ---------------------------------- |
| `outputs/clear-devpost-thumbnail.jpg`     | 1800 by 1200 | Project card and gallery thumbnail |
| `outputs/clear-devpost-hero.png`          | 1800 by 1200 | Codex and Clear hero workspace     |
| `outputs/clear-board-reveal.png`          | 1800 by 1200 | Retry-storm evidence               |
| `outputs/clear-agent-collaboration.png`   | 1800 by 1200 | Shared human-agent investigation   |
| `outputs/clear-trace-log-correlation.png` | 1800 by 1200 | Logs from one exact trace          |
| `outputs/clear-deploy-recovery.png`       | 1800 by 1200 | Deploy marker and visible recovery |
| `outputs/clear-trace-poc-v2.png`          | 1800 by 1200 | Causal three-attempt waterfall     |

## Render workflow

From the repository root:

```bash
vp run media:prepare:hero
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

- Keep each product capture fully opaque and at its natural aspect ratio.
- Scale every primary surface to 90 percent of the canvas width.
- Use one product surface per image, except for the Codex investigation and its existing browser pane.
- Do not add editorial headlines, floating callouts, or overlapping screenshots.
- Use the same restrained one-pixel translucent neutral edge on every product surface.
- Keep chart labels factual. The screenshot is the source of truth.
- Prefer a focused crop over shrinking an interface until it is unreadable.
- Recheck every asset at thumbnail size before uploading it to Devpost.
