import React from "react";
import { Link } from "react-router-dom";
import { useBillingOptional } from "./BillingContext";
import styles from "./VeroCreditMeter.module.css";

function formatReset(iso) {
  if (!iso) return "midnight UTC";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "midnight UTC";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "midnight UTC";
  }
}

export default function VeroCreditMeter({ compact = false, credits: override } = {}) {
  const billing = useBillingOptional();
  const snap = override || billing?.credits || null;
  if (!snap || typeof snap.remaining !== "number") return null;

  const remaining = Math.max(0, Number(snap.remaining ?? 0));
  const wallet = Math.max(0, Number(snap.walletBalance ?? 0));
  const daily =
    typeof snap.dailyRemaining === "number"
      ? Math.max(0, snap.dailyRemaining)
      : Math.max(0, remaining - wallet);
  const allowance = Math.max(1, Number(snap.allowance || daily || 1) + wallet);
  const pct = Math.max(0, Math.min(100, Math.round((remaining / allowance) * 100)));
  const exhausted = remaining < 1;
  const low = !exhausted && remaining < 4;

  return (
    <div
      className={`${styles.meter} ${compact ? styles.compact : ""} ${exhausted ? styles.empty : ""} ${low ? styles.low : ""}`}
      data-vero-credits=""
      title={`${remaining} credits left (daily ${daily} + wallet ${wallet}) · free resets ${formatReset(snap.resetAt)}`}
    >
      <div className={styles.row}>
        <span className={styles.label}>{compact ? "Credits" : "Vero credits"}</span>
        <span className={styles.count}>{remaining}</span>
      </div>
      <div className={styles.track} aria-hidden>
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
      {!compact && exhausted ? (
        <p className={styles.hint}>
          Free credits reset {formatReset(snap.resetAt)}.{" "}
          <Link to="/plus">Buy a pack</Link>
        </p>
      ) : null}
    </div>
  );
}
