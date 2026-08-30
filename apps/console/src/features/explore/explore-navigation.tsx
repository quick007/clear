import type { TelemetryWindow } from "@groundtruth/telemetry";
import * as stylex from "@stylexjs/stylex";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";

import { colors, space } from "../../theme/tokens.stylex";
import { SelectControl, type SelectOption } from "../../ui/select";

const signalTabs = [
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

  return (
    <div {...stylex.props(styles.navigationWrap)}>
      <ExploreTabs
        active={search.signal}
        metric={search.metric}
        query={search.query}
        service={search.service}
        window={search.window}
      />
      <ContextControls
        onServiceChange={(service) =>
          void navigate({
            search: (current) => ({
              ...current,
              service: service === "*" ? undefined : service,
            }),
          })
        }
        onWindowChange={(window) =>
          void navigate({ search: (current) => ({ ...current, window }) })
        }
        service={search.service}
        services={services}
        window={search.window}
      />
    </div>
  );
}

export function ChangesNavigation({ services }: { services: ReadonlyArray<{ name: string }> }) {
  const search = useSearch({ from: "/deploys" });
  const navigate = useNavigate({ from: "/deploys" });

  return (
    <div {...stylex.props(styles.navigationWrap)}>
      <ExploreTabs active="changes" service={search.service} window={search.window} />
      <ContextControls
        onServiceChange={(service) =>
          void navigate({
            search: (current) => ({
              ...current,
              service: service === "*" ? undefined : service,
            }),
          })
        }
        onWindowChange={(window) =>
          void navigate({ search: (current) => ({ ...current, window }) })
        }
        service={search.service}
        services={services}
        window={search.window}
      />
    </div>
  );
}

function ExploreTabs({
  active,
  metric,
  query,
  service,
  window,
}: {
  active: "changes" | "logs" | "metrics" | "traces";
  metric?: string;
  query?: string;
  service?: string;
  window: TelemetryWindow;
}) {
  return (
    <nav aria-label="Investigation data" {...stylex.props(styles.signalNav)}>
      {signalTabs.map((tab) => (
        <Link
          aria-current={active === tab.signal ? "page" : undefined}
          key={tab.signal}
          search={{
            metric: tab.signal === "metrics" ? metric : undefined,
            query:
              tab.signal === active && (tab.signal === "logs" || tab.signal === "traces")
                ? query
                : undefined,
            service,
            signal: tab.signal,
            window,
          }}
          to="/explore"
          {...stylex.props(styles.signalLink, active === tab.signal && styles.signalLinkActive)}
        >
          {tab.label}
        </Link>
      ))}
      <Link
        aria-current={active === "changes" ? "page" : undefined}
        search={{ service, window }}
        to="/deploys"
        {...stylex.props(styles.signalLink, active === "changes" && styles.signalLinkActive)}
      >
        Deploys
      </Link>
    </nav>
  );
}

function ContextControls({
  onServiceChange,
  onWindowChange,
  service,
  services,
  window,
}: {
  onServiceChange: (service: string) => void;
  onWindowChange: (window: TelemetryWindow) => void;
  service?: string;
  services: ReadonlyArray<{ name: string }>;
  window: TelemetryWindow;
}) {
  const serviceOptions = [
    { label: "All services", value: "*" },
    ...services.map((item) => ({ label: item.name, value: String(item.name) })),
  ];

  return (
    <div {...stylex.props(styles.contextControls)}>
      {services.length > 1 ? (
        <span {...stylex.props(styles.serviceControl)}>
          <SelectControl
            ariaLabel="Filter by service"
            onChange={onServiceChange}
            options={serviceOptions}
            placeholder="All services"
            value={service ?? "*"}
          />
        </span>
      ) : null}
      <span {...stylex.props(styles.windowControl)}>
        <SelectControl
          ariaLabel="Select time range"
          onChange={onWindowChange}
          options={windowOptions}
          placeholder="Last hour"
          value={window}
        />
      </span>
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
