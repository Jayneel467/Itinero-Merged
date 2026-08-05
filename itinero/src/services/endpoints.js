/**
 * API endpoint registry.
 * All API URLs defined in one place — never hardcode URLs in components.
 *
 * Usage:
 *   import { ENDPOINTS } from '@/services/endpoints';
 *   const data = await api.get(ENDPOINTS.FLIGHTS.SEARCH, params);
 */

export const ENDPOINTS = {
  // ── Supervisor gateway (local / production) ──
  HEALTH: "/api/health",
  CHAT: "/api/chat",

  // ── Flights (LiteAPI via supervisor) ─────
  FLIGHTS: {
    SEARCH: "/api/flights/search",
    PRICE_CALENDAR: "/api/flights/price-calendar",
    SELECT: "/api/flights/select",
    PREBOOK: "/api/flights/prebook",
    COMPLETE: "/api/flights/complete",
  },

  // ── Hotels (LiteAPI via supervisor) ─────
  HOTELS: {
    SEARCH: "/api/hotels/search",
    RATES: (id) => `/api/hotels/${encodeURIComponent(id)}/rates`,
  },

  // ── Destinations (not live on supervisor) ─
  DESTINATIONS: {
    LIST: "/api/v1/destinations",
    TRENDING: "/api/v1/destinations/trending",
    DETAILS: (id) => `/api/v1/destinations/${id}`,
  },

  // ── Deals ───────────────────────────────
  DEALS: {
    LIST: "/api/v1/deals",
    FEATURED: "/api/v1/deals/featured",
  },

  // ── Booking ─────────────────────────────
  BOOKINGS: {
    CREATE: "/api/v1/bookings",
    DETAILS: (id) => `/api/v1/bookings/${id}`,
    MY_BOOKINGS: "/api/v1/bookings/mine",
    CANCEL: (id) => `/api/v1/bookings/${id}/cancel`,
  },

  // ── Auth ────────────────────────────────
  AUTH: {
    LOGIN: "/api/v1/auth/login",
    REGISTER: "/api/v1/auth/register",
    LOGOUT: "/api/v1/auth/logout",
    REFRESH: "/api/v1/auth/refresh",
    PROFILE: "/api/v1/auth/profile",
  },

  // ── Vero AI (supervisor chat) ───────────
  VERO: {
    CHAT: "/api/chat",
    SUGGESTIONS: "/api/v1/vero/suggestions",
  },
};
