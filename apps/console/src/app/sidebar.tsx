import type { ConsoleOverview, SessionView } from "@groundtruth/api-contract";
import {
  Alert02Icon,
  Cancel01Icon,
  Chart01Icon,
  DashboardSquare01Icon,
  Logout01Icon,
  Menu01Icon,
  Search02Icon,
  Settings01Icon,
  TrafficIncidentIcon,
} from "@hugeicons/core-free-icons";
import { Dialog } from "@base-ui/react/dialog";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { useLogoutMutation } from "../data/queries";
import { mutationOutcomeIsUnknown } from "../errors";
import { colors, radii, space } from "../theme/tokens.stylex";
import { ClearMark } from "../ui/clear-mark";
import { Icon } from "../ui/icon";
import { MutationFailureNotice } from "../ui/mutation-failure-notice";
import { accountInitials, serviceSummary } from "./sidebar-format";
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
  const logout = useLogoutMutation();
  const logoutOutcomeUnknown = logout.isError && mutationOutcomeIsUnknown(logout.error);
  const account = session?.account;
  const accountName = account?.displayName ?? account?.email ?? "Account";
  const initials = accountInitials(accountName);
  const firingCount = overview?.alerts.filter((alert) => alert.status === "firing").length ?? 0;
  const projectName =
    overviewState === "error"
      ? "Project unavailable"
      : (overview?.project.name ?? "Opening workspace");
  const projectSummary =
    overviewState === "error"
      ? "Try again from the page"
      : overviewState === "loading"
        ? "Loading signals"
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
          <span {...stylex.props(styles.projectMark)}>{projectName[0]?.toUpperCase() ?? "C"}</span>
          <span {...stylex.props(styles.projectCopy)}>
            <strong {...stylex.props(styles.projectName)}>{projectName}</strong>
            <span {...stylex.props(styles.projectSummary)}>
              {account ? projectSummary : `Sandbox · ${projectSummary}`}
            </span>
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
          activeOptions={{ includeSearch: false }}
          activeProps={stylex.props(navigationStyles.linkActive)}
          onClick={onNavigate}
          search={{
            metric: undefined,
            service: undefined,
            signal: "metrics" as const,
            window: "1h",
          }}
          to="/explore"
          {...stylex.props(navigationStyles.link)}
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
        <SidebarNavLink
          icon={Settings01Icon}
          label="Settings"
          onNavigate={onNavigate}
          to="/settings/project"
        />
      </nav>

      <div {...stylex.props(styles.bottom)}>
        {account ? (
          <div>
            <div {...stylex.props(styles.account)}>
              <span {...stylex.props(styles.avatar)}>{initials}</span>
              <span {...stylex.props(styles.accountCopy)}>
                <strong {...stylex.props(styles.accountName)}>{accountName}</strong>
                <span {...stylex.props(styles.accountDetail)}>{account.email}</span>
              </span>
              <button
                aria-label="Sign out"
                disabled={logout.isPending || logoutOutcomeUnknown}
                onClick={() => {
                  logout.reset();
                  logout.mutate();
                }}
                type="button"
                {...stylex.props(styles.logout)}
              >
                <Icon icon={Logout01Icon} size={17} />
              </button>
            </div>
            {logout.isError ? (
              <MutationFailureNotice
                checkLabel="Check session"
                compact
                error={logout.error}
                onCheckState={() => window.location.reload()}
              />
            ) : null}
          </div>
        ) : (
          <a
            href="/auth/chatgpt?returnPath=%2Fconnect"
            onClick={onNavigate}
            {...stylex.props(styles.login)}
          >
            <span {...stylex.props(styles.avatar, styles.guestAvatar)}>
              <Icon icon={Chart01Icon} size={16} />
            </span>
            <span {...stylex.props(styles.accountCopy)}>
              <strong {...stylex.props(styles.accountName)}>Log in</strong>
              <span {...stylex.props(styles.accountDetail)}>Create your project</span>
            </span>
          </a>
        )}
      </div>
    </div>
  );
}
const styles = stylex.create({
  desktopSidebar: {
    backdropFilter: "blur(16px) saturate(110%)",
    backgroundColor: "rgba(12, 14, 14, 0.86)",
    borderRightColor: colors.materialLine,
    borderRightStyle: "solid",
    borderRightWidth: 1,
    display: { default: "block", "@media (max-width: 840px)": "none" },
    height: "100vh",
    left: 0,
    position: "fixed",
    top: 0,
    width: 232,
    zIndex: 50,
  },
  sidebarContent: { display: "flex", flexDirection: "column", height: "100%", padding: space.x4 },
  brand: {
    alignItems: "center",
    color: colors.text,
    display: "flex",
    fontSize: 15,
    fontWeight: 600,
    gap: space.x3,
    height: 40,
    paddingInline: space.x2,
    textDecoration: "none",
  },
  project: {
    alignItems: "center",
    backgroundColor: colors.materialSurfaceStrong,
    borderColor: colors.materialLine,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    gap: space.x3,
    marginTop: space.x4,
    minHeight: 58,
    padding: space.x3,
    boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.05)",
    color: colors.text,
  },
  projectMark: {
    alignItems: "center",
    backgroundColor: colors.amberWash,
    borderRadius: radii.sm,
    color: colors.amber,
    display: "flex",
    flexShrink: 0,
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 11,
    fontWeight: 600,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  projectCopy: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  projectName: {
    fontSize: 12,
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  projectSummary: {
    color: colors.textSubtle,
    fontSize: 11,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  nav: { display: "grid", gap: 3, marginTop: space.x6 },
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
  bottom: {
    borderTopColor: colors.line,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    marginTop: "auto",
    paddingTop: space.x4,
  },
  account: {
    alignItems: "center",
    display: "grid",
    gap: space.x3,
    gridTemplateColumns: "32px minmax(0, 1fr) 32px",
  },
  login: {
    alignItems: "center",
    borderRadius: radii.sm,
    color: colors.text,
    display: "grid",
    gap: space.x3,
    gridTemplateColumns: "32px minmax(0, 1fr)",
    padding: space.x2,
    textDecoration: "none",
    ":hover": { backgroundColor: colors.whiteWash },
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.text,
    display: "flex",
    fontFamily: "IBM Plex Mono, monospace",
    fontSize: 11,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  guestAvatar: { color: colors.amber },
  accountCopy: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  accountName: {
    fontSize: 12,
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  accountDetail: {
    color: colors.textSubtle,
    fontSize: 11,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  logout: {
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": colors.whiteWash },
    borderColor: "transparent",
    borderRadius: radii.sm,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.textSubtle,
    cursor: "pointer",
    display: "flex",
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  logoutError: {
    color: colors.red,
    fontSize: 10,
    lineHeight: 1.4,
    marginBlock: space.x2,
    paddingInline: space.x2,
  },
  mobileHeader: {
    alignItems: "center",
    backdropFilter: "blur(16px) saturate(110%)",
    backgroundColor: "rgba(12, 14, 14, 0.86)",
    borderBottomColor: colors.materialLine,
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
    backdropFilter: "blur(16px) saturate(110%)",
    backgroundColor: "rgba(12, 14, 14, 0.94)",
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
