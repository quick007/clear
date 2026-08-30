export type BoardDependencyState = "available" | "missing" | "stale";

export const boardContextMessage = ({
  catalog,
  overview,
}: {
  catalog: BoardDependencyState;
  overview: BoardDependencyState;
}) =>
  [
    catalog === "missing"
      ? "Metric details could not be loaded. Some values may appear without units."
      : catalog === "stale"
        ? "Metric details could not be refreshed. Values use the last loaded units where available."
        : null,
    overview === "missing"
      ? "Project and incident status could not be loaded."
      : overview === "stale"
        ? "Project and incident status use the last loaded data."
        : null,
  ]
    .filter((detail): detail is string => detail !== null)
    .join(" ");
