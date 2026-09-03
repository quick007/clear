# Clear Devpost media

This folder turns real Clear captures and one selectively composited Codex workspace into the final Devpost gallery set. Clear product interfaces always come from screenshots. The renderer adds only a quiet background, a one-pixel edge, and a soft shadow declared in `manifest.json`.

## Capture sources

Capture product sources at 2560 by 1440 without browser chrome when the surface allows it. Keep the same sandbox session and incident window across the board, trace, log, and recovery images. Reference and derived sources retain the dimensions recorded in the manifest.

| File                                      | Capture                                                          |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `sources/homepage.png`                    | Signed-out homepage after the paper shader settles               |
| `sources/homepage-material.png`           | Shader-only lower edge derived from `homepage.png`               |
| `sources/homepage-background.png`         | Atmosphere-only homepage at the final 1800 by 1200 canvas        |
| `sources/board-diagnosis-v2.png`          | Requests elevated, users flat, retries visible                   |
| `sources/board-agent-pane.png`            | Diagnosed board at the final responsive pane size                |
| `sources/codex-ui-reference.png`          | User-provided current Codex shell and pane geometry reference    |
| `sources/codex-conversation-overlay.html` | Editable investigation conversation layer                        |
| `sources/codex-conversation-overlay.png`  | Browser-rendered conversation pixels using the macOS system font |
| `sources/hero-workspace.png`              | Selectively composited Codex and Clear workspace                 |
| `sources/trace-detail-v3.png`             | Three causal attempts in one failed checkout trace               |
| `sources/log-correlation-v2.png`          | Three logs filtered by the exact selected trace                  |
| `sources/board-recovery-v2.png`           | Deploy marker with retry layers returning toward baseline        |

Do not include keys, tokens, local paths, unrelated browser tabs, or unfinished UI. If a label disagrees with the captured value or points at the wrong evidence, adjust the source before rendering.

`hero-workspace.png` preserves the authentic Codex shell, pane geometry, browser chrome, toolbar controls, and empty composer from the two user-provided captures. The investigation messages are the only authored Codex content and are rendered from HTML with the macOS system font. The existing browser viewport contains the matching responsive Clear board capture.

## Final outputs

| File                                      | Size         | Purpose                            |
| ----------------------------------------- | ------------ | ---------------------------------- |
| `outputs/clear-devpost-thumbnail.jpg`     | 1800 by 1200 | Project card and gallery thumbnail |
| `outputs/clear-devpost-hero.png`          | 1800 by 1200 | Codex and Clear hero workspace     |
| `outputs/clear-board-reveal.png`          | 1920 by 1080 | Retry-storm evidence               |
| `outputs/clear-agent-collaboration.png`   | 1920 by 1080 | Shared human-agent investigation   |
| `outputs/clear-trace-log-correlation.png` | 1920 by 1080 | Logs from one exact trace          |
| `outputs/clear-deploy-recovery.png`       | 1920 by 1080 | Deploy marker and visible recovery |
| `outputs/clear-trace-poc-v2.png`          | 1920 by 1080 | Causal three-attempt waterfall     |

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
- Do not add editorial headlines, glass rings, floating callouts, or overlapping screenshots.
- Keep chart labels factual. The screenshot is the source of truth.
- Prefer a focused crop over shrinking an interface until it is unreadable.
- Recheck every asset at thumbnail size before uploading it to Devpost.
