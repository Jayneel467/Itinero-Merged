import React, { useState } from "react";
import { TrendingUp } from "lucide-react";
import styles from "./FlightsPage.module.css";

/**
 * Price insight card — never invents historical prices.
 * Shows live min fare from the current result set when available.
 */
export default function SidebarPriceGraph({ minPrice = null, currency = "₹" }) {
  const [trackPrices, setTrackPrices] = useState(false);
  const hasLive = typeof minPrice === "number" && minPrice > 0;

  return (
    <div className={styles["sidebar-card"]} style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <div style={{ padding: 6, background: "#E8F5E9", borderRadius: 8, display: "flex" }}>
          <TrendingUp size={20} color="#22C55E" />
        </div>
        <h3 style={{ margin: 0, fontSize: 16, color: "#22C55E", fontWeight: 700 }}>Book Now</h3>
      </div>

      <p style={{ margin: "0 0 16px 0", fontSize: 12, color: "#666", lineHeight: 1.4 }}>
        {hasLive
          ? `Lowest fare in this live search: ${currency}${Math.round(minPrice).toLocaleString("en-IN")}.`
          : "Live fares appear here after a search. No sample price history is shown."}
      </p>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          paddingTop: 15,
          borderTop: "1px solid #EBEBEB",
        }}
      >
        <span style={{ fontWeight: 600, color: "#666", fontSize: 13 }}>Track prices</span>
        <div
          className={`${styles["toggle-switch"]} ${trackPrices ? styles["toggle-on"] : ""}`}
          onClick={() => setTrackPrices(!trackPrices)}
          role="switch"
          aria-checked={trackPrices}
        >
          <div className={styles["toggle-thumb"]} />
        </div>
      </div>

      {trackPrices && (
        <p style={{ margin: 0, fontSize: 11, color: "#B7BFCC" }}>
          Price alerts aren’t connected to the live feed yet — we’ll only notify when that API is available.
        </p>
      )}
    </div>
  );
}
