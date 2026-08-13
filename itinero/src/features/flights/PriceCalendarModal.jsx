import React, { useMemo, useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import styles from "./PriceCalendarModal.module.css";
import { useCurrency } from "@/context/CurrencyContext";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Price calendar with live LiteAPI min fares per day (manual search path only).
 */
export default function PriceCalendarModal({
  isOpen,
  onClose,
  departDate,
  onSelectDate,
  pricesByDate = null,
  isDateLoading = null,
  ensureMonthPrices = null,
  origin = "",
  destination = "",
}) {
  const { formatMoney, symbol } = useCurrency();

  const formatShortPrice = (price) => {
    if (typeof price !== "number" || !(price > 0)) return null;
    if (price >= 100000) return `${symbol}${Math.round(price / 1000)}k`;
    return formatMoney(price);
  };
  const initial = departDate ? new Date(`${departDate}T00:00:00`) : new Date();
  const [currentDate, setCurrentDate] = useState(
    new Date(initial.getFullYear(), initial.getMonth(), 1)
  );
  const [selectedIso, setSelectedIso] = useState(departDate || "");

  useEffect(() => {
    if (departDate) {
      const d = new Date(`${departDate}T00:00:00`);
      if (!Number.isNaN(d.getTime())) {
        setCurrentDate(new Date(d.getFullYear(), d.getMonth(), 1));
        setSelectedIso(departDate);
      }
    }
  }, [departDate, isOpen]);

  // Load this month's fares when opened / month changes
  useEffect(() => {
    if (!isOpen || typeof ensureMonthPrices !== "function") return;
    ensureMonthPrices(currentDate.getFullYear(), currentDate.getMonth());
  }, [isOpen, currentDate, ensureMonthPrices]);

  const calendarData = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let startDay = new Date(year, month, 1).getDay();
    startDay = startDay === 0 ? 6 : startDay - 1;

    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const raw =
        pricesByDate && Object.prototype.hasOwnProperty.call(pricesByDate, iso)
          ? pricesByDate[iso]
          : undefined;
      const price = typeof raw === "number" ? raw : null;
      const loading =
        typeof isDateLoading === "function"
          ? isDateLoading(iso)
          : raw === undefined;
      return { day, iso, price, loading, knownEmpty: raw === null };
    });

    const priced = days.map((d) => d.price).filter((p) => typeof p === "number" && p > 0);
    const cheapest = priced.length ? Math.min(...priced) : null;
    const dearest = priced.length ? Math.max(...priced) : null;

    return { daysInMonth, startDay, days, year, month, cheapest, dearest };
  }, [currentDate, pricesByDate, isDateLoading]);

  if (!isOpen) return null;

  const routeLabel =
    origin && destination ? `${origin.toUpperCase()} → ${destination.toUpperCase()}` : "Select departure date";

  return (
    <div className={styles["modal-overlay"]} onClick={onClose}>
      <div className={styles["modal-container"]} onClick={(e) => e.stopPropagation()}>
        <div className={styles["modal-header"]}>
          <button type="button" className={styles["modal-close"]} onClick={onClose}>
            <X size={18} />
          </button>

          <div className={styles["header-top"]}>
            <div className={styles["header-icon"]}>
              <Calendar size={22} color="#fff" />
            </div>
            <div>
              <h2 className={styles["header-title"]}>Price calendar</h2>
              <p className={styles["header-subtitle"]}>
                {routeLabel} - live lowest fares (empty days have no offers).
              </p>
            </div>
          </div>

          <div className={styles["month-selector"]}>
            <button
              type="button"
              className={styles["month-nav-btn"]}
              onClick={() =>
                setCurrentDate(
                  new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)
                )
              }
            >
              <ChevronLeft size={18} />
            </button>
            <span className={styles["month-dropdown"]}>
              {MONTHS[calendarData.month]} {calendarData.year}
            </span>
            <button
              type="button"
              className={styles["month-nav-btn"]}
              onClick={() =>
                setCurrentDate(
                  new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)
                )
              }
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div className={styles["modal-body"]}>
          <div className={styles["calendar-wrapper"]}>
            <div className={styles["calendar-header"]}>
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div key={d} className={styles["day-name"]}>
                  {d}
                </div>
              ))}
            </div>
            <div className={styles["calendar-grid"]}>
              {Array.from({ length: calendarData.startDay }).map((_, i) => (
                <div key={`pad-${i}`} className={`${styles["calendar-cell"]} ${styles.empty}`} />
              ))}
              {calendarData.days.map((cell) => {
                const active = cell.iso === selectedIso;
                const isCheapest =
                  cell.price != null &&
                  calendarData.cheapest != null &&
                  cell.price === calendarData.cheapest;
                const isHigh =
                  cell.price != null &&
                  calendarData.dearest != null &&
                  calendarData.dearest > calendarData.cheapest &&
                  cell.price === calendarData.dearest;
                const priceLabel = formatShortPrice(cell.price);

                return (
                  <button
                    type="button"
                    key={cell.iso}
                    className={`${styles["calendar-cell"]} ${active ? styles.active : ""} ${
                      isCheapest && !active ? styles.cheapest : ""
                    }`}
                    onClick={() => {
                      setSelectedIso(cell.iso);
                      onSelectDate?.(cell.iso);
                      onClose?.();
                    }}
                  >
                    {isCheapest && (
                      <span className={`${styles.badge} ${active ? styles["badge-orange"] : styles["badge-green"]}`}>
                        Low
                      </span>
                    )}
                    <span className={styles["day-number"]}>{cell.day}</span>
                    {cell.loading ? (
                      <span className={styles["price-skeleton"]} aria-label="Loading" />
                    ) : priceLabel ? (
                      <span
                        className={`${styles["price-text"]} ${
                          isCheapest ? styles.green : isHigh ? styles.red : ""
                        }`}
                      >
                        {priceLabel}
                      </span>
                    ) : (
                      <span className={styles["price-text"]}>-</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className={styles["modal-footer"]}>
          <div className={styles.legend}>
            <div className={styles["legend-item"]}>
              <span className={styles["legend-dot"]} style={{ background: "#22C55E" }} />
              Lowest in month
            </div>
            <div className={styles["legend-item"]}>
              <span className={styles["legend-dot"]} style={{ background: "#EF4444" }} />
              Highest in month
            </div>
            <div className={styles["legend-item"]}>
              <span className={styles["legend-dot"]} style={{ background: "#CCCCCC" }} />
              No offers / loading
            </div>
          </div>
          <button type="button" className={styles["apply-btn"]} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
