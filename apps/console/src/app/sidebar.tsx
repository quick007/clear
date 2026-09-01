import type { ConsoleOverview, SessionView } from "@groundtruth/api-contract";
import {
  Alert02Icon,
  Cancel01Icon,
  DashboardSquare01Icon,
  Menu01Icon,
  Search02Icon,
  Settings01Icon,
  TrafficIncidentIcon,
} from "@hugeicons/core-free-icons";
import { Dialog } from "@base-ui/react/dialog";
import * as stylex from "@stylexjs/stylex";
import { Link, useLocation } from "@tanstack/react-router";
import { useState } from "react";

import { colors, radii, space } from "../theme/tokens.stylex";
import { ClearMark } from "../ui/clear-mark";
import { Icon } from "../ui/icon";
import { SidebarAccountFooter } from "./sidebar-account-footer";
import { serviceSummary } from "./sidebar-format";
import { SidebarNavLink } from "./sidebar-nav-link";
import { navigationStyles } from "./sidebar-navigation.styles";

interface WorkspaceNavigationProps {
  readonly overview?: ConsoleOverview;
  readonly overviewState: "error" | "loading" | "ready";
  readonly session?: SessionView;
}

export function WorkspaceSidebar({ overview, overviewState, session }: WorkspaceNavigationProps) {
  return (
    <aside {...stylex.props(styles.desktopSidebar)}>
      <SidebarContent overview={overview} overviewState={overviewState} session={session} />
    </aside>
  );
}

export function MobileWorkspaceHeader({
  overview,
  overviewState,
  session,
}: WorkspaceNavigationProps) {
  const [open, setOpen] = useState(false);

  return (
    <header {...stylex.props(styles.mobileHeader)}>
      <Link
        aria-label="Open the board"
        search={{ guide: undefined }}
        to="/board"
        {...stylex.props(styles.mobileBrand)}
      >
        <ClearMark />
        <span>Clear</span>
      </Link>
      <span {...stylex.props(styles.mobileProject)}>{overview?.project.name ?? "Workspace"}</span>
      <Dialog.Root onOpenChange={setOpen} open={open}>
        <Dialog.Trigger aria-label="Open navigation" {...stylex.props(styles.iconButton)}>
          <Icon icon={Menu01Icon} size={19} />
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Backdrop {...stylex.props(styles.backdrop)} />
          <Dialog.Popup {...stylex.props(styles.drawer)}>
            <Dialog.Title {...stylex.props(styles.screenReaderOnly)}>Navigation</Dialog.Title>
            <Dialog.Close aria-label="Close navigation" {...stylex.props(styles.drawerClose)}>
              <Icon icon={Cancel01Icon} size={19} />
            </Dialog.Close>
            <SidebarContent
              onNavigate={() => setOpen(false)}
              overview={overview}
              overviewState={overviewState}
              session={session}
            />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </header>
  );
}

function SidebarContent({
  onNavigate,
  overview,
  overviewState,
  session,
}: WorkspaceNavigationProps & { readonly onNavigate?: () => void }) {
  const location = useLocation();
  const firingCount = overview?.alerts.filter((alert) => alert.status === "firing").length ?? 0;
  const projectName =
    overviewState === "error"
      ? "Project unavailable"
      : (overview?.project.name ?? "Opening workspace");
  const projectSummary =
    overviewState === "error"
      ? "Project unavailable"
      : overviewState === "loading"
        ? "Loading signals"
        : session?.session._tag === "sandbox"
          ? "Sandbox · live telemetry"
          : overview?.services.length
            ? serviceSummary(overview)
            : "No signals yet";

  return (
    <div {...stylex.props(styles.sidebarContent)}>
      <div>
        <Link
          aria-label="Open the board"
          onClick={onNavigate}
          search={{ guide: undefined }}
          to="/board"
          {...stylex.props(styles.brand)}
        >
          <ClearMark />
          <span>Clear</span>
        </Link>
        <div {...stylex.props(styles.project)}>
          <span aria-hidden {...stylex.props(styles.projectSignal)} />
          <span {...stylex.props(styles.projectCopy)}>
            <strong {...stylex.props(styles.projectName)}>{projectName}</strong>
            <span {...stylex.props(styles.projectSummary)}>{projectSummary}</span>
          </span>
        </div>
      </div>

      <nav aria-label="Workspace" {...stylex.props(styles.nav)}>
        <Link
          activeProps={stylex.props(navigationStyles.linkActive)}
          onClick={onNavigate}
          search={{ guide: undefined }}
          to="/board"
          {...stylex.props(navigationStyles.link)}
        >
          <Icon icon={DashboardSquare01Icon} size={18} />
          <span>Board</span>
        </Link>
        <Link
          aria-current={
            location.pathname.startsWith("/explore") ||
            location.pathname.startsWith("/traces") ||
            location.pathname.startsWith("/deploys")
              ? "page"
              : undefined
          }
          onClick={onNavigate}
          search={{
            metric: undefined,
            query: undefined,
            service: undefined,
            signal: "metrics" as const,
            trace: undefined,
            window: "1h",
          }}
          to="/explore"
          {...stylex.props(
            navigationStyles.link,
            (location.pathname.startsWith("/explore") ||
              location.pathname.startsWith("/traces") ||
              location.pathname.startsWith("/deploys")) &&
              navigationStyles.linkActive,
          )}
        >
          <Icon icon={Search02Icon} size={18} />
          <span>Explore</span>
        </Link>
        <SidebarNavLink
          end={firingCount > 0 ? <span {...stylex.props(styles.count)}>{firingCount}</span> : null}
          icon={Alert02Icon}
          label="Alerts"
          onNavigate={onNavigate}
          to="/alerts"
        />
        <SidebarNavLink
          end={
            overview?.openIncident ? (
              <span aria-label="Open incident" {...stylex.props(styles.openDot)} />
            ) : null
          }
          icon={TrafficIncidentIcon}
          label="Incidents"
          onNavigate={onNavigate}
          to="/incidents"
        />
        {session?.session._tag === "sandbox" ? null : (
          <SidebarNavLink
            icon={Settings01Icon}
            label="Settings"
            onNavigate={onNavigate}
            to="/settings/project"
          />
        )}
      </nav>

      <SidebarAccountFooter onNavigate={onNavigate} session={session} />
    </div>
  );
}
const styles = stylex.create({
  desktopSidebar: {
    backgroundColor: colors.canvasRaised,
    borderRightColor: colors.line,
    borderRightStyle: "solid",
    borderRightWidth: 1,
    display: { default: "block", "@media (max-width: 840px)": "none" },
    height: "100vh",
    left: 0,
    position: "fixed",
    top: 0,
    width: 224,
    zIndex: 50,
  },
  sidebarContent: { display: "flex", flexDirection: "column", height: "100%", padding: space.x3 },
  brand: {
    alignItems: "center",
    color: colors.text,
    display: "flex",
    fontSize: 14,
    fontWeight: 600,
    gap: space.x3,
    height: 48,
    paddingInline: space.x1,
    textDecoration: "none",
  },
  project: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    gap: 10,
    marginTop: space.x2,
    minHeight: 50,
    paddingBlock: 9,
    paddingInline: 11,
    color: colors.text,
  },
  projectSignal: {
    backgroundColor: colors.green,
    borderColor: colors.canvasRaised,
    borderRadius: radii.pill,
    borderStyle: "solid",
    borderWidth: 2,
    boxShadow: `0 0 0 1px ${colors.lineStrong}`,
    display: "block",
    flexShrink: 0,
    height: 9,
    width: 9,
  },
  projectCopy: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  projectName: {
    fontSize: 12,
    fontWeight: 550,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  projectSummary: {
    color: colors.textSubtle,
    fontSize: 10,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  nav: { display: "grid", gap: 2, marginTop: space.x5 },
  count: {
    backgroundColor: colors.redWash,
    borderRadius: radii.pill,
    color: colors.red,
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 10,
    minWidth: 20,
    paddingBlock: 2,
    paddingInline: 6,
    textAlign: "center",
  },
  openDot: {
    backgroundColor: colors.amber,
    borderRadius: radii.pill,
    boxShadow: "0 0 0 4px rgba(251, 191, 36, 0.08)",
    display: "block",
    height: 6,
    width: 6,
  },
  mobileHeader: {
    alignItems: "center",
    backgroundColor: colors.canvasRaised,
    borderBottomColor: colors.line,
    borderBottomStyle: "solid",
    borderBottomWidth: 1,
    display: { default: "none", "@media (max-width: 840px)": "grid" },
    gridTemplateColumns: "1fr auto 1fr",
    height: 56,
    paddingInline: space.x4,
    position: "sticky",
    top: 0,
    zIndex: 40,
  },
  mobileBrand: {
    alignItems: "center",
    color: colors.text,
    display: "flex",
    fontWeight: 600,
    gap: space.x2,
    textDecoration: "none",
  },
  mobileProject: {
    color: colors.textMuted,
    fontSize: 11,
    maxWidth: "42vw",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.textMuted,
    cursor: "pointer",
    display: "flex",
    height: 36,
    justifyContent: "center",
    justifySelf: "end",
    width: 36,
  },
  backdrop: { backgroundColor: colors.overlay, inset: 0, position: "fixed", zIndex: 90 },
  drawer: {
    backgroundColor: colors.canvasRaised,
    borderRightColor: colors.lineStrong,
    borderRightStyle: "solid",
    borderRightWidth: 1,
    height: "100dvh",
    left: 0,
    maxWidth: "calc(100vw - 48px)",
    position: "fixed",
    top: 0,
    width: 280,
    zIndex: 100,
  },
  drawerClose: {
    alignItems: "center",
    backgroundColor: "transparent",
    borderColor: "transparent",
    color: colors.textMuted,
    cursor: "pointer",
    display: "flex",
    height: 40,
    justifyContent: "center",
    position: "absolute",
    right: space.x4,
    top: space.x4,
    width: 40,
    zIndex: 2,
  },
  screenReaderOnly: {
    clip: "rect(0, 0, 0, 0)",
    clipPath: "inset(50%)",
    height: 1,
    overflow: "hidden",
    position: "absolute",
    whiteSpace: "nowrap",
    width: 1,
  },
});
