import * as stylex from "@stylexjs/stylex";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, type ReactNode } from "react";

import { errorMessage } from "../../data/format";
import {
  useBoardQuery,
  useMetricCatalogQuery,
  useOverviewQuery,
  useRuntimeQuery,
  useTriggerSandboxIncident,
} from "../../data/queries";
import { mutationOutcomeIsUnknown } from "../../errors";
import { colors, radii, space } from "../../theme/tokens.stylex";
import { Button } from "../../ui/button";
import { ConsoleFailureActions } from "../../ui/console-failure-actions";
import { CopyButton } from "../../ui/copy-button";
import { MutationFailureNotice } from "../../ui/mutation-failure-notice";
import { ContentState } from "../../ui/page";
import { boardContextMessage, type BoardDependencyState } from "./board-context";
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
  const boardUnavailable = (runtime.isError && !runtime.data) || (board.isError && !board.data);
  const boardFailure = runtime.isError && !runtime.data ? runtime.error : board.error;
  const catalogState = dependencyState(catalog.isError, catalog.data !== undefined);
  const overviewState = dependencyState(overview.isError, overview.data !== undefined);
  const dependencyFailure = catalogState !== "available" || overviewState !== "available";
  const triggerOutcomeUnknown =
    triggerIncident.isError && mutationOutcomeIsUnknown(triggerIncident.error);
  useEffect(() => {
    if (
      !search.start ||
      startedFromHome.current ||
      runtime.data?.mode !== "sandbox" ||
      overview.data === undefined ||
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
          blocked={triggerOutcomeUnknown}
          error={
            triggerIncident.isError ? (
              <MutationFailureNotice
                checkLabel="Check incident state"
                checking={overview.isFetching || board.isFetching}
                error={triggerIncident.error}
                onCheckState={() => {
                  void Promise.all([overview.refetch(), board.refetch()]).then(
                    ([overviewResult, boardResult]) => {
                      if (!overviewResult.isSuccess || !boardResult.isSuccess) return;
                      triggerIncident.reset();
                    },
                  );
                }}
              />
            ) : null
          }
          onStart={() => {
            if (!triggerOutcomeUnknown) triggerIncident.mutate();
          }}
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

      {!boardUnavailable && !board.data && (runtime.isPending || board.isPending) ? (
        <ContentState kind="loading" title="Loading the board" />
      ) : null}
      {boardUnavailable ? (
        <ContentState
          actions={
            <ConsoleFailureActions
              error={boardFailure}
              notFound={{ href: "/", label: "Return home" }}
              onRetry={() =>
                void (runtime.isError && !runtime.data ? runtime.refetch() : board.refetch())
              }
              returnPath="/board"
            />
          }
          kind="error"
          title="The board is unavailable"
        >
          {errorMessage(runtime.isError && !runtime.data ? runtime.error : board.error)}
        </ContentState>
      ) : null}
      {board.data && dependencyFailure ? (
        <BoardContextNotice
          catalog={catalogState}
          error={catalog.error ?? overview.error}
          onRetry={() => {
            if (catalog.isError) void catalog.refetch();
            if (overview.isError) void overview.refetch();
          }}
          overview={overviewState}
          retrying={catalog.isFetching || overview.isFetching}
        />
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

function BoardContextNotice({
  catalog,
  error,
  onRetry,
  overview,
  retrying,
}: {
  catalog: BoardDependencyState;
  error: unknown;
  onRetry: () => void;
  overview: BoardDependencyState;
  retrying: boolean;
}) {
  return (
    <aside aria-live="polite" role="status" {...stylex.props(styles.contextNotice)}>
      <span {...stylex.props(styles.contextNoticeCopy)}>
        {boardContextMessage({ catalog, overview })}
      </span>
      <ConsoleFailureActions
        compact
        disabled={retrying}
        error={error}
        onRetry={onRetry}
        returnPath="/board"
      />
    </aside>
  );
}

const dependencyState = (failed: boolean, loaded: boolean): BoardDependencyState =>
  failed ? (loaded ? "stale" : "missing") : "available";

function SandboxStart({
  blocked,
  error,
  onStart,
  pending,
}: {
  blocked: boolean;
  error: ReactNode;
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
        <Button disabled={pending || blocked} onClick={onStart} tone="primary">
          {pending ? "Starting incident" : "Start incident"}
        </Button>
      </div>
      {error}
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
  contextNotice: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.textMuted,
    display: "flex",
    fontSize: 12,
    gap: space.x3,
    justifyContent: "space-between",
    marginBottom: space.x4,
    paddingBlock: space.x2,
    paddingInline: space.x3,
  },
  contextNoticeCopy: { lineHeight: 1.45 },
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
