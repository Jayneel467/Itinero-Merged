import React from "react";
import { Link } from "react-router-dom";
import { MapPinned, TrainFront } from "lucide-react";
import { PageLayout } from "@/components/layout";
import { useHomeLocationOptional } from "@/context/HomeLocationContext";
import styles from "./RegionalGate.module.css";

/**
 * Shown when a market-specific product (e.g. IRCTC trains) is opened outside its region.
 */
export default function RegionalGate({
  product = "Trains",
  market = "India",
  reason = "This product uses local operators that only run in this market.",
  alternates = [
    { to: "/transits", label: "Transits", copy: "Bus, metro, and coaches near you" },
    { to: "/flights", label: "Flights", copy: "Live fares worldwide" },
  ],
}) {
  const home = useHomeLocationOptional();
  const here = home?.countryName || home?.countryCode || "your region";

  return (
    <PageLayout>
      <div className={styles.page}>
        <div className={styles.card}>
          <span className={styles.icon} aria-hidden>
            <TrainFront size={28} strokeWidth={2.1} />
          </span>
          <p className={styles.brand}>{product} · {market} only</p>
          <h1 className={styles.title}>{product} isn’t available in {here} yet</h1>
          <p className={styles.lede}>
            {reason} Switch your home region to {market} in Regional settings if you’re planning travel
            there, or continue with a product that works where you are.
          </p>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              onClick={() => {
                window.dispatchEvent(new CustomEvent("itinero:open-regional", { detail: { tab: "location" } }));
              }}
            >
              <MapPinned size={16} aria-hidden />
              Change home region
            </button>
            <Link to="/" className={styles.ghost}>
              Back to home
            </Link>
          </div>

          <ul className={styles.alts}>
            {alternates.map((a) => (
              <li key={a.to}>
                <Link to={a.to}>
                  <strong>{a.label}</strong>
                  <span>{a.copy}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </PageLayout>
  );
}
