import api from "@/services/api";
import { ENDPOINTS } from "@/services/endpoints";

const FREE = {
  ok: true,
  plan: "credits",
  veroFree: true,
  loyaltyMultiplier: 1,
  savedTravellersLimit: 8,
  priceWatchLimit: 8,
  priceAlerts: true,
  memberDeals: false,
  prioritySupport: false,
  signedIn: false,
  stripeConfigured: false,
  dailyCredits: 25,
  credits: null,
};

export const billingService = {
  plans: async (currency = "INR") => {
    try {
      return await api.get(ENDPOINTS.BILLING.PLANS, { currency });
    } catch (error) {
      return { ok: false, veroFree: true, plans: [], packs: [], message: error.message };
    }
  },

  me: async () => {
    try {
      return await api.get(ENDPOINTS.BILLING.ME);
    } catch {
      return { ...FREE };
    }
  },

  checkout: async ({ packId = "traveler", currency = "INR", interval = "month" } = {}) => {
    return api.post(ENDPOINTS.BILLING.CHECKOUT, {
      pack_id: packId,
      currency,
      interval,
    });
  },

  completeCheckout: async (sessionId) => {
    return api.post(ENDPOINTS.BILLING.CHECKOUT_COMPLETE, { session_id: sessionId });
  },

  portal: async () => api.post(ENDPOINTS.BILLING.PORTAL, {}),

  credits: async () => {
    try {
      return await api.get(ENDPOINTS.BILLING.CREDITS);
    } catch {
      return { ok: false, veroFree: true, remaining: null };
    }
  },
};

/** @deprecated Plus subscriptions retired — always false. */
export function isPlus() {
  return false;
}
