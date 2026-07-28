import api from "@/services/api";
import { ENDPOINTS } from "@/services/endpoints";

/**
 * Hotel API — supervisor gateway (LiteAPI live inventory).
 */
export const hotelService = {
  search: async (params) => {
    try {
      return await api.get(ENDPOINTS.HOTELS.SEARCH, params);
    } catch (error) {
      const offline = !error.status;
      return {
        hotels: [],
        mode: "degraded",
        message: offline
          ? "Can't reach the hotel search service right now. Try again shortly — no sample stays are shown."
          : error.message || "Hotel search isn't available yet.",
        error: offline ? "hotel_search_unreachable" : `http_${error.status || "error"}`,
      };
    }
  },
};
