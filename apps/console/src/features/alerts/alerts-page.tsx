import { StartInvestigationRequest } from "@groundtruth/api-contract";
import type { Alert } from "@groundtruth/domain";
import * as stylex from "@stylexjs/stylex";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { errorMessage } from "../../data/format";
import {
  useAlertsQuery,
  useDeleteAlertRule,
  useManualAlertsQuery,
  useOverviewQuery,
  useRuntimeQuery,
  useStartInvestigation,
} from "../../data/queries";
import { mutationOutcomeIsUnknown } from "../../errors";
import { colors, radii, space } from "../../theme/tokens.stylex";
import { Button } from "../../ui/button";
import { ConfirmDialog } from "../../ui/confirm-dialog";
import { ConsoleFailureActions } from "../../ui/console-failure-actions";
import { MutationFailureNotice } from "../../ui/mutation-failure-notice";
import { ContentState, Page, PageHeader } from "../../ui/page";
import { StaleDataNotice } from "../../ui/stale-data-notice";
import { AlertSection, ManualAlertRow, ThresholdAlertRow } from "./alert-list";
import { ManualAlertDialog } from "./manual-alert-dialog";

export const investigationWorkspaceNavigation = {
  search: { demo: undefined, guide: undefined },
  to: "/board",
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
  const runtimeUnavailable = runtime.isError && !runtime.data;
  const alertsUnavailable = alerts.isError && !alerts.data;
  const manualAlertsUnavailable = manualAlerts.isError && !manualAlerts.data;
  const unavailable = runtimeUnavailable || alertsUnavailable || manualAlertsUnavailable;
  const loading =
    !unavailable &&
    ((runtime.isPending && !runtime.data) ||
      (alerts.isPending && !alerts.data) ||
      (manualAlerts.isPending && !manualAlerts.data));
  const error = runtimeUnavailable
    ? runtime.error
    : alertsUnavailable
      ? alerts.error
      : manualAlerts.error;
  const hasUsableAlerts = alerts.data !== undefined && manualAlerts.data !== undefined;
  const staleError =
    unavailable || !hasUsableAlerts
      ? null
      : (runtime.error ?? alerts.error ?? manualAlerts.error ?? overview.error);
  const openIncident = overview.data?.openIncident ?? null;
  const incidentContextAvailable = overview.data !== undefined;
  const startOutcomeUnknown =
    startInvestigation.isError && mutationOutcomeIsUnknown(startInvestigation.error);
  const deleteOutcomeUnknown = deleteAlert.isError && mutationOutcomeIsUnknown(deleteAlert.error);
  const investigationBlocked = startInvestigation.isPending || startOutcomeUnknown;

  const retryFailedQueries = () => {
    if (runtime.isError) void runtime.refetch();
    if (runtimeUnavailable) return;
    if (alerts.isError) void alerts.refetch();
    if (manualAlerts.isError) void manualAlerts.refetch();
    if (overview.isError) void overview.refetch();
  };

  const investigate = (alertId: Alert["id"]) => {
    if (investigationBlocked) return;
    startInvestigation.mutate(
      { alertId, payload: StartInvestigationRequest.make({}) },
      {
        onSuccess: () => void navigate(investigationWorkspaceNavigation),
      },
    );
  };

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
      {unavailable ? (
        <ContentState
          actions={
            <ConsoleFailureActions
              error={error}
              notFound={{ href: "/connect", label: "Open connection setup" }}
              onRetry={retryFailedQueries}
              returnPath="/alerts"
            />
          }
          kind="error"
          title="Alerts are unavailable"
        >
          {errorMessage(error)}
        </ContentState>
      ) : null}

      <StaleDataNotice
        copy={
          incidentContextAvailable
            ? "Some alert data or investigation context may be out of date."
            : "Investigation context is unavailable. Alert data remains visible."
        }
        error={staleError}
        notFound={{ href: "/connect", label: "Open connection setup" }}
        onRetry={retryFailedQueries}
        retrying={
          runtime.isFetching || alerts.isFetching || manualAlerts.isFetching || overview.isFetching
        }
        returnPath="/alerts"
      />

      {!loading &&
      !unavailable &&
      alerts.data?.length === 0 &&
      manualAlerts.data?.items.length === 0 ? (
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
          <Button render={<Link {...investigationWorkspaceNavigation} />} tone="secondary">
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
              blocked={investigationBlocked}
              canInvestigate={incidentContextAvailable}
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
          description="Metric thresholds Clear watches for you. Your agent can create and tune them."
          title="Threshold rules"
        >
          {alerts.data.map((alert) => (
            <ThresholdAlertRow
              alert={alert}
              blocked={investigationBlocked}
              canInvestigate={incidentContextAvailable}
              key={alert.id}
              onDelete={() => {
                if (!deleteOutcomeUnknown) deleteAlert.reset();
                setAlertToDelete(alert);
              }}
              onInvestigate={() => investigate(alert.id)}
              openIncidentId={openIncident?.id ?? null}
              pending={
                startInvestigation.isPending && startInvestigation.variables?.alertId === alert.id
              }
            />
          ))}
        </AlertSection>
      ) : null}

      {startInvestigation.isError ? (
        <MutationFailureNotice
          checkLabel="Check current investigation"
          checking={overview.isFetching}
          error={startInvestigation.error}
          onCheckState={() => {
            void overview.refetch().then((result) => {
              if (!result.isSuccess) return;
              startInvestigation.reset();
              if (result.data.openIncident) {
                void navigate(investigationWorkspaceNavigation);
              }
            });
          }}
        />
      ) : null}

      <ConfirmDialog
        confirmLabel="Delete alert rule"
        description={
          alertToDelete === null
            ? "This project will stop evaluating the selected rule."
            : `Clear will stop evaluating “${alertToDelete.name}”. Existing incident history and telemetry stay unchanged.`
        }
        confirmDisabled={deleteOutcomeUnknown}
        dismissDisabled={deleteOutcomeUnknown}
        error={
          deleteAlert.isError ? (
            <MutationFailureNotice
              compact
              checkLabel="Check alert rules"
              checking={alerts.isFetching}
              error={deleteAlert.error}
              onCheckState={() => {
                void alerts.refetch().then((result) => {
                  if (!result.isSuccess || alertToDelete === null) return;
                  const stillExists = result.data.some((alert) => alert.id === alertToDelete.id);
                  deleteAlert.reset();
                  if (!stillExists) setAlertToDelete(null);
                });
              }}
            />
          ) : undefined
        }
        onConfirm={() => {
          if (alertToDelete === null) return;
          deleteAlert.mutate(alertToDelete.id, { onSuccess: () => setAlertToDelete(null) });
        }}
        onOpenChange={(open) => {
          if (!open && !deleteAlert.isPending && !deleteOutcomeUnknown) {
            deleteAlert.reset();
            setAlertToDelete(null);
          }
        }}
        open={alertToDelete !== null}
        pending={deleteAlert.isPending}
        pendingLabel="Deleting rule"
        title="Delete this alert rule?"
      />
    </Page>
  );
}

const styles = stylex.create({
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
});
