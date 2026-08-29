import { Schema } from "effect";

export const DependencyHealth = Schema.Literals(["healthy", "degraded", "unavailable"]);

export class HealthResponse extends Schema.Class<HealthResponse>("Groundtruth/Api/HealthResponse")({
  status: Schema.Literals(["healthy", "degraded"]),
  version: Schema.String,
  checkedAt: Schema.DateTimeUtcFromString,
  dependencies: Schema.Struct({
    postgres: DependencyHealth,
    clickhouse: DependencyHealth,
  }),
}) {}
