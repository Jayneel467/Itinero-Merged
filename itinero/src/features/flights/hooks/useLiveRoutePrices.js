import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flightService } from "@/features/flights/services/flightService";
import { useCurrency } from "@/context/CurrencyContext";

const CACHE_PREFIX = "itinero_route_fare_v1:";
const CONCURRENCY = 3;

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Sample dates over the next ~6 weeks for price-calendar (never invent prices). */
export function sampleNearTermDates(count = 8) {
  const dates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 10; i <= 45; i += 4) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    dates.push(ymd(d));
  }
  return dates.slice(0, count);
}

export function routeKey(from, to) {
  return `${String(from || "").toUpperCase()}|${String(to || "").toUpperCase()}`;
}

function cacheKey(from, to, currency) {
  return `${CACHE_PREFIX}${routeKey(from, to)}|${currency}`;
}

function readCache(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return undefined;
    if (parsed.minPrice === null || typeof parsed.minPrice === "number") {
      return { minPrice: parsed.minPrice, bestDate: parsed.bestDate || null };
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

function writeCache(key, value) {
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({ ...value, at: Date.now() })
    );
  } catch {
    /* ignore */
  }
}

/**
 * Live min fares for a list of { from, to } routes via LiteAPI price-calendar.
 * Never invents prices - missing/failed → null.
 *
 * @returns {{
 *   byKey: Record<string, { minPrice: number|null, bestDate: string|null }>,
 *   loading: Record<string, boolean>,
 *   isHydrating: boolean,
 * }}
 */
export default function useLiveRoutePrices({ routes = [], enabled = true } = {}) {
  const { currency } = useCurrency();
  const [byKey, setByKey] = useState({});
  const [loading, setLoading] = useState({});
  const [isHydrating, setIsHydrating] = useState(false);
  const abortGen = useRef(0);

  const normalized = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const r of routes) {
      const from = String(r?.from || "").toUpperCase().slice(0, 3);
      const to = String(r?.to || "").toUpperCase().slice(0, 3);
      if (from.length !== 3 || to.length !== 3 || from === to) continue;
      const key = routeKey(from, to);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ from, to, key });
    }
    return out;
  }, [routes]);

  const routesSig = useMemo(
    () => normalized.map((r) => r.key).join(","),
    [normalized]
  );

  const fetchOne = useCallback(
    async (route, dates, gen) => {
      const key = route.key;
      const ck = cacheKey(route.from, route.to, currency);
      const cached = readCache(ck);
      if (cached !== undefined) {
        if (gen === abortGen.current) {
          setByKey((prev) => ({ ...prev, [key]: cached }));
          setLoading((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }
        return cached;
      }

      try {
        const res = await flightService.priceCalendar({
          origin: route.from,
          destination: route.to,
          dates,
          adults: 1,
          children: 0,
          infants: 0,
          cabin: "ECONOMY",
          currency,
        });
        if (gen !== abortGen.current) return null;

        const rows = Array.isArray(res?.dates) ? res.dates : [];
        let min = null;
        let bestDate = null;
        for (const row of rows) {
          const p = row?.minPrice;
          if (typeof p === "number" && p > 0 && (min == null || p < min)) {
            min = p;
            bestDate = row.date || null;
          }
        }
        const value = { minPrice: min, bestDate };
        writeCache(ck, value);
        setByKey((prev) => ({ ...prev, [key]: value }));
        return value;
      } catch {
        if (gen === abortGen.current) {
          setByKey((prev) => ({
            ...prev,
            [key]: { minPrice: null, bestDate: null },
          }));
        }
        return null;
      } finally {
        if (gen === abortGen.current) {
          setLoading((prev) => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }
      }
    },
    [currency]
  );

  useEffect(() => {
    if (!enabled || !normalized.length) {
      return undefined;
    }

    const gen = ++abortGen.current;
    const dates = sampleNearTermDates();
    setIsHydrating(true);

    const initial = {};
    const initialLoading = {};
    for (const route of normalized) {
      const cached = readCache(cacheKey(route.from, route.to, currency));
      if (cached !== undefined) {
        initial[route.key] = cached;
      } else {
        initialLoading[route.key] = true;
      }
    }
    setByKey(initial);
    setLoading(initialLoading);

    let cancelled = false;

    (async () => {
      const queue = normalized.filter((r) => !(r.key in initial));
      let idx = 0;

      async function worker() {
        while (!cancelled && gen === abortGen.current && idx < queue.length) {
          const route = queue[idx++];
          await fetchOne(route, dates, gen);
        }
      }

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, queue.length || 1) }, () =>
          worker()
        )
      );
      if (!cancelled && gen === abortGen.current) setIsHydrating(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, routesSig, currency, normalized, fetchOne]);

  return { byKey, loading, isHydrating };
}
