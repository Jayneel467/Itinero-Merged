import React from "react";
import "./Button.css";

/**
 * Reusable Button component with multiple variants.
 *
 * @param {"primary"|"secondary"|"outline"|"ghost"|"pill"} variant
 * @param {"sm"|"md"|"lg"} size
 * @param {string} className - Additional classes
 * @param {React.ReactNode} children
 */
export default function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...props
}) {
  return (
    <button
      className={`btn btn--${variant} btn--${size} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
