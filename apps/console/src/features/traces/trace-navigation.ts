import type { TelemetryWindow } from "@groundtruth/telemetry";

export interface TraceNavigationContext {
  readonly query?: string;
  readonly service?: string;
  readonly source: "logs" | "traces";
  readonly window: TelemetryWindow;
}

export const traceExplorerSearch = (context: TraceNavigationContext) => ({
  metric: undefined,
  query: context.query,
  service: context.service,
  signal: context.source,
  trace: undefined,
  window: context.window,
});

export const traceContextPath = (
  path: string,
  context: TraceNavigationContext,
  explore = false,
) => {
  const params = new URLSearchParams({ window: context.window });
  if (explore) params.set("signal", context.source);
  else params.set("source", context.source);
  if (context.service) params.set("service", context.service);
  if (context.query) params.set("query", context.query);
  return `${path}?${params.toString()}`;
};
