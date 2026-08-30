import * as stylex from "@stylexjs/stylex";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";

import { errorMessage } from "../../data/format";
import {
  useBoardQuery,
  useIncidentQuery,
  useIncidentsQuery,
  useMetricCatalogQuery,
  useOverviewQuery,
  useResetSandbox,
  useRuntimeQuery,
  useTriggerSandboxIncident,
} from "../../data/queries";
import { mutationOutcomeIsUnknown } from "../../errors";
import { colors, radii, space } from "../../theme/tokens.stylex";
import { Button } from "../../ui/button";
import { ConsoleFailureActions } from "../../ui/console-failure-actions";
import { MutationFailureNotice } from "../../ui/mutation-failure-notice";
import { ContentState } from "../../ui/page";
import { InvestigationGuide } from "../onboarding/investigation-guide";
import { investigationStage } from "../onboarding/investigation-progress";
import { SandboxIntroDialog } from "../onboarding/sandbox-intro-dialog";
import { boardContextMessage, type BoardDependencyState } from "./board-context";
import { chartNeedsFullWidth } from "./panel-layout";
import { LivePanel } from "./panel-renderer";
import { getGroundtruthToolStatus, subscribeGroundtruthToolStatus } from "../../webmcp/bootstrap";

const investigationPrompts = {
  baseline: "",
  orient:
    "Investigate the active checkout alert. Tell me the leading explanation and show the most useful first panel on the board.",
  challenge:
    "Requests tripled. If this is real traffic, where are the users? Compare request volume with unique users and show the result on the board.",
  evidence:
    "Same users, triple the requests. Where are the extra requests coming from? Break down checkout and payment calls by attempt number, show it on the board, and tell me whether the leading hypothesis survives.",
  diagnosed: "",
  reviewed: "",
} as const;

export function BoardPage() {
  const search = useSearch({ from: "/board" });
  const navigate = useNavigate({ from: "/board" });
  const runtime = useRuntimeQuery();
  const projectId = runtime.data?.projectId ?? null;
  const board = useBoardQuery(projectId);
  const catalog = useMetricCatalogQuery(projectId);
  const overview = useOverviewQuery(projectId);
  const incidents = useIncidentsQuery(projectId);
  const incident = useIncidentQuery(projectId, overview.data?.openIncident?.id ?? null);
  const triggerIncident = useTriggerSandboxIncident(projectId!);
  const resetSandbox = useResetSandbox(projectId!);
  const toolStatus = useSyncExternalStore(
    subscribeGroundtruthToolStatus,
    getGroundtruthToolStatus,
    getGroundtruthToolStatus,
  );
  const boardUnavailable = (runtime.isError && !runtime.data) || (board.isError && !board.data);
  const boardFailure = runtime.isError && !runtime.data ? runtime.error : board.error;
  const catalogState = dependencyState(catalog.isError, catalog.data !== undefined);
  const incidentHistoryState = dependencyState(incidents.isError, incidents.data !== undefined);
  const overviewState = dependencyState(overview.isError, overview.data !== undefined);
  const dependencyFailure =
    catalogState !== "available" ||
    incidentHistoryState !== "available" ||
    overviewState !== "available";
  const triggerOutcomeUnknown =
    triggerIncident.isError && mutationOutcomeIsUnknown(triggerIncident.error);
  const resetOutcomeUnknown = resetSandbox.isError && mutationOutcomeIsUnknown(resetSandbox.error);
  const closeGuide = () => void navigate({ replace: true, search: { guide: undefined } });
  const startIncident = () => {
    if (triggerOutcomeUnknown || triggerIncident.isPending) return;
    triggerIncident.mutate(undefined, { onSuccess: closeGuide });
  };
  const restartWalkthrough = () => {
    if (resetOutcomeUnknown || resetSandbox.isPending) return;
    resetSandbox.mutate(undefined, { onSuccess: closeGuide });
  };
  const triggerError = triggerIncident.isError ? (
    <MutationFailureNotice
      checkLabel="Check incident state"
      checking={overview.isFetching || board.isFetching || incidents.isFetching}
      error={triggerIncident.error}
      onCheckState={() => {
        void Promise.all([overview.refetch(), board.refetch()]).then(
          ([overviewResult, boardResult]) => {
            if (!overviewResult.isSuccess || !boardResult.isSuccess) return;
            triggerIncident.reset();
            if (overviewResult.data.openIncident) closeGuide();
          },
        );
      }}
    />
  ) : null;
  const resetError = resetSandbox.isError ? (
    <MutationFailureNotice
      checkLabel="Check walkthrough state"
      checking={overview.isFetching || board.isFetching}
      error={resetSandbox.error}
      onCheckState={() => {
        void Promise.all([overview.refetch(), board.refetch(), incidents.refetch()]).then(
          ([overviewResult, boardResult, incidentsResult]) => {
            if (!overviewResult.isSuccess || !boardResult.isSuccess || !incidentsResult.isSuccess) {
              return;
            }
            if (
              overviewResult.data.openIncident ||
              boardResult.data.panels.length !== 1 ||
              incidentsResult.data.items.length > 0
            ) {
              return;
            }
            resetSandbox.reset();
            closeGuide();
          },
        );
      }}
    />
  ) : null;
  const stage = investigationStage({
    hasClosedIncident:
      incidents.data?.items.some((candidate) => candidate.status === "closed") ?? false,
    hasOpenIncident:
      overview.data?.openIncident !== null && overview.data?.openIncident !== undefined,
    hypotheses: incident.data?.hypotheses ?? [],
    panels: board.data?.panels ?? [],
  });

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

      {runtime.data?.mode === "sandbox" && overview.data && incidents.data ? (
        <>
          <SandboxIntroDialog
            blocked={triggerOutcomeUnknown || resetOutcomeUnknown}
            error={stage === "reviewed" ? resetError : triggerError}
            onOpenChange={(open) => {
              if (!open) closeGuide();
            }}
            onRestart={restartWalkthrough}
            onStart={startIncident}
            open={search.guide === true}
            pending={triggerIncident.isPending || resetSandbox.isPending}
            state={
              stage === "reviewed" ? "complete" : overview.data.openIncident ? "active" : "baseline"
            }
          />
          <InvestigationGuide
            action={
              stage === "baseline" ? (
                <Button
                  disabled={triggerIncident.isPending || triggerOutcomeUnknown}
                  onClick={startIncident}
                  tone="primary"
                >
                  {triggerIncident.isPending ? "Starting incident" : "Start incident"}
                </Button>
              ) : stage === "diagnosed" && overview.data.openIncident ? (
                <Button
                  render={
                    <Link
                      params={{ incidentId: overview.data.openIncident.id }}
                      to="/incidents/$incidentId"
                    />
                  }
                  tone="secondary"
                >
                  Review investigation
                </Button>
              ) : stage === "reviewed" ? (
                <Button
                  disabled={resetSandbox.isPending || resetOutcomeUnknown}
                  onClick={restartWalkthrough}
                  tone="secondary"
                >
                  {resetSandbox.isPending ? "Restarting walkthrough" : "Restart walkthrough"}
                </Button>
              ) : null
            }
            agentUnavailable={toolStatus === "failed" || toolStatus === "unsupported"}
            onOpenGuide={() => void navigate({ search: { guide: true } })}
            prompt={investigationPrompts[stage]}
            stage={stage}
          />
          {search.guide ? null : stage === "reviewed" ? resetError : triggerError}
        </>
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
          error={catalog.error ?? overview.error ?? incidents.error}
          incidentHistory={incidentHistoryState}
          onRetry={() => {
            if (catalog.isError) void catalog.refetch();
            if (overview.isError) void overview.refetch();
            if (incidents.isError) void incidents.refetch();
          }}
          overview={overviewState}
          retrying={catalog.isFetching || overview.isFetching || incidents.isFetching}
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
              fullWidth={panel.spec._tag === "metric-chart" && chartNeedsFullWidth(panel.spec)}
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
  incidentHistory,
  onRetry,
  overview,
  retrying,
}: {
  catalog: BoardDependencyState;
  error: unknown;
  incidentHistory: BoardDependencyState;
  onRetry: () => void;
  overview: BoardDependencyState;
  retrying: boolean;
}) {
  return (
    <aside aria-live="polite" role="status" {...stylex.props(styles.contextNotice)}>
      <span {...stylex.props(styles.contextNoticeCopy)}>
        {boardContextMessage({ catalog, incidentHistory, overview })}
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
});
