import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useCurrency } from "@/context/CurrencyContext";
import useLiveRoutePrices, {
  routeKey,
  sampleNearTermDates,
} from "@/features/flights/hooks/useLiveRoutePrices";
import styles from "./PopularRoutesRail.module.css";

const HOT_BY_ORIGIN = {
  BOM: [
    { to: "DEL", city: "New Delhi" },
    { to: "BLR", city: "Bengaluru" },
    { to: "GOI", city: "Goa" },
    { to: "DXB", city: "Dubai" },
    { to: "BKK", city: "Bangkok" },
    { to: "SIN", city: "Singapore" },
  ],
  DEL: [
    { to: "BOM", city: "Mumbai" },
    { to: "BLR", city: "Bengaluru" },
    { to: "GOI", city: "Goa" },
    { to: "DXB", city: "Dubai" },
    { to: "LHR", city: "London" },
    { to: "SIN", city: "Singapore" },
  ],
  BLR: [
    { to: "BOM", city: "Mumbai" },
    { to: "DEL", city: "New Delhi" },
    { to: "GOI", city: "Goa" },
    { to: "DXB", city: "Dubai" },
    { to: "SIN", city: "Singapore" },
    { to: "MAA", city: "Chennai" },
  ],
};

const FALLBACK = [
  { to: "DXB", city: "Dubai" },
  { to: "BKK", city: "Bangkok" },
  { to: "SIN", city: "Singapore" },
  { to: "DEL", city: "New Delhi" },
  { to: "BOM", city: "Mumbai" },
  { to: "GOI", city: "Goa" },
];

/**
 * Live popular-route strip on the flights page (from current search origin).
 */
export default function PopularRoutesRail({ origin = "BOM", originCity = "", enabled = true }) {
  const navigate = useNavigate();
  const { formatMoney } = useCurrency();
  const from = String(origin || "BOM").toUpperCase().slice(0, 3);

  const destinations = useMemo(() => {
    const list = HOT_BY_ORIGIN[from] || FALLBACK;
    return list.filter((d) => d.to !== from).slice(0, 6);
  }, [from]);

  const routes = useMemo(
    () => destinations.map((d) => ({ from, to: d.to })),
    [destinations, from]
  );

  const { byKey, loading } = useLiveRoutePrices({
    routes,
    enabled: Boolean(enabled) && from.length === 3,
  });

  if (!enabled || !from || from.length !== 3) return null;

  function open(dest) {
    const key = routeKey(from, dest.to);
    const fare = byKey[key];
    const depart = fare?.bestDate || sampleNearTermDates(1)[0];
    const qs = new URLSearchParams({
      from,
      to: dest.to,
      trip: "oneway",
    });
    if (originCity) qs.set("fromCity", originCity);
    if (dest.city) qs.set("toCity", dest.city);
    if (depart) qs.set("date", depart);
    navigate(`/flights?${qs.toString()}`);
  }

  return (
    <section className={styles.rail} aria-label="Popular routes">
      <div className={styles.head}>
        <h3 className={styles.title}>Popular from {from}</h3>
        <p className={styles.sub}>Live from-fares · tap to search</p>
      </div>
      <div className={styles.track}>
        {destinations.map((dest) => {
          const key = routeKey(from, dest.to);
          const fare = byKey[key];
          const isLoading = Boolean(loading[key]) || fare === undefined;
          const min = fare?.minPrice;
          const hasPrice = typeof min === "number" && min > 0;

          return (
            <button
              key={dest.to}
              type="button"
              className={styles.card}
              onClick={() => open(dest)}
            >
              <span className={styles.route}>
                {from} → {dest.to}
              </span>
              <span className={styles.city}>{dest.city}</span>
              <span className={styles.price}>
                {isLoading
                  ? "…"
                  : hasPrice
                    ? `From ${formatMoney(Math.round(min))}`
                    : "Search fares"}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
