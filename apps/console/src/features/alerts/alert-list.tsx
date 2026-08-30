import type { Alert, ManualAlert } from "@groundtruth/domain";
import { Delete01Icon, MoreVerticalCircle02Icon } from "@hugeicons/core-free-icons";
import * as stylex from "@stylexjs/stylex";

import { formatRelativeTime } from "../../data/format";
import { colors, radii, space } from "../../theme/tokens.stylex";
import { Button } from "../../ui/button";
import { Icon } from "../../ui/icon";
import { MenuItem, MenuPopup, MenuRoot, MenuTrigger } from "../../ui/menu";
import { StatusPill } from "../../ui/status";

const comparisonCopy = {
  above: ">",
  "at-or-above": "≥",
  below: "<",
  "at-or-below": "≤",
} as const;

export function AlertSection({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section {...stylex.props(styles.section)}>
      <header {...stylex.props(styles.sectionHeader)}>
        <h2 {...stylex.props(styles.sectionTitle)}>{title}</h2>
        <p {...stylex.props(styles.sectionDescription)}>{description}</p>
      </header>
      <div {...stylex.props(styles.list)}>{children}</div>
    </section>
  );
}

export function ManualAlertRow({
  alert,
  blocked,
  canInvestigate,
  onInvestigate,
  openIncidentId,
  pending,
}: {
  alert: ManualAlert;
  blocked: boolean;
  canInvestigate: boolean;
  onInvestigate: () => void;
  openIncidentId: string | null;
  pending: boolean;
}) {
  return (
    <article {...stylex.props(styles.row)}>
      <div {...stylex.props(styles.identity)}>
        <StatusPill tone={severityTone(alert.severity)}>{alert.severity}</StatusPill>
        <div>
          <h3 {...stylex.props(styles.name)}>{alert.title}</h3>
          <span {...stylex.props(styles.summary)}>{alert.context ?? "No additional context"}</span>
        </div>
      </div>
      <div {...stylex.props(styles.meta)}>
        <Detail label="Service" value={alert.serviceName ?? "All services"} />
        <Detail label="Created" value={formatRelativeTime(alert.createdAt)} />
      </div>
      <InvestigationAction
        available={canInvestigate}
        blocked={blocked}
        onInvestigate={onInvestigate}
        openIncidentId={openIncidentId}
        pending={pending}
      />
    </article>
  );
}

export function ThresholdAlertRow({
  alert,
  blocked,
  canInvestigate,
  onDelete,
  onInvestigate,
  openIncidentId,
  pending,
}: {
  alert: Alert;
  blocked: boolean;
  canInvestigate: boolean;
  onDelete: () => void;
  onInvestigate: () => void;
  openIncidentId: string | null;
  pending: boolean;
}) {
  return (
    <article {...stylex.props(styles.row)}>
      <div {...stylex.props(styles.identity)}>
        <StatusPill
          tone={
            alert.status === "firing"
              ? "critical"
              : alert.status === "healthy"
                ? "healthy"
                : "neutral"
          }
        >
          {alert.status}
        </StatusPill>
        <div>
          <h3 {...stylex.props(styles.name)}>{alert.name}</h3>
          <code {...stylex.props(styles.summary)}>{alert.metricName}</code>
        </div>
      </div>
      <div {...stylex.props(styles.meta)}>
        <Detail label="Service" value={alert.serviceName ?? "All services"} />
        <Detail
          label="Condition"
          value={`${alert.aggregation} ${comparisonCopy[alert.comparison]} ${alert.threshold} · ${Math.round(alert.windowSeconds / 60)} min`}
        />
      </div>
      <div {...stylex.props(styles.rowActions)}>
        {alert.status === "firing" ? (
          <InvestigationAction
            available={canInvestigate}
            blocked={blocked}
            onInvestigate={onInvestigate}
            openIncidentId={openIncidentId}
            pending={pending}
          />
        ) : null}
        <MenuRoot>
          <MenuTrigger aria-label={`Actions for ${alert.name}`} size="icon">
            <Icon icon={MoreVerticalCircle02Icon} size={18} />
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuItem onClick={onDelete} tone="danger">
              <span {...stylex.props(styles.menuAction)}>
                <Icon icon={Delete01Icon} size={15} /> Delete rule
              </span>
            </MenuItem>
          </MenuPopup>
        </MenuRoot>
      </div>
    </article>
  );
}

function InvestigationAction({
  available,
  blocked,
  onInvestigate,
  openIncidentId,
  pending,
}: {
  available: boolean;
  blocked: boolean;
  onInvestigate: () => void;
  openIncidentId: string | null;
  pending: boolean;
}) {
  if (!available) return null;
  return openIncidentId ? null : (
    <Button disabled={blocked} onClick={onInvestigate} tone="secondary">
      {pending ? "Starting" : "Start investigation"}
    </Button>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <span {...stylex.props(styles.detail)}>
      <span>{label}</span>
      <code {...stylex.props(styles.detailValue)}>{value}</code>
    </span>
  );
}

const severityTone = (severity: ManualAlert["severity"]) =>
  severity === "critical" ? "critical" : severity === "warning" ? "attention" : "info";

const styles = stylex.create({
  section: { display: "grid", gap: space.x3, marginBottom: space.x8 },
  sectionHeader: {
    display: "grid",
    gap: 3,
  },
  sectionTitle: { fontSize: 14, fontWeight: 500, marginBlock: 0 },
  sectionDescription: { color: colors.textSubtle, fontSize: 11, marginBlock: 0 },
  list: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    alignItems: "center",
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: { default: 1, ":last-child": 0 },
    display: "grid",
    gap: space.x5,
    gridTemplateColumns: {
      default: "minmax(260px, 1fr) minmax(300px, 1fr) auto",
      "@media (max-width: 840px)": "1fr",
    },
    padding: space.x4,
  },
  identity: { alignItems: "center", display: "flex", gap: space.x3, minWidth: 0 },
  name: { fontSize: 13, fontWeight: 500, marginBlock: 0 },
  summary: {
    color: colors.textSubtle,
    display: "block",
    fontSize: 10,
    marginTop: 3,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  meta: {
    display: "grid",
    gap: space.x4,
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  },
  detail: {
    color: colors.textSubtle,
    display: "grid",
    fontSize: 10,
    gap: 4,
    minWidth: 0,
  },
  detailValue: {
    color: colors.textMuted,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  rowActions: {
    alignItems: "center",
    display: "flex",
    gap: space.x2,
    justifyContent: "flex-end",
  },
  menuAction: { alignItems: "center", display: "flex", gap: space.x2 },
});
