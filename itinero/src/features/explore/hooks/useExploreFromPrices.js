import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flightService } from "@/features/flights/services/flightService";
import { useCurrency } from "@/context/CurrencyContext";
import { sampleDatesForMonth } from "../data/catalog";

const CACHE_PREFIX = "itinero_explore_fare_v1:";
const CONCURRENCY = 4;

function cacheKey(origin, dest, monthKey, currency) {
  return `${CACHE_PREFIX}${origin}|${dest}|${monthKey || "any"}|${currency}`;
}

function readCache(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.minPrice === "number") return parsed.minPrice;
    if (parsed && parsed.minPrice === null) return null;
  } catch {
    /* ignore */
  }
  return undefined;
}

function writeCache(key, minPrice) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ minPrice, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

/**
 * Batch live min fares origin → many destinations via price-calendar.
 * Never invents prices.
 */
export default function useExploreFromPrices({
  origin,
  destinations = [],
  monthKey = "",
  enabled = true,
}) {
  const { currency } = useCurrency();
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState({});
  const [isHydrating, setIsHydrating] = useState(false);
  const abortGen = useRef(0);
  const destKey = useMemo(
    () => destinations.map((d) => d.iata).filter(Boolean).join(","),
    [destinations]
  );

  const fetchOne = useCallback(
    async (destIata, dates, gen) => {
      const key = cacheKey(origin, destIata, monthKey, currency);
      const cached = readCache(key);
      if (cached !== undefined) {
        if (gen === abortGen.current) {
          setPrices((prev) => ({ ...prev, [destIata]: cached }));
          setLoading((prev) => {
            const next = { ...prev };
            delete next[destIata];
            return next;
          });
        }
        return cached;
      }

      try {
        const res = await Promise.race([
          flightService.priceCalendar({
            origin,
            destination: destIata,
            dates,
            adults: 1,
            children: 0,
            infants: 0,
            cabin: "ECONOMY",
            currency,
          }),
          new Promise((_, reject) => {
            window.setTimeout(() => reject(new Error("explore_fare_timeout")), 12_000);
          }),
        ]);
        if (gen !== abortGen.current) return null;
        const rows = Array.isArray(res?.dates) ? res.dates : [];
        let min = null;
        for (const row of rows) {
          const p = row?.minPrice;
          if (typeof p === "number" && p > 0 && (min == null || p < min)) min = p;
        }
        writeCache(key, min);
        setPrices((prev) => ({ ...prev, [destIata]: min }));
        return min;
      } catch {
        if (gen === abortGen.current) {
          writeCache(key, null);
          setPrices((prev) => ({ ...prev, [destIata]: null }));
        }
        return null;
      } finally {
        if (gen === abortGen.current) {
          setLoading((prev) => {
            const next = { ...prev };
            delete next[destIata];
            return next;
          });
        }
      }
    },
    [origin, monthKey, currency]
  );

  useEffect(() => {
    if (!enabled || !origin || origin.length !== 3 || !destinations.length) {
      return undefined;
    }

    const gen = ++abortGen.current;
    const dates = sampleDatesForMonth(monthKey);
    const iatas = [
      ...new Set(
        destinations
          .map((d) => String(d.iata || "").toUpperCase())
          .filter((c) => c.length === 3 && c !== origin)
      ),
    ];

    setIsHydrating(true);
    const initialLoading = {};
    const initialPrices = {};
    for (const iata of iatas) {
      const key = cacheKey(origin, iata, monthKey, currency);
      const cached = readCache(key);
      if (cached !== undefined) {
        initialPrices[iata] = cached;
      } else {
        initialLoading[iata] = true;
      }
    }
    setPrices(initialPrices);
    setLoading(initialLoading);

    let cancelled = false;

    (async () => {
      const queue = iatas.filter((iata) => !(iata in initialPrices));
      let idx = 0;

      async function worker() {
        while (!cancelled && gen === abortGen.current && idx < queue.length) {
          const iata = queue[idx++];
          await fetchOne(iata, dates, gen);
        }
      }

      const workers = Array.from(
        { length: Math.min(CONCURRENCY, queue.length || 1) },
        () => worker()
      );
      await Promise.all(workers);
      if (!cancelled && gen === abortGen.current) setIsHydrating(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, origin, destKey, monthKey, currency, destinations, fetchOne]);

  return { prices, loading, isHydrating };
}
