# Clear

Build the WebMCP-native OpenTelemetry observability surface described in `context.md`.

### General Notes

- Everything should real as much as possible. Avoid adding words like "demo" or leaking context about the build (e.g. react + vite) app into the app as that makes the app feel like a toy. Interfaces should feel pleasant to use, using things like popups to insert smth rather than just a jank textbox.
- Use shadcn/proper components and icons whenever possible, avlid using say ^ instead of a chevron up arrow icon.
- Avoid eyebrows or fully uppercase text (mixed case ok).
- Max file length (where it makes sense) is 500 lines. Pay attention to the way you structure code as well. If a larger rewrite is nessesary to reduce long term complexity, do it. As you write code, wctively search for "code judo" moves: restructurings that preserve behavior while making the implementation dramatically simpler, smaller, more direct, and more elegant.
  - To that end, you should try to rely on existing, trusted, actively maintained packages rather than reinventing the wheel unless nothing satisfies your requirements
- Always use vite plus (vp xxx or vp run xxx) when running commands, not npm or pnpm.
- Use inferred types over annotations. any is the enemy. Do not take a type, turn it into a more genaric type, then re-validate it back into a more complex type.
- This project uses aggressivly adopts effect v4 apis, including the unstable ones. Lean into them whereever possible rather than regressing back to a more normal default
- Make regular commits as you build, and push when you make those commits

### Folder Structure

```text
apps/                 Product and incident services
  backend/            Effect API and application services
  collector/          Go OpenTelemetry Collector distribution
  console/            React console and WebMCP site tools
  checkout-api/       Intentionally broken example API
  checkout-web/       Example storefront
  payments-stub/      Controlled upstream dependency
packages/             Shared contracts, models, persistence, and panel DSL
examples/             Examples and incident scenario tooling
  load-generator/     Retry-storm scenario controller
  node-otel/           Standalone OpenTelemetry Node integration
infra/                Local and Render infrastructure
docs/                 Product, architecture, and operations documentation
video/                Submission script, shot list, and media tooling
media/                Reproducible submission assets
```
