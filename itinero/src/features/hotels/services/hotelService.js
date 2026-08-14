import api from "@/services/api";
import { ENDPOINTS } from "@/services/endpoints";

/**
 * Hotel API - supervisor gateway → LiteAPI live inventory + book.
 * Default: LiteAPI Payment SDK (Stripe).
 */
export const hotelService = {
  search: async (params) => {
    try {
      return await api.get(ENDPOINTS.HOTELS.SEARCH, params);
    } catch (error) {
      const status = Number(error?.status) || 0;
      const offline = !status || status === 502 || status === 503 || status === 504;
      return {
        hotels: [],
        mode: "degraded",
        message: offline
          ? "Can't reach hotel search right now (API offline). Refresh in a moment - we never invent stays."
          : error.message || "Hotel search failed.",
        error: offline ? "hotel_search_unreachable" : `http_${status || "error"}`,
      };
    }
  },

  /** Live room rates for one hotel (POST LiteAPI /hotels/rates via supervisor). */
  getRates: async (hotelId, params) => {
    try {
      return await api.get(ENDPOINTS.HOTELS.RATES(hotelId), params);
    } catch (error) {
      const offline = !error.status;
      return {
        hotel: { id: hotelId },
        rooms: [],
        mode: "degraded",
        message: offline
          ? "Can't reach room rates right now. No sample rooms are shown."
          : error.message || "Room rates failed.",
        error: offline ? "hotel_rates_unreachable" : `http_${error.status || "error"}`,
      };
    }
  },

  getReviews: async (hotelId, limit = 20) => {
    try {
      return await api.get(ENDPOINTS.HOTELS.REVIEWS(hotelId), { limit });
    } catch (error) {
      return {
        ok: false,
        reviews: [],
        total: 0,
        error: error?.code || error?.message || "reviews_failed",
      };
    }
  },

  /** Homepage “Loved by Explorers” - live LiteAPI guest quotes (no invented reviews). */
  getFeaturedReviews: async (limit = 12) => {
    try {
      return await api.get(ENDPOINTS.HOTELS.FEATURED_REVIEWS, { limit });
    } catch (error) {
      return {
        ok: false,
        reviews: [],
        total: 0,
        error: error?.code || error?.message || "featured_reviews_failed",
        message: error?.message || "Could not load guest reviews.",
      };
    }
  },

  /** LiteAPI eSimply eSIM plans for destination country (ISO-2). */
  getEsimPackages: async (countryCode) => {
    try {
      return await api.get(ENDPOINTS.HOTELS.ESIM_PACKAGES(countryCode));
    } catch (error) {
      return {
        ok: false,
        packages: [],
        message: error.message || "Could not load eSIM plans.",
      };
    }
  },

  /** Hold room offer - LiteAPI Payment SDK (Stripe) by default. */
  prebook: async (body) => {
    try {
      // Availability miss may refresh rates + retry several offers.
      return await api.post(ENDPOINTS.HOTELS.PREBOOK, body, { timeoutMs: 120_000 });
    } catch (error) {
      return {
        ok: false,
        error: error?.code || "prebook_failed",
        message: error?.message || "Could not hold this room.",
      };
    }
  },

  /** Confirm stay after Stripe / Payment SDK (or sandbox mock). */
  book: async (body) => {
    try {
      return await api.post(ENDPOINTS.HOTELS.BOOK, body, { timeoutMs: 55_000 });
    } catch (error) {
      return {
        ok: false,
        error: error?.code || "book_failed",
        message: error?.message || "Could not confirm this stay.",
      };
    }
  },

  getBooking: async (bookingId, extra = {}) => {
    try {
      const email = extra.email || extra.guestEmail || undefined;
      return await api.get(ENDPOINTS.HOTELS.BOOKING(bookingId), email ? { email } : undefined);
    } catch (error) {
      return { ok: false, error: error?.message || "get_failed" };
    }
  },

  cancelBooking: async (bookingId, extra = {}) => {
    try {
      return await api.post(
        ENDPOINTS.HOTELS.CANCEL,
        {
          booking_id: bookingId,
          payment_id: extra.paymentId || extra.payment_id || undefined,
          expected_amount: extra.expectedAmount ?? extra.expected_amount ?? undefined,
          payment_provider: extra.paymentProvider || extra.payment_provider || undefined,
          email: extra.email || extra.guestEmail || undefined,
        },
        { timeoutMs: 40_000 }
      );
    } catch (error) {
      return { ok: false, error: error?.message || "cancel_failed" };
    }
  },

  amendBooking: async (body) => {
    try {
      return await api.post(ENDPOINTS.HOTELS.AMEND, body, { timeoutMs: 55_000 });
    } catch (error) {
      return { ok: false, error: error?.message || "amend_failed" };
    }
  },
};
