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
import { colors, radii, space } from "../theme/tokens.stylex";
import { ClearMark } from "../ui/clear-mark";
import { Icon } from "../ui/icon";
import { accountInitials, serviceSummary } from "./sidebar-format";
import { SidebarNavLink } from "./sidebar-nav-link";
import { navigationStyles } from "./sidebar-navigation.styles";

export function WorkspaceSidebar({
  overview,
  session,
}: {
  overview?: ConsoleOverview;
  session?: SessionView;
}) {
  return (
    <aside {...stylex.props(styles.desktopSidebar)}>
      <SidebarContent overview={overview} session={session} />
    </aside>
  );
}

export function MobileWorkspaceHeader({
  overview,
  session,
}: {
  overview?: ConsoleOverview;
  session?: SessionView;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header {...stylex.props(styles.mobileHeader)}>
      <Link
        aria-label="Open the board"
        search={{ start: undefined }}
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
  session,
}: {
  onNavigate?: () => void;
  overview?: ConsoleOverview;
  session?: SessionView;
}) {
  const logout = useLogoutMutation();
  const account = session?.account;
  const accountName = account?.displayName ?? account?.email ?? "Account";
  const initials = accountInitials(accountName);
  const firingCount = overview?.alerts.filter((alert) => alert.status === "firing").length ?? 0;

  return (
    <div {...stylex.props(styles.sidebarContent)}>
      <div>
        <Link
          aria-label="Open the board"
          onClick={onNavigate}
          search={{ start: undefined }}
          to="/board"
          {...stylex.props(styles.brand)}
        >
          <ClearMark />
          <span>Clear</span>
        </Link>
        <div {...stylex.props(styles.project)}>
          <span {...stylex.props(styles.projectMark)}>
            {overview?.project.name[0]?.toUpperCase() ?? "C"}
          </span>
          <span {...stylex.props(styles.projectCopy)}>
            <strong {...stylex.props(styles.projectName)}>
              {overview?.project.name ?? "Opening workspace"}
            </strong>
            <span {...stylex.props(styles.projectSummary)}>
              {overview?.services.length ? serviceSummary(overview) : "No signals yet"}
            </span>
          </span>
        </div>
      </div>

      <nav aria-label="Workspace" {...stylex.props(styles.nav)}>
        <Link
          activeProps={stylex.props(navigationStyles.linkActive)}
          onClick={onNavigate}
          search={{ start: undefined }}
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
          <div {...stylex.props(styles.account)}>
            <span {...stylex.props(styles.avatar)}>{initials}</span>
            <span {...stylex.props(styles.accountCopy)}>
              <strong {...stylex.props(styles.accountName)}>{accountName}</strong>
              <span {...stylex.props(styles.accountDetail)}>{account.email}</span>
            </span>
            <button
              aria-label="Sign out"
              disabled={logout.isPending}
              onClick={() => logout.mutate()}
              type="button"
              {...stylex.props(styles.logout)}
            >
              <Icon icon={Logout01Icon} size={17} />
            </button>
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
    backgroundColor: colors.canvasRaised,
    borderRightColor: colors.line,
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
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    display: "flex",
    gap: space.x3,
    marginTop: space.x4,
    minHeight: 58,
    padding: space.x3,
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
    fontSize: 10,
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
    fontSize: 9,
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
    fontSize: 10,
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
    fontSize: 11,
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  accountDetail: {
    color: colors.textSubtle,
    fontSize: 9,
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
