import type { SessionView } from "@groundtruth/api-contract";
import { Chart01Icon, Logout01Icon, Plug01Icon } from "@hugeicons/core-free-icons";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { signInHref } from "../auth-route";
import { useLogoutMutation } from "../data/queries";
import { mutationOutcomeIsUnknown } from "../errors";
import { colors, radii, space } from "../theme/tokens.stylex";
import { Icon } from "../ui/icon";
import { MutationFailureNotice } from "../ui/mutation-failure-notice";
import { accountInitials } from "./sidebar-format";

export function SidebarAccountFooter({
  onNavigate,
  session,
}: {
  readonly onNavigate?: () => void;
  readonly session?: SessionView;
}) {
  const logout = useLogoutMutation();
  const logoutOutcomeUnknown = logout.isError && mutationOutcomeIsUnknown(logout.error);
  const account = session?.account;

  if (!account) {
    return (
      <div {...stylex.props(styles.footer)}>
        <a href={signInHref("/connect")} onClick={onNavigate} {...stylex.props(styles.login)}>
          <span {...stylex.props(styles.avatar, styles.guestAvatar)}>
            <Icon icon={Chart01Icon} size={16} />
          </span>
          <span {...stylex.props(styles.accountCopy)}>
            <strong {...stylex.props(styles.accountName)}>Log in</strong>
            <span {...stylex.props(styles.accountDetail)}>Create your project</span>
          </span>
        </a>
      </div>
    );
  }

  const accountName = account.displayName ?? account.email ?? "Account";

  return (
    <div {...stylex.props(styles.footer)}>
      <Link onClick={onNavigate} to="/connect" {...stylex.props(styles.connect)}>
        <Icon icon={Plug01Icon} size={16} />
        <span>Connect data</span>
      </Link>
      <div {...stylex.props(styles.account)}>
        <span {...stylex.props(styles.avatar)}>{accountInitials(accountName)}</span>
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
  );
}

const styles = stylex.create({
  footer: {
    borderTopColor: colors.line,
    borderTopStyle: "solid",
    borderTopWidth: 1,
    display: "grid",
    gap: space.x2,
    marginTop: "auto",
    paddingTop: space.x3,
  },
  connect: {
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": colors.whiteWash },
    borderRadius: radii.sm,
    color: colors.textMuted,
    display: "flex",
    fontSize: 12,
    gap: space.x3,
    minHeight: 34,
    paddingInline: space.x2,
    textDecoration: "none",
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
});
