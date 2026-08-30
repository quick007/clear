import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { ConsoleAuthenticationRequired, ConsoleInvalidRequest } from "../errors";
import { ConsoleFailureActions } from "./console-failure-actions";

vi.mock("@stylexjs/stylex", () => ({
  create: (rules: Readonly<Record<string, unknown>>) =>
    Object.fromEntries(Object.keys(rules).map((name) => [name, name])),
  defineVars: (variables: Readonly<Record<string, string>>) => variables,
  props: (...names: ReadonlyArray<string | false>) => ({
    "data-style": names.filter(Boolean).join(" "),
  }),
}));

describe("ConsoleFailureActions", () => {
  it("renders login without a retry for authentication failures", () => {
    const html = renderToStaticMarkup(
      <ConsoleFailureActions
        error={new ConsoleAuthenticationRequired()}
        onRetry={() => undefined}
        returnPath="/alerts"
      />,
    );

    expect(html).toContain("Log in again");
    expect(html).toContain("returnPath=%2Falerts");
    expect(html).not.toContain("Try again");
  });

  it("renders no action for an invalid request without a safe destination", () => {
    const html = renderToStaticMarkup(
      <ConsoleFailureActions
        error={new ConsoleInvalidRequest()}
        onRetry={() => undefined}
        returnPath="/alerts"
      />,
    );

    expect(html).toBe("");
  });
});
