/**
 * Application-wide configuration.
 * Single source of truth for env-based settings and feature flags.
 *
 * Manual flight/hotel search → API_BASE_URL (LiteAPI via FastAPI routes).
 * Ask Vero chat → same host is fine, but different endpoints (/api/chat).
 */

function resolveApiBaseUrl() {
  const fromEnv = (import.meta.env.VITE_API_URL || "").trim().replace(/\/$/, "");
  // Prefer explicit env; otherwise hit the local flights/booking API directly
  // (not the Vite page origin — avoids /itinero base-path / proxy confusion).
  if (fromEnv) return fromEnv;
  return "http://127.0.0.1:8000";
}

export const APP_CONFIG = {
  APP_NAME: "Itinero",

  /** Booking / flight-search API (POST /api/flights/search). Not the Vero chat agent. */
  API_BASE_URL: resolveApiBaseUrl(),

  /** Base path for client-side routing (matches vite.config.js `base`) */
  BASE_PATH: "/itinero",

  DEFAULT_CURRENCY: "INR",
  DEFAULT_LOCALE: "en-IN",

  FEATURES: {
    AI_CHAT: true,
    FLIGHT_BOOKING: true,
    HOTEL_BOOKING: false,
    DEALS: true,
    USER_AUTH: false,
    DARK_MODE: false,
  },

  PAGINATION: {
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
  },

  DEBOUNCE: {
    SEARCH: 300,
    RESIZE: 150,
    SCROLL: 100,
  },
};

export const BREAKPOINTS = {
  SM: 640,
  MD: 768,
  LG: 1024,
  XL: 1280,
  XXL: 1536,
};
