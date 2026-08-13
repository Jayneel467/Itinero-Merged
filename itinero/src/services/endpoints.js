/**
 * API endpoint registry.
 * All API URLs defined in one place - never hardcode URLs in components.
 *
 * Usage:
 *   import { ENDPOINTS } from '@/services/endpoints';
 *   const data = await api.get(ENDPOINTS.FLIGHTS.SEARCH, params);
 */

export const ENDPOINTS = {
  // ── Supervisor gateway (local / production) ──
  HEALTH: "/api/health",
  CHAT: "/api/chat",
  FEEDBACK: "/api/feedback",

  MARKETING: {
    SUBSCRIBE: "/api/newsletter/subscribe",
    LEAD: "/api/marketing/lead",
    INTERESTS: "/api/me/interests",
    EVENTS: "/api/me/interest-events",
    SCORE: "/api/me/score",
    OFFERS: "/api/offers",
    VALIDATE_OFFER: "/api/offers/validate",
    GO: (slug) => `/api/go/${encodeURIComponent(slug)}`,
    ADMIN_STATS: "/api/admin/marketing/stats",
    ADMIN_OFFERS: "/api/admin/offers",
    ADMIN_SEGMENTS: "/api/admin/segments",
  },

  // ── Flights (LiteAPI via supervisor) ─────
  FLIGHTS: {
    SEARCH: "/api/flights/search",
    AIRPORTS: "/api/flights/airports",
    EXPAND: "/api/flights/airports/expand",
    PRICE_CALENDAR: "/api/flights/price-calendar",
    SELECT: "/api/flights/select",
    PREBOOK: "/api/flights/prebook",
    ATTACH_SERVICES: "/api/flights/attach-services",
    COMPLETE: "/api/flights/complete",
    TRACK: "/api/flights/track",
    AIRPORT_BOARD: "/api/flights/airport",
  },

  // ── Hotels (LiteAPI via supervisor) ─────
  HOTELS: {
    SEARCH: "/api/hotels/search",
    RATES: (id) => `/api/hotels/${encodeURIComponent(id)}/rates`,
    REVIEWS: (id) => `/api/hotels/${encodeURIComponent(id)}/reviews`,
    FEATURED_REVIEWS: "/api/hotels/reviews/featured",
    PREBOOK: "/api/hotels/prebook",
    ESIM_PACKAGES: (cc) => `/api/hotels/addons/esim/${encodeURIComponent(cc)}`,
    BOOK: "/api/hotels/book",
    BOOKING: (id) => `/api/hotels/bookings/${encodeURIComponent(id)}`,
    CANCEL: "/api/hotels/bookings/cancel",
  },

  // ── FX (Frankfurter via supervisor) ─
  FX: {
    RATES: "/api/fx/rates",
    CONVERT: "/api/fx/convert",
  },

  INTEGRATIONS: {
    LITEAPI: "/api/integrations/liteapi",
  },

  LOYALTY: {
    SETTINGS: "/api/loyalty/settings",
    ESTIMATE: "/api/loyalty/estimate",
    BALANCE: "/api/loyalty/balance",
    HISTORY: "/api/loyalty/history",
    REDEEM_QUOTE: "/api/loyalty/redeem-quote",
    REDEEM: "/api/loyalty/redeem",
  },

  // ── Events (Ticketmaster Discovery via supervisor) ─
  EVENTS: {
    SEARCH: "/api/events",
    DETAIL: (id) => `/api/events/${encodeURIComponent(id)}`,
  },

  TRAINS: {
    SEARCH: "/api/trains",
    STATIONS: "/api/trains/stations",
    TRACK: "/api/trains/track",
    PNR: "/api/trains/pnr",
    FARES: "/api/trains/fares",
  },

  BUSES: {
    SEARCH: "/api/buses",
    PLACES: "/api/places/suggest",
  },

  PLACES: {
    SUGGEST: "/api/places/suggest",
    PHOTO: "/api/places/photo",
  },

  // ── Packages (curated catalog + live stay) ─
  PACKAGES: {
    LIST: "/api/packages",
    DETAIL: (id) => `/api/packages/${encodeURIComponent(id)}`,
    QUOTE: (id) => `/api/packages/${encodeURIComponent(id)}/quote`,
    PREVIEW_DAY: (id) => `/api/packages/${encodeURIComponent(id)}/preview-day`,
    HOTELS: (id) => `/api/packages/${encodeURIComponent(id)}/hotels`,
    FLIGHTS: (id) => `/api/packages/${encodeURIComponent(id)}/flights`,
    BOOK: "/api/packages/book",
    BOOKING: (id) => `/api/packages/bookings/${encodeURIComponent(id)}`,
    CANCEL: (id) => `/api/packages/bookings/${encodeURIComponent(id)}/cancel`,
    SEND_EMAIL: (id) => `/api/packages/bookings/${encodeURIComponent(id)}/send-email`,
    ITINERO_PAYMENT_INTENT: "/api/packages/itinero-payment-intent",
    FLIGHT_HOLD: "/api/packages/flight-hold",
  },

  // ── Explore destinations (supervisor explore_factory) ─
  EXPLORE: {
    DESTINATIONS: "/api/explore/destinations",
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

  TRIPS: {
    LIST: "/api/trips",
    UPSERT: "/api/trips",
    ONE: (id) => `/api/trips/${encodeURIComponent(id)}`,
  },

  // ── Booking / Trips manage ──────────────
  PAYMENTS: {
    INTENT: "/api/payments/intent",
  },
  BOOKINGS: {
    FLIGHT_GET: (id) => `/api/flights/bookings/${encodeURIComponent(id)}`,
    FLIGHT_CANCEL_QUOTE: (id) => `/api/flights/bookings/${encodeURIComponent(id)}/cancel-quote`,
    FLIGHT_CANCEL: "/api/flights/bookings/cancel",
    HOTEL_GET: (id) => `/api/hotels/bookings/${encodeURIComponent(id)}`,
    HOTEL_CANCEL: "/api/hotels/bookings/cancel",
    RESEND_EMAIL: "/api/bookings/resend-email",
    SEND_EMAIL: "/api/bookings/send-email",
  },

  // ── Auth ────────────────────────────────
  AUTH: {
    OTP_SEND: "/api/v1/auth/otp/send",
    OTP_VERIFY: "/api/v1/auth/otp/verify",
    LOGIN: "/api/v1/auth/login",
    REGISTER: "/api/v1/auth/register",
    LOGOUT: "/api/v1/auth/logout",
    GOOGLE: "/api/v1/auth/google",
    REFRESH: "/api/v1/auth/refresh",
    PROFILE: "/api/v1/auth/profile",
  },

  // ── Vero AI (supervisor chat) ───────────
  VERO: {
    CHAT: "/api/chat",
    FILTER: "/api/vero/filter",
    SUGGESTIONS: "/api/v1/vero/suggestions",
    VOICE_STATUS: "/api/voice/status",
    VOICE_STT: "/api/voice/stt",
    VOICE_TTS: "/api/voice/tts",
  },
};
