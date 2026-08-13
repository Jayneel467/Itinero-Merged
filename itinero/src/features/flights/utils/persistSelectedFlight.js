import {
  canonicalizeAirlineName,
  inferAirlineCode,
  airlineLogoUrl,
} from "./airlineIdentity";

function asLeg(obj, fallbackTime, fallbackAirport) {
  if (obj && (obj.time || obj.airport || obj.date)) {
    return {
      time: obj.time || "--:--",
      airport: String(obj.airport || "").toUpperCase(),
      date: obj.date || "",
    };
  }
  return {
    time: fallbackTime || "--:--",
    airport: String(fallbackAirport || "").toUpperCase(),
    date: "",
  };
}

/**
 * Save the live fare into sessionStorage so passenger-info / payment
 * show the same airline, logo, times, and price as the left results.
 */
export function persistSelectedFlight(flight) {
  if (!flight) return null;
  const rawName =
    flight.airline?.name ||
    (typeof flight.airline === "string" ? flight.airline : "") ||
    "";
  const name = canonicalizeAirlineName(rawName, flight.airline?.code);
  const code = inferAirlineCode(
    name,
    flight.flightNumber || flight.flight_number || flight.flight_code,
    flight.airline?.code || flight.airline_code
  );
  const logo =
    flight.airline?.logo ||
    flight.logo ||
    flight.airline_logo ||
    airlineLogoUrl(code);
  const payload = {
    id: flight.id || flight.offerId || flight.offer_id || flight.flight_id,
    offerId: flight.offer_id || flight.offerId || flight.id || flight.flight_id,
    price: flight.price,
    currency: flight.currencyCode || flight.currency || "INR",
    currencyCode: flight.currencyCode || flight.currency || "INR",
    airline: { name, code, logo },
    flightNumber:
      flight.flightNumber || flight.flight_number || flight.flight_code || "",
    departure: asLeg(flight.departure, flight.dep_time, flight.origin),
    arrival: asLeg(flight.arrival, flight.arr_time, flight.dest || flight.destination),
    departureAt: flight.departureAt || null,
    arrivalAt: flight.arrivalAt || null,
    duration: flight.duration || "",
    stops: flight.stops,
    stopsCount: flight.stopsCount ?? null,
    fare_family: flight.fare_family || flight.cabin || null,
    cabin: flight.cabin || flight.fare_family || null,
    baggage: flight.baggage || null,
    layoverCodes: flight.layoverCodes || null,
    carriers: flight.carriers || null,
    segmentFlightNos: flight.segmentFlightNos || null,
    aircraft: flight.aircraft || null,
    refundable: flight.refundable ?? null,
    isSelfConnect: !!flight.isSelfConnect,
    connectHub: flight.connectHub || null,
    feederOfferId: flight.feederOfferId || null,
    haulOfferId: flight.haulOfferId || null,
  };
  try {
    sessionStorage.setItem("itinero_selected_flight", JSON.stringify(payload));
  } catch {
    /* quota */
  }
  return payload;
}

const SESSION_KEY = "itinero_flight_session_id";

export function persistFlightSessionId(sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) return;
  try {
    sessionStorage.setItem(SESSION_KEY, sid);
  } catch {
    /* quota */
  }
}

export function readFlightSessionId() {
  try {
    return String(sessionStorage.getItem(SESSION_KEY) || "").trim();
  } catch {
    return "";
  }
}
