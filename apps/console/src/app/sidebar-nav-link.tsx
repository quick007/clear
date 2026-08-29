import * as stylex from "@stylexjs/stylex";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Icon } from "../ui/icon";
import { navigationStyles } from "./sidebar-navigation.styles";

export function SidebarNavLink({
  end,
  icon,
  label,
  onNavigate,
  to,
}: {
  end?: ReactNode;
  icon: Parameters<typeof Icon>[0]["icon"];
  label: string;
  onNavigate?: () => void;
  to: "/alerts" | "/incidents" | "/settings/project";
}) {
  return (
    <Link
      activeProps={stylex.props(navigationStyles.linkActive)}
      onClick={onNavigate}
      to={to}
      {...stylex.props(navigationStyles.link)}
    >
      <Icon icon={icon} size={18} />
      <span>{label}</span>
      {end ? <span {...stylex.props(navigationStyles.end)}>{end}</span> : null}
    </Link>
  );
}
