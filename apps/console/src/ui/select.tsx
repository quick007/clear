import { ArrowDown01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { Select } from "@base-ui/react/select";
import * as stylex from "@stylexjs/stylex";

import { colors, radii, space } from "../theme/tokens.stylex";
import { Icon } from "./icon";

export interface SelectOption<Value extends string> {
  readonly description?: string;
  readonly label: string;
  readonly value: Value;
}

export function SelectControl<Value extends string>({
  ariaLabel,
  disabled = false,
  onChange,
  options,
  placeholder,
  value,
}: {
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: Value) => void;
  options: ReadonlyArray<SelectOption<Value>>;
  placeholder: string;
  value: Value | null;
}) {
  return (
    <Select.Root
      disabled={disabled}
      items={options}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
      value={value}
    >
      <Select.Trigger aria-label={ariaLabel} {...stylex.props(styles.trigger)}>
        <Select.Value placeholder={placeholder} />
        <Select.Icon {...stylex.props(styles.triggerIcon)}>
          <Icon icon={ArrowDown01Icon} size={15} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner align="start" sideOffset={6} {...stylex.props(styles.positioner)}>
          <Select.Popup {...stylex.props(styles.popup)}>
            <Select.List {...stylex.props(styles.list)}>
              {options.map((option) => (
                <Select.Item key={option.value} value={option.value} {...stylex.props(styles.item)}>
                  <Select.ItemIndicator {...stylex.props(styles.indicator)}>
                    <Icon icon={CheckmarkCircle02Icon} size={15} />
                  </Select.ItemIndicator>
                  <Select.ItemText {...stylex.props(styles.itemText)}>
                    <strong {...stylex.props(styles.itemLabel)}>{option.label}</strong>
                    {option.description ? (
                      <small {...stylex.props(styles.itemDescription)}>{option.description}</small>
                    ) : null}
                  </Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

const styles = stylex.create({
  trigger: {
    alignItems: "center",
    backgroundColor: { default: colors.canvas, ":hover": colors.surfaceHover },
    borderColor: colors.lineStrong,
    borderRadius: radii.sm,
    borderStyle: "solid",
    borderWidth: 1,
    color: colors.text,
    cursor: "pointer",
    display: "flex",
    fontSize: 13,
    gap: space.x3,
    height: 44,
    justifyContent: "space-between",
    minWidth: 0,
    paddingInline: space.x3,
    textAlign: "left",
    width: "100%",
    ":disabled": { cursor: "not-allowed", opacity: 0.5 },
  },
  triggerIcon: { color: colors.textSubtle, display: "flex" },
  positioner: { zIndex: 120 },
  popup: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 18px 50px rgba(0, 0, 0, 0.34)",
    color: colors.text,
    minWidth: "var(--anchor-width)",
    outline: "none",
    overflow: "hidden",
  },
  list: { maxHeight: 300, overflowY: "auto", padding: space.x2 },
  item: {
    alignItems: "center",
    backgroundColor: { default: "transparent", "[data-highlighted]": colors.surfaceHover },
    borderRadius: radii.sm,
    cursor: "pointer",
    display: "grid",
    gap: space.x2,
    gridTemplateColumns: "18px minmax(0, 1fr)",
    minHeight: 42,
    outline: "none",
    paddingBlock: 7,
    paddingInline: space.x2,
  },
  indicator: { color: colors.green, display: "flex" },
  itemText: {
    display: "grid",
    gap: 2,
    minWidth: 0,
  },
  itemLabel: { fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" },
  itemDescription: { color: colors.textSubtle, fontSize: 11 },
});
