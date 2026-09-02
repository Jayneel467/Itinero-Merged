import { describeAirport } from "@/constants/airports";

const CHECKOUT_KEY = "itinero_flight_checkout";
const CONFIRM_KEY = "itinero_flight_confirmation";

/** Clock for ticket UI / PDF - never render raw ISO datetimes. */
export function formatFlightClock(value) {
  const s = String(value ?? "").trim();
  if (!s || s === "-" || s === "--:--") return "--:--";
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
    const [hh, mm] = s.split(":");
    return `${String(hh).padStart(2, "0")}:${mm}`;
  }
  const iso = s.match(/(?:T|\s)(\d{2}):(\d{2})/);
  if (iso) return `${iso[1]}:${iso[2]}`;
  try {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }
  } catch {
    /* ignore */
  }
  return s.length > 8 ? "--:--" : s;
}

/** Travel date label for ticket / PDF. */
export function formatFlightDate(value) {
  const s = String(value ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    try {
      const d = new Date(`${s.slice(0, 10)}T12:00:00`);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
      }
    } catch {
      /* ignore */
    }
    return s.slice(0, 10);
  }
  const iso = s.match(/(\d{4}-\d{2}-\d{2})T/);
  if (iso) return formatFlightDate(iso[1]);
  return s;
}

/** Prefer airline PNR over LiteAPI UUIDs for the printed booking reference. */
export function pickDisplayBookingRef(...candidates) {
  const list = candidates
    .flatMap((c) => (Array.isArray(c) ? c : [c]))
    .map((c) => String(c || "").trim())
    .filter(Boolean);
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const pnr = list.find((c) => !uuid.test(c) && c.length <= 24);
  return pnr || list[0] || null;
}

export function saveFlightCheckout(payload) {
  if (!payload?.flight) return null;
  const data = {
    ...payload,
    savedAt: new Date().toISOString(),
  };
  try {
    sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify(data));
    if (payload.flight) {
      sessionStorage.setItem("itinero_selected_flight", JSON.stringify(payload.flight));
    }
  } catch {
    /* quota */
  }
  return data;
}

export function readFlightCheckout() {
  try {
    return JSON.parse(sessionStorage.getItem(CHECKOUT_KEY) || "null");
  } catch {
    return null;
  }
}

export function saveFlightConfirmation(payload) {
  if (!payload) return null;
  try {
    sessionStorage.setItem(CONFIRM_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
  return payload;
}

export function readFlightConfirmation() {
  try {
    return JSON.parse(sessionStorage.getItem(CONFIRM_KEY) || "null");
  } catch {
    return null;
  }
}

export function checkoutAmount(flight) {
  const n = Number(flight?.price);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100) / 100;
}

export function checkoutCurrency(flight, fallback = "INR") {
  return (
    String(flight?.currencyCode || flight?.currency || fallback)
      .replace(/[^A-Z]/gi, "")
      .toUpperCase()
      .slice(0, 3) || fallback
  );
}

export function resolveFlightConfirmation(routeState) {
  if (routeState?.flight && (routeState.paymentId || routeState.bookingRef)) {
    return routeState;
  }
  const saved = readFlightConfirmation();
  if (saved?.flight) return saved;
  const checkout = readFlightCheckout();
  if (checkout?.flight) return checkout;
  try {
    const flight = JSON.parse(sessionStorage.getItem("itinero_selected_flight") || "null");
    if (flight) {
      return {
        flight,
        travelers: [],
        contact: {},
        amount: Number(flight.price) || 0,
        currency: flight.currencyCode || flight.currency || "INR",
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function confirmationFromFlightTrip(trip) {
  if (!trip) return null;
  const leg = (trip.legs || []).find((l) => l.type === "flight" && (l.bookingId || l.pnr || l.flightSnapshot));
  if (!leg) return null;
  const snap = leg.flightSnapshot && typeof leg.flightSnapshot === "object" ? leg.flightSnapshot : {};
  const origin = trip.origin || snap.departure?.airport || "";
  const dest = trip.destination || snap.arrival?.airport || "";
  const flight = {
    ...snap,
    airline: snap.airline || { name: leg.airline, code: leg.airlineCode },
    flightNumber: snap.flightNumber || leg.flightNumber,
    departure: snap.departure || { airport: origin, date: leg.departDate || trip.departDate, time: leg.departureTime },
    arrival: snap.arrival || { airport: dest, time: leg.arrivalTime },
    duration: snap.duration || leg.duration,
    stops: snap.stops ?? leg.stops,
    price: snap.price ?? leg.price,
    currency: snap.currency || leg.currency,
    cabin: snap.cabin,
  };
  return {
    flight,
    travelers: [],
    contact: trip.contact || {},
    paymentId: leg.paymentId || null,
    bookingRef: leg.pnr || leg.bookingId || null,
    supplierBookingId: leg.bookingId || null,
    amount: Number(leg.price || snap.price) || 0,
    currency: leg.currency || snap.currency || "INR",
    liteapi: { booking_id: leg.bookingId, airline_pnr: leg.pnr },
  };
}

export function confirmationToPdfBooking(confirmation, recap) {
  const c = confirmation || {};
  const f = c.flight || {};
  const lite = c.liteapi && typeof c.liteapi === "object" ? c.liteapi : {};
  const travelers = Array.isArray(c.travelers) ? c.travelers : [];
  const originCode = recap?.origin || f.departure?.airport;
  const destCode = recap?.dest || f.arrival?.airport;
  const depTime = formatFlightClock(
    recap?.depTime || f.departure?.time || f.departureAt || f.departure_at
  );
  const arrTime = formatFlightClock(
    recap?.arrTime || f.arrival?.time || f.arrivalAt || f.arrival_at
  );
  const travelDate = formatFlightDate(
    recap?.depDate || f.departure?.date || f.departureAt || f.departure_at
  );
  const displayRef = pickDisplayBookingRef(
    lite.airline_pnr,
    lite.booking_ref,
    c.bookingRef,
    lite.booking_id,
    c.supplierBookingId,
    c.paymentId
  );
  const retRecap = recap?.returnRecap;
  const retFlight = f.selectedReturn || f.returnSummary;
  const isRoundTrip = Boolean(retRecap || retFlight || f.selectedReturn || f.returnSummary);

  const segments_summary = [
    {
      from: originCode,
      to: destCode,
      airline: recap?.airlineName || f.airline?.name,
      airline_code: recap?.airlineCode || f.airline?.code,
      airline_logo: recap?.logo || f.airline?.logo || f.logo || "",
      flight_number: recap?.flightNo || f.flightNumber,
      departure: depTime,
      arrival: arrTime,
      date: travelDate,
      duration: recap?.duration || f.duration,
      stops: recap?.stops || f.stops,
      cabin: recap?.cabin || f.cabin,
      from_airport: describeAirport(originCode),
      to_airport: describeAirport(destCode),
      leg_label: isRoundTrip ? "Departing Flight" : undefined,
    },
  ];

  if (isRoundTrip && (retRecap || retFlight)) {
    const retOrigin = retRecap?.origin || retFlight?.departure?.airport || destCode;
    const retDest = retRecap?.dest || retFlight?.arrival?.airport || originCode;
    segments_summary.push({
      from: retOrigin,
      to: retDest,
      airline: retRecap?.airlineName || retFlight?.airline?.name || f.airline?.name,
      airline_code: retRecap?.airlineCode || retFlight?.airline?.code || f.airline?.code,
      airline_logo: retRecap?.logo || retFlight?.airline?.logo || f.airline?.logo || "",
      flight_number: retRecap?.flightNo || retFlight?.flightNumber || f.flightNumber,
      departure: formatFlightClock(retRecap?.depTime || retFlight?.departure?.time),
      arrival: formatFlightClock(retRecap?.arrTime || retFlight?.arrival?.time),
      date: formatFlightDate(retRecap?.depDate || retFlight?.departure?.date || f.returnDate),
      duration: retRecap?.duration || retFlight?.duration || "-",
      stops: retRecap?.stops || retFlight?.stops || "Direct",
      cabin: retRecap?.cabin || retFlight?.cabin || "Economy",
      from_airport: describeAirport(retOrigin),
      to_airport: describeAirport(retDest),
      leg_label: "Return Flight",
    });
  }

  return {
    booking_id: displayRef,
    airline_pnr: pickDisplayBookingRef(lite.airline_pnr, lite.booking_ref, displayRef),
    booking_ref: displayRef,
    airline: recap?.airlineName || f.airline?.name,
    airline_code: recap?.airlineCode || f.airline?.code || "",
    airline_logo: recap?.logo || f.airline?.logo || f.logo || "",
    status: paid ? "PAID" : "PENDING",
    payment_status: paid
      ? String(lite.payment_status || "completed")
      : "Not captured",
    timestamp: c.paidAt || c.savedAt || new Date().toISOString(),
    total_price: c.amount ?? f.price,
    currency: c.currency || f.currencyCode || f.currency || "INR",
    duration: recap?.duration || f.duration,
    cabin: recap?.cabin || f.cabin || f.fare_family,
    baggage_cabin: recap?.baggageCabin || f.baggage?.cabin || "",
    baggage_checked: recap?.baggageChecked || f.baggage?.checked || "",
    stops: recap?.stops || f.stops,
    travel_date: travelDate,
    origin_airport: describeAirport(originCode),
    dest_airport: describeAirport(destCode),
    contact: {
      email: c.contact?.email || "",
      phone: c.contact?.phone || "",
      phone_country_code: "91",
    },
    passengers: travelers.map((t) => ({
      first_name: t.firstName || t.first_name,
      last_name: t.lastName || t.last_name,
      passenger_type: normalizePassengerType(t.type || t.passengerType || t.passenger_type),
      date_of_birth: t.dob || t.date_of_birth,
    })),
    segments_summary,
  };
}

function normalizePassengerType(type) {
  if (typeof type === "number" && Number.isFinite(type)) return type;
  const s = String(type || "").trim().toLowerCase();
  if (s === "child" || s === "chd" || s === "1") return 1;
  if (s === "infant" || s === "inf" || s === "2") return 2;
  return 0;
}

export function bookingRefFromPayment(paymentId) {
  const tail = String(paymentId || "")
    .replace(/^pay_/i, "")
    .slice(-6)
    .toUpperCase();
  return tail ? `ITN-${tail}` : `ITN-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

const DEFAULT_DOC_EXPIRY = "2030-12-31";

/** Map passenger-info travelers into LiteAPI prebook slots. */
export function travelersToLitePassengers(travelers = []) {
  return (Array.isArray(travelers) ? travelers : []).map((t) => {
    const genderRaw = String(t.gender || "M").toUpperCase();
    const gender = genderRaw.startsWith("F") ? "F" : "M";
    const nationality = String(t.nationality || "IN")
      .replace(/[^A-Za-z]/g, "")
      .toUpperCase()
      .slice(0, 2) || "IN";
    return {
      first_name: String(t.firstName || t.first_name || "").trim(),
      last_name: String(t.lastName || t.last_name || "").trim(),
      birthday: t.dob || t.date_of_birth || t.birthday || "",
      gender,
      nationality,
      document_type: "PASSPORT",
      document_number: String(t.passport || t.documentNumber || t.document_number || "")
        .replace(/\s+/g, "")
        .slice(0, 15),
      document_expiry: t.documentExpiry || t.document_expiry || DEFAULT_DOC_EXPIRY,
      document_issue_country: nationality,
      passenger_type: normalizePassengerType(t.type || t.passengerType || t.passenger_type),
    };
  });
}
