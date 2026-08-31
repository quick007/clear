import { useQuery } from "@tanstack/react-query";

import { getPublicApiClient } from "../api/public-client";

const publicStatusRefreshInterval = 15 * 1_000; // 15 seconds

const shouldPollPublicStatus = () =>
  typeof document === "undefined" || document.visibilityState === "visible";

export function usePublicStatusQuery() {
  return useQuery({
    queryKey: ["clear", "public-status"],
    queryFn: async ({ signal }) => (await getPublicApiClient()).getStatus(signal),
    refetchInterval: () => (shouldPollPublicStatus() ? publicStatusRefreshInterval : false),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
    staleTime: 10 * 1_000, // 10 seconds
  });
}
