import React from "react";
import { motion } from "framer-motion";
import styles from "./LoadingState.module.css";

/**
 * Shared loading UI - spinner + optional skeleton cards.
 * Use wherever lists or detail data are fetching.
 */
export default function LoadingState({
  variant = "block",
  title = "Loading…",
  message = "",
  skeleton = null,
  count = 3,
  className = "",
}) {
  const skeletonCount = Math.max(1, Math.min(Number(count) || 3, 8));

  const body = (
    <div
      className={[
        styles.root,
        styles[`variant_${variant}`],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className={styles.header}>
        <div className={styles.spinnerWrap} aria-hidden>
          <motion.span
            className={styles.ring}
            animate={{ rotate: 360 }}
            transition={{ duration: 1.1, ease: "linear", repeat: Infinity }}
          />
          <motion.span
            className={styles.dot}
            animate={{ scale: [0.85, 1.1, 0.85], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
        <div className={styles.copy}>
          <p className={styles.title}>{title}</p>
          {message ? <p className={styles.message}>{message}</p> : null}
          <div className={styles.barTrack} aria-hidden>
            <motion.span
              className={styles.barFill}
              animate={{ x: ["-40%", "140%"] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
        </div>
      </div>

      {skeleton ? (
        <div className={styles.skeletonGrid} data-skeleton={skeleton}>
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <SkeletonCard key={i} type={skeleton} index={i} />
          ))}
        </div>
      ) : null}
    </div>
  );

  if (variant === "overlay") {
    return (
      <div className={styles.overlay} role="presentation">
        {body}
      </div>
    );
  }

  return body;
}

function SkeletonCard({ type, index }) {
  const delay = index * 0.08;
  if (type === "flight") {
    return (
      <motion.div
        className={`${styles.card} ${styles.flightCard}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.35 }}
      >
        <div className={styles.row}>
          <span className={`${styles.bone} ${styles.logo}`} />
          <span className={`${styles.bone} ${styles.lineLg}`} />
          <span className={`${styles.bone} ${styles.price}`} />
        </div>
        <div className={styles.row}>
          <span className={`${styles.bone} ${styles.time}`} />
          <span className={`${styles.bone} ${styles.route}`} />
          <span className={`${styles.bone} ${styles.time}`} />
        </div>
        <div className={styles.row}>
          <span className={`${styles.bone} ${styles.chip}`} />
          <span className={`${styles.bone} ${styles.chip}`} />
          <span className={`${styles.bone} ${styles.btn}`} />
        </div>
      </motion.div>
    );
  }

  if (type === "hotel") {
    return (
      <motion.div
        className={`${styles.card} ${styles.hotelCard}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.35 }}
      >
        <span className={`${styles.bone} ${styles.hotelImg}`} />
        <div className={styles.hotelBody}>
          <span className={`${styles.bone} ${styles.lineLg}`} />
          <span className={`${styles.bone} ${styles.lineMd}`} />
          <span className={`${styles.bone} ${styles.lineSm}`} />
          <span className={`${styles.bone} ${styles.price}`} />
        </div>
      </motion.div>
    );
  }

  if (type === "room") {
    return (
      <motion.div
        className={`${styles.card} ${styles.roomCard}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.35 }}
      >
        <span className={`${styles.bone} ${styles.roomImg}`} />
        <span className={`${styles.bone} ${styles.lineMd}`} />
        <span className={`${styles.bone} ${styles.lineSm}`} />
        <span className={`${styles.bone} ${styles.btn}`} />
      </motion.div>
    );
  }

  if (type === "package") {
    return (
      <motion.div
        className={`${styles.card} ${styles.packageCard}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.35 }}
      >
        <span className={`${styles.bone} ${styles.packageImg}`} />
        <span className={`${styles.bone} ${styles.lineLg}`} />
        <span className={`${styles.bone} ${styles.lineSm}`} />
        <span className={`${styles.bone} ${styles.price}`} />
      </motion.div>
    );
  }

  // lines
  return (
    <motion.div
      className={`${styles.card} ${styles.linesCard}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay, duration: 0.3 }}
    >
      <span className={`${styles.bone} ${styles.lineLg}`} />
      <span className={`${styles.bone} ${styles.lineMd}`} />
      <span className={`${styles.bone} ${styles.lineSm}`} />
    </motion.div>
  );
}

/** Compact spinner for buttons / banners */
export function LoadingDots({ label = "Working" }) {
  return (
    <span className={styles.dots} aria-live="polite">
      <span className={styles.dotsLabel}>{label}</span>
      <span className={styles.dotPulse} />
      <span className={styles.dotPulse} />
      <span className={styles.dotPulse} />
    </span>
  );
}
