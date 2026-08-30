import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { NotFoundSurface, RouteErrorSurface } from "./app-error-boundary";

vi.mock("@stylexjs/stylex", () => ({
  create: (rules: Readonly<Record<string, unknown>>) =>
    Object.fromEntries(Object.keys(rules).map((name) => [name, name])),
  defineVars: (variables: Readonly<Record<string, string>>) => variables,
  props: (...names: ReadonlyArray<string | false>) => ({
    "data-style": names.filter(Boolean).join(" "),
  }),
}));

describe("console recovery surfaces", () => {
  it("keeps a route failure calm and recoverable without exposing its error", () => {
    const html = renderToStaticMarkup(
      <RouteErrorSurface error={new Error("private route detail")} reset={() => undefined} />,
    );

    expect(html).toContain("This view is unavailable");
    expect(html).toContain("Your telemetry and incident data are unchanged.");
    expect(html).toContain("Try again");
    expect(html).toContain('href="/board"');
    expect(html).not.toContain("Error:");
  });

  it("gives an unknown path a clear route back into the product", () => {
    const html = renderToStaticMarkup(<NotFoundSurface />);

    expect(html).toContain("Page not found");
    expect(html).toContain("Go to board");
    expect(html).not.toContain("Try again");
  });
});
