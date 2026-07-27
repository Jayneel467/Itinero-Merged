import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flightService } from "../services/flightService";

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

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Async live min-fares for the date strip / price calendar.
 * Never invents prices — only stores numbers returned by LiteAPI via supervisor.
 */
export default function usePriceCalendar({
  origin,
  destination,
  departDate,
  returnDate,
  tripType,
  adults = 1,
  children = 0,
  infants = 0,
  cabin = "ECONOMY",
  /** Seed selected-day fare from the main results search without waiting */
  seedPrice = null,
}) {
  const [pricesByDate, setPricesByDate] = useState({});
  const [loadingDates, setLoadingDates] = useState({});
  const [isStripLoading, setIsStripLoading] = useState(false);
  const pricesRef = useRef({});
  const inflightRef = useRef(new Set());
  const mountedRef = useRef(true);
  const reqIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    pricesRef.current = pricesByDate;
  }, [pricesByDate]);

  const stripDates = useMemo(() => {
    if (!departDate) return [];
    return Array.from({ length: 15 }, (_, i) => addDays(departDate, i - 7));
  }, [departDate]);

  const fetchDates = useCallback(
    async (dates) => {
      if (!origin || !destination || !dates?.length) return;
      if (origin.length !== 3 || destination.length !== 3) return;

      const known = pricesRef.current;
      const needed = dates.filter((iso) => {
        if (!iso) return false;
        if (Object.prototype.hasOwnProperty.call(known, iso)) return false;
        if (inflightRef.current.has(iso)) return false;
        return true;
      });
      if (!needed.length) return;

      needed.forEach((iso) => inflightRef.current.add(iso));
      if (mountedRef.current) {
        setLoadingDates((prev) => {
          const next = { ...prev };
          needed.forEach((iso) => {
            next[iso] = true;
          });
          return next;
        });
      }

      const myReq = reqIdRef.current;

      try {
        const res = await flightService.priceCalendar({
          origin,
          destination,
          dates: needed,
          return_date:
            tripType === "return" && returnDate ? returnDate : undefined,
          adults,
          children,
          infants,
          cabin,
        });

        if (!mountedRef.current || myReq !== reqIdRef.current) return;

        const rows = Array.isArray(res.dates) ? res.dates : [];
        setPricesByDate((prev) => {
          const next = { ...prev };
          for (const row of rows) {
            const iso = row?.date;
            if (!iso) continue;
            const p = row.minPrice;
            next[iso] = typeof p === "number" && p > 0 ? p : null;
          }
          for (const iso of needed) {
            if (!(iso in next)) next[iso] = null;
          }
          return next;
        });
      } finally {
        needed.forEach((iso) => inflightRef.current.delete(iso));
        if (mountedRef.current && myReq === reqIdRef.current) {
          setLoadingDates((prev) => {
            const next = { ...prev };
            needed.forEach((iso) => {
              delete next[iso];
            });
            return next;
          });
        }
      }
    },
    [origin, destination, returnDate, tripType, adults, children, infants, cabin]
  );

  // Reset when route / pax / cabin changes
  useEffect(() => {
    reqIdRef.current += 1;
    pricesRef.current = {};
    setPricesByDate({});
    setLoadingDates({});
    inflightRef.current = new Set();
  }, [origin, destination, adults, children, infants, cabin, tripType, returnDate]);

  // Seed selected day from main live search min price
  useEffect(() => {
    if (!departDate || typeof seedPrice !== "number" || seedPrice <= 0) return;
    setPricesByDate((prev) => {
      if (typeof prev[departDate] === "number") return prev;
      return { ...prev, [departDate]: seedPrice };
    });
  }, [departDate, seedPrice]);

  // Load strip window async (does not block main results).
  // Prefer center ±3 first so visible fares appear sooner, then the rest of ±7.
  useEffect(() => {
    if (!stripDates.length || !origin || !destination || !departDate) return;
    let cancelled = false;
    (async () => {
      setIsStripLoading(true);
      try {
        const priority = Array.from({ length: 7 }, (_, i) => addDays(departDate, i - 3));
        if (!cancelled) await fetchDates(priority);
        if (!cancelled) await fetchDates(stripDates);
      } finally {
        if (!cancelled && mountedRef.current) setIsStripLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stripDates, origin, destination, departDate, fetchDates]);

  const ensureMonthPrices = useCallback(
    async (year, monthIndex) => {
      const count = daysInMonth(year, monthIndex);
      const dates = Array.from({ length: count }, (_, i) => {
        const day = i + 1;
        return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      });
      // Skeleton the whole month while week batches fill in
      setLoadingDates((prev) => {
        const next = { ...prev };
        for (const iso of dates) {
          if (!Object.prototype.hasOwnProperty.call(pricesRef.current, iso)) {
            next[iso] = true;
          }
        }
        return next;
      });
      try {
        for (let i = 0; i < dates.length; i += 7) {
          await fetchDates(dates.slice(i, i + 7));
        }
      } finally {
        setLoadingDates((prev) => {
          const next = { ...prev };
          for (const iso of dates) delete next[iso];
          return next;
        });
      }
    },
    [fetchDates]
  );

  const isDateLoading = useCallback(
    (iso) => {
      if (Object.prototype.hasOwnProperty.call(pricesByDate, iso)) return false;
      if (loadingDates[iso]) return true;
      if (isStripLoading && stripDates.includes(iso)) return true;
      return false;
    },
    [loadingDates, isStripLoading, pricesByDate, stripDates]
  );

  return {
    pricesByDate,
    isStripLoading,
    isDateLoading,
    loadingDates,
    stripDates,
    ensureMonthPrices,
    fetchDates,
  };
}
