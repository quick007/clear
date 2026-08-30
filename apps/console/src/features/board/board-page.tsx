import * as stylex from "@stylexjs/stylex";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";

import { errorMessage } from "../../data/format";
import {
  useBoardQuery,
  useIncidentQuery,
  useMetricCatalogQuery,
  useOverviewQuery,
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
import { LivePanel } from "./panel-renderer";

const investigationPrompt =
  "Investigate the active checkout alert. Compare request volume with unique users and retries, then show the evidence on the board.";

export function BoardPage() {
  const search = useSearch({ from: "/board" });
  const navigate = useNavigate({ from: "/board" });
  const runtime = useRuntimeQuery();
  const projectId = runtime.data?.projectId ?? null;
  const board = useBoardQuery(projectId);
  const catalog = useMetricCatalogQuery(projectId);
  const overview = useOverviewQuery(projectId);
  const incident = useIncidentQuery(projectId, overview.data?.openIncident?.id ?? null);
  const triggerIncident = useTriggerSandboxIncident(projectId!);
  const boardUnavailable = (runtime.isError && !runtime.data) || (board.isError && !board.data);
  const boardFailure = runtime.isError && !runtime.data ? runtime.error : board.error;
  const catalogState = dependencyState(catalog.isError, catalog.data !== undefined);
  const overviewState = dependencyState(overview.isError, overview.data !== undefined);
  const dependencyFailure = catalogState !== "available" || overviewState !== "available";
  const triggerOutcomeUnknown =
    triggerIncident.isError && mutationOutcomeIsUnknown(triggerIncident.error);
  const closeGuide = () => void navigate({ replace: true, search: { guide: undefined } });
  const startIncident = () => {
    if (triggerOutcomeUnknown || triggerIncident.isPending) return;
    triggerIncident.mutate(undefined, { onSuccess: closeGuide });
  };
  const mutationError = triggerIncident.isError ? (
    <MutationFailureNotice
      checkLabel="Check incident state"
      checking={overview.isFetching || board.isFetching}
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
  const stage = investigationStage({
    hasOpenIncident:
      overview.data?.openIncident !== null && overview.data?.openIncident !== undefined,
    hypotheses: incident.data?.hypotheses ?? [],
    panelCount: board.data?.panels.length ?? 0,
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

      {runtime.data?.mode === "sandbox" && overview.data ? (
        <>
          <SandboxIntroDialog
            blocked={triggerOutcomeUnknown}
            error={mutationError}
            onOpenChange={(open) => {
              if (!open) closeGuide();
            }}
            onStart={startIncident}
            open={search.guide === true}
            pending={triggerIncident.isPending}
          />
          <InvestigationGuide
            action={
              <Button
                disabled={triggerIncident.isPending || triggerOutcomeUnknown}
                onClick={startIncident}
                tone="primary"
              >
                {triggerIncident.isPending ? "Starting incident" : "Start incident"}
              </Button>
            }
            onOpenGuide={() => void navigate({ search: { guide: true } })}
            prompt={investigationPrompt}
            stage={stage}
          />
          {search.guide ? null : mutationError}
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
