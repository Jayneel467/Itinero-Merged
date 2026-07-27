/**
 * Map supervisor FlightOffer → FlightCardDesign shape.
 * Never invent prices, baggage, amenities, or aircraft.
 */

function currencySymbol(code) {
  if (!code || code === "INR") return "₹";
  if (code === "USD") return "$";
  if (code === "EUR") return "€";
  return `${code} `;
}

function formatBaggageKg(kg) {
  if (kg == null || Number.isNaN(Number(kg))) return null;
  return `${Number(kg)}kg`;
}

function parseBaggage(offer) {
  const detail = offer.baggage_detail || {};
  const cabin =
    formatBaggageKg(detail.cabin_kg) ||
    (typeof offer.baggage === "string" && /cabin|carry/i.test(offer.baggage)
      ? offer.baggage
      : null);
  const checked =
    formatBaggageKg(detail.checked_kg) ||
    (typeof offer.baggage === "string" && /check/i.test(offer.baggage)
      ? offer.baggage
      : null);

  // Plain string baggage from LiteAPI (e.g. "1 PC") — show as checked if no split
  if (!cabin && !checked && typeof offer.baggage === "string" && offer.baggage.trim()) {
    return { cabin: null, checked: offer.baggage.trim() };
  }
  return { cabin, checked };
}

function stopsLabel(stops) {
  const n = Number(stops) || 0;
  if (n === 0) return "Direct";
  if (n === 1) return "1 Stop";
  return `${n} Stops`;
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
 * Round-trip offers include INBOUND segments — treating them as layovers
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

function mapSegment(s, fallbackAirline, fallbackFlightNumber, fallbackDuration) {
  return {
    departure: {
      time: timeOf(s.departure),
      airport: s.from || "",
      date: shortDate(s.departure),
    },
    arrival: {
      time: timeOf(s.arrival),
      airport: s.to || "",
      date: shortDate(s.arrival),
    },
    duration:
      s.duration_minutes != null
        ? `${Math.floor(s.duration_minutes / 60)}h ${String(s.duration_minutes % 60).padStart(2, "0")}m`
        : fallbackDuration || "—",
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
 * @param {{ isBestValue?: boolean }} opts
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

  const mappedOutbound = displaySegs.map((s) =>
    mapSegment(s, offer.airline, offer.flight_number, offer.duration)
  );
  const mappedInbound = inbound.map((s) =>
    mapSegment(s, offer.airline, offer.flight_number, offer.return_duration)
  );

  return {
    id: String(offer.id || offer.offer_id || ""),
    offer_id: offer.offer_id || offer.id,
    index: offer.index,
    raw: offer,
    airline: {
      name: offer.airline || "Airline",
      code: offer.flight_number || "",
      logo: offer.airline_logo || firstSeg.logo || null,
    },
    flightNumber: offer.flight_number || "",
    badge: opts.isBestValue || offer.is_cheapest ? "Best Value" : null,
    isBestValue: !!(opts.isBestValue || offer.is_cheapest),
    departure: {
      time: offer.depart_time || "--:--",
      airport: offer.origin || firstSeg.from || "",
      date: shortDate(firstSeg.departure),
    },
    arrival: {
      time: offer.arrive_time || "--:--",
      airport: offer.destination || lastSeg.to || "",
      date: shortDate(lastSeg.arrival),
    },
    duration: offer.duration || "—",
    durationMins: durationMinutes(offer.duration),
    stops: stopsLabel(offer.stops),
    stopsCount: Number(offer.stops) || 0,
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
    details: {
      flightInfo: {
        aircraft: firstSeg.aircraft || null,
        flightNumber: offer.flight_number || firstSeg.flight_number || null,
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
            duration: offer.return_duration || "—",
            stops: stopsLabel(offer.return_stops),
          }
        : null,
  };
}

export { durationMinutes };
