import { IncidentDetail } from "@groundtruth/api-contract";
import { IncidentId, ProjectId } from "@groundtruth/domain";
import { Schema } from "effect";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { TimelineBar } from "./timeline-bar";

vi.mock("@stylexjs/stylex", () => ({
  create: (rules: Readonly<Record<string, unknown>>) =>
    Object.fromEntries(Object.keys(rules).map((name) => [name, name])),
  defineVars: (variables: Readonly<Record<string, string>>) => variables,
  props: (...names: ReadonlyArray<string | false>) => ({
    "data-style": names.filter(Boolean).join(" "),
  }),
}));

const closedIncident = Schema.decodeUnknownSync(IncidentDetail)({
  incident: {
    id: IncidentId.make("01890f6e-7c00-7000-8000-000000000002"),
    projectId: ProjectId.make("01890f6e-7c00-7000-8000-000000000001"),
    title: "Checkout latency and error spike",
    status: "closed",
    summary: "Latency recovered after the retry policy was corrected.",
    openedAt: "2026-08-28T06:00:00.000Z",
    closedAt: "2026-08-28T06:15:00.000Z",
    createdAt: "2026-08-28T06:00:00.000Z",
    updatedAt: "2026-08-28T06:15:00.000Z",
  },
  hypotheses: [],
  timeline: [],
});

describe("TimelineBar", () => {
  it("keeps the resolved state and final summary visible", () => {
    const html = renderToStaticMarkup(<TimelineBar incidentDetail={closedIncident} />);

    expect(html).toContain("Closed incident timeline");
    expect(html).toContain("Summary: Latency recovered after the retry policy was corrected.");
    expect(html).toContain('data-style="latestDot resolvedDot"');
  });
});
