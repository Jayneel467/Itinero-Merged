import React from "react";
import { Link } from "react-router-dom";
import styles from "./ActionButton.module.css";

const VARIANTS = {
  primary: styles.primary,
  navy: styles.navy,
  ghost: styles.ghost,
  soft: styles.soft,
  gradient: styles.gradient,
  danger: styles.danger,
};

function composeClassName({ variant, pill, block, className }) {
  return [
    styles.root,
    VARIANTS[variant] || VARIANTS.primary,
    pill && styles.pill,
    block && styles.block,
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Shared button / link control - use instead of one-off page-level btn classes.
 */
export default function ActionButton({
  variant = "primary",
  pill = false,
  block = false,
  to,
  href,
  className = "",
  children,
  type = "button",
  ...props
}) {
  const cls = composeClassName({ variant, pill, block, className });

  if (to) {
    return (
      <Link to={to} className={cls} {...props}>
        {children}
      </Link>
    );
  }

  if (href) {
    return (
      <a href={href} className={cls} {...props}>
        {children}
      </a>
    );
  }

  return (
    <button type={type} className={cls} {...props}>
      {children}
    </button>
  );
}

export { styles as actionButtonStyles };
