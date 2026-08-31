import type { SessionView } from "@groundtruth/api-contract";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@stylexjs/stylex", () => ({
  create: (rules: Readonly<Record<string, unknown>>) =>
    Object.fromEntries(Object.keys(rules).map((name) => [name, name])),
  defineVars: (variables: Readonly<Record<string, string>>) => variables,
  props: (...names: ReadonlyArray<string | false>) => ({
    "data-style": names.filter(Boolean).join(" "),
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    search,
    target,
    to,
    ...props
  }: {
    children: React.ReactNode;
    search?: { readonly demo?: boolean; readonly guide?: boolean };
    target?: string;
    to: string;
    readonly [key: string]: unknown;
  }) =>
    createElement(
      "a",
      {
        href: search?.demo === true ? `${to}?demo=true&guide=true` : to,
        target,
        ...props,
      },
      children,
    ),
}));

vi.mock("../data/queries", () => ({
  useLogoutMutation: () => ({
    error: null,
    isError: false,
    isPending: false,
    mutate: vi.fn(),
    reset: vi.fn(),
  }),
}));

vi.mock("../ui/icon", () => ({ Icon: () => null }));
vi.mock("../ui/mutation-failure-notice", () => ({ MutationFailureNotice: () => null }));

import { SidebarAccountFooter } from "./sidebar-account-footer";

describe("SidebarAccountFooter", () => {
  it("keeps account email private and makes the isolated demo prominent", () => {
    const session = {
      account: {
        displayName: "Lukas",
        email: "private@example.com",
      },
    } as SessionView;

    const html = renderToStaticMarkup(<SidebarAccountFooter session={session} />);

    expect(html).toContain("Lukas");
    expect(html).not.toContain("private@example.com");
    expect(html).toContain("Connect data");
    expect(html).toContain("See demo");
    expect(html).toContain('href="/board?demo=true&amp;guide=true"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("large");
  });
});
