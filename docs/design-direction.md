# Clear design direction

This document defines the visual and interaction direction for the Clear console. It is a product design contract, not a loose mood board. The console should feel like a serious instrument that happens to be unusually calm, clear, and collaborative.

## Design thesis

Clear is a shared investigation surface for an operator and an agent. The interface must make three things legible at the same time:

1. What production is doing now.
2. What the current incident hypothesis is.
3. What the agent inspected or changed on the board.

The visual concept is a **reference instrument**. Every chart is read against a visible baseline, the ground truth, rather than floating in an arbitrary box. During an incident, signals pull away from that reference. During recovery, they settle back toward it. This gives Clear a functional visual signature without decorative branding.

The interface should be:

- Spacious, but information-rich.
- Warm, but not soft or playful.
- Precise, but not cold.
- Operational, but not modeled after Grafana's density.
- Agent-aware, but never styled like a chat product.

## Non-negotiable implementation choices

- React, Vite Plus, and TanStack Router.
- Base UI primitives wrapped in local Clear components.
- StyleX for component styling and design tokens.
- Hugeicons free icons, using `@hugeicons/react` and the free icon set.
- Tailwind color values may be copied into StyleX variables. Do not install or use Tailwind.
- Recharts for data visualization, with Clear-owned styling and React-rendered overlays where practical.
- IBM Plex Sans for interface text and IBM Plex Mono for numbers, identifiers, tool names, durations, and query fragments.
- Dark mode is the primary shipped theme. Tokens must still be structured through `stylex.defineVars` so a light theme can be added without rewriting components.
- No Radix packages, Lucide icons, Tailwind classes, CSS modules, styled-components, or scattered inline style objects.

Base UI is the behavior and accessibility foundation, not the visual identity. Wrap primitives such as `Popover`, `Select`, `Menu`, `Dialog`, `Tabs`, `Tooltip`, and `Collapsible` in small local components with consistent StyleX styling. Product code should consume those local components rather than restyling raw primitives repeatedly.

## Visual language

### Color

Use warm neutral surfaces. The palette should feel like a dark control room lit by the data, not a blue-gray developer tool.

| Token             | Value     | Use                                                         |
| ----------------- | --------- | ----------------------------------------------------------- |
| `canvas`          | `#0c0a09` | Deepest application background, Tailwind stone-950          |
| `surface`         | `#141210` | Main working surface                                        |
| `surfaceRaised`   | `#1c1917` | Popovers, selected rows, raised regions, Tailwind stone-900 |
| `border`          | `#292524` | Hairlines and separators, Tailwind stone-800                |
| `borderStrong`    | `#44403c` | Focus-adjacent and selected boundaries, Tailwind stone-700  |
| `textPrimary`     | `#e7e5e4` | Primary text, Tailwind stone-200                            |
| `textSecondary`   | `#a8a29e` | Supporting text, Tailwind stone-400                         |
| `textTertiary`    | `#78716c` | Metadata and inactive controls, Tailwind stone-500          |
| `attention`       | `#fbbf24` | Incident attention and deploy markers, Tailwind amber-400   |
| `healthy`         | `#34d399` | Healthy state, Tailwind emerald-400                         |
| `critical`        | `#f87171` | Firing state, Tailwind red-400                              |
| `seriesSecondary` | `#38bdf8` | Secondary chart series, Tailwind sky-400                    |
| `seriesRetry`     | `#fb923c` | Retry amplification, Tailwind orange-400                    |
| `seriesUpstream`  | `#a78bfa` | Upstream dependency series, Tailwind violet-400             |

Rules:

- Amber is the product accent. It indicates attention, active incident context, and deploy events. It is not the default button color.
- Status colors describe status only. Do not reuse red as a generic chart-series color or green as a generic positive trend.
- Do not use pure black or pure white.
- Product surfaces do not use gradients. The public homepage may use one restrained shader-like atmospheric treatment behind the hero.
- Do not use colored panel backgrounds. Color should come from data, small status marks, focus, and selected controls.
- A firing alert gets a red status mark and clear text. It does not turn an entire panel red.

### Typography

- IBM Plex Sans: navigation, labels, prose, controls, and headings.
- IBM Plex Mono: metric values, timestamps, trace and span IDs, service names when shown as identifiers, tool calls, arguments, durations, and query expressions.
- Use tabular numerals for all changing values.
- Interface body: 14px with a 20px line height.
- Metadata: 12px with a 16px line height. Never render meaningful text below 12px.
- Section title: 15px or 16px, weight 500.
- Panel title: 14px, weight 500.
- Primary stat: 28px to 32px, weight 500, mono.
- Page title: 20px to 24px, weight 500. The console does not need marketing-sized headings.
- Use weights 400 and 500 for almost everything. Reserve 600 for a rare critical hierarchy need.
- Use mixed case. Do not use uppercase eyebrows or letter-spaced micro-labels.

### Spacing and shape

Use a 4px base scale, with common values of 8, 12, 16, 20, 24, 32, 40, 48, and 64px.

- Desktop page inset: 24px.
- Major region gap: 20px to 24px.
- Panel interior padding: 20px.
- Control height: 36px standard, 40px prominent.
- Touch target: at least 40px below 1024px.
- Panel radius: 8px.
- Interactive control radius: 6px.
- Popover and dialog radius: 10px.
- Rails, strips, and shell regions do not get rounded outer containers.
- Elevation comes from a one-step surface change and a hairline border. Avoid dark-mode drop shadows.

Panels should read as aligned instrument regions, not a pile of cards. Prefer shared grid lines, open surface, and consistent internal padding over separate floating boxes.

### Icons

- Use Hugeicons free stroke icons at a consistent 1.5px stroke character.
- Use 16px icons inside dense controls and rows, 20px icons in primary navigation and empty states.
- Icons inherit the surrounding text color.
- Status is communicated with a separate dot, badge, or text label, not by tinting every icon.
- Never use text glyphs such as `^`, `>`, `...`, or emoji as icon substitutes.
- Do not mix icon families.

## Information architecture

The desktop interface has four regions. Product state, not tool plumbing, determines what earns space.

1. **Sidebar**: Board, Explore, Alerts, Incidents, and Settings, with account controls at the bottom.
2. **Context header**: page title, time range, and service or environment scope only when multiple values exist.
3. **Stage**: the board, unified explorer, alert list, incident list, or settings.
4. **Incident timeline**: notes, hypothesis changes, deploy events, and incident closure when an incident is active.

WebMCP tool names, counts, registration events, arguments, and durations remain discoverable in the agent surface and never become website chrome. Healthy connections do not earn permanent status chrome. A clear inline or toast error appears only when a connection fails.

### Route structure

- `/board`: live metric board and primary landing surface.
- `/explore`: Metrics, Logs, and Traces under shared service, environment, and time context.
- `/explore/traces/$traceId`: trace waterfall and correlated logs.
- `/alerts`: alert definitions and current state.
- `/incidents`: incident history and active investigations.
- `/incidents/$incidentId`: shareable incident route that preserves the board-centered layout.
- `/connect`: ingest onboarding and per-signal connection state.
- `/settings/project`: project, retention, and ingest-key management.

Primary route choices are labeled in the sidebar. Do not make users decode icons for primary navigation.

## Region behavior

### Sidebar and context header

The sidebar contains the Clear mark, five labeled product destinations, and the account control. It should feel calm and structural, not like another dashboard panel.

The context header contains only controls that change the current view. Project ownership is single-user in the hackathon release. Service and environment selectors stay hidden until the project contains multiple relevant values. Time range uses a compact Base UI menu. Do not place permanent text inputs in the header.

Sandbox reset is secondary. The homepage's **Demo incident** action is the primary entry point. Never add simulated recovery or fake-deploy controls.

### Situation strip

The strip is the narrative spine between navigation and data.

- Quiet height: 48px.
- Active incident height: 88px to 120px, depending on alert count and viewport.
- Quiet state shows signal freshness and service health with minimal visual noise.
- Incident state shows title, elapsed time, the most relevant firing alerts, and hypothesis chips.
- A rejected hypothesis is struck through and remains visible.
- A confirmed hypothesis uses a small status treatment, not a filled green banner.

### Stage and board

The stage gets the full available width. It has no decorative container around the whole page.

- Default desktop board: two columns with a 20px gap.
- Normal panel height: 280px to 320px.
- Comparison and trace-context panels span both columns.
- The board may use larger focal panels and smaller supporting panels, but never a mosaic of tiny rectangles.
- Humans do not create or edit panels. Panel composition belongs to the user's agent through WebMCP.

When an agent creates a panel during an incident, insert it at the top of the board and bring it into view if the user has not actively scrolled elsewhere. A short board-local highlight may acknowledge the new panel without identifying the underlying tool call. Outside an incident, append new panels unless the user chooses a position.

### Timeline drawer

- Collapsed height: 44px.
- Expanded desktop height: up to 40% of the viewport.
- It may open once when an incident begins, then respects the user's choice.
- Entries align on a real time axis and use small typed icons for notes, hypotheses, deploy events, and closure.
- On narrow screens it becomes a full-height Base UI dialog or sheet rather than compressing the charts.

## First viewport wire description

Primary composition target: 1728 by 960 content viewport. This should remain legible when captured inside a 1920 by 1080 video frame and downscaled for playback.

```text
+----------------------+-----------------------------------------------------------+
| Clear                | Board                              15 minutes | checkout  |
|                      +-----------------------------------------------------------+
| Board                | Firing alert | Active investigation | hypotheses          |
| Explore              +-----------------------------------------------------------+
| Alerts               |                                                           |
| Incidents            | Upstream requests vs unique users                         |
| Settings             | Full-width focal panel                                    |
|                      |                                                           |
|                      | Upstream requests by attempt | Checkout latency           |
|                      |                                                           |
| Account              | Incident timeline                                         |
+----------------------+-----------------------------------------------------------+
```

At baseline, before an incident, the stage shows four generous panels in a 2 by 2 grid: upstream request rate, p95 latency, error rate, and upstream error rate. Unique users are intentionally absent so the initial traffic-surge interpretation remains credible.

During the reveal, the agent-created comparison panel becomes the top full-width panel. The retry panel follows directly below it. Both are visible with the situation strip in one frame. The video may show the agent interaction beside the browser when a tool call itself matters, without duplicating that interaction inside the product.

At recovery, the layout stays still. Deploy markers land at the same x-position across relevant panels and signals settle toward their baseline. The lack of layout movement is part of the emotional beat: the system calms down instead of the interface celebrating.

## Data visualization direction

### The baseline rule

Every metric panel should offer a thin baseline reference derived from a stable pre-incident window or an explicitly selected comparison window. The line is subtle in normal operation and becomes easier to read during an incident.

- Label the baseline in the plot rather than forcing a legend lookup.
- Include baseline method and window in the tooltip or panel details.
- Never imply a meaningful baseline when insufficient history exists. Show an honest unavailable state.
- A baseline is a reference, not an alert threshold. Keep those concepts visually distinct.

### Retry-storm focal panels

**Upstream requests versus unique users**

- Default incident view indexes both series to their baseline value, where 1.0 equals the ground.
- Show a quiet tolerance band around 1.0 for unique users.
- Upstream requests rise toward 3.0 while users remain near 1.0.
- Provide an explicit raw-values mode for operators.
- Avoid a default dual-axis comparison because independent scales can manufacture a visual story.

**Retry amplification**

- Use a stacked area or clearly stacked line treatment for upstream requests grouped by attempt and retry attributes.
- First attempts form the stable lower band in a neutral series color.
- Retries use orange and expand visibly above the stable base.
- Directly label the series near their latest values when space allows.

**Deploy and recovery**

- Deploy events are amber vertical markers with a small flag and accessible label.
- The same deploy timestamp aligns across all panels for the affected service.
- Clicking a marker opens a compact popover with SHA, description, service, and link when present.
- Recovery is shown by data returning toward baseline, not by confetti, success banners, or green chart floods.

### Chart styling

- 1.5px line weight.
- No point markers on continuous time series.
- No area fill on ordinary line charts.
- No x-axis grid. Use sparse horizontal rules, roughly one per 100px of plot height.
- Axis and legend labels must be at least 12px.
- Use a maximum of five distinguishable series in one panel.
- Render legends as interactive series toggles.
- Prefer a React tooltip or carefully themed Recharts tooltip that matches Base UI surfaces.
- Do not replay series animation on every live update.
- Keep the last visible data during a disconnect and mark it stale rather than replacing it with an empty chart.

## Component behavior

### Filters and query controls

- Use Base UI popovers, selects, and menus for compact selection.
- A selected filter is a removable chip with a readable name and value.
- Advanced query details live in an expandable section, not in the default panel header.
- Search fields appear inside the popover that needs them.
- Preserve keyboard navigation, roving focus, Escape behavior, and focus restoration from Base UI.

### Dialogs and destructive actions

- Create and edit flows use focused dialogs with a preview when it adds confidence.
- Revoking an ingest key and deleting a project require explicit consequence copy and distinct confirmation styling.
- Benign panel edits do not get dramatic warning treatment.
- Dialog actions remain visible without forcing the body into a tiny scroll area.

### Focus and selection

- Every interactive element has a clear keyboard focus ring using a restrained amber outline plus offset.
- Hover alone is never the only state indicator.
- Selected rows use `surfaceRaised`, a strong text treatment, and a small structural marker. Do not rely on color alone.

## Motion

Motion is event-driven and restrained.

### Chrome motion

- Popovers and menus: 120 to 160ms opacity plus 4px movement.
- Inserted panels: 180 to 220ms opacity plus no more than 8px movement.
- Timeline expansion: 200ms ease-out.
- Hypothesis state change: 180ms crossfade. Rejected strikethrough may draw left to right over 200ms.

### Data motion

- Initial chart render may fade over 200ms. Do not animate a line drawing across the whole history.
- Live samples append without reanimating the series.
- A deploy marker may rise once over 300ms.
- A brief one-time baseline emphasis may indicate sustained recovery. It must not pulse indefinitely.

Respect `prefers-reduced-motion`. Remove translation, scaling, stagger, and line-drawing effects. Retain instant state changes or a short opacity transition only.

## Loading, empty, error, and stale states

State design is part of the primary product, not cleanup work.

### Loading

- Skeletons match the final geometry.
- A chart skeleton includes a plot area, sparse axis ticks, title width, and baseline rule.
- A trace skeleton uses span bars and keeps the service column visible.
- Avoid full-page spinners after the shell is available.
- Any spinner inside a control is 16px or smaller and has an accessible label.

### Empty

- Explain what normally fills the region and offer one relevant next action.
- Empty logs and traces explain whether the signal has ever been received without adding permanent connection chrome.
- An empty board keeps the main canvas quiet. It may show two or three short suggested investigation prompts.
- An incident-free situation strip communicates healthy quiet without a congratulatory banner.
- Empty states use an icon, short text, and at most one primary action. No large illustrations.

### Error

- Keep errors inside the region that failed whenever possible.
- A failed panel retains its header and replaces only the plot with a concise error state and retry action.
- Show a typed error kind or reference in mono without dumping raw stack traces.
- Query errors do not make the whole panel red.
- A disconnected live stream produces a compact error with a retry action. It disappears after recovery.
- A partial telemetry failure clearly identifies whether metrics, logs, or traces are affected.

### Stale and offline

- Preserve the last successful data.
- Dim stale plots slightly and mark the final timestamp.
- Distinguish a genuinely flat signal from a signal that stopped updating.
- Show reconnect backoff without animating a noisy countdown across the page.
- Sandbox expiry appears in the situation strip with a reset action, not a blocking modal.

## Responsive behavior

### 1440px and wider

- Board uses two columns.
- Timeline is a bottom drawer.
- Situation strip shows incident context in one or two readable rows.

### 1180px to 1439px

- Board remains two columns where panel minimum widths allow it.
- Comparison panels still span the board.
- Secondary actions stay contextual to their page or move into a focused menu.

### 768px to 1179px

- Board becomes one column.
- Situation strip can scroll horizontally, with incident identity pinned first.
- Timeline opens as a full-height sheet.
- Logs filters collapse into a single filter popover.

### Below 768px

- Panels use one column and a minimum height of 240px.
- Legends move below the plot when needed.
- Trace waterfall pins a readable span-name column and lets the timing region scroll horizontally.
- Tooltips must have touch and keyboard equivalents.
- Do not attempt to display desktop rails at miniature scale.

The 1024px to 1440px range is a primary environment because the ChatGPT desktop browser may share width with conversation chrome. It must not be treated as an afterthought.

## Exact anti-patterns to avoid

- No permanent four-way split with a left rail, center grid, right rail, and bottom panel all fighting for space.
- No grid of identical rounded cards with a title, number, and tiny sparkline repeated twelve times.
- No panels below 240px tall for primary investigation charts.
- No 10px or 11px chart labels.
- No giant marketing hero inside the authenticated console.
- No gradients, glow effects, glassmorphism, neon borders, or dark-mode shadows inside the product workspace. The homepage atmospheric treatment is the only exception.
- No pure black background or pure white body text.
- No uppercase eyebrow labels.
- No oversized pills for every piece of metadata.
- No colored border around every panel during an incident.
- No default blue primary button on every surface.
- No bare text inputs stacked directly on the page when a popover, select, or focused dialog fits the task.
- No raw schema editor as the default panel-creation experience.
- No placeholder copy that mentions Vite, React, hackathon, toy, fake, or demo inside the product.
- No prominent scenario controls in the main application toolbar.
- No tool-call feed, tool-count badge, registration token, or other WebMCP implementation detail in the product UI.
- No Lucide, Radix, emoji icons, or hand-typed chevrons.
- No Tailwind classes or Tailwind runtime dependency.
- No Recharts default presentation, legend, tooltip, or full-series update animation.
- No rainbow chart palette.
- No dual y-axis comparison as the default reveal visualization.
- No hover-only critical action.
- No full-page modal for a recoverable panel error.
- No spinner replacing previously loaded telemetry.
- No auto-scrolling the board while the user is actively inspecting older content.
- No celebratory recovery animation. The telemetry itself is the payoff.

## Visual QA rubric

This is a reusable design-review rubric, not a release-status checklist. It records the standards a reviewer should assess against a concrete viewport, browser, and scenario. Verification evidence belongs with the relevant test, capture, or release check.

- **Composition:** At desktop and narrow widths, the active incident, focal evidence, retry evidence, and timeline remain reachable without clipped controls, accidental horizontal scrolling, or competing chrome. Suggested prompts never cover a populated board.
- **Visual system:** StyleX variables, Base UI wrappers, and Hugeicons preserve a consistent, accessible interface. Text stays at least 12px, changing values use tabular mono numerals, amber remains deliberate, and focus stays visible. The workspace has no gradients, glow, glass panels, or card-soup composition.
- **Charts:** Baselines have a truthful source and accessible explanation. The requests-versus-users and retry evidence remain legible after video downscaling without a dual-axis trick. Deploy markers, long labels, tooltips, and live updates remain intelligible and accessible.
- **Product states and accessibility:** Loading, empty, error, stale, disconnected, expiry, and reset states remain calm and recoverable. Keyboard navigation, focus restoration, dialog behavior, non-color status signals, reduced motion, zoom, and narrow touch targets require deliberate verification.
- **Recorded incident:** The traffic-surge hypothesis, decisive comparison, retry evidence, deploy marker, and recovery must be understandable without a tool feed on the website. Site-tool registration belongs only in the recorded agent interaction.

## Acceptance statement

The design succeeds when a cold viewer can understand the current incident, see the agent's investigation, and read the decisive evidence without hunting across the screen. It should look credible in a production operator's browser, distinctive in a hackathon video, and calm enough that the telemetry remains the loudest thing on the page.
