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

    expect(html).toContain("Ready to investigate with your agent");
    expect(html).toContain("Start live incident");
    expect(html).not.toContain("Continue here without an agent");
  });

  it("keeps an unsupported browser on baseline until the workspace opens in ChatGPT", () => {
    const html = renderDialog("unsupported");

    expect(html).toContain("Open this page inside ChatGPT before starting");
    expect(html).toContain("Inspect healthy telemetry");
    expect(html).not.toContain("Start live incident");
    expect(html).toContain("Copy live URL for ChatGPT");
    expect(html).toContain('data-copy-value="https://clear.example/board?guide=true"');
  });

  it("waits for the capability check before offering the guided start", () => {
    const html = renderDialog("checking");

    expect(html).toContain("Checking agent access");
    expect(html).toContain("disabled");
    expect(html).not.toContain("Continue here without an agent");
  });

  it("offers retry or healthy telemetry inspection after startup fails", () => {
    const html = renderDialog("failed");

    expect(html).toContain("Agent access could not start");
    expect(html).toContain("Try agent access again");
    expect(html).toContain("Inspect healthy telemetry");
  });
});
