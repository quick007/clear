import { WebhookIcon } from "@hugeicons/core-free-icons";
import * as stylex from "@stylexjs/stylex";

import { colors, radii, space } from "../../theme/tokens.stylex";
import { CopyButton } from "../../ui/copy-button";
import { Icon } from "../../ui/icon";

export function DeployWebhookSetup({ apiOrigin }: { apiOrigin: string }) {
  const endpoint = `${apiOrigin}/v1/events/deploy`;
  const curlSnippet = `curl --fail-with-body \\
  -X POST ${endpoint} \\
  -H 'content-type: application/json' \\
  -H "x-clear-ingest-key: \${CLEAR_INGEST_KEY}" \\
  --data '{
    "service": "your-service",
    "sha": "0123456789abcdef",
    "description": "Deploy production"
  }'`;

  return (
    <section id="deploy-events" {...stylex.props(styles.section)}>
      <span {...stylex.props(styles.icon)}>
        <Icon icon={WebhookIcon} size={19} />
      </span>
      <div {...stylex.props(styles.body)}>
        <header {...stylex.props(styles.header)}>
          <div>
            <h2 {...stylex.props(styles.title)}>Show deploys beside your telemetry</h2>
            <p {...stylex.props(styles.description)}>
              Post an event after a successful deploy. Clear adds the change to your board and
              timeline, but never runs or controls the deployment.
            </p>
          </div>
        </header>

        <div {...stylex.props(styles.endpoint)}>
          <span {...stylex.props(styles.endpointCopy)}>
            <small {...stylex.props(styles.label)}>Deploy event endpoint</small>
            <code {...stylex.props(styles.endpointValue)}>{endpoint}</code>
          </span>
          <CopyButton label="Copy deploy event endpoint" value={endpoint} />
        </div>

        <div {...stylex.props(styles.codeWrap)}>
          <pre {...stylex.props(styles.code)}>
            <code>{curlSnippet}</code>
          </pre>
          <span {...stylex.props(styles.copyButton)}>
            <CopyButton label="Copy deploy event example" value={curlSnippet} />
          </span>
        </div>
        <p {...stylex.props(styles.note)}>
          The service must exactly match its OpenTelemetry <code>service.name</code>. Use the same
          ingest key as your exporter and keep it in your deployment platform's secret manager.
        </p>
      </div>
    </section>
  );
}

const styles = stylex.create({
  section: {
    alignItems: "start",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderStyle: "solid",
    borderWidth: 1,
    display: "grid",
    gap: space.x4,
    gridTemplateColumns: { default: "40px minmax(0, 1fr)", "@media (max-width: 620px)": "1fr" },
    marginTop: space.x8,
    padding: { default: space.x6, "@media (max-width: 620px)": space.x4 },
    scrollMarginTop: space.x6,
  },
  icon: {
    alignItems: "center",
    backgroundColor: colors.blueWash,
    borderRadius: radii.md,
    color: colors.blue,
    display: "flex",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  body: { display: "grid", gap: space.x4, minWidth: 0 },
  header: {
    alignItems: { default: "start", "@media (max-width: 620px)": "stretch" },
    display: "flex",
    flexDirection: { default: "row", "@media (max-width: 620px)": "column" },
    gap: space.x4,
    justifyContent: "space-between",
  },
  title: { fontSize: 15, fontWeight: 500, margin: 0 },
  description: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 1.6,
    marginBottom: 0,
    marginTop: space.x2,
    maxWidth: 720,
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
  endpointCopy: { display: "grid", gap: 4, minWidth: 0 },
  label: { color: colors.textSubtle, fontSize: 10 },
  endpointValue: {
    color: colors.text,
    fontSize: 12,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  codeWrap: { position: "relative" },
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
  copyButton: { position: "absolute", right: space.x3, top: space.x3 },
  note: { color: colors.textSubtle, fontSize: 11, lineHeight: 1.55, margin: 0 },
});
