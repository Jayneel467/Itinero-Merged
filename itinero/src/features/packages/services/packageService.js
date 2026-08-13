import api from "@/services/api";
import { ENDPOINTS } from "@/services/endpoints";

export const packageService = {
  list: async (params = {}) => {
    try {
      return await api.get(ENDPOINTS.PACKAGES.LIST, params);
    } catch (error) {
      return {
        packages: [],
        total: 0,
        mode: "degraded",
        message: error.message || "Could not load packages.",
      };
    }
  },

  get: async (id, params = {}) => {
    try {
      return await api.get(ENDPOINTS.PACKAGES.DETAIL(id), params);
    } catch (error) {
      return {
        package: null,
        mode: "degraded",
        message: error.message || "Package not found.",
      };
    }
  },

  quote: async (id, params = {}) => {
    try {
      return await api.get(ENDPOINTS.PACKAGES.QUOTE(id), params);
    } catch (error) {
      return {
        quote: null,
        mode: "degraded",
        message: error.message || "Quote failed.",
      };
    }
  },

  previewDay: async (id, params = {}) => {
    try {
      return await api.get(ENDPOINTS.PACKAGES.PREVIEW_DAY(id), params);
    } catch (error) {
      return { ok: false, message: error.message || "Preview failed." };
    }
  },

  hotels: async (id, params = {}) => {
    try {
      return await api.get(ENDPOINTS.PACKAGES.HOTELS(id), params);
    } catch (error) {
      return {
        hotels: [],
        mode: "degraded",
        message: error.message || "Hotel search failed.",
      };
    }
  },

  flights: async (id, params = {}) => {
    try {
      return await api.get(ENDPOINTS.PACKAGES.FLIGHTS(id), params);
    } catch (error) {
      return {
        flights: [],
        mode: "degraded",
        message: error.message || "Flight search failed.",
      };
    }
  },

  book: async (payload) => {
    try {
      return await api.post(ENDPOINTS.PACKAGES.BOOK, payload);
    } catch (error) {
      return {
        ok: false,
        message: error.message || "Booking failed.",
      };
    }
  },

  getBooking: async (id, email) => {
    try {
      const q = email ? `?email=${encodeURIComponent(email)}` : "";
      return await api.get(`${ENDPOINTS.PACKAGES.BOOKING(id)}${q}`);
    } catch (error) {
      return { booking: null, error: "not_found" };
    }
  },

  cancelBooking: async (id, email) => {
    try {
      return await api.post(ENDPOINTS.PACKAGES.CANCEL(id), { email });
    } catch (error) {
      return {
        ok: false,
        message: error.message || "Could not cancel package.",
      };
    }
  },

  sendConfirmationEmail: async (id, email) => {
    try {
      return await api.post(ENDPOINTS.PACKAGES.SEND_EMAIL(id), { email });
    } catch (error) {
      return {
        ok: false,
        message: error.message || "Could not send confirmation email.",
      };
    }
  },

  createItineroPaymentIntent: async (payload) => {
    try {
      return await api.post(ENDPOINTS.PACKAGES.ITINERO_PAYMENT_INTENT, payload);
    } catch (error) {
      return {
        ok: false,
        message: error.message || "Could not start Itinero payment.",
      };
    }
  },

  holdFlight: async (payload) => {
    try {
      return await api.post(ENDPOINTS.PACKAGES.FLIGHT_HOLD, payload);
    } catch (error) {
      return {
        ok: false,
        message: error.message || "Could not hold flights.",
      };
    }
  },
};
