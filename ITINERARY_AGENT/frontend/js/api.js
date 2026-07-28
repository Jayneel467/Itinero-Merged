/**
 * api.js — Thin REST client for the FastAPI backend.
 *
 * All functions return the parsed JSON body on success or throw an Error
 * with a human-readable message on failure.  The base URL auto-detects
 * the current host so no hardcoded ports are needed.
 */

const API_BASE = `${window.location.protocol}//${window.location.host}/api`;

/**
 * Core fetch wrapper — adds JSON headers, checks status, parses body.
 * @param {string} path  - e.g. "/chat"
 * @param {object} [options] - fetch init options
 */
async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const defaults = {
    headers: { 'Content-Type': 'application/json', ...options.headers },
  };
  const init = { ...defaults, ...options };
  if (init.body && typeof init.body === 'object') {
    init.body = JSON.stringify(init.body);
  }

  let res;
  try {
    res = await fetch(url, init);
  } catch (networkErr) {
    throw new Error('Network error — is the server running?');
  }

  let data;
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (!res.ok) {
    const msg = data.detail || data.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// ─── Session ─────────────────────────────────────────────────────────────────

/** Create a new session. Returns { session_id, welcome_message }. */
async function apiCreateSession() {
  return apiFetch('/session/create', { method: 'POST' });
}

/** Delete / reset a session. */
async function apiDeleteSession(sessionId) {
  return apiFetch(`/session/${sessionId}`, { method: 'DELETE' });
}

/** Get session status. */
async function apiGetSessionStatus(sessionId) {
  return apiFetch(`/session/${sessionId}/status`);
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

/**
 * Send a chat message.
 * @param {string} sessionId
 * @param {string} message
 * @returns {Promise<ChatResponse>}
 */
async function apiChat(sessionId, message) {
  return apiFetch('/chat', {
    method: 'POST',
    body: { session_id: sessionId, message },
  });
}

// ─── Flights ─────────────────────────────────────────────────────────────────

/**
 * Search flights (uses current session trip requirements).
 */
async function apiSearchFlights(sessionId, params = {}) {
  return apiFetch('/flight/search', {
    method: 'POST',
    body: { session_id: sessionId, ...params },
  });
}

/** Record user's flight selection. */
async function apiSelectFlight(sessionId, flightId) {
  return apiFetch('/flight/select', {
    method: 'POST',
    body: { session_id: sessionId, flight_id: flightId },
  });
}

/** Pre-book a flight. */
async function apiPrebookFlight(sessionId, flightId, numPassengers = 1) {
  return apiFetch('/flight/prebook', {
    method: 'POST',
    body: { session_id: sessionId, flight_id: flightId, num_passengers: numPassengers },
  });
}

// ─── Hotels ──────────────────────────────────────────────────────────────────

/** Search hotels. */
async function apiSearchHotels(sessionId, params = {}) {
  return apiFetch('/hotel/search', {
    method: 'POST',
    body: { session_id: sessionId, ...params },
  });
}

/** Select a hotel for a specific trip day. */
async function apiSelectHotel(sessionId, hotelId, dayNumber) {
  return apiFetch('/hotel/select', {
    method: 'POST',
    body: { session_id: sessionId, hotel_id: hotelId, day_number: dayNumber },
  });
}

/**
 * Bulk pre-book hotels.
 * @param {string} sessionId
 * @param {Array<{hotel_id: string, day_number: number}>} selections
 */
async function apiPrebookHotels(sessionId, selections) {
  return apiFetch('/hotel/prebook', {
    method: 'POST',
    body: { session_id: sessionId, selections },
  });
}

// ─── Itinerary ────────────────────────────────────────────────────────────────

/** Generate / retrieve draft itinerary. */
async function apiGetDraftItinerary(sessionId) {
  return apiFetch('/itinerary/draft', {
    method: 'POST',
    body: { session_id: sessionId },
  });
}

/** Generate / retrieve final itinerary. */
async function apiGetFinalItinerary(sessionId) {
  return apiFetch('/itinerary/final', {
    method: 'POST',
    body: { session_id: sessionId },
  });
}

// ─── Requirements Form ──────────────────────────────────────────────────────

/**
 * Submit trip requirements via the structured form (replaces chat-based collection).
 * @param {string} sessionId
 * @param {object} data - { departure_city, destination, departure_date, return_date, num_travelers, budget, trip_type, special_requests }
 * @returns {Promise<SubmitRequirementsResponse>}
 */
async function apiSubmitRequirements(sessionId, data) {
  return apiFetch('/requirements/submit', {
    method: 'POST',
    body: { session_id: sessionId, ...data },
  });
}

// ─── Itinerary Versioning ────────────────────────────────────────────────────

/**
 * List all saved itinerary versions for a session.
 * Returns { session_id, versions, active_version, total_versions }
 */
async function apiGetVersions(sessionId) {
  return apiFetch(`/itinerary/${sessionId}/versions`);
}

/**
 * Regenerate the itinerary with optional field overrides.
 * Saves as a new version without overwriting previous versions.
 * @param {string} sessionId
 * @param {object} overrides — partial TripRequirements fields to override
 * @param {string} [versionLabel] — optional custom label for the new version
 */
async function apiRegenerateItinerary(sessionId, overrides = {}, versionLabel = null) {
  return apiFetch('/itinerary/regenerate', {
    method: 'POST',
    body: {
      session_id: sessionId,
      version_label: versionLabel,
      ...overrides,
    },
  });
}

/**
 * Compare two itinerary versions.
 * @param {string} sessionId
 * @param {number} v1 — version number (1-based)
 * @param {number} v2 — version number (1-based)
 */
async function apiCompareVersions(sessionId, v1, v2) {
  return apiFetch('/itinerary/compare', {
    method: 'POST',
    body: { session_id: sessionId, v1, v2 },
  });
}

/**
 * Set the active itinerary version.
 * @param {string} sessionId
 * @param {number} versionNumber
 */
async function apiSetActiveVersion(sessionId, versionNumber) {
  return apiFetch('/itinerary/set-active', {
    method: 'POST',
    body: { session_id: sessionId, version_number: versionNumber },
  });
}
