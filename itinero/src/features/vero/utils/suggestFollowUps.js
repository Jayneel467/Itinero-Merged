/**
 * Derive 2–4 follow-up chip labels from the last user ask + assistant reply.
 * Prefer API `suggestions` when present; this is the FE fallback.
 */

const PLACE_RE =
  /\b(?:in|at|to|for|near|around)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\b/;
const KNOWN_PLACES = [
  "Goa",
  "Mumbai",
  "Delhi",
  "Bangalore",
  "Bengaluru",
  "Hyderabad",
  "Chennai",
  "Kolkata",
  "Pune",
  "Ahmedabad",
  "Jaipur",
  "Kochi",
  "Surat",
  "Dubai",
  "Manali",
  "Shimla",
  "Udaipur",
  "Rishikesh",
  "Lonavala",
];

function titleCase(s) {
  return String(s || "")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function guessPlace(userText, replyText) {
  const blob = `${userText || ""} ${replyText || ""}`;
  for (const place of KNOWN_PLACES) {
    if (new RegExp(`\\b${place}\\b`, "i").test(blob)) return place;
  }
  const m = blob.match(PLACE_RE);
  if (m?.[1]) {
    const candidate = titleCase(m[1]);
    const skip = /^(Week|Month|India|The|A|An|Next|This|That|Your|My)$/i;
    if (!skip.test(candidate)) return candidate;
  }
  return null;
}

function detectIntent(userText, replyText) {
  const t = `${userText || ""} ${replyText || ""}`.toLowerCase();
  if (/\b(weather|forecast|temperature|rain|humid)\b/.test(t)) return "weather";
  if (/\b(flight|flights|airfare|airline|fly|boarding|pnr)\b/.test(t)) return "flights";
  if (/\b(restaurant|restaurants|food|eat|cuisine|cafe|dining)\b/.test(t)) return "food";
  if (/\b(hotel|hotels|resort|stay|accommodation)\b/.test(t)) return "hotels";
  if (/\b(itinerary|trip plan|day[- ]?by[- ]?day|\d+[-\s]?day|plan (a |my )?trip)\b/.test(t))
    return "itinerary";
  if (/\b(visa|immigration)\b/.test(t)) return "visa";
  if (/\b(beach|beaches|things to do|attraction|activities)\b/.test(t)) return "activities";
  return "general";
}

/**
 * @param {{ userText?: string, replyText?: string, apiSuggestions?: string[]|null }} opts
 * @returns {string[]}
 */
export function suggestFollowUps({ userText = "", replyText = "", apiSuggestions = null } = {}) {
  if (Array.isArray(apiSuggestions) && apiSuggestions.length) {
    return apiSuggestions
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .slice(0, 4);
  }

  const place = guessPlace(userText, replyText);
  const intent = detectIntent(userText, replyText);
  const p = place || "Goa";
  let chips = [];

  switch (intent) {
    case "weather":
      chips = [
        `Best beaches in ${p}`,
        `Where to eat in ${p}`,
        `Plan 3-day ${p} trip`,
        `Flights to ${p}`,
      ];
      break;
    case "flights":
      chips = [
        "Show cheapest option",
        "Try a different date",
        place ? `Weather in ${p}` : "Weather at destination",
        place ? `Where to eat in ${p}` : "Where to eat nearby",
      ];
      break;
    case "food":
      chips = [
        `Best cafes in ${p}`,
        `Vegetarian spots in ${p}`,
        `Things to do in ${p}`,
        `Flights to ${p}`,
      ];
      break;
    case "hotels":
      chips = [
        `Things to do in ${p}`,
        `Where to eat in ${p}`,
        `Flights to ${p}`,
        `Plan 3-day ${p} trip`,
      ];
      break;
    case "itinerary":
      chips = [
        `Flights to ${p}`,
        `Where to eat in ${p}`,
        `Best beaches in ${p}`,
        `Weather in ${p}`,
      ];
      break;
    case "activities":
      chips = [
        `Where to eat in ${p}`,
        `Weather in ${p}`,
        `Plan 3-day ${p} trip`,
        `Flights to ${p}`,
      ];
      break;
    case "visa":
      chips = [
        place ? `Flights to ${p}` : "Search flights",
        place ? `Plan a trip to ${p}` : "Plan a trip",
        "Weather tips for travelers",
      ];
      break;
    default:
      chips = place
        ? [
            `Weather in ${p}`,
            `Where to eat in ${p}`,
            `Plan 3-day ${p} trip`,
            `Flights to ${p}`,
          ]
        : [
            "Weather in Goa next week",
            "Mumbai to Delhi on 26 July",
            "Plan a 5-day trip to Surat",
            "Where to eat in Mumbai",
          ];
  }

  // De-dupe vs last user message (don't suggest what they just asked)
  const last = (userText || "").trim().toLowerCase();
  return chips
    .filter((c) => c.trim().toLowerCase() !== last)
    .slice(0, 4);
}
