import React from "react";
import { Gift } from "lucide-react";
import styles from "./LoyaltyEarnBanner.module.css";

export default function LoyaltyEarnBanner({ estimate, loading = false, compact = false, className = "" }) {
  if (loading && !estimate?.enabled) {
    return (
      <div className={`${styles.banner} ${styles.loading} ${className}`.trim()} aria-hidden>
        <Gift size={16} />
        <span>Checking rewards…</span>
      </div>
    );
  }

  if (!estimate?.enabled || !estimate?.points) return null;

  const program = estimate.programName || "Itinero Rewards";
  const pointsLabel = Number(estimate.points).toLocaleString();

  return (
    <div
      className={`${styles.banner} ${compact ? styles.compact : ""} ${className}`.trim()}
      role="status"
      aria-label={`${program}: earn about ${pointsLabel} points on this booking`}
    >
      <Gift size={compact ? 15 : 18} aria-hidden />
      <div className={styles.copy}>
        <strong>
          Earn ~{pointsLabel} {program} points
        </strong>
        {!compact ? (
          <span className={styles.note}>
            {Number(estimate.loyaltyMultiplier) > 1 ? "Member 2× · " : ""}
            {estimate.accrualNote || "Points credited after check-out."}{" "}
            {estimate.disclaimer || ""}
          </span>
        ) : null}
      </div>
    </div>
  );
}
