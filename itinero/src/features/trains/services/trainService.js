import api from "@/services/api";
import { ENDPOINTS } from "@/services/endpoints";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function friendlyTrainError(error) {
  const code = error?.code || "";
  if (code === "unreachable" || code === "timeout" || /can't reach|timed out|supervisor/i.test(String(error?.message || ""))) {
    return "Can't reach the trains service. Retry, or check the API on port 8000.";
  }
  return error?.message || "Could not load trains.";
}

export const trainService = {
  search: async (params = {}) => {
    let last = null;
    const query = { limit: 120, ...params };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await api.get(ENDPOINTS.TRAINS.SEARCH, query);
        if (Array.isArray(res?.trains)) return res;
        return {
          trains: [],
          total: 0,
          mode: res?.mode || "empty",
          message: res?.message || "No trains found.",
        };
      } catch (error) {
        last = error;
        const retryable = error?.code === "unreachable" || error?.code === "timeout";
        if (!retryable || attempt === 2) break;
        await sleep(500 * (attempt + 1));
      }
    }
    return {
      trains: [],
      total: 0,
      mode: "degraded",
      message: friendlyTrainError(last),
    };
  },

  track: async ({ number, start_day = 0 } = {}) => {
    try {
      return await api.get(ENDPOINTS.TRAINS.TRACK, { number, start_day });
    } catch (error) {
      return {
        ok: false,
        mode: "degraded",
        message: friendlyTrainError(error),
        track: null,
        stations: [],
        gps_unable: true,
        is_gps: false,
      };
    }
  },

  pnr: async ({ pnr } = {}) => {
    try {
      return await api.get(ENDPOINTS.TRAINS.PNR, { pnr });
    } catch (error) {
      return { ok: false, mode: "degraded", message: friendlyTrainError(error), pnr: null };
    }
  },

  stations: async (q = "", limit = 8) => {
    try {
      const res = await api.get(ENDPOINTS.TRAINS.STATIONS, { q, limit });
      return Array.isArray(res?.stations) ? res.stations : [];
    } catch {
      return [];
    }
  },

  fares: async ({ number, origin, destination, date, quota = "GN" } = {}) => {
    try {
      return await api.get(ENDPOINTS.TRAINS.FARES, { number, origin, destination, date, quota });
    } catch {
      return { ok: false, classes: [] };
    }
  },
};
