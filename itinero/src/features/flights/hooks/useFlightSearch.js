import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { flightService } from "../services/flightService";
import { mapOfferToCard } from "../utils/mapOffer";
import { diversifyByAirline, isFakeAirline } from "../utils/airlineIdentity";
import { expandAirportSearch } from "@/constants/airports";
import { stitchHubConnections } from "../utils/connectItineraries";
import { dedupeFlights } from "../utils/dedupeFlights";
import { toIsoDate } from "../utils/dateParams";
import { persistFlightSessionId } from "../utils/persistSelectedFlight";
import { useCurrency } from "@/context/CurrencyContext";
import api from "@/services/api";
import { ENDPOINTS } from "@/services/endpoints";

const INITIAL_BATCH = 48;
const STEP = 24;

const CABIN_MAP = {
  economy: "ECONOMY",
  "premium economy": "PREMIUM_ECONOMY",
  "prem. eco": "PREMIUM_ECONOMY",
  business: "BUSINESS",
  first: "FIRST",
  "first class": "FIRST",
  premium: "PREMIUM_ECONOMY",
};

const CABIN_LABEL = {
  ECONOMY: "Economy",
  PREMIUM_ECONOMY: "Premium Economy",
  BUSINESS: "Business",
  FIRST: "First",
};

function emptyCabinMessage(cabin, origin, dest) {
  const label = CABIN_LABEL[cabin] || cabin || "this cabin";
  if (cabin === "FIRST") {
    return `No First fares published for ${origin} → ${dest} on these dates. First is rarely sold on many Asia routes - try Business or Economy.`;
  }
  if (cabin && cabin !== "ECONOMY") {
    return `No ${label} fares published for ${origin} → ${dest} on these dates. Try Economy or another date.`;
  }
  return `No flights found for ${origin} → ${dest}. Try different dates or nearby airports.`;
}

function normalizeTripType(raw) {
  const s = String(raw || "return")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .trim();
  if (s.includes("multi")) return "multiway";
  if (s.includes("one")) return "oneway";
  return "return";
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Common Middle East / Gulf connection hubs. */
const MIDDLE_EAST_AIRPORTS = new Set([
  "DXB", "AUH", "SHJ", "DWC", "RKT",
  "DOH", "BAH", "KWI", "MCT",
  "RUH", "JED", "DMM", "MED", "AHB", "ELQ",
  "AMM", "AQJ", "BEY",
  "CAI", "SSH", "HRG", "HBE",
  "TLV", "ETH",
]);

const EMPTY_FLIGHT_FILTERS = {
  maxPrice: null,
  airlines: [],
  stops: [],
  departureTimes: [],
  arrivalTimes: [],
  maxDurationHours: null,
  excludeLayoverRegions: [],
};

function layoverAirports(flight) {
  const segs = flight?.segments;
  if (!Array.isArray(segs) || segs.length < 2) return [];
  const codes = [];
  for (let i = 0; i < segs.length - 1; i++) {
    const code = String(segs[i]?.arrival?.airport || "").toUpperCase().slice(0, 3);
    if (code) codes.push(code);
  }
  return codes;
}

function flightTouchesMiddleEastLayover(flight) {
  return layoverAirports(flight).some((code) => MIDDLE_EAST_AIRPORTS.has(code));
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

/** Fingerprint for matching OW legs to RT packages */
export function legFingerprint(flight) {
  const num = String(
    flight?.flightNumber || flight?.airline?.code || flight?.airline?.name || ""
  )
    .replace(/\s+/g, "")
    .toLowerCase();
  const dep = String(flight?.departure?.time || "").slice(0, 5);
  const arr = String(flight?.arrival?.time || "").slice(0, 5);
  return `${num}|${dep}|${arr}`;
}

function returnLegFingerprint(flight) {
  const seg = flight?.returnSegments?.[0];
  const num = String(seg?.flightNumber || "").replace(/\s+/g, "").toLowerCase();
  const dep = String(flight?.returnSummary?.departure?.time || "").slice(0, 5);
  const arr = String(flight?.returnSummary?.arrival?.time || "").slice(0, 5);
  return `${num}|${dep}|${arr}`;
}

function mapList(raw, { legLabel, legIndex, routeKey, routeLabel, routeOrigin, routeDestination } = {}) {
  const list = (Array.isArray(raw) ? raw : []).filter(
    (f) =>
      !isFakeAirline(
        f?.airline,
        f?.airline_code || f?.airlineCode,
        f?.flight_number || f?.flightNumber
      )
  );
  const cheapest = list.reduce(
    (min, f) => (typeof f.price === "number" && f.price < min ? f.price : min),
    Number.POSITIVE_INFINITY
  );
  const bestIdx = list.findIndex(
    (f) => f.is_cheapest || (typeof f.price === "number" && f.price === cheapest)
  );
  return list.map((f, idx) => {
    const card = mapOfferToCard(f, {
      isBestValue: idx === bestIdx,
      legLabel,
      legIndex,
      routeKey,
      routeLabel,
      routeOrigin,
      routeDestination,
    });
    // Keep IDs unique across multi-airport route merges
    if (routeKey && card.id) {
      card.id = `${routeKey}:${card.id}`;
    }
    return card;
  });
}

function parseIataList(raw) {
  return String(raw || "")
    .split(/[,+|/\s]+/)
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{3}$/.test(c))
    .filter((c, i, arr) => arr.indexOf(c) === i)
    .slice(0, 3);
}

function buildRoutePairs(origins, destinations) {
  const pairs = [];
  for (const o of origins) {
    for (const d of destinations) {
      if (o !== d) pairs.push({ origin: o, destination: d, key: `${o}-${d}` });
    }
  }
  return pairs.slice(0, 9);
}

/**
 * Live flight search - return trips use outbound-first (OW), then return (OW),
 * then resolve a bookable RT package. Cuts initial LiteAPI latency.
 */
export default function useFlightSearch() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { currency } = useCurrency();
  const [flights, setFlights] = useState([]);
  const [totalOffers, setTotalOffers] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState(null);
  useEffect(() => {
    persistFlightSessionId(sessionId);
  }, [sessionId]);
  const [sortBy, setSortBy] = useState("recommended");
  const [visible, setVisible] = useState(INITIAL_BATCH);
  const [filters, setFilters] = useState({ ...EMPTY_FLIGHT_FILTERS });
  const [activeRouteKey, setActiveRouteKey] = useState("all");
  const [fanout, setFanout] = useState({ origins: [], destinations: [], pairs: [], hubs: [] });

  // Round-trip two-step
  const [rtStep, setRtStep] = useState("outbound"); // outbound | return
  const [selectedOutbound, setSelectedOutbound] = useState(null);
  const [isResolvingRt, setIsResolvingRt] = useState(false);
  const searchGen = useRef(0);

  const search = useMemo(() => {
    // Prefer `depart`; accept legacy `date` from broken resume links.
    const depart = toIsoDate(searchParams.get("depart") || searchParams.get("date"));
    const ret = toIsoDate(searchParams.get("return"));
    const cabinRaw = (searchParams.get("cabin") || "Economy").toLowerCase();
    const tripType = normalizeTripType(searchParams.get("trip") || "Return");

    const requestedOrigins = parseIataList(searchParams.get("from"));
    const requestedDests = parseIataList(searchParams.get("to"));
    const o0 = requestedOrigins[0] || "";
    const d0 = requestedDests[0] || "";
    const origins = o0 ? [o0] : [];
    const destinations = d0 ? [d0] : [];

    const legs = [];
    if (tripType === "multiway") {
      const n = Math.max(1, Number(searchParams.get("legs") || 1));
      for (let i = 0; i < n; i++) {
        const o = (searchParams.get(`leg${i}_from`) || "").toUpperCase().slice(0, 3);
        const d = (searchParams.get(`leg${i}_to`) || "").toUpperCase().slice(0, 3);
        const dep = toIsoDate(searchParams.get(`leg${i}_depart`));
        if (o && d && dep) legs.push({ origin: o, destination: d, departDate: dep });
      }
    }
    if (!legs.length) {
      const legO = origins[0] || "";
      const legD = destinations[0] || "";
      if (legO && legD && depart) {
        legs.push({ origin: legO, destination: legD, departDate: depart });
      }
    }

    const routePairs =
      tripType === "multiway"
        ? []
        : buildRoutePairs(origins, destinations);

    return {
      origin: legs[0]?.origin || origins[0] || "",
      destination: legs[0]?.destination || destinations[0] || "",
      requestedOrigin: o0,
      requestedDestination: d0,
      origins,
      destinations,
      routePairs,
      isMultiAirport: routePairs.length > 1,
      departDate: legs[0]?.departDate || depart,
      returnDate: tripType === "return" ? ret : "",
      adults: Math.max(1, Number(searchParams.get("adults") || 1)),
      children: Math.max(0, Number(searchParams.get("children") || 0)),
      infants: Math.max(0, Number(searchParams.get("infants") || 0)),
      cabin: CABIN_MAP[cabinRaw] || "ECONOMY",
      tripType,
      legs,
    };
  }, [searchParams]);

  const resetRtFlow = useCallback(() => {
    setRtStep("outbound");
    setSelectedOutbound(null);
    setIsResolvingRt(false);
  }, []);

  const runSearch = useCallback(
    async (override = {}) => {
      const q = { ...search, ...override };

      if (q.tripType === "multiway") {
        if (!q.origin || !q.destination || !q.departDate) {
          setError("Choose origin, destination, and departure date to search live fares.");
          setFlights([]);
          return;
        }
      } else if (!(q.origin && q.destination && q.departDate)) {
        setError("Choose origin, destination, and departure date to search live fares.");
        setFlights([]);
        return;
      }

      const gen = ++searchGen.current;
      setIsLoading(true);
      setError("");
      setMessage("");
      setVisible(INITIAL_BATCH);
      setActiveRouteKey("all");
      setFanout({ origins: [], destinations: [], pairs: [], hubs: [] });
      resetRtFlow();

      try {
      const isReturn = q.tripType === "return" && q.returnDate;
      const basePayload = {
        adults: q.adults,
        children: q.children,
        infants: q.infants,
        cabin: q.cabin,
        currency,
        session_id: sessionId || undefined,
      };

      let origins = [q.requestedOrigin || q.origin].filter(Boolean);
      let destinations = [q.requestedDestination || q.destination].filter(Boolean);
      let hubs = [];
      const o0 = q.requestedOrigin || origins[0] || q.origin;
      const d0 = q.requestedDestination || destinations[0] || q.destination;

      // Sync local expand (instant) + async API expand in parallel with primary LiteAPI search.
      if (q.tripType !== "multiway" && o0 && d0) {
        origins = expandAirportSearch([o0]).slice(0, 2);
        destinations = expandAirportSearch([d0]).slice(0, 2);
      }

      const primaryKey = o0 && d0 ? `${o0}-${d0}` : "";
      const primaryPromise =
        q.tripType !== "multiway" && o0 && d0
          ? flightService.search({
              ...basePayload,
              origin: o0,
              destination: d0,
              depart_date: q.departDate,
              return_date: undefined,
            })
          : null;

      const expandPromise =
        q.tripType !== "multiway" && o0 && d0
          ? flightService.expandRoute(o0, d0).catch(() => null)
          : Promise.resolve(null);

      // Paint primary route as soon as LiteAPI returns - don't wait for expand/fan-out.
      if (primaryPromise) {
        const res = await primaryPromise;
        if (gen !== searchGen.current) return;
        const mapped = mapList(Array.isArray(res?.flights) ? res.flights : [], {
          legLabel: isReturn ? "Departing" : undefined,
          routeKey: primaryKey,
          routeLabel: `${o0} → ${d0}`,
          routeOrigin: o0,
          routeDestination: d0,
        });
        setFlights(mapped);
        setTotalOffers(mapped.length);
        setFanout({
          origins: [o0],
          destinations: [d0],
          pairs: [{ origin: o0, destination: d0, key: primaryKey }],
          hubs: [],
        });
        setMessage(
          (res?.message || "") +
            (isReturn ? " Select a departing flight, then we’ll load returns." : "")
        );
        if (res?.session_id) setSessionId(res.session_id);
        if (!mapped.length) {
          setError(emptyCabinMessage(q.cabin, o0, d0));
        } else {
          setError("");
        }
        // Show results immediately; nearby/hub fan-out merges below.
        setIsLoading(false);
      }

      const exp = await expandPromise;
      if (gen !== searchGen.current) return;
      if (exp?.ok) {
        const oCodes = (exp.origins || [])
          .map((r) => String(r.code || r).toUpperCase())
          .filter((c) => /^[A-Z]{3}$/.test(c));
        const dCodes = (exp.destinations || [])
          .map((r) => String(r.code || r).toUpperCase())
          .filter((c) => /^[A-Z]{3}$/.test(c));
        hubs = (exp.hubs || [])
          .map((r) => String(r.code || r).toUpperCase())
          .filter((c) => /^[A-Z]{3}$/.test(c))
          .slice(0, 2);
        if (oCodes.length) origins = oCodes.slice(0, 2);
        if (dCodes.length) destinations = dCodes.slice(0, 2);
      }

      const displayPairs =
        q.tripType === "multiway"
          ? []
          : buildRoutePairs(origins.slice(0, 2), destinations.slice(0, 2));
      // Cap extras - primary already loaded; at most 3 more live rates calls.
      const extraPairs = [];
      for (const hub of hubs.slice(0, 1)) {
        if (!hub || hub === o0 || hub === d0) continue;
        const fk = `${o0}-${hub}`;
        if (!displayPairs.some((p) => p.key === fk)) {
          extraPairs.push({ origin: o0, destination: hub, key: fk, role: "feeder" });
        }
        const hk = `${hub}-${d0}`;
        if (!displayPairs.some((p) => p.key === hk) && extraPairs.length < 3) {
          extraPairs.push({ origin: hub, destination: d0, key: hk, role: "haul" });
        }
      }

      if (displayPairs.length) {
        setFanout({ origins, destinations, pairs: displayPairs, hubs });
      }

      const otherPairs = [...displayPairs, ...extraPairs].filter((p) => p.key !== primaryKey).slice(0, 3);

      // Multi-airport / hub-pair: fan-out remaining one-way searches after primary paint
      if (q.tripType !== "multiway" && (otherPairs.length > 0 || (displayPairs.length > 1 && primaryPromise))) {
        const results = otherPairs.length
          ? await Promise.all(
              otherPairs.map((pair) =>
                flightService.search({
                  ...basePayload,
                  origin: pair.origin,
                  destination: pair.destination,
                  depart_date: q.departDate,
                  return_date: undefined,
                })
              )
            )
          : [];
        if (gen !== searchGen.current) return;

        const rawByKey = new Map();
        if (primaryPromise) {
          // Primary already mapped into state; re-fetch from current flights for stitch base
        }
        otherPairs.forEach((pair, idx) => {
          rawByKey.set(pair.key, Array.isArray(results[idx]?.flights) ? results[idx].flights : []);
        });

        let allMapped = displayPairs.flatMap((pair) => {
          if (pair.key === primaryKey) return []; // keep primary from first paint; merge below
          return mapList(rawByKey.get(pair.key) || [], {
            routeKey: pair.key,
            routeLabel: `${pair.origin} → ${pair.destination}`,
            routeOrigin: pair.origin,
            routeDestination: pair.destination,
            legLabel: isReturn ? "Departing" : undefined,
          });
        });

        const wantKey = primaryKey;
        const stitchedRaw = [];
        for (const hub of hubs.slice(0, 1)) {
          stitchedRaw.push(
            ...stitchHubConnections({
              origin: o0,
              destination: d0,
              hub,
              feeders: rawByKey.get(`${o0}-${hub}`) || [],
              hauls: rawByKey.get(`${hub}-${d0}`) || [],
            })
          );
        }
        const mappedStitched = wantKey
          ? mapList(stitchedRaw, {
              routeKey: wantKey,
              routeLabel: `${o0} → ${d0}`,
              routeOrigin: o0,
              routeDestination: d0,
              legLabel: isReturn ? "Departing" : undefined,
            })
          : [];

        // Merge with primary results already on screen
        setFlights((prev) => {
          const merged = dedupeFlights([...(prev || []), ...allMapped, ...mappedStitched]);
          let minPrice = Infinity;
          for (const f of merged) {
            if (f.price > 0 && f.price < minPrice) minPrice = f.price;
          }
          for (const f of merged) {
            f.isBestValue = f.price > 0 && f.price === minPrice;
            f.badge = f.isBestValue ? "Best Value" : f.badge;
          }
          setTotalOffers(merged.length);
          return merged;
        });

        if (mappedStitched.length) {
          setActiveRouteKey(wantKey);
          setMessage(
            `${o0} → ${d0}` +
              (hubs[0] ? ` via ${hubs[0]}` : "") +
              (displayPairs.length > 1 ? `, plus nearby airports.` : ".") +
              (isReturn ? " Select a departing flight, then we’ll load returns." : "")
          );
        } else if (displayPairs.length > 1) {
          setMessage(
            `Comparing ${displayPairs.length} routes (${origins.join(", ")} → ${destinations.join(", ")}).` +
              (isReturn ? " Select a departing flight, then we’ll load returns for that route." : "")
          );
        }
        const sid = results.find((r) => r.session_id)?.session_id;
        if (sid) setSessionId(sid);
        return;
      }

      // Multi-city: search all legs in parallel
      if (!primaryPromise) {
      const multiLegs =
        q.tripType === "multiway" && Array.isArray(q.legs) && q.legs.length
          ? q.legs
          : [
              {
                origin: q.origin,
                destination: q.destination,
                departDate: q.departDate,
              },
            ];

      const legResults = await Promise.all(
        multiLegs.map((leg) =>
          flightService.search({
            ...basePayload,
            origin: leg.origin,
            destination: leg.destination,
            depart_date: leg.departDate,
            return_date: undefined,
          })
        )
      );

      if (gen !== searchGen.current) return;

      const allMapped = dedupeFlights(
        legResults.flatMap((legRes, idx) => {
          const raw = Array.isArray(legRes?.flights) ? legRes.flights : [];
          const leg = multiLegs[idx];
          const legNo = idx + 1;
          return mapList(raw, {
            legLabel:
              q.tripType === "multiway"
                ? `Flight ${legNo}: ${leg.origin} → ${leg.destination}`
                : isReturn
                  ? "Departing"
                  : undefined,
            legIndex: q.tripType === "multiway" ? legNo : undefined,
            routeKey: `${leg.origin}-${leg.destination}`,
            routeLabel: `${leg.origin} → ${leg.destination}`,
            routeOrigin: leg.origin,
            routeDestination: leg.destination,
          });
        })
      );

      const primary = multiLegs[0] || {
        origin: q.origin,
        destination: q.destination,
      };
      const res = legResults[0] || {};
      const multiMsg =
        q.tripType === "multiway" && multiLegs.length > 1
          ? ` Multi-city: ${multiLegs.length} legs searched live.`
          : "";

      setFlights(allMapped);
      setTotalOffers(allMapped.length);
      setMessage(
        (res.message || "") +
          multiMsg +
          (isReturn ? " Select a departing flight, then we’ll load returns." : "")
      );
      if (res.session_id) setSessionId(res.session_id);
      if (!allMapped.length) {
        const fallback = emptyCabinMessage(q.cabin, primary.origin, primary.destination);
        const apiMsg = res.message || (res.error && !String(res.error).includes("_") ? res.error : null);
        const thinApi =
          !apiMsg ||
          /no live offers|no flights|no offers/i.test(String(apiMsg));
        setError(thinApi ? fallback : apiMsg);
      }
      }
      } catch (err) {
        if (gen !== searchGen.current) return;
        setFlights([]);
        setError(err?.message || "Flight search failed. Try again.");
      } finally {
        if (gen === searchGen.current) setIsLoading(false);
      }
    },
    [search, sessionId, currency, resetRtFlow]
  );

  const selectOutbound = useCallback(
    async (flight) => {
      if (search.tripType !== "return" || !search.returnDate) return null;
      const gen = ++searchGen.current;
      setSelectedOutbound(flight);
      setRtStep("return");
      setIsLoading(true);
      setError("");
      setMessage("");
      setVisible(INITIAL_BATCH);
      setFilters({ ...EMPTY_FLIGHT_FILTERS });
      setActiveRouteKey("all");

      const retOrigin = flight.routeDestination || flight.arrival?.airport || search.destination;
      const retDest = flight.routeOrigin || flight.departure?.airport || search.origin;

      // Return leg = one-way search with swapped airports on the return date
      const res = await flightService.search({
        origin: retOrigin,
        destination: retDest,
        depart_date: search.returnDate,
        return_date: undefined,
        adults: search.adults,
        children: search.children,
        infants: search.infants,
        cabin: search.cabin,
        currency,
        session_id: sessionId || undefined,
      });

      if (gen !== searchGen.current) return null;

      const mapped = dedupeFlights(
        mapList(res.flights, {
          legLabel: "Returning",
          routeKey: `${retOrigin}-${retDest}`,
          routeLabel: `${retOrigin} → ${retDest}`,
          routeOrigin: retOrigin,
          routeDestination: retDest,
        })
      );
      setFlights(mapped);
      setTotalOffers(mapped.length);
      setMessage(
        mapped.length
          ? `Choose your return to ${retDest}. Departing flight locked (${flight.routeLabel || `${retDest} → ${retOrigin}`}).`
          : res.message || "No return flights found for this date."
      );
      if (res.session_id) setSessionId(res.session_id);
      if (!mapped.length) {
        setError(res.message || "No return flights found. Try another date or change outbound.");
      }
      setIsLoading(false);
      return mapped;
    },
    [search, sessionId, currency]
  );

  const changeOutbound = useCallback(() => {
    resetRtFlow();
    runSearch();
  }, [resetRtFlow, runSearch]);

  /**
   * After return pick: resolve a LiteAPI round-trip offer (single offer_id) matching both legs.
   * Falls back to a composite card (outbound offer + return display, summed price) if no package match.
   */
  const selectReturn = useCallback(
    async (returnFlight) => {
      if (!selectedOutbound || !search.returnDate) return returnFlight;

      setIsResolvingRt(true);
      setError("");
      const outOrigin =
        selectedOutbound.routeOrigin || selectedOutbound.departure?.airport || search.origin;
      const outDest =
        selectedOutbound.routeDestination ||
        selectedOutbound.arrival?.airport ||
        search.destination;
      try {
        const res = await flightService.search({
          origin: outOrigin,
          destination: outDest,
          depart_date: search.departDate,
          return_date: search.returnDate,
          adults: search.adults,
          children: search.children,
          infants: search.infants,
          cabin: search.cabin,
          currency,
          session_id: sessionId || undefined,
        });
        if (res.session_id) setSessionId(res.session_id);

        const packages = mapList(res.flights);
        const outKey = legFingerprint(selectedOutbound);
        const retKey = legFingerprint(returnFlight);

        const exact = packages.find(
          (p) => legFingerprint(p) === outKey && returnLegFingerprint(p) === retKey
        );
        const outOnly = packages.find((p) => legFingerprint(p) === outKey);
        const matched = exact || outOnly;

        if (matched) {
          return {
            ...matched,
            selectedOutbound,
            selectedReturn: returnFlight,
            isRoundTripPackage: true,
          };
        }

        const combinedPrice =
          (Number(selectedOutbound.price) || 0) + (Number(returnFlight.price) || 0);
        return {
          ...selectedOutbound,
          id: `rt-${selectedOutbound.id}-${returnFlight.id}`,
          offer_id: selectedOutbound.offer_id || selectedOutbound.id,
          price: combinedPrice,
          returnSummary: {
            departure: returnFlight.departure,
            arrival: returnFlight.arrival,
            duration: returnFlight.duration,
            stops: returnFlight.stops,
          },
          returnSegments: returnFlight.segments,
          selectedOutbound,
          selectedReturn: returnFlight,
          isRoundTripPackage: false,
          badge: null,
          isBestValue: false,
        };
      } catch {
        const combinedPrice =
          (Number(selectedOutbound.price) || 0) + (Number(returnFlight.price) || 0);
        return {
          ...selectedOutbound,
          price: combinedPrice,
          returnSummary: {
            departure: returnFlight.departure,
            arrival: returnFlight.arrival,
            duration: returnFlight.duration,
            stops: returnFlight.stops,
          },
          selectedOutbound,
          selectedReturn: returnFlight,
          isRoundTripPackage: false,
        };
      } finally {
        setIsResolvingRt(false);
      }
    },
    [selectedOutbound, search, sessionId, currency]
  );

  // Auto-search when URL has enough params (or currency changes)
  useEffect(() => {
    if (
      (search.origin && search.destination && search.departDate) ||
      (search.isMultiAirport && search.departDate)
    ) {
      runSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    search.origin,
    search.destination,
    search.departDate,
    search.returnDate,
    search.adults,
    search.children,
    search.cabin,
    search.tripType,
    search.legs,
    search.origins.join(","),
    search.destinations.join(","),
    currency,
  ]);

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

  const displayPairs = fanout.pairs.length ? fanout.pairs : search.routePairs;
  const isMultiAirportView = displayPairs.length > 1;

  const searchView = useMemo(
    () => ({
      ...search,
      origins: fanout.origins.length ? fanout.origins : search.origins,
      destinations: fanout.destinations.length ? fanout.destinations : search.destinations,
      routePairs: displayPairs,
      isMultiAirport: isMultiAirportView,
      hubs: fanout.hubs || [],
    }),
    [search, fanout, displayPairs, isMultiAirportView]
  );

  const routeSummaries = useMemo(() => {
    if (!isMultiAirportView) return [];
    const byKey = new Map();
    for (const pair of displayPairs || []) {
      byKey.set(pair.key, {
        key: pair.key,
        origin: pair.origin,
        destination: pair.destination,
        label: `${pair.origin} → ${pair.destination}`,
        count: 0,
        minPrice: null,
      });
    }
    for (const f of flights) {
      const key = f.routeKey;
      if (!key || !byKey.has(key)) continue;
      const row = byKey.get(key);
      row.count += 1;
      if (f.price > 0 && (row.minPrice == null || f.price < row.minPrice)) {
        row.minPrice = f.price;
      }
    }
    return Array.from(byKey.values()).sort((a, b) => {
      if (a.minPrice == null) return 1;
      if (b.minPrice == null) return -1;
      return a.minPrice - b.minPrice;
    });
  }, [flights, isMultiAirportView, displayPairs]);

  const filtered = useMemo(() => {
    const maxP = filters.maxPrice ?? (priceBounds.max || Infinity);
    let list = flights.filter((f) => {
      if (activeRouteKey && activeRouteKey !== "all" && f.routeKey && f.routeKey !== activeRouteKey) {
        return false;
      }
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
      if (filters.excludeLayoverRegions?.includes("middle_east")) {
        if (flightTouchesMiddleEastLayover(f)) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      const priceA = typeof a.price === "number" && Number.isFinite(a.price) ? a.price : Infinity;
      const priceB = typeof b.price === "number" && Number.isFinite(b.price) ? b.price : Infinity;
      const durA = typeof a.durationMins === "number" ? a.durationMins : Infinity;
      const durB = typeof b.durationMins === "number" ? b.durationMins : Infinity;

      if (sortBy === "fastest") return durA - durB || priceA - priceB;
      if (sortBy === "cheapest" || sortBy === "price_asc") return priceA - priceB;
      if (sortBy === "price_desc") return priceB - priceA;
      if (sortBy === "departure") {
        const ta = String(a.departure?.time || a.departTime || a.departureTime || "");
        const tb = String(b.departure?.time || b.departTime || b.departureTime || "");
        return ta.localeCompare(tb) || priceA - priceB;
      }
      // recommended default
      if (!!b.isBestValue !== !!a.isBestValue) return a.isBestValue ? -1 : 1;
      return priceA - priceB;
    });

    // Airline round-robin is only for Recommended - it must not undo price/duration order.
    if (sortBy === "recommended") {
      const best = list.filter((f) => f.isBestValue);
      const rest = list.filter((f) => !f.isBestValue);
      list = [...best, ...diversifyByAirline(rest)];
    }
    return list;
  }, [flights, filters, sortBy, priceBounds.max, activeRouteKey]);

  const shown = filtered.slice(0, visible);

  function changeDepartDate(iso) {
    const next = new URLSearchParams(searchParams);
    const prevDepart = search.departDate;
    next.set("depart", iso);
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

  function clearQuickFilter() {
    setFilters({ ...EMPTY_FLIGHT_FILTERS });
    setVisible(INITIAL_BATCH);
  }

  async function applyQuickFilter(text) {
    const q = (text || "").trim();
    if (!q) {
      clearQuickFilter();
      return "Filters cleared.";
    }
    try {
      const res = await api.post(ENDPOINTS.VERO.FILTER, {
        domain: "flights",
        query: q,
        airlines: airlineCounts.map((a) => a.name),
        price_bounds: priceBounds,
      });
      const f = res?.filters || {};
      setFilters({
        ...EMPTY_FLIGHT_FILTERS,
        maxPrice: f.maxPrice ?? null,
        airlines: f.airlines || [],
        stops: f.stops || [],
        departureTimes: f.departureTimes || [],
        arrivalTimes: f.arrivalTimes || [],
        maxDurationHours: f.maxDurationHours ?? null,
        excludeLayoverRegions: f.excludeLayoverRegions || [],
      });
      if (f.sortBy) setSortBy(f.sortBy);
      setVisible(INITIAL_BATCH);
      return res?.summary || "Applied Vero filter.";
    } catch (err) {
      return err?.message || "Vero filter failed - try again.";
    }
  }

  const isReturnFlow = search.tripType === "return" && Boolean(search.returnDate);

  return {
    search: searchView,
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
    routeSummaries,
    activeRouteKey,
    setActiveRouteKey: (key) => {
      setActiveRouteKey(key);
      setVisible(INITIAL_BATCH);
    },
    runSearch,
    changeDepartDate,
    applyQuickFilter,
    clearQuickFilter,
    applyVeroFilter: applyQuickFilter,
    addDays,
    INITIAL_BATCH,
    STEP,
    // Two-step return
    isReturnFlow,
    rtStep,
    selectedOutbound,
    selectOutbound,
    selectReturn,
    changeOutbound,
    isResolvingRt,
  };
}
