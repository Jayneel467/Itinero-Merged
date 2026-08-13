/**
 * Application-wide configuration.
 * Single source of truth for env-based settings and feature flags.
 *
 * Manual flight/hotel search → API_BASE_URL (LiteAPI via FastAPI / supervisor).
 * Ask Vero chat → VERO_API_URL (general_agent.run - LLM orchestrator).
 */

function resolveApiBaseUrl() {
  const fromEnv = (import.meta.env.VITE_API_URL || "").trim().replace(/\/$/, "");
  // Dev: use Vite proxy (/api → :8000) to avoid CORS when port is 5174, etc.
  if (import.meta.env.DEV) {
    if (!fromEnv || /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(fromEnv)) {
      return "";
    }
  }
  if (fromEnv) return fromEnv;
  return "http://127.0.0.1:8000";
}

function resolveVeroApiBaseUrl() {
  const fromEnv = (import.meta.env.VITE_VERO_API_URL || "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  // Default: Vero orchestrator (general_agent.run) on 8001
  return "http://127.0.0.1:8001";
}

export const APP_CONFIG = {
  APP_NAME: "Itinero",

  /** Booking / flight-search API (POST /api/flights/search). Not the Vero chat agent. */
  API_BASE_URL: resolveApiBaseUrl(),

  /** Vero chat API (POST /api/chat) - general agent orchestrator. */
  VERO_API_BASE_URL: resolveVeroApiBaseUrl(),

  /** Base path for client-side routing (matches vite.config.js `base`) */
  BASE_PATH: "/itinero",

  DEFAULT_CURRENCY: "INR",
  DEFAULT_LOCALE: "en-IN",

  /** Stripe publishable key for LiteAPI Payment SDK (pk_test_… in sandbox). */
  STRIPE_PUBLISHABLE_KEY: (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || "").trim(),

  /** Itinero merchant Stripe - package flights / Itinero share (separate from LiteAPI). */
  ITINERO_STRIPE_PUBLISHABLE_KEY: (
    import.meta.env.VITE_ITINERO_STRIPE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ||
    ""
  ).trim(),

  /** Maps JavaScript API (browser). Restrict by HTTP referrer. Blank → OSM fallback. */
  GOOGLE_MAPS_API_KEY: (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim(),

  /** Google Sign-In (OAuth Web client id - public in browser). */
  GOOGLE_CLIENT_ID: (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim(),

  /** Acquisition measurement (optional). */
  GA_MEASUREMENT_ID: (import.meta.env.VITE_GA_MEASUREMENT_ID || "").trim(),
  META_PIXEL_ID: (import.meta.env.VITE_META_PIXEL_ID || "").trim(),

  /**
   * Travelpayouts Klook affiliate. Public campaign/marker only - wrap destination
   * URLs with tp.media/r. Blank marker hides partner CTAs.
   */
  KLOOK: {
    campaignId: (import.meta.env.VITE_KLOOK_TP_CAMPAIGN_ID ?? "137").trim(),
    marker: (import.meta.env.VITE_KLOOK_TP_MARKER ?? "723913").trim(),
    p: (import.meta.env.VITE_KLOOK_TP_P ?? "4110").trim(),
    trs: (import.meta.env.VITE_KLOOK_TP_TRS ?? "524247").trim(),
    locale: (import.meta.env.VITE_KLOOK_LOCALE || "en-IN").trim() || "en-IN",
  },

  FEATURES: {
    AI_CHAT: true,
    FLIGHT_BOOKING: true,
    HOTEL_BOOKING: true,
    DEALS: true,
    USER_AUTH: true,
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
