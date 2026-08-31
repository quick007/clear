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

vi.mock("@base-ui/react/dialog", async () => {
  const { cloneElement, createElement, isValidElement } = await import("react");
  const container = ({ children }: { children?: React.ReactNode }) =>
    createElement("div", null, children);
  return {
    Dialog: {
      Backdrop: container,
      Close: ({ children, render }: { children?: React.ReactNode; render?: React.ReactNode }) =>
        isValidElement(render) ? cloneElement(render) : createElement("button", null, children),
      Description: container,
      Popup: container,
      Portal: container,
      Root: container,
      Title: container,
    },
  };
});

vi.mock("../../ui/button", async () => {
  const { createElement } = await import("react");
  return {
    Button: ({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) =>
      createElement("button", { disabled }, children),
  };
});

vi.mock("../../ui/copy-button", async () => {
  const { createElement } = await import("react");
  return {
    CopyButton: ({ label, value }: { label: string; value: string }) =>
      createElement("button", { "data-copy-value": value }, label),
  };
});

vi.mock("../../ui/icon", () => ({ Icon: () => null }));

import { SandboxIntroDialog, type SandboxAgentAccess } from "./sandbox-intro-dialog";

const renderDialog = (agentAccess: SandboxAgentAccess) =>
  renderToStaticMarkup(
    <SandboxIntroDialog
      agentAccess={agentAccess}
      blocked={false}
      onOpenChange={vi.fn()}
      onRestart={vi.fn()}
      onRetryAgentAccess={vi.fn()}
      onStart={vi.fn()}
      open
      pending={false}
      shareUrl="https://clear.example/board?guide=true"
      state="baseline"
    />,
  );

describe("sandbox intro agent access", () => {
  it("keeps the agent-guided start primary when access is ready", () => {
    const html = renderDialog("ready");

    expect(html).toContain("WebMCP tools ready");
    expect(html).toContain("query live telemetry");
    expect(html).toContain("Trigger checkout incident");
    expect(html).not.toContain("Continue here without an agent");
  });

  it("warns that an unsupported-browser sandbox will not carry into ChatGPT", () => {
    const html = renderDialog("unsupported");

    expect(html).toContain("Open this page inside ChatGPT before starting");
    expect(html).toContain("will not carry over");
    expect(html).toContain("Continue here without an agent");
    expect(html).toContain("Copy live URL for ChatGPT");
    expect(html).toContain('data-copy-value="https://clear.example/board?guide=true"');
  });

  it("waits for the capability check before offering the guided start", () => {
    const html = renderDialog("checking");

    expect(html).toContain("Checking WebMCP access");
    expect(html).toContain("disabled");
    expect(html).not.toContain("Continue here without an agent");
  });

  it("offers retry or an explicit human-only path after startup fails", () => {
    const html = renderDialog("failed");

    expect(html).toContain("WebMCP access could not start");
    expect(html).toContain("Try WebMCP access again");
    expect(html).toContain("Continue here without an agent");
  });
});
