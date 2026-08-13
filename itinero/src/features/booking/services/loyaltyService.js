import api from "@/services/api";
import { ENDPOINTS } from "@/services/endpoints";

export const loyaltyService = {
  settings: async () => {
    try {
      return await api.get(ENDPOINTS.LOYALTY.SETTINGS);
    } catch (error) {
      return { ok: false, enabled: false, message: error.message || "Loyalty unavailable." };
    }
  },

  estimate: async (amount, currency = "INR") => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return { ok: false, enabled: false };
    }
    try {
      return await api.get(ENDPOINTS.LOYALTY.ESTIMATE, {
        amount: amt,
        currency: currency || "INR",
      });
    } catch (error) {
      return { ok: false, enabled: false, message: error.message || "Could not estimate points." };
    }
  },

  balance: async () => {
    try {
      return await api.get(ENDPOINTS.LOYALTY.BALANCE);
    } catch (error) {
      return { ok: false, message: error.message || "Could not load balance." };
    }
  },

  history: async (limit = 30) => {
    try {
      return await api.get(ENDPOINTS.LOYALTY.HISTORY, { limit });
    } catch (error) {
      return { ok: false, events: [], message: error.message || "Could not load history." };
    }
  },

  redeemQuote: async (points, currency = "INR") => {
    try {
      return await api.get(ENDPOINTS.LOYALTY.REDEEM_QUOTE, {
        points: Number(points),
        currency: currency || "INR",
      });
    } catch (error) {
      return { ok: false, message: error.message || "Could not quote redemption." };
    }
  },

  redeem: async (points, currency = "INR") => {
    try {
      return await api.post(ENDPOINTS.LOYALTY.REDEEM, {
        points: Number(points),
        currency: currency || "INR",
      });
    } catch (error) {
      return {
        ok: false,
        message: error.message || "Could not reserve points for checkout.",
      };
    }
  },
};
