# Groundtruth

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
- PostgreSQL uses Drizzle through its native Effect Postgres adapter. Prefer Relational Query Builder v2 through `db.query.<table>.findMany` and `findFirst` with `defineRelations` over `db.select().from(...)` whenever the relational API can express the read. Use `db.select` or raw SQL only for queries the relational API genuinely cannot express, and keep that exception isolated and explained. Writes use Drizzle's typed insert, update, and delete builders.

### Folder Structure

As you implement this project, add the folder structure here pls
