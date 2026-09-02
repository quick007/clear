import type { SessionView } from "@groundtruth/api-contract";
import {
  ArrowRight01Icon,
  Chart01Icon,
  Logout01Icon,
  Plug01Icon,
} from "@hugeicons/core-free-icons";
import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";

import { signInHref } from "../auth-route";
import { useLogoutMutation } from "../data/queries";
import { mutationOutcomeIsUnknown } from "../errors";
import { colors, radii, space } from "../theme/tokens.stylex";
import { Button } from "../ui/button";
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

  const accountName = account.displayName ?? "Account";
  const demoWorkspace = session?.session?._tag === "sandbox";

  return (
    <div {...stylex.props(styles.footer)}>
      {demoWorkspace ? (
        <a href="/board?hosted=true" onClick={onNavigate} {...stylex.props(styles.connect)}>
          <Icon icon={ArrowRight01Icon} size={16} />
          <span>Return to my project</span>
        </a>
      ) : (
        <>
          <Link onClick={onNavigate} to="/connect" {...stylex.props(styles.connect)}>
            <Icon icon={Plug01Icon} size={16} />
            <span>Connect data</span>
          </Link>
          <Button
            large
            render={
              <a
                href="/board?demo=true&guide=true"
                onClick={onNavigate}
                rel="noopener"
                target="_blank"
              />
            }
            tone="primary"
          >
            <span>See demo</span>
            <Icon icon={ArrowRight01Icon} size={16} />
          </Button>
        </>
      )}
      <div {...stylex.props(styles.account)}>
        <span {...stylex.props(styles.avatar)}>{accountInitials(accountName)}</span>
        <span {...stylex.props(styles.accountCopy)}>
          <strong {...stylex.props(styles.accountName)}>{accountName}</strong>
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
    backgroundColor: { default: "transparent", ":hover": colors.whiteWash },
    borderRadius: radii.md,
    color: colors.text,
    display: "grid",
    gap: space.x3,
    gridTemplateColumns: "32px minmax(0, 1fr)",
    minHeight: 44,
    paddingBlock: 6,
    paddingInline: space.x2,
    textDecoration: "none",
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.sm,
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
  guestAvatar: { color: colors.textMuted },
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
