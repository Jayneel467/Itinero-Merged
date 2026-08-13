import React from "react";
import ActionButton from "@/components/shared/ActionButton";

const VARIANT_MAP = {
  primary: "primary",
  secondary: "ghost",
  outline: "ghost",
  ghost: "ghost",
  pill: "ghost",
};

/**
 * UI Button - thin wrapper around shared ActionButton.
 * Prefer importing ActionButton directly for links and extra variants.
 */
export default function Button({
  variant = "primary",
  size = "md",
  pill = false,
  block = false,
  className = "",
  children,
  ...props
}) {
  const mapped = VARIANT_MAP[variant] || "primary";
  const isPill = pill || variant === "pill";
  const sizeClass =
    size === "sm" ? " !min-h-[36px] !px-3 !text-[13px]" : size === "lg" ? " !min-h-[48px] !px-6 !text-base" : "";

  return (
    <ActionButton
      variant={mapped}
      pill={isPill}
      block={block}
      className={`${sizeClass} ${className}`.trim()}
      {...props}
    >
      {children}
    </ActionButton>
  );
}
