import {
  AlertName,
  DisplayName,
  EmailAddress,
  HostedSubject,
  ProjectName,
  ProjectSlug,
  ServiceName,
} from "@groundtruth/domain";
import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";
import {
  AccountRepository,
  AlertRepository,
  ProjectRepository,
} from "../src/repositories/services.ts";
import { RepositoriesMemory } from "../src/testing/in-memory.ts";
import { RepositoriesMemoryControl } from "../src/testing/in-memory-state.ts";

describe("in-memory alert repository", () => {
  it("counts and deletes alerts within their project", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const accounts = yield* AccountRepository;
        const projects = yield* ProjectRepository;
        const alerts = yield* AlertRepository;
        const control = yield* RepositoriesMemoryControl;
        const owner = yield* accounts.upsertHosted({
          hostedSubject: HostedSubject.make("alert-owner@example.com"),
          email: EmailAddress.make("alert-owner@example.com"),
          displayName: DisplayName.make("Alert owner"),
        });
        const createProject = (slug: string, name: string) =>
          projects.create({
            ownerId: owner.id,
            slug: ProjectSlug.make(slug),
            name: ProjectName.make(name),
            mode: "hosted",
            retentionDays: 7,
            quotas: {
              maxIngestBytesPerMinute: 50_000_000,
              maxActiveSeries: 100_000,
              maxPanels: 100,
            },
          });
        const project = yield* createProject("alerts", "Alerts");
        const otherProject = yield* createProject("other-alerts", "Other alerts");
        const alert = yield* alerts.create(project.id, {
          name: AlertName.make("Checkout request rate"),
          serviceName: ServiceName.make("checkout-api"),
          metricName: "http.server.requests",
          aggregation: "rate",
          comparison: "above",
          threshold: 100,
          windowSeconds: 60,
          severity: "critical",
          summary: null,
          enabled: true,
        });

        expect(yield* alerts.count(project.id)).toBe(1);
        expect(yield* alerts.count(otherProject.id)).toBe(0);
        expect(yield* alerts.delete(otherProject.id, alert.id)).toBe(false);
        expect(yield* alerts.delete(project.id, alert.id)).toBe(true);
        expect(yield* alerts.delete(project.id, alert.id)).toBe(false);
        expect(yield* alerts.count(project.id)).toBe(0);
        expect((yield* control.snapshot).outbox.at(-1)).toMatchObject({
          projectId: project.id,
          kind: "alert.updated",
          payload: { alertId: alert.id, deleted: true },
        });
      }).pipe(Effect.provide(RepositoriesMemory)),
    );
  });
});
