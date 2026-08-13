import React from "react";
import { useCurrency } from "@/context/CurrencyContext";
import { findAirportByCode } from "@/constants/airports";
import styles from "./RouteCompareBar.module.css";

function cityOf(code) {
  return findAirportByCode(code)?.city || code;
}

/**
 * Route comparison for multi-airport / hub searches.
 * Grid of route cards (not a clipped horizontal scroller).
 */
export default function RouteCompareBar({
  routes = [],
  activeKey = "all",
  requestedKey = "",
  onSelect,
  isLoading = false,
}) {
  const { formatMoney } = useCurrency();
  if (!routes.length) return null;

  const totalFlights = routes.reduce((n, r) => n + (r.count || 0), 0);
  const globalMin = routes.reduce((min, r) => {
    if (r.minPrice == null) return min;
    return min == null || r.minPrice < min ? r.minPrice : min;
  }, null);

  return (
    <section className={styles.wrap} aria-label="Compare routes">
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>Nearby & hub airports</h2>
          <p className={styles.sub}>
            {isLoading
              ? "Searching every airport pair…"
              : `${routes.length} airport pairs · hub connections when the origin feeds a hub`}
          </p>
        </div>
      </div>

      <div className={styles.grid}>
        <button
          type="button"
          className={`${styles.card} ${activeKey === "all" ? styles.cardActive : ""}`}
          onClick={() => onSelect?.("all")}
        >
          <span className={styles.route}>All routes</span>
          <span className={styles.meta}>
            {isLoading ? "…" : `${totalFlights} flights`}
          </span>
          <span className={styles.price}>
            {globalMin != null ? `from ${formatMoney(globalMin)}` : "-"}
          </span>
        </button>

        {routes.map((route) => {
          const isActive = activeKey === route.key;
          const isCheapest =
            globalMin != null && route.minPrice != null && route.minPrice === globalMin;
          const isYours = Boolean(requestedKey && route.key === requestedKey);

          return (
            <button
              key={route.key}
              type="button"
              className={`${styles.card} ${isActive ? styles.cardActive : ""} ${
                isCheapest ? styles.cardBest : ""
              } ${isYours ? styles.cardYours : ""} ${
                !isLoading && !route.count ? styles.cardEmpty : ""
              }`}
              onClick={() => onSelect?.(route.key)}
            >
              <div className={styles.cardTop}>
                <span className={styles.route}>{route.label}</span>
                {(isCheapest || isYours) && (
                  <div className={styles.badges}>
                    {isCheapest ? <span className={styles.tag}>Lowest</span> : null}
                    {isYours ? <span className={styles.tagYou}>Your search</span> : null}
                  </div>
                )}
              </div>
              <span className={styles.cities}>
                {cityOf(route.origin)} → {cityOf(route.destination)}
              </span>
              <span className={styles.meta}>
                {isLoading
                  ? "Searching…"
                  : route.count
                    ? `${route.count} option${route.count === 1 ? "" : "s"}`
                    : "No flights"}
              </span>
              <span className={styles.price}>
                {route.minPrice != null ? formatMoney(route.minPrice) : "-"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
