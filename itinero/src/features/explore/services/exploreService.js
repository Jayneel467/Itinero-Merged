import api from "@/services/api";
import { ENDPOINTS } from "@/services/endpoints";
import { applyRemoteExploreCatalog } from "../data/catalog";

export const exploreService = {
  listDestinations: async (params = {}) => {
    try {
      return await api.get(ENDPOINTS.EXPLORE.DESTINATIONS, params);
    } catch (error) {
      return {
        destinations: [],
        total: 0,
        mode: "degraded",
        message: error.message || "Could not load Explore destinations.",
      };
    }
  },

  /** Fetch + merge into the live Explore catalog used by ranking. */
  hydrateCatalog: async (params = {}) => {
    const res = await exploreService.listDestinations(params);
    const list = Array.isArray(res.destinations) ? res.destinations : [];
    if (list.length) applyRemoteExploreCatalog(list);
    return res;
  },
};
