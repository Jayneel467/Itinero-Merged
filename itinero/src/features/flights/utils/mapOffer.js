import { getCurrencyMeta } from "@/context/CurrencyContext";
import { APP_CONFIG } from "@/app/config";
import {
  canonicalizeAirlineName,
  normalizeAirlineCode,
  formatFlightLabel,
} from "./airlineIdentity";

/**
 * Map supervisor FlightOffer → FlightCardDesign shape.
 * Never invent prices, baggage, amenities, or aircraft.
 */

function currencySymbol(code) {
  return getCurrencyMeta(code || APP_CONFIG.DEFAULT_CURRENCY).symbol;
}

function formatBaggageKg(kg) {
  if (kg == null || Number.isNaN(Number(kg))) return null;
  const n = Number(kg);
  if (n === 0) return "0kg";
  return `${n}kg`;
}

function formatPieces(n) {
  if (n == null || Number.isNaN(Number(n))) return null;
  const v = Number(n);
  if (v === 0) return "0 PC";
  return v === 1 ? "1 PC" : `${v} PC`;
}

/**
 * Split LiteAPI baggage into short cabin/checked labels.
 * Never put the full "Cabin included · Checked included" summary into both slots -
 * that overflows the card and overlaps the schedule column.
 */
function parseBaggage(offer) {
  const detail = offer.baggage_detail || {};
  let cabin =
    formatBaggageKg(detail.cabin_kg) || formatPieces(detail.cabin_pieces);
  let checked =
    formatBaggageKg(detail.checked_kg) || formatPieces(detail.checked_pieces);

  if (!cabin && detail.has_carry_on) cabin = "Included";
  if (!checked && detail.has_checked) checked = "Included";

  if (!cabin && !checked && typeof offer.baggage === "string" && offer.baggage.trim()) {
    const parts = offer.baggage.split(/\s*[·|]\s*/).map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      if (/cabin|carry/i.test(part) && !cabin) {
        cabin = /included/i.test(part) ? "Included" : part.replace(/cabin\s*/i, "").trim() || "Included";
      } else if (/check/i.test(part) && !checked) {
        checked = /included/i.test(part) ? "Included" : part.replace(/checked\s*/i, "").trim() || "Included";
      }
    }
    if (!cabin && !checked) {
      return { cabin: null, checked: offer.baggage.trim() };
    }
  }
  return { cabin, checked };
}

/** Only pass through a real positive seat count - never invent scarcity. */
function coerceSeatsRemaining(value) {
  if (value == null || value === false || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 500) return null;
  return Math.trunc(n);
}

/** Map schedule fare_options → UI fare rows (hotel rates analogue). */
function mapFareOptions(offer) {
  const raw = Array.isArray(offer.fare_options) ? offer.fare_options : [];
  if (raw.length) {
    return raw.map((f, i) => {
      const bag = parseBaggage(f);
      return {
        id: String(f.offer_id || f.id || `${offer.offer_id || offer.id}-fare-${i}`),
        offer_id: f.offer_id || f.id,
        // Never invent "Standard" - only show LiteAPI fare family when present
        fare_family: f.fare_family || null,
        cabin: f.cabin_class || f.cabin || offer.cabin || null,
        price: Number(f.total_price ?? f.price) || 0,
        price_base: f.price_base ?? null,
        price_taxes: f.price_taxes ?? null,
        price_fees: f.price_fees ?? null,
        currency: f.currency || offer.currency || "INR",
        baggage: bag,
        seats_remaining: coerceSeatsRemaining(f.seats_remaining),
        refundable: typeof f.refundable === "boolean" ? f.refundable : null,
        changeable: typeof f.changeable === "boolean" ? f.changeable : null,
        has_refund_fee: f.has_refund_fee === true,
        has_change_fee: f.has_change_fee === true,
        terms_summary: Array.isArray(f.terms_summary) ? f.terms_summary : null,
        amenities: Array.isArray(f.amenities) ? f.amenities : [],
      };
    });
  }
  // Single-fare fallback so the card always has a selectable row
  return [
    {
      id: String(offer.offer_id || offer.id || "fare-0"),
      offer_id: offer.offer_id || offer.id,
      fare_family: offer.fare_family || null,
      cabin: offer.cabin || null,
      price: Number(offer.price) || 0,
      price_base: offer.price_base ?? null,
      price_taxes: offer.price_taxes ?? null,
      price_fees: offer.price_fees ?? null,
      currency: offer.currency || "INR",
      baggage: parseBaggage(offer),
      seats_remaining: coerceSeatsRemaining(offer.seats_remaining),
      refundable: typeof offer.refundable === "boolean" ? offer.refundable : null,
      changeable: typeof offer.changeable === "boolean" ? offer.changeable : null,
      has_refund_fee: offer.has_refund_fee === true,
      has_change_fee: offer.has_change_fee === true,
      terms_summary: Array.isArray(offer.terms_summary) ? offer.terms_summary : null,
      amenities: Array.isArray(offer.amenities) ? offer.amenities : [],
    },
  ];
}

function stopsLabel(stops) {
  const n = Number(stops) || 0;
  if (n === 0) return "Direct";
  if (n === 1) return "1 Stop";
  return `${n} Stops`;
}

function arrivalDayOffset(depIso, arrIso) {
  if (!depIso || !arrIso) return 0;
  const a = new Date(String(depIso).includes("T") ? depIso : `${depIso}T00:00:00`);
  const b = new Date(String(arrIso).includes("T") ? arrIso : `${arrIso}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  const d0 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const d1 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  const days = Math.round((d1 - d0) / 86400000);
  return Number.isFinite(days) && days > 0 ? days : 0;
}

function shortDate(isoOrTime) {
  if (!isoOrTime) return "";
  try {
    const d = new Date(isoOrTime.includes("T") ? isoOrTime : `${isoOrTime}T00:00:00`);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  } catch {
    return "";
  }
}

function durationMinutes(duration) {
  if (!duration || typeof duration !== "string") return Number.POSITIVE_INFINITY;
  const h = duration.match(/(\d+)\s*h/);
  const m = duration.match(/(\d+)\s*m/);
  return (h ? parseInt(h[1], 10) : 0) * 60 + (m ? parseInt(m[1], 10) : 0);
}

function directionOf(seg) {
  return String(seg?.direction || "").toUpperCase();
}

/**
 * Outbound leg only for the main card / layover UI.
 * Round-trip offers include INBOUND segments - treating them as layovers
 * caused BOM→BOM and multi-day "durations".
 */
function splitLegs(segs) {
  if (!Array.isArray(segs) || !segs.length) {
    return { outbound: [], inbound: [] };
  }
  const outbound = segs.filter((s) => directionOf(s) === "OUTBOUND");
  const inbound = segs.filter((s) => directionOf(s) === "INBOUND");
  if (outbound.length || inbound.length) {
    return {
      outbound: outbound.length
        ? outbound
        : segs.filter((s) => directionOf(s) !== "INBOUND"),
      inbound,
    };
  }
  return { outbound: segs, inbound: [] };
}

function timeOf(iso) {
  if (!iso) return "--:--";
  const s = String(iso);
  const tIdx = s.indexOf("T");
  if (tIdx >= 0 && s.length >= tIdx + 6) return s.slice(tIdx + 1, tIdx + 6);
  if (s.length >= 5 && s[2] === ":") return s.slice(0, 5);
  return "--:--";
}

function formatDurationMins(mins) {
  if (mins == null || !Number.isFinite(mins) || mins < 0) return null;
  const total = Math.round(mins);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Connection wait between consecutive mapped segments. */
export function layoverBetween(prevSeg, nextSeg) {
  if (!prevSeg || !nextSeg) return null;
  const airport =
    prevSeg.arrival?.airport || nextSeg.departure?.airport || "Connection";
  const arriveTime = prevSeg.arrival?.time || null;
  const departTime = nextSeg.departure?.time || null;

  let mins = null;
  const arrMs = prevSeg.arrivalAt ? Date.parse(prevSeg.arrivalAt) : NaN;
  const depMs = nextSeg.departureAt ? Date.parse(nextSeg.departureAt) : NaN;
  if (Number.isFinite(arrMs) && Number.isFinite(depMs) && depMs > arrMs) {
    mins = Math.round((depMs - arrMs) / 60000);
  }

  return {
    airport,
    arriveTime,
    departTime,
    minutes: mins,
    durationLabel: formatDurationMins(mins),
  };
}

function mapSegment(s, fallbackAirline, fallbackFlightNumber, fallbackDuration) {
  const depIso = s.departure || s.depart || null;
  const arrIso = s.arrival || s.arrive || null;
  let durLabel = fallbackDuration || "-";
  if (s.duration_minutes != null && Number.isFinite(Number(s.duration_minutes))) {
    const dm = Number(s.duration_minutes);
    durLabel = formatDurationMins(dm) || durLabel;
  } else if (depIso && arrIso) {
    const a = Date.parse(depIso);
    const b = Date.parse(arrIso);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
      durLabel = formatDurationMins((b - a) / 60000) || durLabel;
    }
  }

  return {
    departure: {
      time: timeOf(depIso),
      airport: s.from || "",
      date: shortDate(depIso),
    },
    arrival: {
      time: timeOf(arrIso),
      airport: s.to || "",
      date: shortDate(arrIso),
    },
    departureAt: depIso || null,
    arrivalAt: arrIso || null,
    duration: durLabel,
    stops: "Direct",
    airline: { name: s.airline || fallbackAirline },
    flightInfo: {
      flightNumber: s.flight_number || fallbackFlightNumber,
      aircraft: s.aircraft || null,
    },
    direction: s.direction || null,
  };
}

/**
 * @param {object} offer - supervisor / LiteAPI UI offer
 * @param {{ isBestValue?: boolean, legLabel?: string, legIndex?: number }} opts
 */
export function mapOfferToCard(offer, opts = {}) {
  const baggage = parseBaggage(offer);
  const amenities = Array.isArray(offer.amenities)
    ? offer.amenities
        .map((a) => (typeof a === "string" ? a : a?.name))
        .filter(Boolean)
    : [];

  const allSegs = Array.isArray(offer.segments) ? offer.segments : [];
  const fromApiOutbound = Array.isArray(offer.outbound_segments)
    ? offer.outbound_segments
    : null;
  const fromApiInbound = Array.isArray(offer.inbound_segments)
    ? offer.inbound_segments
    : null;
  const { outbound, inbound } =
    fromApiOutbound != null
      ? { outbound: fromApiOutbound, inbound: fromApiInbound || [] }
      : splitLegs(allSegs);

  const displaySegs = outbound.length ? outbound : allSegs;
  const firstSeg = displaySegs[0] || {};
  const lastSeg = displaySegs[displaySegs.length - 1] || {};

  const rawCode =
    firstSeg.airline_code || offer.airline_code || normalizeAirlineCode(offer.flight_number);
  const code = normalizeAirlineCode(rawCode) || rawCode || "";
  const flightNumber = formatFlightLabel(
    code,
    offer.flight_number || firstSeg.flight_number || ""
  );

  const mappedOutbound = displaySegs.map((s) =>
    mapSegment(
      s,
      offer.airline,
      formatFlightLabel(
        s.airline_code || code,
        s.flight_number || offer.flight_number
      ),
      null
    )
  );
  const mappedInbound = inbound.map((s) =>
    mapSegment(
      s,
      offer.airline,
      formatFlightLabel(
        s.airline_code || code,
        s.flight_number || offer.flight_number
      ),
      null
    )
  );

  const airlineName = canonicalizeAirlineName(
    offer.airline || firstSeg.airline,
    code
  );

  const layoverCodes = displaySegs
    .slice(0, -1)
    .map((s) => String(s.to || "").toUpperCase().slice(0, 3))
    .filter((c) => /^[A-Z]{3}$/.test(c));

  const carriers = [];
  const seenCarrier = new Set();
  for (const s of displaySegs) {
    const n = canonicalizeAirlineName(s.airline || offer.airline, s.airline_code || code);
    const key = String(n || "").toLowerCase();
    if (n && !seenCarrier.has(key)) {
      seenCarrier.add(key);
      carriers.push(n);
    }
  }

  const segmentFlightNos = displaySegs
    .map((s) =>
      formatFlightLabel(s.airline_code || code, s.flight_number || "")
    )
    .filter(Boolean);

  return {
    id: String(offer.id || offer.offer_id || ""),
    offer_id: offer.offer_id || offer.id,
    index: offer.index,
    raw: offer,
    airline: {
      name: airlineName,
      code,
      logo: offer.airline_logo || firstSeg.logo || null,
    },
    flightNumber,
    badge: opts.isBestValue || offer.is_cheapest ? "Best Value" : null,
    isBestValue: !!(opts.isBestValue || offer.is_cheapest),
    legLabel: opts.legLabel || null,
    legIndex: opts.legIndex || null,
    routeKey: opts.routeKey || null,
    routeLabel: opts.routeLabel || null,
    routeOrigin: opts.routeOrigin || null,
    routeDestination: opts.routeDestination || null,
    isSelfConnect: !!offer.self_connect,
    feederOfferId: offer.feeder_offer_id || null,
    haulOfferId: offer.haul_offer_id || null,
    connectHub: offer.connect_hub || null,
    departure: {
      time: offer.depart_time || "--:--",
      airport: offer.origin || firstSeg.from || "",
      date: shortDate(firstSeg.departure),
    },
    departureAt: firstSeg.departure || null,
    arrival: {
      time: offer.arrive_time || "--:--",
      airport: offer.destination || lastSeg.to || "",
      date: shortDate(lastSeg.arrival),
    },
    arrivalAt: lastSeg.arrival || null,
    duration: offer.duration || "-",
    durationMins: durationMinutes(offer.duration),
    stops: stopsLabel(offer.stops),
    stopsCount: Number(offer.stops) || Math.max(0, displaySegs.length - 1),
    layoverCodes,
    carriers,
    segmentFlightNos,
    dayOffset: arrivalDayOffset(firstSeg.departure, lastSeg.arrival),
    baggage,
    price: Number(offer.price) || 0,
    currency: currencySymbol(offer.currency),
    currencyCode: offer.currency || "INR",
    perPerson: true,
    price_base: offer.price_base ?? null,
    price_taxes: offer.price_taxes ?? null,
    price_fees: offer.price_fees ?? null,
    amenities,
    cabin: offer.cabin || null,
    fare_family: offer.fare_family || null,
    seats_remaining: coerceSeatsRemaining(offer.seats_remaining),
    refundable: typeof offer.refundable === "boolean" ? offer.refundable : null,
    changeable: typeof offer.changeable === "boolean" ? offer.changeable : null,
    has_refund_fee: offer.has_refund_fee === true,
    has_change_fee: offer.has_change_fee === true,
    terms_summary: Array.isArray(offer.terms_summary) ? offer.terms_summary : null,
    fares: mapFareOptions(offer),
    details: {
      flightInfo: {
        aircraft: firstSeg.aircraft || null,
        flightNumber: flightNumber || null,
      },
      amenities,
    },
    // Layover UI only within the outbound leg (never across OUTBOUND→INBOUND)
    hasLayover: displaySegs.length > 1,
    segments: mappedOutbound.length ? mappedOutbound : null,
    returnSegments: mappedInbound.length ? mappedInbound : null,
    returnSummary:
      inbound.length || offer.return_depart_time
        ? {
            departure: {
              time: offer.return_depart_time || timeOf(inbound[0]?.departure),
              airport: offer.return_origin || inbound[0]?.from || "",
            },
            arrival: {
              time: offer.return_arrive_time || timeOf(inbound[inbound.length - 1]?.arrival),
              airport:
                offer.return_destination || inbound[inbound.length - 1]?.to || "",
            },
            duration: offer.return_duration || "-",
            stops: stopsLabel(offer.return_stops),
          }
        : null,
  };
}

export { durationMinutes };
