import React from "react";
import { X } from "lucide-react";
import ActionButton from "../ActionButton";
import styles from "./FilterDrawer.module.css";

/**
 * Mobile filter drawer - shared by flights, hotels, and other list pages.
 */
export default function FilterDrawer({
  open,
  onClose,
  title = "Filters",
  children,
  footer,
  applyLabel = "Apply filters",
}) {
  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.panel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className={styles.header}>
          <h3 className={styles.title}>{title}</h3>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close filters">
            <X size={22} aria-hidden />
          </button>
        </header>

        <div className={styles.body}>{children}</div>

        {footer !== null ? (
          <footer className={styles.footer}>
            {footer ?? (
              <ActionButton block onClick={onClose}>
                {applyLabel}
              </ActionButton>
            )}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
