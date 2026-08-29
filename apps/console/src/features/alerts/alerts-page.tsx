import { StartInvestigationRequest } from "@groundtruth/api-contract";
import type { Alert, ManualAlert } from "@groundtruth/domain";
import { Delete01Icon, MoreVerticalCircle02Icon } from "@hugeicons/core-free-icons";
import * as stylex from "@stylexjs/stylex";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { errorMessage, formatRelativeTime } from "../../data/format";
import {
  useAlertsQuery,
  useDeleteAlertRule,
  useManualAlertsQuery,
  useOverviewQuery,
  useRuntimeQuery,
  useStartInvestigation,
} from "../../data/queries";
import { colors, radii, space } from "../../theme/tokens.stylex";
import { Button } from "../../ui/button";
import { ConfirmDialog } from "../../ui/confirm-dialog";
import { Icon } from "../../ui/icon";
import { MenuItem, MenuPopup, MenuRoot, MenuTrigger } from "../../ui/menu";
import { ContentState, Page, PageHeader, RetryButton } from "../../ui/page";
import { StatusPill } from "../../ui/status";
import { ManualAlertDialog } from "./manual-alert-dialog";

const comparisonCopy = {
  above: ">",
  "at-or-above": "≥",
  below: "<",
  "at-or-below": "≤",
} as const;

export function AlertsPage() {
  const runtime = useRuntimeQuery();
  const projectId = runtime.data?.projectId ?? null;
  const alerts = useAlertsQuery(projectId);
  const manualAlerts = useManualAlertsQuery(projectId);
  const overview = useOverviewQuery(projectId);
  const deleteAlert = useDeleteAlertRule(projectId);
  const startInvestigation = useStartInvestigation(projectId!);
  const navigate = useNavigate();
  const [alertToDelete, setAlertToDelete] = useState<Alert | null>(null);
  const loading =
    !runtime.isError &&
    !alerts.isError &&
    !manualAlerts.isError &&
    (runtime.isPending || alerts.isPending || manualAlerts.isPending);
  const error = runtime.error ?? alerts.error ?? manualAlerts.error;
  const openIncident = overview.data?.openIncident ?? null;

  const investigate = (alertId: Alert["id"]) =>
    startInvestigation.mutate(
      { alertId, payload: StartInvestigationRequest.make({}) },
      {
        onSuccess: (result) =>
          void navigate({
            params: { incidentId: result.incident.id },
            to: "/incidents/$incidentId",
          }),
      },
    );

  return (
    <Page>
      <PageHeader
        actions={
          projectId === null ? null : (
            <ManualAlertDialog
              projectId={projectId}
              services={overview.data?.services.map((service) => String(service.name)) ?? []}
            />
          )
        }
        description="Signals that need attention now. Your agent can also create threshold rules."
        title="Alerts"
      />

      {loading ? <ContentState kind="loading" title="Loading alerts" /> : null}
      {error ? (
        <ContentState
          actions={
            <RetryButton
              onRetry={() => {
                void runtime.refetch();
                void alerts.refetch();
                void manualAlerts.refetch();
              }}
            />
          }
          kind="error"
          title="Alerts are unavailable"
        >
          {errorMessage(error)}
        </ContentState>
      ) : null}

      {!loading && !error && alerts.data?.length === 0 && manualAlerts.data?.items.length === 0 ? (
        <ContentState title="Nothing needs attention">
          Create an alert for something you noticed, or ask your agent to watch a telemetry
          threshold.
        </ContentState>
      ) : null}

      {openIncident ? (
        <section {...stylex.props(styles.activeInvestigation)}>
          <span>
            <strong {...stylex.props(styles.activeInvestigationTitle)}>
              Investigation in progress
            </strong>
            <small {...stylex.props(styles.activeInvestigationCopy)}>
              Finish the current investigation before starting another from an alert.
            </small>
          </span>
          <Button
            render={<Link params={{ incidentId: openIncident.id }} to="/incidents/$incidentId" />}
            tone="secondary"
          >
            Open investigation
          </Button>
        </section>
      ) : null}

      {manualAlerts.data && manualAlerts.data.items.length > 0 ? (
        <AlertSection
          description="Created by people who noticed something worth investigating."
          title="Manual alerts"
        >
          {manualAlerts.data.items.map((alert) => (
            <ManualAlertRow
              alert={alert}
              key={alert.id}
              onInvestigate={() => investigate(alert.id)}
              openIncidentId={openIncident?.id ?? null}
              pending={
                startInvestigation.isPending && startInvestigation.variables?.alertId === alert.id
              }
            />
          ))}
        </AlertSection>
      ) : null}

      {alerts.data && alerts.data.length > 0 ? (
        <AlertSection
          description="Telemetry conditions created and maintained with your agent."
          title="Threshold rules"
        >
          {alerts.data.map((alert) => (
            <ThresholdAlertRow
              alert={alert}
              key={alert.id}
              onDelete={() => setAlertToDelete(alert)}
              onInvestigate={() => investigate(alert.id)}
              openIncidentId={openIncident?.id ?? null}
              pending={
                startInvestigation.isPending && startInvestigation.variables?.alertId === alert.id
              }
            />
          ))}
        </AlertSection>
      ) : null}

      {startInvestigation.isError || deleteAlert.isError ? (
        <p aria-live="polite" {...stylex.props(styles.error)}>
          {errorMessage(startInvestigation.error ?? deleteAlert.error)}
        </p>
      ) : null}

      <ConfirmDialog
        confirmLabel="Delete alert rule"
        description={
          alertToDelete === null
            ? "This project will stop evaluating the selected rule."
            : `Clear will stop evaluating “${alertToDelete.name}”. Existing incident history and telemetry stay unchanged.`
        }
        onConfirm={() => {
          if (alertToDelete === null) return;
          deleteAlert.mutate(alertToDelete.id, { onSuccess: () => setAlertToDelete(null) });
        }}
        onOpenChange={(open) => {
          if (!open && !deleteAlert.isPending) setAlertToDelete(null);
        }}
        open={alertToDelete !== null}
        pending={deleteAlert.isPending}
        pendingLabel="Deleting rule"
        title="Delete this alert rule?"
      />
    </Page>
  );
}

function AlertSection({
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

function ManualAlertRow({
  alert,
  onInvestigate,
  openIncidentId,
  pending,
}: {
  alert: ManualAlert;
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
        onInvestigate={onInvestigate}
        openIncidentId={openIncidentId}
        pending={pending}
      />
    </article>
  );
}

function ThresholdAlertRow({
  alert,
  onDelete,
  onInvestigate,
  openIncidentId,
  pending,
}: {
  alert: Alert;
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
  onInvestigate,
  openIncidentId,
  pending,
}: {
  onInvestigate: () => void;
  openIncidentId: string | null;
  pending: boolean;
}) {
  return openIncidentId ? null : (
    <Button disabled={pending} onClick={onInvestigate} tone="secondary">
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
  activeInvestigation: {
    alignItems: { default: "center", "@media (max-width: 620px)": "stretch" },
    backgroundColor: colors.amberWash,
    borderColor: "rgba(251, 191, 36, 0.2)",
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    flexDirection: { default: "row", "@media (max-width: 620px)": "column" },
    gap: space.x5,
    justifyContent: "space-between",
    marginBottom: space.x6,
    padding: space.x4,
  },
  activeInvestigationTitle: { display: "block", fontSize: 12, fontWeight: 500 },
  activeInvestigationCopy: {
    color: colors.textMuted,
    display: "block",
    fontSize: 10,
    marginTop: 4,
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
  error: { color: colors.red, fontSize: 12, marginTop: space.x4 },
});
