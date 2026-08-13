import api from "@/services/api";
import { ENDPOINTS } from "@/services/endpoints";

/** Booking select/prebook/complete - longer than search calendar, still hard-capped. */
const BOOKING_TIMEOUT_MS = 55_000;

function friendlyBookingError(error, fallback) {
  const raw = String(error?.message || error || "").trim();
  if (!raw) return fallback;
  // Strip noisy exception class prefixes from supervisor (`LiteAPIError: …`).
  const cleaned = raw.replace(/^(LiteAPIError|ValidationError|FlightAgentError):\s*/i, "");
  if (/unable to process prebook/i.test(cleaned)) {
    return (
      "Booking hold failed. Check passenger details (name, DOB, ID) match the ticket, " +
      "then try another flight or date."
    );
  }
  if (/timed out|timeout/i.test(cleaned)) {
    return cleaned;
  }
  if (error?.code === "unreachable") {
    return cleaned || "Can't reach the booking service on port 8000.";
  }
  return cleaned || fallback;
}

async function bookingPost(endpoint, body) {
  try {
    return await api.post(endpoint, body, { timeoutMs: BOOKING_TIMEOUT_MS });
  } catch (error) {
    return {
      ok: false,
      error: friendlyBookingError(error, "Booking request failed."),
      code: error?.code || "booking_request_failed",
    };
  }
}

/**
 * Manual flight search API - POST /api/flights/search → LiteAPI.
 * This is the classic booking search path (not the Vero chat agent).
 */
export const flightService = {
  search: async (params) => {
    try {
      return await api.post(ENDPOINTS.FLIGHTS.SEARCH, params, { timeoutMs: 120_000 });
    } catch (error) {
      const unreachable = error.code === "unreachable" || error.code === "timeout" || !error.status;
      return {
        session_id: params.session_id || crypto.randomUUID(),
        flights: [],
        mode: "degraded",
        message: unreachable
          ? error.code === "timeout"
            ? "Flight search timed out. Try again in a moment."
            : "Can't reach the flight search service. Check that the API is running on port 8000, then try again."
          : error.message ||
            "That search didn't go through. Try different dates or check back shortly.",
        error: unreachable
          ? error.code === "timeout"
            ? "flight_search_timeout"
            : "flight_search_unreachable"
          : error.code || `http_${error.status || "error"}`,
      };
    }
  },

  /**
   * Live min fares per date for the date strip / price calendar.
   * Returns { dates: [{ date, minPrice, currency }], mode, message }.
   */
  priceCalendar: async (params) => {
    try {
      return await api.post(ENDPOINTS.FLIGHTS.PRICE_CALENDAR, params, { timeoutMs: 60_000 });
    } catch (error) {
      const unreachable = error.code === "unreachable" || error.code === "timeout" || !error.status;
      return {
        dates: [],
        mode: "degraded",
        message: unreachable
          ? "Can't reach the flight search service for the price calendar."
          : error.message || "Price calendar unavailable right now.",
        error: unreachable ? "price_calendar_unreachable" : error.code || `http_${error.status || "error"}`,
      };
    }
  },

  /** Nearby metros + feeder hubs for Google-style connection pairing. */
  expandRoute: async (origin, destination) => {
    try {
      return await api.get(
        ENDPOINTS.FLIGHTS.EXPAND,
        { origin, destination },
        { timeoutMs: 20_000 }
      );
    } catch (error) {
      return {
        ok: false,
        origin,
        destination,
        origins: [],
        destinations: [],
        hubs: [],
        error: error?.code || error?.message || "route_expand_failed",
      };
    }
  },

  /** Live airport departures / arrivals / nearby. Never invents times. */
  airportBoard: async (code = "") => {
    try {
      return await api.get(
        ENDPOINTS.FLIGHTS.AIRPORT_BOARD,
        { code },
        { timeoutMs: 25_000 }
      );
    } catch (error) {
      const unreachable = error.code === "unreachable" || error.code === "timeout" || !error.status;
      return {
        ok: false,
        mode: "degraded",
        message: unreachable
          ? "Can't reach the airport board. Check the API on port 8000."
          : error.message || "Could not load the airport board.",
        airport: null,
      };
    }
  },

  /** Live flight status + optional ADS-B. Never invents gate/delay/pin. */
  track: async ({ flight, date = "" } = {}) => {
    try {
      return await api.get(ENDPOINTS.FLIGHTS.TRACK, { flight, date }, { timeoutMs: 20_000 });
    } catch (error) {
      const unreachable = error.code === "unreachable" || error.code === "timeout" || !error.status;
      return {
        ok: false,
        mode: "degraded",
        message: unreachable
          ? "Can't reach the flight tracker. Check the API on port 8000."
          : error.message || "Could not load live flight status.",
        track: null,
        gps_unable: true,
      };
    }
  },

  /** Airport autocomplete - place names + IATA codes via supervisor. */
  searchAirports: async (q, limit = 10) => {
    try {
      return await api.get(
        ENDPOINTS.FLIGHTS.AIRPORTS,
        { q, limit },
        { timeoutMs: 12_000 }
      );
    } catch (error) {
      return {
        ok: false,
        airports: [],
        error: error?.code || error?.message || "airport_suggest_failed",
      };
    }
  },

  select: (body) => bookingPost(ENDPOINTS.FLIGHTS.SELECT, body),

  prebook: (body) => bookingPost(ENDPOINTS.FLIGHTS.PREBOOK, body),

  /** Attach seats/bags (and any other LiteAPI ancillaries) after hold. */
  attachServices: (body) => bookingPost(ENDPOINTS.FLIGHTS.ATTACH_SERVICES, body),

  /** Issue ticket after prebook (+ Stripe / sandbox mock). */
  complete: (body) => bookingPost(ENDPOINTS.FLIGHTS.COMPLETE, body),

  getBooking: async (bookingId, extra = {}) => {
    try {
      const email = extra.email || extra.guestEmail || undefined;
      return await api.get(
        ENDPOINTS.BOOKINGS.FLIGHT_GET(bookingId),
        email ? { email } : {},
        { timeoutMs: 30_000 }
      );
    } catch (error) {
      return { ok: false, error: friendlyBookingError(error, "Could not load booking.") };
    }
  },

  cancelQuote: async (bookingId, extra = {}) => {
    try {
      const email = extra.email || extra.guestEmail || undefined;
      return await api.get(
        ENDPOINTS.BOOKINGS.FLIGHT_CANCEL_QUOTE(bookingId),
        email ? { email } : {},
        { timeoutMs: 30_000 }
      );
    } catch (error) {
      return { ok: false, error: friendlyBookingError(error, "Could not load cancel quote.") };
    }
  },

  cancelBooking: async (bookingId, extra = {}) => {
    try {
      return await api.post(
        ENDPOINTS.BOOKINGS.FLIGHT_CANCEL,
        {
          booking_id: bookingId,
          payment_id: extra.paymentId || extra.payment_id || undefined,
          expected_amount: extra.expectedAmount ?? extra.expected_amount ?? undefined,
          payment_provider: extra.paymentProvider || extra.payment_provider || undefined,
          email: extra.email || extra.guestEmail || undefined,
        },
        { timeoutMs: BOOKING_TIMEOUT_MS }
      );
    } catch (error) {
      return { ok: false, error: friendlyBookingError(error, "Could not cancel booking.") };
    }
  },

};
