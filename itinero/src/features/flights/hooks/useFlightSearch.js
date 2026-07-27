import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { flightService } from "../services/flightService";
import { mapOfferToCard } from "../utils/mapOffer";

const INITIAL_BATCH = 15;
const STEP = 20;

const CABIN_MAP = {
  economy: "ECONOMY",
  "premium economy": "PREMIUM_ECONOMY",
  "prem. eco": "PREMIUM_ECONOMY",
  business: "BUSINESS",
  first: "FIRST",
};

function toIsoDate(value) {
  if (!value) return "";
  // Prefer calendar date as-is — avoid UTC day-shift from toISOString()
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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

function hourOf(t) {
  const m = String(t || "").match(/(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1], 10) : -1;
}

function inBucket(hour, bucket) {
  if (bucket === "early") return hour >= 0 && hour < 6;
  if (bucket === "morning") return hour >= 6 && hour < 12;
  if (bucket === "afternoon") return hour >= 12 && hour < 18;
  if (bucket === "evening") return hour >= 18 && hour < 24;
  return true;
}

/**
 * Live flight search against the supervisor gateway.
 */
export default function useFlightSearch() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [flights, setFlights] = useState([]);
  const [totalOffers, setTotalOffers] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [sortBy, setSortBy] = useState("recommended");
  const [visible, setVisible] = useState(INITIAL_BATCH);
  const [filters, setFilters] = useState({
    maxPrice: null,
    airlines: [],
    stops: [], // 'Direct' | '1 Stop' | '2+ Stops'
    departureTimes: [],
    arrivalTimes: [],
    maxDurationHours: null,
  });

  const search = useMemo(() => {
    const depart = toIsoDate(searchParams.get("depart"));
    const ret = toIsoDate(searchParams.get("return"));
    const cabinRaw = (searchParams.get("cabin") || "Economy").toLowerCase();
    return {
      origin: (searchParams.get("from") || "").toUpperCase().slice(0, 3),
      destination: (searchParams.get("to") || "").toUpperCase().slice(0, 3),
      departDate: depart,
      returnDate: ret,
      adults: Math.max(1, Number(searchParams.get("adults") || 1)),
      children: Math.max(0, Number(searchParams.get("children") || 0)),
      infants: Math.max(0, Number(searchParams.get("infants") || 0)),
      cabin: CABIN_MAP[cabinRaw] || "ECONOMY",
      tripType: (searchParams.get("trip") || "Return").toLowerCase(),
    };
  }, [searchParams]);

  const runSearch = useCallback(
    async (override = {}) => {
      const q = { ...search, ...override };
      if (!q.origin || !q.destination || !q.departDate) {
        setError("Choose origin, destination, and departure date to search live fares.");
        setFlights([]);
        return;
      }
      if (q.origin.length !== 3 || q.destination.length !== 3) {
        setError("Use 3-letter IATA codes (e.g. BOM, DEL).");
        setFlights([]);
        return;
      }

      setIsLoading(true);
      setError("");
      setMessage("");
      setVisible(INITIAL_BATCH);

      const res = await flightService.search({
        origin: q.origin,
        destination: q.destination,
        depart_date: q.departDate,
        return_date:
          q.tripType === "return"
            ? q.returnDate || undefined
            : undefined,
        adults: q.adults,
        children: q.children,
        infants: q.infants,
        cabin: q.cabin,
        session_id: sessionId || undefined,
      });

      const raw = Array.isArray(res.flights) ? res.flights : [];
      const cheapest = raw.reduce(
        (min, f) => (typeof f.price === "number" && f.price < min ? f.price : min),
        Number.POSITIVE_INFINITY
      );
      const mapped = raw.map((f) =>
        mapOfferToCard(f, {
          isBestValue: f.is_cheapest || f.price === cheapest,
        })
      );

      setFlights(mapped);
      setTotalOffers(res.total_offers || mapped.length);
      setMessage(res.message || "");
      if (res.session_id) setSessionId(res.session_id);
      if (!mapped.length) {
        // Prefer human message over machine error codes (e.g. flight_search_unreachable)
        setError(
          res.message ||
            (res.error && !String(res.error).includes("_")
              ? res.error
              : null) ||
            "No flights found. Try different dates."
        );
      }
      setIsLoading(false);
    },
    [search, sessionId]
  );

  // Auto-search when URL has enough params
  useEffect(() => {
    if (search.origin && search.destination && search.departDate) {
      runSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when query identity changes
  }, [search.origin, search.destination, search.departDate, search.returnDate, search.adults, search.children, search.cabin]);

  const priceBounds = useMemo(() => {
    if (!flights.length) return { min: 0, max: 0 };
    const prices = flights.map((f) => f.price).filter((p) => p > 0);
    if (!prices.length) return { min: 0, max: 0 };
    return { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) };
  }, [flights]);

  const airlineCounts = useMemo(() => {
    const m = new Map();
    for (const f of flights) {
      const name = f.airline?.name || "Airline";
      m.set(name, (m.get(name) || 0) + 1);
    }
    return Array.from(m.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [flights]);

  const stopCounts = useMemo(() => {
    const c = { Direct: 0, "1 Stop": 0, "2+ Stops": 0 };
    for (const f of flights) {
      if (f.stopsCount === 0) c.Direct += 1;
      else if (f.stopsCount === 1) c["1 Stop"] += 1;
      else c["2+ Stops"] += 1;
    }
    return c;
  }, [flights]);

  const filtered = useMemo(() => {
    const maxP = filters.maxPrice ?? (priceBounds.max || Infinity);
    let list = flights.filter((f) => {
      if (f.price > maxP) return false;
      if (filters.airlines.length && !filters.airlines.includes(f.airline?.name)) return false;
      if (filters.stops.length) {
        const label =
          f.stopsCount === 0 ? "Direct" : f.stopsCount === 1 ? "1 Stop" : "2+ Stops";
        if (!filters.stops.includes(label)) return false;
      }
      if (filters.departureTimes.length) {
        const h = hourOf(f.departure?.time);
        if (!filters.departureTimes.some((b) => inBucket(h, b))) return false;
      }
      if (filters.arrivalTimes.length) {
        const h = hourOf(f.arrival?.time);
        if (!filters.arrivalTimes.some((b) => inBucket(h, b))) return false;
      }
      if (filters.maxDurationHours != null) {
        if (f.durationMins > filters.maxDurationHours * 60) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sortBy === "fastest") return a.durationMins - b.durationMins;
      if (sortBy === "cheapest") return a.price - b.price;
      if (!!b.isBestValue !== !!a.isBestValue) return a.isBestValue ? -1 : 1;
      return a.price - b.price;
    });
    return list;
  }, [flights, filters, sortBy, priceBounds.max]);

  const shown = filtered.slice(0, visible);

  function changeDepartDate(iso) {
    const next = new URLSearchParams(searchParams);
    const prevDepart = search.departDate;
    next.set("depart", iso);
    // Keep round-trip span when shifting the date strip
    if (search.returnDate && prevDepart && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      const prev = new Date(`${prevDepart}T00:00:00`);
      const neu = new Date(`${iso}T00:00:00`);
      if (!Number.isNaN(prev.getTime()) && !Number.isNaN(neu.getTime())) {
        const deltaDays = Math.round((neu - prev) / 86400000);
        if (deltaDays !== 0) {
          next.set("return", addDays(search.returnDate, deltaDays));
        }
      }
    }
    setSearchParams(next);
  }

  function applyQuickFilter(text) {
    const t = (text || "").toLowerCase();
    const next = { ...filters };
    const notes = [];
    const priceMatch = t.match(/(?:under|below|less than|<)\s*₹?\s*([\d,]+)\s*(k)?/);
    if (priceMatch) {
      let v = parseInt(priceMatch[1].replace(/,/g, ""), 10);
      if (priceMatch[2]) v *= 1000;
      next.maxPrice = v;
      notes.push(`under ₹${v.toLocaleString("en-IN")}`);
    }
    if (/(no stop|non[- ]?stop|nonstop|direct|without stop)/.test(t)) {
      next.stops = ["Direct"];
      notes.push("non-stop only");
    } else if (/1 stop|one stop/.test(t)) {
      next.stops = ["1 Stop"];
      notes.push("1 stop");
    }
    if (/cheap|lowest|budget/.test(t)) {
      setSortBy("cheapest");
      notes.push("cheapest first");
    }
    if (/fast|quick|short/.test(t)) {
      setSortBy("fastest");
      notes.push("fastest first");
    }
    const matched = airlineCounts
      .map((a) => a.name)
      .filter((name) => t.includes(name.toLowerCase()));
    if (matched.length) {
      next.airlines = matched;
      notes.push(matched.join(", "));
    }
    if (/morning/.test(t)) {
      next.departureTimes = ["morning"];
      notes.push("morning departures");
    }
    if (/evening|night/.test(t)) {
      next.departureTimes = ["evening"];
      notes.push("evening departures");
    }
    setFilters(next);
    setVisible(INITIAL_BATCH);
    return notes.length
      ? `Filtered: ${notes.join(" · ")}`
      : "Couldn't match that — try a price, airline, or 'non-stop'.";
  }

  return {
    search,
    flights,
    filtered,
    shown,
    totalOffers,
    isLoading,
    message,
    error,
    sessionId,
    sortBy,
    setSortBy,
    visible,
    setVisible,
    showMore: () => setVisible((v) => v + STEP),
    showAll: () => setVisible(filtered.length),
    hasMore: shown.length < filtered.length,
    filters,
    setFilters,
    priceBounds,
    airlineCounts,
    stopCounts,
    runSearch,
    changeDepartDate,
    applyQuickFilter,
    /** @deprecated use applyQuickFilter — local only, not Vero chat */
    applyVeroFilter: applyQuickFilter,
    addDays,
    INITIAL_BATCH,
    STEP,
  };
}
