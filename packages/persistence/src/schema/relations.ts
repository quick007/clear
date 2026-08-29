import { defineRelations } from "drizzle-orm";
import { accounts, authHandoffCodes, hostedSessions } from "./accounts.ts";
import { alerts, dashboards, manualAlerts, panels } from "./boards.ts";
import { deployEvents, hypotheses, incidents, timelineEntries } from "./incidents.ts";
import { outboxEvents } from "./outbox.ts";
import { ingestKeys, projects } from "./projects.ts";

export const relations = defineRelations(
  {
    accounts,
    alerts,
    authHandoffCodes,
    dashboards,
    deployEvents,
    hostedSessions,
    hypotheses,
    incidents,
    ingestKeys,
    manualAlerts,
    outboxEvents,
    panels,
    projects,
    timelineEntries,
  },
  (relation) => ({
    accounts: {
      projects: relation.many.projects(),
      sessions: relation.many.hostedSessions(),
    },
    hostedSessions: {
      account: relation.one.accounts({
        from: relation.hostedSessions.accountId,
        to: relation.accounts.id,
        optional: false,
      }),
    },
    projects: {
      owner: relation.one.accounts({
        from: relation.projects.ownerId,
        to: relation.accounts.id,
        optional: false,
      }),
      ingestKeys: relation.many.ingestKeys(),
      dashboards: relation.many.dashboards(),
      alerts: relation.many.alerts(),
      manualAlerts: relation.many.manualAlerts(),
      incidents: relation.many.incidents(),
      deployEvents: relation.many.deployEvents(),
      outboxEvents: relation.many.outboxEvents(),
    },
    ingestKeys: {
      project: relation.one.projects({
        from: relation.ingestKeys.projectId,
        to: relation.projects.id,
        optional: false,
      }),
    },
    dashboards: {
      project: relation.one.projects({
        from: relation.dashboards.projectId,
        to: relation.projects.id,
        optional: false,
      }),
      panels: relation.many.panels({
        from: [relation.dashboards.projectId, relation.dashboards.id],
        to: [relation.panels.projectId, relation.panels.dashboardId],
      }),
    },
    panels: {
      dashboard: relation.one.dashboards({
        from: [relation.panels.projectId, relation.panels.dashboardId],
        to: [relation.dashboards.projectId, relation.dashboards.id],
        optional: false,
      }),
    },
    alerts: {
      project: relation.one.projects({
        from: relation.alerts.projectId,
        to: relation.projects.id,
        optional: false,
      }),
    },
    manualAlerts: {
      project: relation.one.projects({
        from: relation.manualAlerts.projectId,
        to: relation.projects.id,
        optional: false,
      }),
    },
    incidents: {
      project: relation.one.projects({
        from: relation.incidents.projectId,
        to: relation.projects.id,
        optional: false,
      }),
      hypotheses: relation.many.hypotheses({
        from: [relation.incidents.projectId, relation.incidents.id],
        to: [relation.hypotheses.projectId, relation.hypotheses.incidentId],
      }),
      timeline: relation.many.timelineEntries({
        from: [relation.incidents.projectId, relation.incidents.id],
        to: [relation.timelineEntries.projectId, relation.timelineEntries.incidentId],
      }),
    },
    hypotheses: {
      incident: relation.one.incidents({
        from: [relation.hypotheses.projectId, relation.hypotheses.incidentId],
        to: [relation.incidents.projectId, relation.incidents.id],
        optional: false,
      }),
    },
    timelineEntries: {
      incident: relation.one.incidents({
        from: [relation.timelineEntries.projectId, relation.timelineEntries.incidentId],
        to: [relation.incidents.projectId, relation.incidents.id],
        optional: false,
      }),
    },
    deployEvents: {
      project: relation.one.projects({
        from: relation.deployEvents.projectId,
        to: relation.projects.id,
        optional: false,
      }),
    },
    outboxEvents: {
      project: relation.one.projects({
        from: relation.outboxEvents.projectId,
        to: relation.projects.id,
        optional: false,
      }),
    },
  }),
);
