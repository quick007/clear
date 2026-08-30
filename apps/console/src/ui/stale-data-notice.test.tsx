import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { ConsoleAuthenticationRequired, ConsoleUnavailable } from "../errors";
import { StaleDataNotice } from "./stale-data-notice";

vi.mock("@stylexjs/stylex", () => ({
  create: (rules: Readonly<Record<string, unknown>>) =>
    Object.fromEntries(Object.keys(rules).map((name) => [name, name])),
  defineVars: (variables: Readonly<Record<string, string>>) => variables,
  props: (...names: ReadonlyArray<string | false>) => ({
    "data-style": names.filter(Boolean).join(" "),
  }),
}));

describe("StaleDataNotice", () => {
  it("renders nothing without a refetch failure", () => {
    const html = renderToStaticMarkup(
      <StaleDataNotice
        copy="Showing the last loaded incidents."
        error={null}
        onRetry={() => undefined}
        returnPath="/incidents"
      />,
    );

    expect(html).toBe("");
  });

  it("keeps cached content visible with a typed retry action", () => {
    const html = renderToStaticMarkup(
      <StaleDataNotice
        copy="Showing the last loaded incidents."
        error={new ConsoleUnavailable({ retryable: true })}
        onRetry={() => undefined}
        returnPath="/incidents"
      />,
    );

    expect(html).toContain("Showing the last loaded incidents.");
    expect(html).toContain("Try again");
  });

  it("disables retry while the failed query is already refetching", () => {
    const html = renderToStaticMarkup(
      <StaleDataNotice
        copy="Showing the last loaded incidents."
        error={new ConsoleUnavailable({ retryable: true })}
        onRetry={() => undefined}
        retrying
        returnPath="/incidents"
      />,
    );

    expect(html).toContain("disabled");
  });

  it("uses login rather than retry when cached data outlives a session", () => {
    const html = renderToStaticMarkup(
      <StaleDataNotice
        copy="Showing the last loaded incidents."
        error={new ConsoleAuthenticationRequired()}
        onRetry={() => undefined}
        returnPath="/incidents"
      />,
    );

    expect(html).toContain("Log in again");
    expect(html).not.toContain("Try again");
  });
});
