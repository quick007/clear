import type { Cursor } from "@groundtruth/api-contract";
import { type ProjectId, ServiceName } from "@groundtruth/domain";
import type { TelemetryWindow } from "@groundtruth/telemetry";
import { useInfiniteQuery } from "@tanstack/react-query";

import { nextPageCursor } from "./pagination";
import { queryKeys } from "./query-keys";
import { runGroundtruthQuery } from "./runtime-operations";

export function useDeploysQuery(
  projectId: ProjectId | null,
  service?: string,
  window?: TelemetryWindow,
) {
  return useInfiniteQuery({
    queryKey:
      projectId === null
        ? ["groundtruth", "deploys", "idle"]
        : queryKeys.deploys(projectId, service, window),
    queryFn: ({ pageParam, signal }) =>
      runGroundtruthQuery(
        (runtime) =>
          runtime.api.client.deploys.listDeployEvents({
            params: { projectId: projectId! },
            query: {
              cursor: pageParam,
              limit: 50,
              service: service === undefined ? undefined : ServiceName.make(service),
              window,
            },
          }),
        signal,
      ),
    initialPageParam: undefined as Cursor | undefined,
    getNextPageParam: nextPageCursor,
    enabled: projectId !== null,
  });
}
