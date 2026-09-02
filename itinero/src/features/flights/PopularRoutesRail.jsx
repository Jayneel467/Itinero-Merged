import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plane, TrendingUp, ArrowUpRight, ArrowRight } from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext";
import { findAirportByCode } from "@/constants/airports";
import useLiveRoutePrices, {
  routeKey,
  sampleNearTermDates,
} from "@/features/flights/hooks/useLiveRoutePrices";
import styles from "./PopularRoutesRail.module.css";

const HOT_BY_ORIGIN = {
  BOM: [
    { to: "DEL", city: "New Delhi", country: "India" },
    { to: "BLR", city: "Bengaluru", country: "India" },
    { to: "GOI", city: "Goa", country: "India" },
    { to: "DXB", city: "Dubai", country: "UAE" },
    { to: "BKK", city: "Bangkok", country: "Thailand" },
    { to: "SIN", city: "Singapore", country: "Singapore" },
  ],
  DEL: [
    { to: "BOM", city: "Mumbai", country: "India" },
    { to: "BLR", city: "Bengaluru", country: "India" },
    { to: "GOI", city: "Goa", country: "India" },
    { to: "DXB", city: "Dubai", country: "UAE" },
    { to: "LHR", city: "London", country: "UK" },
    { to: "SIN", city: "Singapore", country: "Singapore" },
  ],
  BLR: [
    { to: "BOM", city: "Mumbai", country: "India" },
    { to: "DEL", city: "New Delhi", country: "India" },
    { to: "GOI", city: "Goa", country: "India" },
    { to: "DXB", city: "Dubai", country: "UAE" },
    { to: "SIN", city: "Singapore", country: "Singapore" },
    { to: "MAA", city: "Chennai", country: "India" },
  ],
  HYD: [
    { to: "BOM", city: "Mumbai", country: "India" },
    { to: "DEL", city: "New Delhi", country: "India" },
    { to: "BLR", city: "Bengaluru", country: "India" },
    { to: "GOI", city: "Goa", country: "India" },
    { to: "DXB", city: "Dubai", country: "UAE" },
    { to: "SIN", city: "Singapore", country: "Singapore" },
  ],
  CCU: [
    { to: "DEL", city: "New Delhi", country: "India" },
    { to: "BOM", city: "Mumbai", country: "India" },
    { to: "BLR", city: "Bengaluru", country: "India" },
    { to: "BKK", city: "Bangkok", country: "Thailand" },
    { to: "SIN", city: "Singapore", country: "Singapore" },
    { to: "GOI", city: "Goa", country: "India" },
  ],
  MAA: [
    { to: "BOM", city: "Mumbai", country: "India" },
    { to: "DEL", city: "New Delhi", country: "India" },
    { to: "BLR", city: "Bengaluru", country: "India" },
    { to: "SIN", city: "Singapore", country: "Singapore" },
    { to: "DXB", city: "Dubai", country: "UAE" },
    { to: "KUL", city: "Kuala Lumpur", country: "Malaysia" },
  ],
};

const FALLBACK = [
  { to: "DXB", city: "Dubai", country: "UAE" },
  { to: "BKK", city: "Bangkok", country: "Thailand" },
  { to: "SIN", city: "Singapore", country: "Singapore" },
  { to: "DEL", city: "New Delhi", country: "India" },
  { to: "BOM", city: "Mumbai", country: "India" },
  { to: "GOI", city: "Goa", country: "India" },
];

/**
 * Live popular-route strip on the flights page (from current search origin).
 */
export default function PopularRoutesRail({ origin = "BOM", originCity = "", enabled = true }) {
  const navigate = useNavigate();
  const { formatMoney } = useCurrency();
  const from = String(origin || "BOM").toUpperCase().slice(0, 3);
  const fromAirport = findAirportByCode(from);
  const displayOriginCity = originCity || fromAirport?.city || from;

  const destinations = useMemo(() => {
    const list = HOT_BY_ORIGIN[from] || FALLBACK;
    return list
      .filter((d) => d.to !== from)
      .map((d) => {
        const found = findAirportByCode(d.to);
        return {
          ...d,
          city: d.city || found?.city || d.to,
        };
      })
      .slice(0, 6);
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
    if (displayOriginCity) qs.set("fromCity", displayOriginCity);
    if (dest.city) qs.set("toCity", dest.city);
    if (depart) qs.set("date", depart);
    navigate(`/flights?${qs.toString()}`);
  }

  return (
    <section className={styles.rail} aria-label="Popular routes">
      <div className={styles.head}>
        <div className={styles.headLeft}>
          <div className={styles.iconBadge}>
            <TrendingUp className="w-4 h-4 text-[#F97211]" />
          </div>
          <div>
            <h3 className={styles.title}>Popular from {displayOriginCity} ({from})</h3>
            <p className={styles.sub}>Live low-fares · Tap to search instantly</p>
          </div>
        </div>
        <div className={styles.originPill}>
          <span className={styles.originDot} />
          <span>Non-stop & Connecting Deals</span>
        </div>
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
              <div className={styles.cardTop}>
                <div className={styles.airportBadges}>
                  <span className={styles.codeFrom}>{from}</span>
                  <span className={styles.routeArrow}>
                    <Plane className={styles.planeIcon} />
                  </span>
                  <span className={styles.codeTo}>{dest.to}</span>
                </div>
                <span className={styles.arrowPill}>
                  <ArrowUpRight className={styles.cardActionIcon} />
                </span>
              </div>

              <div className={styles.cardBody}>
                <span className={styles.cityName}>{dest.city}</span>
                {dest.country ? <span className={styles.countryName}>{dest.country}</span> : null}
              </div>

              <div className={styles.cardFooter}>
                {isLoading ? (
                  <div className={styles.loadingSkeleton}>
                    <span className={styles.skeletonLine} />
                  </div>
                ) : hasPrice ? (
                  <div className={styles.priceContainer}>
                    <span className={styles.priceLabel}>From</span>
                    <span className={styles.priceValue}>{formatMoney(Math.round(min))}</span>
                  </div>
                ) : (
                  <span className={styles.searchFaresLabel}>
                    Search fares <ArrowRight className="w-3.5 h-3.5 inline ml-0.5" />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
