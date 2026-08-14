import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Gift, Sparkles } from "lucide-react";
import { PageLayout } from "@/components/layout";
import { LoadingState } from "@/components/shared";
import { useAuthOptional } from "@/features/auth/context/AuthContext";
import { loyaltyService } from "@/features/booking/services/loyaltyService";
import styles from "./RewardsPage.module.css";

function formatEvent(row) {
  const pts = Number(row.points || 0);
  const sign = pts >= 0 ? "+" : "";
  return `${sign}${pts.toLocaleString()} pts · ${row.reason?.replace(/_/g, " ") || "activity"}`;
}

export default function RewardsPage() {
  const auth = useAuthOptional();
  const signedIn = Boolean(auth?.isAuthenticated && auth?.user?.id);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [bal, hist] = await Promise.all([
        loyaltyService.balance(),
        signedIn ? loyaltyService.history(40) : Promise.resolve({ events: [] }),
      ]);
      if (!cancelled) {
        setBalance(bal);
        setHistory(hist?.events || []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  return (
    <PageLayout>
      <div className={styles.wrap}>
        <p className={styles.kicker}>Itinero Rewards</p>
        <h1>Your points</h1>
        <p className={styles.lead}>
          Earn on hotel stays and packages. Redeem on package checkout (10 points ≈ $1).{" "}
          Points earn on confirmed bookings. Need more Vero runway?{" "}
          <Link to="/plus">Buy credits</Link>.
        </p>

        {!signedIn ? (
          <div className={styles.card}>
            <Gift size={22} />
            <p>Sign in to see your balance and activity.</p>
            <Link to="/login" className={styles.cta}>
              Sign in
            </Link>
          </div>
        ) : loading ? (
          <LoadingState title="Loading rewards" message="Fetching your points…" skeleton="lines" count={2} />
        ) : (
          <>
            <div className={styles.balanceGrid}>
              <div className={styles.balanceCard}>
                <span>Available</span>
                <strong>{Number(balance?.balance || 0).toLocaleString()}</strong>
                <small>points</small>
              </div>
              <div className={styles.balanceCard}>
                <span>Pending</span>
                <strong>{Number(balance?.pendingBalance || 0).toLocaleString()}</strong>
                <small>after check-out</small>
              </div>
              <div className={styles.balanceCard}>
                <span>Lifetime</span>
                <strong>{Number(balance?.lifetimeEarned || 0).toLocaleString()}</strong>
                <small>earned</small>
              </div>
            </div>

            <section className={styles.section}>
              <h2>
                <Sparkles size={18} /> How to use points
              </h2>
              <ul>
                <li>Earn ~1% back in points on eligible bookings.</li>
                <li>Hotel points move from pending → available after check-out.</li>
                <li>Apply points on package checkout for an instant discount.</li>
                <li>Minimum redemption: {balance?.minRedeemPoints || 50} points.</li>
              </ul>
            </section>

            <section className={styles.section}>
              <h2>Recent activity</h2>
              {history.length ? (
                <ul className={styles.history}>
                  {history.map((row) => (
                    <li key={row.id}>
                      <div>
                        <strong>{formatEvent(row)}</strong>
                        <span>{row.status}</span>
                      </div>
                      <time>{row.createdAt ? new Date(row.createdAt).toLocaleDateString() : ""}</time>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.empty}>No activity yet - book a stay or package to start earning.</p>
              )}
            </section>
          </>
        )}
      </div>
    </PageLayout>
  );
}
