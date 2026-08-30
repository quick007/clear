import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { ConsoleInvalidRequest, ConsoleOutcomeUnknown } from "../errors";
import { MutationFailureNotice } from "./mutation-failure-notice";

vi.mock("@stylexjs/stylex", () => ({
  create: (rules: Readonly<Record<string, unknown>>) =>
    Object.fromEntries(Object.keys(rules).map((name) => [name, name])),
  defineVars: (variables: Readonly<Record<string, string>>) => variables,
  props: (...names: ReadonlyArray<string | false>) => ({
    "data-style": names.filter(Boolean).join(" "),
  }),
}));

describe("MutationFailureNotice", () => {
  it("requires a state check when a write outcome is unknown", () => {
    const html = renderToStaticMarkup(
      <MutationFailureNotice error={new ConsoleOutcomeUnknown()} onCheckState={() => undefined} />,
    );

    expect(html).toContain("The change may have completed");
    expect(html).toContain("Check current state");
    expect(html).not.toContain("Try again");
  });

  it("keeps deterministic request failures distinct", () => {
    const html = renderToStaticMarkup(
      <MutationFailureNotice error={new ConsoleInvalidRequest()} onCheckState={() => undefined} />,
    );

    expect(html).toContain("Clear could not complete that request");
    expect(html).not.toContain("Check current state");
  });
});
