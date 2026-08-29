import { Menu } from "@base-ui/react/menu";
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactNode } from "react";

import { colors, radii, space } from "../theme/tokens.stylex";

export const MenuRoot = Menu.Root;

type MenuTriggerProps = Omit<ComponentProps<typeof Menu.Trigger>, "className"> & {
  children: ReactNode;
  size?: "content" | "icon" | "wide";
};

export function MenuTrigger({ children, size = "content", ...props }: MenuTriggerProps) {
  return (
    <Menu.Trigger {...props} {...stylex.props(styles.trigger, triggerSizes[size])}>
      {children}
    </Menu.Trigger>
  );
}

type MenuPopupProps = {
  align?: ComponentProps<typeof Menu.Positioner>["align"];
  children: ReactNode;
};

export function MenuPopup({ align = "start", children }: MenuPopupProps) {
  return (
    <Menu.Portal>
      <Menu.Positioner align={align} sideOffset={8} {...stylex.props(styles.positioner)}>
        <Menu.Popup {...stylex.props(styles.popup)}>{children}</Menu.Popup>
      </Menu.Positioner>
    </Menu.Portal>
  );
}

type MenuItemProps = Omit<ComponentProps<typeof Menu.Item>, "className"> & {
  children: ReactNode;
  description?: string;
  mobileOnly?: boolean;
  tone?: "default" | "danger";
};

export function MenuItem({
  children,
  description,
  mobileOnly = false,
  tone = "default",
  ...props
}: MenuItemProps) {
  return (
    <Menu.Item
      {...props}
      {...stylex.props(
        styles.item,
        tone === "danger" && styles.itemDanger,
        mobileOnly && styles.mobileOnly,
      )}
    >
      <span {...stylex.props(styles.itemLabel)}>{children}</span>
      {description ? <span {...stylex.props(styles.itemDescription)}>{description}</span> : null}
    </Menu.Item>
  );
}

export function MenuSeparator({ mobileOnly = false }: { mobileOnly?: boolean }) {
  return <Menu.Separator {...stylex.props(styles.separator, mobileOnly && styles.mobileOnly)} />;
}

const styles = stylex.create({
  trigger: {
    alignItems: "center",
    backgroundColor: { default: "transparent", ":hover": colors.whiteWash },
    borderColor: "transparent",
    borderRadius: radii.sm,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.text,
    cursor: "pointer",
    display: "inline-flex",
    fontSize: 13,
    gap: space.x2,
    minHeight: { default: 36, "@media (max-width: 620px)": 44 },
    paddingInline: space.x2,
    textAlign: "left",
  },
  positioner: { zIndex: 80 },
  popup: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.lg,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 18px 50px rgba(0, 0, 0, 0.32)",
    color: colors.text,
    padding: space.x2,
    transformOrigin: "var(--transform-origin)",
  },
  item: {
    backgroundColor: { default: "transparent", "[data-highlighted]": colors.surfaceHover },
    borderRadius: radii.sm,
    color: colors.text,
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    fontSize: 13,
    gap: 2,
    minHeight: { default: 36, "@media (max-width: 620px)": 44 },
    outline: "none",
    paddingBlock: 8,
    paddingInline: 10,
  },
  itemLabel: { fontWeight: 500 },
  itemDescription: { color: colors.textSubtle, fontSize: 12 },
  itemDanger: { color: colors.red },
  mobileOnly: { display: { default: "none", "@media (max-width: 520px)": "flex" } },
  separator: { backgroundColor: colors.line, height: 1, marginBlock: space.x2 },
});

const triggerSizes = stylex.create({
  content: { minWidth: 0 },
  icon: {
    justifyContent: "center",
    minWidth: { default: 36, "@media (max-width: 620px)": 44 },
    paddingInline: 0,
    width: { default: 36, "@media (max-width: 620px)": 44 },
  },
  wide: {
    minWidth: { default: 232, "@media (max-width: 620px)": 36 },
    paddingInline: { default: space.x2, "@media (max-width: 620px)": 4 },
  },
});
