import api from "@/services/api";
import { ENDPOINTS } from "@/services/endpoints";

export const eventService = {
  search: async (params = {}) => {
    try {
      return await api.get(ENDPOINTS.EVENTS.SEARCH, params);
    } catch (error) {
      return {
        events: [],
        total: 0,
        mode: "degraded",
        message: error.message || "Could not load events.",
      };
    }
  },

  get: async (id) => {
    try {
      return await api.get(ENDPOINTS.EVENTS.DETAIL(id));
    } catch (error) {
      return {
        event: null,
        mode: "degraded",
        message: error.message || "Event not found.",
      };
    }
  },
};
