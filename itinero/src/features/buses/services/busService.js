import api from "@/services/api";
import { ENDPOINTS } from "@/services/endpoints";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function friendlyBusError(error) {
  const code = error?.code || "";
  if (code === "unreachable" || code === "timeout" || /can't reach|timed out|supervisor/i.test(String(error?.message || ""))) {
    return "Can't reach the buses service. Retry, or check the API on port 8000.";
  }
  return error?.message || "Could not load buses.";
}

export const busService = {
  suggestPlaces: async (q, limit = 8) => {
    const query = String(q || "").trim();
    if (query.length < 2) return [];
    try {
      const res = await api.get(ENDPOINTS.BUSES.PLACES, { q: query, limit });
      return Array.isArray(res?.places) ? res.places : [];
    } catch {
      return [];
    }
  },
  search: async (params = {}) => {
    let last = null;
    const query = { limit: 80, ...params };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await api.get(ENDPOINTS.BUSES.SEARCH, query);
        if (Array.isArray(res?.buses)) return res;
        return {
          buses: [],
          total: 0,
          mode: res?.mode || "empty",
          message: res?.message || "No buses found.",
          user_message: res?.user_message || "",
          region: res?.region || "",
          local: Boolean(res?.local),
        };
      } catch (error) {
        last = error;
        const retryable = error?.code === "unreachable" || error?.code === "timeout";
        if (!retryable || attempt === 2) break;
        await sleep(500 * (attempt + 1));
      }
    }
    return {
      buses: [],
      total: 0,
      mode: "degraded",
      message: friendlyBusError(last),
    };
  },
};
