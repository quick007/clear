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

vi.mock("@tanstack/react-router", async () => {
  const { createElement } = await import("react");
  return {
    Link: ({
      children,
      search,
      to,
    }: {
      children: React.ReactNode;
      search?: Readonly<Record<string, boolean>>;
      to: string;
    }) => {
      const query = search
        ? `?${new URLSearchParams(Object.entries(search).map(([key, value]) => [key, String(value)]))}`
        : "";
      return createElement("a", { href: `${to}${query}` }, children);
    },
  };
});

vi.mock("../../ui/clear-mark", () => ({ ClearMark: () => null }));
vi.mock("../../ui/icon", () => ({ Icon: () => null }));
vi.mock("./home-atmosphere", () => ({ HomeAtmosphere: () => null }));

import { HomePage } from "./home-page";

describe("home page", () => {
  it("makes the WebMCP product and fastest proof path explicit", () => {
    const html = renderToStaticMarkup(<HomePage />);

    expect(html).toContain("typed WebMCP tools");
    expect(html).toContain("get_console_overview()");
    expect(html).toContain("Explore the live sandbox");
    expect(html).toContain('href="/board?demo=true&amp;guide=true"');
    expect(html).toContain("isolated to this tab");
    expect(html).toContain("keeps control of code and deployment");
  });

  it("keeps real telemetry connection separate from the sandbox", () => {
    const html = renderToStaticMarkup(<HomePage />);

    expect(html).toContain("Connect your telemetry");
    expect(html).toContain('href="/sign-in?returnPath=%2Fconnect%3Fhosted%3Dtrue"');
  });
});
