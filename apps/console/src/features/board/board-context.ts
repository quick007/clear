export type BoardDependencyState = "available" | "loading" | "missing" | "stale";

const dependencyMessages = {
  board: {
    available: null,
    loading: "Loading board configuration.",
    missing: "Board configuration could not be loaded.",
    stale: "Board configuration could not be refreshed. Showing the last loaded panels.",
  },
  catalog: {
    available: null,
    loading: "Loading metric details.",
    missing: "Metric details could not be loaded. Some values may appear without units.",
    stale:
      "Metric details could not be refreshed. Values use the last loaded units where available.",
  },
  incidentHistory: {
    available: null,
    loading: "Loading investigation history.",
    missing: "Investigation history could not be loaded, so walkthrough actions are paused.",
    stale: "Investigation history uses the last loaded data.",
  },
  overview: {
    available: null,
    loading: "Loading project and incident status.",
    missing: "Project and incident status could not be loaded.",
    stale: "Project and incident status use the last loaded data.",
  },
} as const satisfies Record<
  "board" | "catalog" | "incidentHistory" | "overview",
  Record<BoardDependencyState, string | null>
>;

export const boardDependencyState = (failed: boolean, loaded: boolean): BoardDependencyState =>
  failed ? (loaded ? "stale" : "missing") : loaded ? "available" : "loading";

export const boardContextMessage = ({
  board,
  catalog,
  incidentHistory,
  overview,
}: {
  board: BoardDependencyState;
  catalog: BoardDependencyState;
  incidentHistory: BoardDependencyState;
  overview: BoardDependencyState;
}) =>
  [
    dependencyMessages.board[board],
    dependencyMessages.catalog[catalog],
    dependencyMessages.overview[overview],
    dependencyMessages.incidentHistory[incidentHistory],
  ]
    .filter((detail) => detail !== null)
    .join(" ");
