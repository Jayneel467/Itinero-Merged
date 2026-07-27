import React, { useState } from "react";
import styles from "./FlightsPage.module.css";

/**
 * Local keyword filter for manual flight results (client-side only).
 * Does NOT call the Vero chat agent or /api/chat.
 */
export default function SidebarQuickFilter({ onFilter }) {
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");

  function apply() {
    if (!onFilter) return;
    const result = onFilter(query);
    setNote(typeof result === "string" ? result : "");
  }

  return (
    <div className={`${styles["sidebar-card"]} ${styles["vero-filter-card"]}`} style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", marginBottom: 15 }}>
        <span style={{ fontWeight: 700, fontSize: 16, color: "#001439" }}>Quick filter</span>
        <span style={{ fontSize: 11, color: "#888" }}>
          Filters these results locally — no AI chat involved.
        </span>
      </div>

      <textarea
        className={styles["vero-textarea"]}
        placeholder="e.g. non-stop under ₹25000, morning, IndiGo"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Quick filter text"
      />

      <button type="button" className={styles["fl-btn-vero"]} onClick={apply}>
        Apply filter
      </button>

      {note && (
        <p style={{ margin: "10px 0 0", fontSize: 12, color: "#666", lineHeight: 1.4 }}>{note}</p>
      )}
    </div>
  );
}
