import type { TelemetryWindow } from "@groundtruth/telemetry";
import * as stylex from "@stylexjs/stylex";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";

import { colors, space } from "../../theme/tokens.stylex";
import { SelectControl, type SelectOption } from "../../ui/select";

const tabs = [
  { label: "Metrics", signal: "metrics" },
  { label: "Logs", signal: "logs" },
  { label: "Traces", signal: "traces" },
] as const;

const windowOptions = [
  { label: "Last 15 minutes", value: "15m" },
  { label: "Last hour", value: "1h" },
  { label: "Last 6 hours", value: "6h" },
  { label: "Last 24 hours", value: "24h" },
  { label: "Last 7 days", value: "7d" },
] satisfies ReadonlyArray<SelectOption<TelemetryWindow>>;

export function ExploreNavigation({ services }: { services: ReadonlyArray<{ name: string }> }) {
  const search = useSearch({ from: "/explore" });
  const navigate = useNavigate({ from: "/explore" });
  const serviceOptions = [
    { label: "All services", value: "*" },
    ...services.map((service) => ({ label: service.name, value: String(service.name) })),
  ];

  return (
    <div {...stylex.props(styles.navigationWrap)}>
      <nav aria-label="Telemetry signals" {...stylex.props(styles.signalNav)}>
        {tabs.map((tab) => (
          <Link
            aria-current={search.signal === tab.signal ? "page" : undefined}
            key={tab.signal}
            search={{ ...search, signal: tab.signal }}
            to="/explore"
            {...stylex.props(
              styles.signalLink,
              search.signal === tab.signal && styles.signalLinkActive,
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <div {...stylex.props(styles.contextControls)}>
        {services.length > 1 ? (
          <span {...stylex.props(styles.serviceControl)}>
            <SelectControl
              ariaLabel="Filter by service"
              onChange={(service) =>
                void navigate({
                  search: (current) => ({
                    ...current,
                    service: service === "*" ? undefined : service,
                  }),
                })
              }
              options={serviceOptions}
              placeholder="All services"
              value={search.service ?? "*"}
            />
          </span>
        ) : null}
        <span {...stylex.props(styles.windowControl)}>
          <SelectControl
            ariaLabel="Select time range"
            onChange={(window) => void navigate({ search: (current) => ({ ...current, window }) })}
            options={windowOptions}
            placeholder="Last hour"
            value={search.window}
          />
        </span>
      </div>
    </div>
  );
}

const styles = stylex.create({
  navigationWrap: {
    alignItems: "center",
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: "flex",
    flexWrap: "wrap",
    gap: space.x3,
    justifyContent: "space-between",
    marginInline: "auto",
    maxWidth: 1400,
    paddingInline: { default: space.x6, "@media (max-width: 620px)": space.x5 },
    paddingTop: space.x4,
  },
  signalNav: { alignItems: "center", display: "flex", gap: space.x1 },
  signalLink: {
    borderBottomColor: "transparent",
    borderBottomStyle: "solid",
    borderBottomWidth: 2,
    color: { default: colors.textSubtle, ":hover": colors.text },
    fontSize: 12,
    fontWeight: 500,
    paddingBlock: 11,
    paddingInline: space.x3,
    textDecoration: "none",
  },
  signalLinkActive: { borderBottomColor: colors.amber, color: colors.text },
  contextControls: {
    alignItems: "center",
    display: "flex",
    gap: space.x2,
    justifyContent: { default: "end", "@media (max-width: 620px)": "start" },
    width: { default: "auto", "@media (max-width: 620px)": "100%" },
  },
  serviceControl: {
    display: "block",
    flex: { default: "0 0 auto", "@media (max-width: 620px)": "1 1 auto" },
    width: { default: 180, "@media (max-width: 620px)": "auto" },
  },
  windowControl: {
    display: "block",
    flex: { default: "0 0 auto", "@media (max-width: 620px)": "1 1 auto" },
    width: { default: 156, "@media (max-width: 620px)": "auto" },
  },
});
