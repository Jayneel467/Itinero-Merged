import React from "react";
import styles from "./ActionRow.module.css";

/**
 * Horizontal group for ActionButton controls (toolbars, empty states, confirmations).
 */
export default function ActionRow({
  align = "center",
  layout = "row",
  className = "",
  children,
  ...props
}) {
  const alignClass =
    align === "start" ? styles.start : align === "end" ? styles.end : styles.center;
  const layoutClass = layout === "grid" ? styles.grid : layout === "stretch" ? styles.stretch : "";

  return (
    <div className={[styles.row, alignClass, layoutClass, className].filter(Boolean).join(" ")} {...props}>
      {children}
    </div>
  );
}
