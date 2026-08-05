import api from "@/services/api";
import { ENDPOINTS } from "@/services/endpoints";

/**
 * Hotel API — supervisor gateway → LiteAPI live inventory.
 * Never invents sample hotels or room prices.
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
          : error.message || "Hotel search failed.",
        error: offline ? "hotel_search_unreachable" : `http_${error.status || "error"}`,
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
};
