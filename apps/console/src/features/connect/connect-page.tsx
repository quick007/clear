import { CheckmarkCircle02Icon, CloudUploadIcon, Key01Icon } from "@hugeicons/core-free-icons";
import * as stylex from "@stylexjs/stylex";
import { useState } from "react";

import { getConsoleConfig } from "../../config";
import { errorMessage, formatRelativeTime } from "../../data/format";
import { useCreateIngestKey, useOverviewQuery, useRuntimeQuery } from "../../data/queries";
import { mutationOutcomeIsUnknown } from "../../errors";
import { colors, radii, space } from "../../theme/tokens.stylex";
import { Button } from "../../ui/button";
import { ConsoleFailureActions } from "../../ui/console-failure-actions";
import { CopyButton } from "../../ui/copy-button";
import { Icon } from "../../ui/icon";
import { MutationFailureNotice } from "../../ui/mutation-failure-notice";
import { ContentState, Page, PageHeader } from "../../ui/page";
import { StaleDataNotice } from "../../ui/stale-data-notice";
import { StatusDot } from "../../ui/status";

export function ConnectPage() {
  const endpoint = getConsoleConfig().otlpOrigin;
  const runtime = useRuntimeQuery();
  const projectId = runtime.data?.projectId ?? null;
  const overview = useOverviewQuery(projectId);
  const createKey = useCreateIngestKey(projectId!);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const connectionLoading =
    (runtime.isPending && !runtime.data) || (overview.isPending && !overview.data);
  const connectionUnavailable = !runtime.data || !projectId || !overview.data;
  const failure = runtime.isError && !runtime.data ? runtime.error : overview.error;
  const staleFailure = connectionUnavailable ? null : (runtime.error ?? overview.error);
  const retryFailedQueries = () => {
    if (runtime.isError) void runtime.refetch();
    if (runtime.isError && !runtime.data) return;
    if (overview.isError) void overview.refetch();
  };
  const createKeyOutcomeUnknown = createKey.isError && mutationOutcomeIsUnknown(createKey.error);

  if (connectionLoading) {
    return (
      <Page>
        <ContentState kind="loading" title="Preparing your connection" />
      </Page>
    );
  }
  if (connectionUnavailable) {
    return (
      <Page>
        <ContentState
          actions={
            <ConsoleFailureActions
              error={failure}
              notFound={{ href: "/", label: "Return home" }}
              onRetry={retryFailedQueries}
              returnPath="/connect"
            />
          }
          kind="error"
          title="Connection setup is unavailable"
        >
          {errorMessage(failure)}
        </ContentState>
      </Page>
    );
  }

  const hosted = runtime.data.mode === "hosted";
  if (!hosted) {
    return (
      <Page>
        <PageHeader
          description="Create a durable project before sending real OpenTelemetry data."
          title="Connect your telemetry"
        />
        <section {...stylex.props(styles.sandboxGate)}>
          <span {...stylex.props(styles.sandboxGateIcon)}>
            <Icon icon={CloudUploadIcon} size={21} />
          </span>
          <div {...stylex.props(styles.sandboxGateCopy)}>
            <h2 {...stylex.props(styles.sandboxGateTitle)}>Keep the sandbox separate</h2>
            <p {...stylex.props(styles.sandboxGateDetail)}>
              This temporary workspace is ready for the guided incident. Sign in with ChatGPT to
              create your own project, issue an ingest key, and connect any OpenTelemetry SDK or
              Collector.
            </p>
          </div>
          <Button large render={<a href="/auth/chatgpt?returnPath=%2Fconnect" />} tone="primary">
            Sign in to create a project
          </Button>
        </section>
      </Page>
    );
  }
  const exporterSnippet = `export OTEL_EXPORTER_OTLP_ENDPOINT=${endpoint}\nexport OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf\nexport OTEL_EXPORTER_OTLP_HEADERS="x-clear-ingest-key=${createdKey ?? "<your-key>"}"\nexport OTEL_SERVICE_NAME=your-service`;

  return (
    <Page>
      <PageHeader
        description="Point any OpenTelemetry SDK or Collector at Clear. No proprietary agent is required."
        title="Connect OpenTelemetry"
      />
      <StaleDataNotice
        copy="Showing the last loaded connection status."
        error={staleFailure}
        notFound={{ href: "/", label: "Return home" }}
        onRetry={retryFailedQueries}
        retrying={runtime.isFetching || overview.isFetching}
        returnPath="/connect"
      />
      <div {...stylex.props(styles.layout)}>
        <section {...stylex.props(styles.steps)}>
          <ConnectStep icon={Key01Icon} number="1" title="Create an ingest key">
            <p {...stylex.props(styles.copy)}>
              Keys belong to {overview.data.project.name}. You can keep up to three active keys and
              the secret is shown only once.
            </p>
            <Button
              disabled={createKey.isPending || createKeyOutcomeUnknown}
              onClick={() =>
                createKey.mutate("primary-exporter", {
                  onSuccess: (result) => setCreatedKey(result.key),
                })
              }
              tone="secondary"
            >
              {createKey.isPending ? "Creating key" : "Create ingest key"}
            </Button>
            {createdKey ? (
              <div {...stylex.props(styles.secret)}>
                <span {...stylex.props(styles.secretCopy)}>
                  <strong {...stylex.props(styles.secretTitle)}>Copy this key now</strong>
                  <code {...stylex.props(styles.secretValue)}>{createdKey}</code>
                </span>
                <CopyButton label="Copy ingest key" value={createdKey} />
              </div>
            ) : null}
            {createKey.isError ? (
              <MutationFailureNotice
                checkLabel="Check current keys"
                error={createKey.error}
                message={
                  createKeyOutcomeUnknown
                    ? "The key may have been created, but its secret cannot be recovered. Check current keys and revoke the new key before creating a replacement."
                    : undefined
                }
                onCheckState={() => window.location.assign("/settings/project")}
              />
            ) : null}
          </ConnectStep>

          <ConnectStep icon={CloudUploadIcon} number="2" title="Point your exporter at Clear">
            <div {...stylex.props(styles.endpoint)}>
              <span {...stylex.props(styles.endpointCopy)}>
                <small {...stylex.props(styles.endpointLabel)}>OTLP endpoint</small>
                <code {...stylex.props(styles.endpointValue)}>{endpoint}</code>
              </span>
              <CopyButton label="Copy endpoint" value={endpoint} />
            </div>
            <div {...stylex.props(styles.codeWrap)}>
              <pre {...stylex.props(styles.code)}>
                <code>{exporterSnippet}</code>
              </pre>
              <span {...stylex.props(styles.codeCopyButton)}>
                <CopyButton label="Copy exporter configuration" value={exporterSnippet} />
              </span>
            </div>
          </ConnectStep>

          <ConnectStep icon={CheckmarkCircle02Icon} number="3" title="Verify your signals">
            <p {...stylex.props(styles.copy)}>
              Clear accepts OTLP/HTTP protobuf and JSON for metrics, logs, and traces.
            </p>
            <div aria-label="Signal status" {...stylex.props(styles.signalGrid)}>
              {overview.data.signalHealth.map((signal) => (
                <span key={signal.signal} {...stylex.props(styles.signal)}>
                  <StatusDot tone={signal.status === "healthy" ? "healthy" : "neutral"} />
                  <span {...stylex.props(styles.signalCopy)}>
                    <strong {...stylex.props(styles.signalName)}>{signal.signal}</strong>
                    <small {...stylex.props(styles.signalDetail)}>
                      {signal.lastSeenAt
                        ? `Last received ${formatRelativeTime(signal.lastSeenAt)}`
                        : "Waiting for first signal"}
                    </small>
                  </span>
                </span>
              ))}
            </div>
          </ConnectStep>
        </section>

        <aside {...stylex.props(styles.help)}>
          <h2 {...stylex.props(styles.helpTitle)}>Collector friendly</h2>
          <p {...stylex.props(styles.helpCopy)}>
            Existing OpenTelemetry pipelines can add Clear as another OTLP exporter. Keep your
            current sampling, processors, and destinations.
          </p>
          <a
            href="https://github.com/quick007/clear/blob/main/docs/otel-quickstart.md"
            {...stylex.props(styles.helpLink)}
          >
            Open the integration guide
          </a>
        </aside>
      </div>
    </Page>
  );
}

function ConnectStep({
  children,
  icon,
  number,
  title,
}: {
  children: React.ReactNode;
  icon: Parameters<typeof Icon>[0]["icon"];
  number: string;
  title: string;
}) {
  return (
    <article {...stylex.props(styles.step)}>
      <span {...stylex.props(styles.stepNumber)}>{number}</span>
      <div {...stylex.props(styles.stepBody)}>
        <h2 {...stylex.props(styles.stepTitle)}>
          <Icon icon={icon} size={17} /> {title}
        </h2>
        {children}
      </div>
    </article>
  );
}

const styles = stylex.create({
  sandboxGate: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderStyle: "solid",
    borderWidth: 1,
    display: "grid",
    gap: space.x5,
    gridTemplateColumns: {
      default: "44px minmax(0, 1fr) auto",
      "@media (max-width: 760px)": "44px minmax(0, 1fr)",
      "@media (max-width: 520px)": "1fr",
    },
    padding: { default: space.x6, "@media (max-width: 520px)": space.x5 },
  },
  sandboxGateIcon: {
    alignItems: "center",
    backgroundColor: colors.amberWash,
    borderRadius: radii.md,
    color: colors.amber,
    display: "flex",
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  sandboxGateCopy: { minWidth: 0 },
  sandboxGateTitle: { fontSize: 16, fontWeight: 500, margin: 0 },
  sandboxGateDetail: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 1.6,
    marginBottom: 0,
    marginTop: space.x2,
    maxWidth: 700,
  },
  layout: {
    alignItems: "start",
    display: "grid",
    gap: space.x6,
    gridTemplateColumns: { default: "minmax(0, 1fr) 280px", "@media (max-width: 900px)": "1fr" },
  },
  steps: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderStyle: "solid",
    borderWidth: 1,
    overflow: "hidden",
  },
  step: {
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: { default: 1, ":last-child": 0 },
    display: "grid",
    gap: space.x4,
    gridTemplateColumns: "32px minmax(0, 1fr)",
    padding: { default: space.x6, "@media (max-width: 620px)": space.x4 },
  },
  stepNumber: {
    alignItems: "center",
    backgroundColor: colors.amberWash,
    borderRadius: radii.pill,
    color: colors.amber,
    display: "flex",
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 10,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  stepBody: {
    display: "grid",
    gap: space.x4,
    minWidth: 0,
  },
  stepTitle: {
    alignItems: "center",
    display: "flex",
    fontSize: 14,
    fontWeight: 500,
    gap: space.x2,
    marginBlock: 3,
  },
  copy: { color: colors.textMuted, fontSize: 12, lineHeight: 1.6, marginBlock: 0, maxWidth: 700 },
  secret: {
    alignItems: { default: "center", "@media (max-width: 620px)": "stretch" },
    backgroundColor: colors.greenWash,
    borderColor: "rgba(52, 211, 153, 0.22)",
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: { default: "row", "@media (max-width: 620px)": "column" },
    gap: space.x4,
    justifyContent: "space-between",
    padding: space.x4,
  },
  secretCopy: { display: "grid", gap: 5, minWidth: 0 },
  secretTitle: { color: colors.green, fontSize: 11, fontWeight: 500 },
  secretValue: {
    color: colors.text,
    fontSize: 11,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  endpoint: {
    alignItems: { default: "center", "@media (max-width: 620px)": "stretch" },
    backgroundColor: colors.canvas,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: { default: "row", "@media (max-width: 620px)": "column" },
    gap: space.x4,
    justifyContent: "space-between",
    padding: space.x4,
  },
  endpointCopy: { display: "grid", gap: 4 },
  endpointLabel: { color: colors.textSubtle, fontSize: 10 },
  endpointValue: { color: colors.text, fontSize: 12 },
  codeWrap: { position: "relative" },
  codeCopyButton: { position: "absolute", right: space.x3, top: space.x3 },
  code: {
    backgroundColor: colors.canvas,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.textMuted,
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 10,
    lineHeight: 1.7,
    margin: 0,
    overflowX: "auto",
    padding: space.x4,
    paddingRight: 56,
  },
  signalGrid: {
    display: "grid",
    gap: space.x2,
    gridTemplateColumns: {
      default: "repeat(3, minmax(0, 1fr))",
      "@media (max-width: 620px)": "1fr",
    },
  },
  signal: {
    alignItems: "center",
    backgroundColor: colors.canvas,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    gap: space.x3,
    padding: space.x3,
  },
  signalCopy: { display: "grid", gap: 2 },
  signalName: { fontSize: 11, fontWeight: 500, textTransform: "capitalize" },
  signalDetail: { color: colors.textSubtle, fontSize: 9 },
  help: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderStyle: "solid",
    borderWidth: 1,
    padding: space.x5,
  },
  helpTitle: { fontSize: 14, fontWeight: 500, marginBlock: 0 },
  helpCopy: { color: colors.textMuted, fontSize: 12, lineHeight: 1.6, marginBlock: space.x3 },
  helpLink: { color: colors.amber, fontSize: 11, textDecoration: "none" },
});
