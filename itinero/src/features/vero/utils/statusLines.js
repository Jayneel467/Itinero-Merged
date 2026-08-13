/**
 * Intent-aware rotating status copy while /api/chat is in flight.
 * Tasteful, short - not spammy.
 */

const PLACE_RE =
  /\b(?:in|for|near|around|over|to)\s+([A-Za-z][A-Za-z .'-]{1,32}?)(?=\s+(?:next|this|on|for|in|,|\.|$)|$)/i;

const WEATHER_RE =
  /\b(weather|forecast|temperature|rain|raining|humidity|climate|radar|storm|sunny|cloudy)\b/i;
const FLIGHT_RE =
  /\b(flight|flights|fare|fares|airline|airlines|airport|fly|flying|depart|departure|ticket|tickets|udaan|tikit)\b|ફ્લાઇટ|વિમાન|उड़ान|फ्लाइट|^\s*[A-Za-z .'-]+\s+to\s+[A-Za-z .'-]+/i;
const HOTEL_RE =
  /\b(hotel|hotels|stay|stays|resort|resorts|accommodation|room|rooms|check[- ]?in)\b|હોટલ|होटल/i;
const FOOD_RE =
  /\b(food|restaurant|restaurants|eat|eating|dining|cafe|cafes|cuisine|lunch|dinner|brunch|menu)\b|ખાવાનું|खाना/i;
const ITINERARY_RE =
  /\b(itinerary|plan|trip|days?|weekend|vacation|holiday|visit|explore|sightseeing|things\s+to\s+do)\b|યોજના|यात्रा/i;
const HAS_DATE_RE =
  /\b(\d{1,2})\s*(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b|\b\d{4}-\d{2}-\d{2}\b|\b(tomorrow|today|next\s+week|this\s+weekend)\b|\b\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?\b/i;
const ROUTE_RE = /\b[A-Za-z][A-Za-z .'-]{1,24}\s+to\s+[A-Za-z][A-Za-z .'-]{1,24}\b/i;

function cleanPlace(raw) {
  if (!raw) return "";
  return String(raw)
    .replace(/\b(next|this|week|weekend|month|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.*$/i, "")
    .replace(/[.,!?;:]+$/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

export function extractPlace(message) {
  const m = String(message || "").match(PLACE_RE);
  const place = cleanPlace(m?.[1]);
  if (!place || place.length < 2 || place.length > 36) return "";
  // Avoid false positives like "to Delhi" when already classified as flights
  return place;
}

export function inferStatusIntent(message) {
  const text = String(message || "").trim();
  if (!text) return "general";
  if (WEATHER_RE.test(text)) return "weather";
  if (HOTEL_RE.test(text)) return "hotels";
  if (FOOD_RE.test(text)) return "food";
  if (FLIGHT_RE.test(text)) return "flights";
  if (ITINERARY_RE.test(text)) return "itinerary";
  return "general";
}

/**
 * True when the user is asking about flights but still owes a date (or similar).
 * Used so we don't cycle airline-search jokes while only clarifying slots.
 */
export function needsFlightClarification(message, options = {}) {
  if (options.forceSearch) return false;
  if (options.forceClarify) return true;
  const text = String(message || "").trim();
  if (!text) return false;
  const intent = inferStatusIntent(text);
  if (intent !== "flights" && !ROUTE_RE.test(text)) return false;
  // Slot-answer follow-ups ("Depart on 2026-08-15") already include a date → search.
  if (HAS_DATE_RE.test(text)) return false;
  // City pair or explicit flight words without a date → clarification.
  return ROUTE_RE.test(text) || FLIGHT_RE.test(text);
}

function weatherLines(place) {
  const where = place || "your destination";
  return [
    "Pinging the weather desk…",
    `Checking radar over ${where}…`,
    "Asking the clouds politely…",
    "Scanning next week's skies…",
    `Reading the forecast tea leaves for ${where}…`,
  ];
}

function flightLines() {
  return [
    "Calling flight radar…",
    "Lining up fares…",
    "Checking runway gossip…",
    "Sorting seats by charm and price…",
    "Whispering sweet deals to the airlines…",
  ];
}

function clarificationLines() {
  return [
    "Checking what I still need…",
    "Almost - just need a couple details…",
    "Opening the trip checklist…",
    "Gathering the missing pieces…",
  ];
}

function hotelLines(place) {
  const where = place ? ` in ${place}` : "";
  return [
    `Pulling stays${where}…`,
    "Checking live hotel rates…",
    "Sorting rooms by value…",
    "Opening the hotel desk…",
    "Finding a solid base for the trip…",
  ];
}

function foodLines(place) {
  const where = place ? ` in ${place}` : "";
  return [
    `Sniffing out restaurants${where}…`,
    "Asking locals where lunch lives…",
    "Following the good smells…",
    "Reading menus between the lines…",
    "Hunting for a table worth the trip…",
  ];
}

function itineraryLines(place) {
  const where = place ? ` for ${place}` : "";
  return [
    `Sketching a trip${where}…`,
    "Plotting your next adventure…",
    "Consulting my travel sixth sense…",
    "Packing imaginary bags…",
    "Balancing must-sees with nap time…",
  ];
}

function generalLines() {
  return [
    "Thinking this through…",
    "Opening my travel notebook…",
    "One sec - Vero's on it…",
    "Connecting a few dots…",
    "Brewing a useful answer…",
  ];
}

/**
 * Build a shuffled-ish rotation list for the inferred intent.
 * Starts with a stable first line so the UI doesn't feel random on paint.
 */
export function getStatusLines(message, options = {}) {
  if (needsFlightClarification(message, options)) {
    return clarificationLines();
  }
  const intent = options.forceSearch ? "flights" : inferStatusIntent(message);
  const place = extractPlace(message);
  let lines;
  switch (intent) {
    case "weather":
      lines = weatherLines(place);
      break;
    case "flights":
      lines = flightLines();
      break;
    case "hotels":
      lines = hotelLines(place);
      break;
    case "food":
      lines = foodLines(place);
      break;
    case "itinerary":
      lines = itineraryLines(place);
      break;
    default:
      lines = generalLines();
  }
  return lines.filter(Boolean);
}

/** Rotating voice-overlay status (Gujarati / Hindi / English). */
export function getVoiceStatusLines(message, lang) {
  const tag = String(lang || "").toLowerCase();
  const gu = tag.startsWith("gu");
  const hi = tag.startsWith("hi");
  const intent = inferStatusIntent(message);
  if (gu) {
    if (intent === "flights") {
      return ["ફ્લાઇટ શોધી રહી છું…", "ભાવ લાઇન કરી રહી છું…", "એરલાઇન સાથે વાત…"];
    }
    if (intent === "hotels") {
      return ["હોટલ જોઈ રહી છું…", "રેટ ચેક કરી રહી છું…", "સારી સ્ટે શોધી રહી છું…"];
    }
    if (intent === "itinerary") {
      return ["યોજના ગોઠવી રહી છું…", "દિવસો ગોઠવી રહી છું…"];
    }
    return ["વેરો વિચારે છે…", "થોડી રાહ જુઓ…", "જોડી રહી છું…"];
  }
  if (hi) {
    if (intent === "flights") {
      return ["फ्लाइट ढूंढ रही हूँ…", "किराया देख रही हूँ…", "एयरलाइन से बात…"];
    }
    if (intent === "hotels") {
      return ["होटल देख रही हूँ…", "रेट चेक कर रही हूँ…"];
    }
    return ["वेरो सोच रही है…", "एक पल…", "जोड़ रही हूँ…"];
  }
  return getStatusLines(message, { forceSearch: intent === "flights" });
}
