import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps } from "react";

type IconProps = {
  icon: ComponentProps<typeof HugeiconsIcon>["icon"];
  label?: string;
  size?: number;
};

export function Icon({ icon, label, size = 18 }: IconProps) {
  return (
    <HugeiconsIcon
      aria-hidden={label ? undefined : true}
      aria-label={label}
      color="currentColor"
      icon={icon}
      size={size}
      strokeWidth={1.7}
    />
  );
}
