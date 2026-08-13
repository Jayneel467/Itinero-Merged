import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Gift } from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext";
import { useAuthOptional } from "@/features/auth/context/AuthContext";
import { loyaltyService } from "@/features/booking/services/loyaltyService";
import styles from "./PointsRedeemPanel.module.css";

export default function PointsRedeemPanel({
  total,
  currency,
  onRedemptionChange,
  disabled = false,
}) {
  const auth = useAuthOptional();
  const { formatMoney } = useCurrency();
  const [balance, setBalance] = useState(null);
  const [pointsToUse, setPointsToUse] = useState(0);
  const [quote, setQuote] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const signedIn = Boolean(auth?.isAuthenticated && auth?.user?.id);
  const minRedeem = balance?.minRedeemPoints || 50;

  useEffect(() => {
    if (!signedIn) {
      setBalance(null);
      onRedemptionChange?.(null);
      return;
    }
    let cancelled = false;
    loyaltyService.balance().then((res) => {
      if (!cancelled) setBalance(res);
    });
    return () => {
      cancelled = true;
    };
  }, [signedIn, onRedemptionChange]);

  useEffect(() => {
    if (!signedIn || !pointsToUse || pointsToUse < minRedeem) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    loyaltyService.redeemQuote(pointsToUse, currency).then((res) => {
      if (!cancelled) setQuote(res);
    });
    return () => {
      cancelled = true;
    };
  }, [signedIn, pointsToUse, currency, minRedeem]);

  const payable = useMemo(() => {
    const base = Number(total) || 0;
    const discount = Number(quote?.discountAmount || 0);
    return Math.max(0, base - discount);
  }, [total, quote]);

  const handleApply = async () => {
    if (!signedIn || busy || disabled) return;
    setError("");
    if (pointsToUse < minRedeem) {
      setError(`Use at least ${minRedeem} points.`);
      return;
    }
    setBusy(true);
    try {
      const res = await loyaltyService.redeem(pointsToUse, currency);
      if (!res?.ok || !res?.redemptionId) {
        throw new Error(res?.message || "Could not apply points.");
      }
      onRedemptionChange?.({
        redemptionId: res.redemptionId,
        points: res.points,
        discountAmount: res.discountAmount,
        currency: res.currency,
        chargeAmount: payable,
      });
    } catch (err) {
      setError(err?.message || "Could not apply points.");
      onRedemptionChange?.(null);
    } finally {
      setBusy(false);
    }
  };

  const handleClear = () => {
    setPointsToUse(0);
    setQuote(null);
    setError("");
    onRedemptionChange?.(null);
  };

  if (!signedIn) {
    return (
      <div className={styles.panel}>
        <Gift size={16} aria-hidden />
        <p>
          <Link to="/login">Sign in</Link> to earn and use Itinero Rewards on packages.
        </p>
      </div>
    );
  }

  if (!balance?.ok) return null;

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <Gift size={16} aria-hidden />
        <div>
          <strong>Itinero Rewards</strong>
          <span>{Number(balance.balance || 0).toLocaleString()} points available</span>
        </div>
      </div>
      {Number(balance.balance || 0) >= minRedeem ? (
        <>
          <label className={styles.label}>
            Use points
            <input
              type="range"
              min={0}
              max={Math.max(minRedeem, Number(balance.balance || 0))}
              step={10}
              value={pointsToUse}
              disabled={disabled || busy}
              onChange={(e) => {
                setPointsToUse(Number(e.target.value));
                onRedemptionChange?.(null);
              }}
            />
            <span className={styles.pointsValue}>{pointsToUse.toLocaleString()} pts</span>
          </label>
          {quote?.ok && pointsToUse >= minRedeem ? (
            <p className={styles.quote}>
              −{formatMoney(quote.discountAmount)} · Pay {formatMoney(payable)}
            </p>
          ) : null}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.applyBtn}
              disabled={disabled || busy || pointsToUse < minRedeem}
              onClick={handleApply}
            >
              {busy ? "Applying…" : "Apply points"}
            </button>
            {pointsToUse > 0 ? (
              <button type="button" className={styles.clearBtn} disabled={busy} onClick={handleClear}>
                Clear
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <p className={styles.note}>Earn more points on your next trip - redeem from {minRedeem} pts.</p>
      )}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
