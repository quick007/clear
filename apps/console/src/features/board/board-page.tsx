import * as stylex from "@stylexjs/stylex";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { errorMessage } from "../../data/format";
import {
  useBoardQuery,
  useMetricCatalogQuery,
  useOverviewQuery,
  useRuntimeQuery,
  useTriggerSandboxIncident,
} from "../../data/queries";
import { colors, radii, space } from "../../theme/tokens.stylex";
import { Button } from "../../ui/button";
import { CopyButton } from "../../ui/copy-button";
import { ContentState, RetryButton } from "../../ui/page";
import { LivePanel } from "./panel-renderer";

const investigationPrompt = "Investigate the active alerts and show me why.";

export function BoardPage() {
  const search = useSearch({ from: "/board" });
  const navigate = useNavigate({ from: "/board" });
  const startedFromHome = useRef(false);
  const runtime = useRuntimeQuery();
  const projectId = runtime.data?.projectId ?? null;
  const board = useBoardQuery(projectId);
  const catalog = useMetricCatalogQuery(projectId);
  const overview = useOverviewQuery(projectId);
  const triggerIncident = useTriggerSandboxIncident(projectId!);
  useEffect(() => {
    if (
      !search.start ||
      startedFromHome.current ||
      runtime.data?.mode !== "sandbox" ||
      overview.data?.openIncident ||
      projectId === null
    ) {
      return;
    }
    startedFromHome.current = true;
    triggerIncident.mutate(undefined, {
      onSettled: () => void navigate({ replace: true, search: { start: undefined } }),
    });
  }, [
    navigate,
    overview.data?.openIncident,
    projectId,
    runtime.data?.mode,
    search.start,
    triggerIncident,
  ]);

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.pageHeader)}>
        <div>
          <h1 {...stylex.props(styles.pageTitle)}>
            {board.data?.dashboard.name ?? "Observability board"}
          </h1>
          <p {...stylex.props(styles.pageDescription)}>
            {board.data?.dashboard.description ?? "Live OpenTelemetry signals for this project."}
          </p>
        </div>
      </header>

      {runtime.data?.mode === "sandbox" && overview.data && !overview.data.openIncident ? (
        <SandboxStart
          error={triggerIncident.isError ? errorMessage(triggerIncident.error) : null}
          onStart={() => triggerIncident.mutate()}
          pending={triggerIncident.isPending}
        />
      ) : null}

      {runtime.data?.mode === "sandbox" &&
      overview.data?.openIncident &&
      board.data &&
      board.data.panels.length <= 1 ? (
        <aside aria-label="Suggested agent prompt" {...stylex.props(styles.agentPrompt)}>
          <span {...stylex.props(styles.agentPromptCopy)}>
            <strong {...stylex.props(styles.agentPromptTitle)}>Ask your agent</strong>
            <span>{investigationPrompt}</span>
          </span>
          <CopyButton label="Copy suggested prompt" value={investigationPrompt} />
        </aside>
      ) : null}

      {!runtime.isError && !board.isError && (runtime.isPending || board.isPending) ? (
        <ContentState kind="loading" title="Loading the board" />
      ) : null}
      {runtime.isError || board.isError ? (
        <ContentState
          actions={
            <RetryButton
              onRetry={() => {
                void runtime.refetch();
                void board.refetch();
              }}
            />
          }
          kind="error"
          title="The board is unavailable"
        >
          {errorMessage(runtime.error ?? board.error)}
        </ContentState>
      ) : null}
      {board.data?.panels.length === 0 ? (
        <ContentState
          actions={
            <Button render={<Link to="/connect" />} tone="secondary">
              Connect telemetry
            </Button>
          }
          title="This board is ready for telemetry"
        >
          Clear creates a useful overview when signals arrive. Your agent can shape the board for
          the questions you are investigating.
        </ContentState>
      ) : null}
      {board.data && board.data.panels.length > 0 ? (
        <section aria-label="Metric panels" {...stylex.props(styles.grid)}>
          {board.data.panels.map((panel) => (
            <LivePanel
              catalog={catalog.data ?? []}
              fullWidth={panel.spec._tag === "metric-chart"}
              key={panel.metadata.id}
              panel={panel}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function SandboxStart({
  error,
  onStart,
  pending,
}: {
  error: string | null;
  onStart: () => void;
  pending: boolean;
}) {
  return (
    <section aria-labelledby="start-incident-title" {...stylex.props(styles.sandboxStart)}>
      <div {...stylex.props(styles.sandboxIntro)}>
        <div>
          <h2 id="start-incident-title" {...stylex.props(styles.sandboxTitle)}>
            Start an incident
          </h2>
          <p {...stylex.props(styles.sandboxCopy)}>
            Introduce a controlled retry storm, then ask your agent to investigate what changed.
          </p>
        </div>
        <Button disabled={pending} onClick={onStart} tone="primary">
          {pending ? "Starting incident" : "Start incident"}
        </Button>
      </div>
      {error ? (
        <p role="alert" {...stylex.props(styles.sandboxError)}>
          {error}
        </p>
      ) : null}
    </section>
  );
}

const styles = stylex.create({
  page: {
    marginInline: "auto",
    maxWidth: 1400,
    padding: { default: space.x6, "@media (max-width: 620px)": space.x5 },
  },
  pageHeader: {
    alignItems: { default: "end", "@media (max-width: 620px)": "stretch" },
    display: "flex",
    flexDirection: { default: "row", "@media (max-width: 620px)": "column" },
    gap: { default: space.x6, "@media (max-width: 620px)": space.x4 },
    justifyContent: "space-between",
    marginBottom: space.x6,
  },
  pageTitle: { fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em", marginBlock: 0 },
  pageDescription: { color: colors.textMuted, fontSize: 13, marginBlock: 6 },
  grid: {
    display: "grid",
    gap: space.x3,
    gridTemplateColumns: {
      default: "repeat(2, minmax(0, 1fr))",
      "@media (max-width: 920px)": "1fr",
    },
    paddingBottom: space.x10,
  },
  agentPrompt: {
    alignItems: "center",
    backdropFilter: "blur(10px) saturate(108%)",
    backgroundColor: colors.materialSurface,
    borderColor: colors.materialLine,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.045)",
    color: colors.textMuted,
    display: "flex",
    fontSize: 13,
    gap: space.x4,
    justifyContent: "space-between",
    marginBottom: space.x4,
    paddingBlock: space.x3,
    paddingInline: space.x4,
  },
  agentPromptCopy: {
    alignItems: { default: "center", "@media (max-width: 620px)": "start" },
    display: "flex",
    flexDirection: { default: "row", "@media (max-width: 620px)": "column" },
    gap: { default: space.x3, "@media (max-width: 620px)": 2 },
  },
  agentPromptTitle: { color: colors.text, fontWeight: 500, whiteSpace: "nowrap" },
  sandboxStart: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderStyle: "solid",
    borderWidth: 1,
    display: "grid",
    gap: space.x5,
    marginBottom: space.x6,
    padding: { default: space.x6, "@media (max-width: 620px)": space.x5 },
  },
  sandboxIntro: {
    alignItems: { default: "center", "@media (max-width: 620px)": "stretch" },
    display: "flex",
    flexDirection: { default: "row", "@media (max-width: 620px)": "column" },
    gap: space.x5,
    justifyContent: "space-between",
  },
  sandboxTitle: { fontSize: 18, fontWeight: 500, marginBlock: 0 },
  sandboxCopy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 1.55,
    marginBlock: space.x2,
    maxWidth: 680,
  },
  sandboxError: { color: colors.red, fontSize: 12, marginBlock: 0 },
});
