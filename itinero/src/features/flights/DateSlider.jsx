import React, { useState, useEffect, useMemo } from "react";
import { Calendar } from "lucide-react";
import styles from "./FlightsPage.module.css";
import PriceCalendarModal from "./PriceCalendarModal";

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + n);
  // Local YMD — never toISOString() (shifts the calendar day in IST+)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayLabel(iso) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return { line: iso, iso };
  return {
    line: d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" }),
    iso,
  };
}

function formatPrice(price) {
  if (typeof price !== "number" || !(price > 0)) return null;
  return `₹${Math.round(price).toLocaleString("en-IN")}`;
}

/**
 * Date strip around the selected depart date (±7 days).
 * Prices come from live LiteAPI price-calendar only (never invented).
 */
export default function DateSlider({
  departDate,
  onSelectDate,
  /** Optional map isoDate -> price number | null from real searches only */
  pricesByDate = null,
  /** iso -> true while that day's min fare is loading */
  isDateLoading = null,
  ensureMonthPrices = null,
  origin = "",
  destination = "",
}) {
  const [startIndex, setStartIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(7);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const dates = useMemo(() => {
    const center = departDate || new Date().toISOString().slice(0, 10);
    return Array.from({ length: 15 }, (_, i) => {
      const iso = addDays(center, i - 7);
      const label = dayLabel(iso);
      const raw =
        pricesByDate && Object.prototype.hasOwnProperty.call(pricesByDate, iso)
          ? pricesByDate[iso]
          : undefined;
      const price = typeof raw === "number" ? raw : null;
      const loading =
        typeof isDateLoading === "function"
          ? isDateLoading(iso)
          : raw === undefined;
      return { ...label, price, loading, isActive: iso === center, knownEmpty: raw === null };
    });
  }, [departDate, pricesByDate, isDateLoading]);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 600) setVisibleCount(3);
      else if (width < 992) setVisibleCount(5);
      else setVisibleCount(7);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Keep selected date visible
  useEffect(() => {
    const activeIdx = dates.findIndex((d) => d.isActive);
    if (activeIdx < 0) return;
    if (activeIdx < startIndex) setStartIndex(activeIdx);
    else if (activeIdx >= startIndex + visibleCount) {
      setStartIndex(Math.max(0, activeIdx - visibleCount + 1));
    }
  }, [dates, startIndex, visibleCount]);

  const maxIndex = Math.max(0, dates.length - visibleCount);
  const visibleDates = dates.slice(startIndex, startIndex + visibleCount);

  return (
    <>
      <div className={styles["fl-content-wrapper"]}>
        <div className={styles["fl-sidebar-filters"]}>
          <div className={styles["fl-row11"]}>
            <div
              className={`${styles["fl-icon12"]} ${styles["date-nav-prev"]}`}
              onClick={() => startIndex > 0 && setStartIndex(startIndex - 1)}
              style={{
                cursor: startIndex === 0 ? "default" : "pointer",
                opacity: startIndex === 0 ? 0.5 : 1,
              }}
              role="button"
              tabIndex={0}
              aria-label="Previous dates"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#001439" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </div>

            {visibleDates.map((item, index) => {
              const isActive = item.isActive;
              const priceLabel = formatPrice(item.price);
              return (
                <React.Fragment key={item.iso}>
                  <div
                    className={`${styles["fl-col7"]} ${styles["date-item"]}`}
                    onClick={() => onSelectDate?.(item.iso)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") onSelectDate?.(item.iso);
                    }}
                  >
                    <span className={isActive ? styles["fl-text14"] : styles["fl-text12"]}>
                      {item.line}
                    </span>
                    <span className={isActive ? styles["fl-text15"] : styles["fl-text13"]}>
                      {item.loading ? (
                        <span className={styles["price-skeleton"]} aria-label="Loading fare" />
                      ) : (
                        priceLabel || "—"
                      )}
                    </span>
                    {isActive && <div className={styles["active-date-border"]} />}
                  </div>
                  {index < visibleDates.length - 1 && (
                    <div className={styles["date-spacer"]} />
                  )}
                </React.Fragment>
              );
            })}

            <div
              className={`${styles["fl-icon13"]} ${styles["date-nav-next"]}`}
              onClick={() => startIndex < maxIndex && setStartIndex(startIndex + 1)}
              style={{
                cursor: startIndex >= maxIndex ? "default" : "pointer",
                opacity: startIndex >= maxIndex ? 0.5 : 1,
              }}
              role="button"
              tabIndex={0}
              aria-label="Next dates"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#001439" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>
          </div>
        </div>

        <button
          type="button"
          className={styles["fl-btn-row2"]}
          onClick={() => setIsCalendarOpen(true)}
        >
          <Calendar className={styles["fl-icon14"]} size={24} color="#000000" />
          <span className={styles["fl-text17"]}>{"View Price\nCalendar"}</span>
        </button>
      </div>

      <PriceCalendarModal
        isOpen={isCalendarOpen}
        onClose={() => setIsCalendarOpen(false)}
        departDate={departDate}
        onSelectDate={onSelectDate}
        pricesByDate={pricesByDate}
        isDateLoading={isDateLoading}
        ensureMonthPrices={ensureMonthPrices}
        origin={origin}
        destination={destination}
      />
    </>
  );
}
