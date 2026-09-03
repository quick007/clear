import { IncidentDetail } from "@groundtruth/api-contract";
import { Hypothesis, HypothesisId, Incident, IncidentId, ProjectId } from "@groundtruth/domain";
import { Schema } from "effect";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { HypothesisList, SituationStrip } from "./situation-strip";

vi.mock("@stylexjs/stylex", () => ({
  create: (rules: Readonly<Record<string, unknown>>) =>
    Object.fromEntries(Object.keys(rules).map((name) => [name, name])),
  defineVars: (variables: Readonly<Record<string, string>>) => variables,
  props: (...names: ReadonlyArray<string | false>) => ({
    "data-style": names.filter(Boolean).join(" "),
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    createElement("a", { href: to }, children),
}));

const projectId = ProjectId.make("01890f6e-7c00-7000-8000-000000000001");
const incidentId = IncidentId.make("01890f6e-7c00-7000-8000-000000000002");
const statuses = ["proposed", "testing", "rejected", "confirmed"] as const;

const hypotheses = statuses.map((status, index) =>
  Schema.decodeUnknownSync(Hypothesis)({
    id: HypothesisId.make(`01890f6e-7c00-7000-8000-00000000000${index + 3}`),
    projectId,
    incidentId,
    text: `${status} cause`,
    status,
    createdAt: "2026-08-28T06:00:00.000Z",
    updatedAt: "2026-08-28T06:00:00.000Z",
  }),
);

describe("HypothesisList", () => {
  it("renders every hypothesis and status for the disclosure popover", () => {
    const html = renderToStaticMarkup(<HypothesisList hypotheses={hypotheses} />);

    expect(html).toContain('aria-label="Incident hypotheses"');
    for (const status of statuses) {
      expect(html).toContain(`${status} cause`);
      expect(html).toContain(`aria-label="${status} hypothesis: ${status} cause"`);
      expect(html).toContain(`>${status}</span>`);
    }
    expect(html).toContain('data-style="hypothesisText rejectedText"');
    expect(html).not.toContain("line-through");
  });
});

describe("SituationStrip", () => {
  it("does not report zero firing alerts for a manual investigation", () => {
    const incidentDetail = new IncidentDetail({
      incident: Schema.decodeUnknownSync(Incident)({
        id: incidentId,
        projectId,
        title: "Checkout behavior needs investigation",
        status: "open",
        summary: null,
        openedAt: "2026-08-28T06:00:00.000Z",
        closedAt: null,
        createdAt: "2026-08-28T06:00:00.000Z",
        updatedAt: "2026-08-28T06:00:00.000Z",
      }),
      hypotheses: [],
      timeline: [],
    });
    const html = renderToStaticMarkup(<SituationStrip incidentDetail={incidentDetail} />);

    expect(html).toContain("Investigation open");
    expect(html).not.toContain("0 alerts firing");
  });

  it("keeps a resolved incident and its summary visible without an open overview incident", () => {
    const incidentDetail = new IncidentDetail({
      incident: Schema.decodeUnknownSync(Incident)({
        id: incidentId,
        projectId,
        title: "Checkout latency and error spike",
        status: "closed",
        summary: "Latency recovered after the retry policy was corrected.",
        openedAt: "2026-08-28T06:00:00.000Z",
        closedAt: "2026-08-28T06:15:00.000Z",
        createdAt: "2026-08-28T06:00:00.000Z",
        updatedAt: "2026-08-28T06:15:00.000Z",
      }),
      hypotheses,
      timeline: [],
    });
    const html = renderToStaticMarkup(<SituationStrip incidentDetail={incidentDetail} />);

    expect(html).toContain("Closed");
    expect(html).toContain("Checkout latency and error spike");
    expect(html).toContain("Latency recovered after the retry policy was corrected.");
    expect(html).toContain(
      'aria-label="View hypotheses: 1 confirmed, 1 testing, 1 proposed, 1 rejected"',
    );
    expect(html).toContain(">1 confirmed</span>");
  });
});
