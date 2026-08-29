import type { ConsoleOverview } from "@groundtruth/api-contract";

export const accountInitials = (name: string) =>
  name
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "C";

export const serviceSummary = (overview: ConsoleOverview) => {
  if (overview.services.length === 1) return overview.services[0]!.name;
  return `${overview.services.length} services`;
};
