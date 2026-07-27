import api from "@/services/api";
import { ENDPOINTS } from "@/services/endpoints";

/** Booking select/prebook/complete — longer than search calendar, still hard-capped. */
const BOOKING_TIMEOUT_MS = 55_000;

function friendlyBookingError(error, fallback) {
  const raw = String(error?.message || error || "").trim();
  if (!raw) return fallback;
  // Strip noisy exception class prefixes from supervisor (`LiteAPIError: …`).
  const cleaned = raw.replace(/^(LiteAPIError|ValidationError|FlightAgentError):\s*/i, "");
  if (/unable to process prebook/i.test(cleaned)) {
    return (
      "Booking hold failed (LiteAPI). Check passenger details (name, DOB, ID) match the ticket, " +
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
 * Manual flight search API — POST /api/flights/search → LiteAPI.
 * This is the classic booking search path (not the Vero chat agent).
 */
export const flightService = {
  search: async (params) => {
    try {
      return await api.post(ENDPOINTS.FLIGHTS.SEARCH, params, { timeoutMs: 90_000 });
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

  select: (body) => bookingPost(ENDPOINTS.FLIGHTS.SELECT, body),

  prebook: (body) => bookingPost(ENDPOINTS.FLIGHTS.PREBOOK, body),

  /** Issue ticket after prebook (+ Payment SDK card when enabled). */
  complete: (body) => bookingPost(ENDPOINTS.FLIGHTS.COMPLETE, body),
};
