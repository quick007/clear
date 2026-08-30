import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { ConsoleAuthenticationRequired, ConsoleUnavailable } from "../errors";
import { IncidentContextNotice } from "./incident-context-notice";

vi.mock("@stylexjs/stylex", () => ({
  create: (rules: Readonly<Record<string, unknown>>) =>
    Object.fromEntries(Object.keys(rules).map((name) => [name, name])),
  defineVars: (variables: Readonly<Record<string, string>>) => variables,
  props: (...names: ReadonlyArray<string | false>) => ({
    "data-style": names.filter(Boolean).join(" "),
  }),
}));

describe("IncidentContextNotice", () => {
  it("keeps the last loaded investigation context visible with a retry", () => {
    const html = renderToStaticMarkup(
      <IncidentContextNotice
        error={new ConsoleUnavailable({ retryable: true })}
        hasDetail
        onRetry={() => undefined}
        retrying={false}
        returnPath="/board"
      />,
    );

    expect(html).toContain("Investigation context is out of date.");
    expect(html).toContain("Showing the last loaded hypotheses and timeline.");
    expect(html).toContain("Try again");
  });

  it("explains partial shell context when detail has never loaded", () => {
    const html = renderToStaticMarkup(
      <IncidentContextNotice
        error={new ConsoleUnavailable({ retryable: true })}
        hasDetail={false}
        onRetry={() => undefined}
        retrying={false}
        returnPath="/board"
      />,
    );

    expect(html).toContain("Investigation context is unavailable.");
    expect(html).toContain("Hypotheses and timeline could not be loaded.");
  });

  it("uses the typed authentication recovery instead of retry", () => {
    const html = renderToStaticMarkup(
      <IncidentContextNotice
        error={new ConsoleAuthenticationRequired()}
        hasDetail
        onRetry={() => undefined}
        retrying={false}
        returnPath="/board"
      />,
    );

    expect(html).toContain("Log in again");
    expect(html).not.toContain("Try again");
  });
});
