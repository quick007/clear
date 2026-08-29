# Clear video package

This directory contains the source timeline and small production helpers for the scripted, narrated submission video. The manufactured load, planned diagnosis beats, and edit are rehearsed. The checkout code change, WebMCP calls, Render deployment, deploy event, and telemetry recovery are real. The complete capture and performance directions live in:

- `docs/video-runbook.md`
- `docs/video-shot-list.md`
- `video/timeline.json`

## Local tool path

The current Mac has iMovie, `screencapture`, `osascript`, Swift, and `avconvert`. `ffmpeg` and `ffprobe` are not installed. The practical zero-install path is:

1. Capture each source beat with macOS Screen Recording or QuickTime Player.
2. Assemble in iMovie as a 1080p, 30 fps project.
3. Split clips at the shot boundaries in `timeline.json`.
4. Use Crop to Fill or a restrained Ken Burns move for the zoom plan.
5. Record narration after picture lock, then duck incidental audio fully.
6. Export at 1080p High quality.
7. Upload `captions.srt` with the final YouTube video.

The iMovie route is intentional. Do not add a heavyweight video dependency only to automate ten straightforward cuts.

## Generate and validate

```sh
vp exec node video/scripts/build-captions.mjs
vp exec node video/scripts/validate-package.mjs
```

`build-captions.mjs` generates an accessible narration transcript at `video/captions.srt` from the single timeline source. The shorter `caption` values in that source are optional editorial overlays. `validate-package.mjs` verifies continuous shot boundaries, the under-three-minute limit, narration coverage, and the no-em-dash rule across the package.

## Prepare a checkout-only rehearsal project

```sh
vp exec node video/scripts/prepare-shoot-workspace.mjs ../clear-checkout-rehearsal
```

This creates a standalone checkout-only project without dependencies or build output. It resolves workspace catalog versions so `vp install` works outside the monorepo. Use the full-clone instructions in the runbook for the real shoot, because the real take needs workspace dependencies, a pushable dedicated branch, and a real checkout-only Render deployment.
