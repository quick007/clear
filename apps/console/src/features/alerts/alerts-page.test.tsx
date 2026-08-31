import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { AlertsPage, investigationWorkspaceNavigation } from "./alerts-page";

const testState = vi.hoisted(() => ({
  manualAlerts: [] as Array<{ id: string }>,
  navigate: vi.fn(),
  onInvestigate: null as null | (() => void),
  openIncident: null as null | { id: string },
  startInvestigation: vi.fn(),
}));

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
    Link: ({ children, to }: { children?: React.ReactNode; to: string }) =>
      createElement("a", { href: to }, children),
    useNavigate: () => testState.navigate,
  };
});

vi.mock("../../data/queries", () => ({
  useAlertsQuery: () => queryResult([]),
  useDeleteAlertRule: () => mutationResult(),
  useManualAlertsQuery: () => queryResult({ items: testState.manualAlerts }),
  useOverviewQuery: () => queryResult({ openIncident: testState.openIncident, services: [] }),
  useRuntimeQuery: () => queryResult({ projectId: "project-1" }),
  useStartInvestigation: () => ({
    ...mutationResult(),
    mutate: testState.startInvestigation,
  }),
}));

vi.mock("../../ui/button", async () => {
  const { cloneElement, createElement, isValidElement } = await import("react");
  return {
    Button: ({ children, render }: { children: React.ReactNode; render?: React.ReactNode }) =>
      isValidElement(render)
        ? cloneElement(render, {}, children)
        : createElement("button", null, children),
  };
});

vi.mock("../../ui/confirm-dialog", () => ({ ConfirmDialog: () => null }));
vi.mock("../../ui/console-failure-actions", () => ({ ConsoleFailureActions: () => null }));
vi.mock("../../ui/mutation-failure-notice", () => ({ MutationFailureNotice: () => null }));
vi.mock("../../ui/stale-data-notice", () => ({ StaleDataNotice: () => null }));
vi.mock("../../ui/page", async () => {
  const { createElement } = await import("react");
  return {
    ContentState: ({ children }: { children?: React.ReactNode }) =>
      createElement("div", null, children),
    Page: ({ children }: { children: React.ReactNode }) => createElement("main", null, children),
    PageHeader: () => null,
  };
});
vi.mock("./manual-alert-dialog", () => ({ ManualAlertDialog: () => null }));
vi.mock("./alert-list", async () => {
  const { createElement } = await import("react");
  return {
    AlertSection: ({ children }: { children: React.ReactNode }) =>
      createElement("section", null, children),
    ManualAlertRow: ({ onInvestigate }: { onInvestigate: () => void }) => {
      testState.onInvestigate = onInvestigate;
      return createElement("div");
    },
    ThresholdAlertRow: () => createElement("div"),
  };
});

const queryResult = <Value,>(data: Value) => ({
  data,
  error: null,
  isError: false,
  isFetching: false,
  isPending: false,
  refetch: vi.fn(),
});

const mutationResult = () => ({
  error: null,
  isError: false,
  isPending: false,
  mutate: vi.fn(),
  reset: vi.fn(),
  variables: undefined,
});

describe("alert investigation routing", () => {
  beforeEach(() => {
    testState.manualAlerts = [];
    testState.navigate.mockReset();
    testState.onInvestigate = null;
    testState.openIncident = null;
    testState.startInvestigation.mockReset();
  });

  it("opens an active investigation in the shared board workspace", () => {
    testState.openIncident = { id: "incident-1" };

    const html = renderToStaticMarkup(<AlertsPage />);

    expect(html).toContain('href="/board"');
    expect(html).toContain("Open investigation");
    expect(html).not.toContain("/incidents/incident-1");
  });

  it("routes a newly started investigation to the shared board workspace", () => {
    testState.manualAlerts = [{ id: "alert-1" }];
    testState.startInvestigation.mockImplementation((_input, options) => options.onSuccess());
    renderToStaticMarkup(<AlertsPage />);

    testState.onInvestigate?.();

    expect(testState.startInvestigation).toHaveBeenCalledOnce();
    expect(testState.navigate).toHaveBeenCalledWith(investigationWorkspaceNavigation);
    expect(investigationWorkspaceNavigation).toEqual({
      search: { demo: undefined, guide: undefined },
      to: "/board",
    });
  });
});
