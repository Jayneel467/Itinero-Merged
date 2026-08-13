/**
 * Derive 2-4 follow-up / answer chip labels from the last user ask + assistant reply.
 * Prefer API `suggestions` when present; this is the FE fallback.
 * When Vero asks a question, prefer short answer chips so the user can tap instead of type.
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

const NON_PLACES = new Set([
  "my trips",
  "my trip",
  "my profile",
  "my account",
  "my bookings",
  "left",
  "the left",
  "help",
  "support",
  "booking",
  "bookings",
  "profile",
  "account",
  "notifications",
  "saved",
  "flights",
  "hotels",
  "trains",
  "explore",
  "deals",
  "packages",
  "transits",
  "confirmation",
  "checkout",
  "payment",
  "passenger",
  "passengers",
]);

function guessPlace(userText, replyText) {
  const blob = `${userText || ""} ${replyText || ""}`;
  for (const place of KNOWN_PLACES) {
    if (new RegExp(`\\b${place}\\b`, "i").test(blob)) return place;
  }
  const m = blob.match(PLACE_RE);
  if (m?.[1]) {
    const candidate = titleCase(m[1]);
    const lower = candidate.toLowerCase();
    if (NON_PLACES.has(lower)) return null;
    const skip = /^(Week|Month|India|The|A|An|Next|This|That|Your|My)$/i;
    if (!skip.test(candidate.split(/\s+/)[0])) return candidate;
  }
  return null;
}

function detectIntent(userText, replyText) {
  const t = `${userText || ""} ${replyText || ""}`.toLowerCase();
  // Itinerary intent wins over hotel/flight keywords (e.g. "plan trip" + "both")
  if (
    /\b(itinerary|trip plan|day[- ]?by[- ]?day|\d+[-\s]?day|plan (a |my )?trip|full (trip|plan)|build (an? )?itinerary|create (an? )?(itinerary|trip))\b/.test(
      t
    )
  ) {
    return "itinerary";
  }
  if (/\b(weather|forecast|temperature|rain|humid)\b/.test(t)) return "weather";
  if (/\b(flight|flights|airfare|airline|fly|boarding|pnr|terminal|gate)\b/.test(t)) return "flights";
  if (/\b(restaurant|restaurants|food|eat|cuisine|cafe|dining)\b/.test(t)) return "food";
  if (/\b(hotel|hotels|resort|stay|accommodation)\b/.test(t)) return "hotels";
  if (/\b(visa|immigration)\b/.test(t)) return "visa";
  if (/\b(beach|beaches|things to do|attraction|activities)\b/.test(t)) return "activities";
  return "general";
}

/**
 * Short tap-to-answer chips when the assistant ends with a gathering question.
 * @returns {string[]|null}
 */
export function answerChipsFromQuestion(replyText = "") {
  const t = String(replyText || "").trim();
  if (!t || !/\?/.test(t.slice(-160))) return null;
  const q = t.toLowerCase();

  if (/\b(where (are you|you'?re) (flying|coming|leaving) from|origin|from which (city|airport)|which city (are you|do you) (start|leave))\b/.test(q)) {
    return ["Mumbai", "Delhi", "Bangalore", "Hyderabad"];
  }
  if (/\b(where (to|are you going)|which (city|destination)|destination)\b/.test(q) && !/\bhotel\b/.test(q)) {
    return ["Goa", "Manali", "Dubai", "Jaipur"];
  }
  if (/\b(when|dates?|check[- ]?in|check[- ]?out|how long|nights?|weekend)\b/.test(q)) {
    return ["This weekend", "Next week", "In 2 weeks", "3 nights"];
  }
  if (/\b(how many|travelers?|travellers?|adults?|guests?|people|passengers?)\b/.test(q)) {
    return ["Just me", "2 adults", "2 adults + 1 child", "Family of 4"];
  }
  if (/\b(budget|spend|price range|mid[- ]?range|premium)\b/.test(q)) {
    return ["Budget", "Mid-range", "Premium", "Flexible - just build the itinerary"];
  }
  // Never offer "flights or hotels or both" as browse chips - escalate phrasing
  if (/\b(flights?, hotels?, or both|find flights|hotels, or both)\b/.test(q)) {
    return [
      "Create the full itinerary with flights and hotels",
      "Yes - start with flights",
      "Hotels only for now",
    ];
  }
  if (/\b(shall i search|search for flights|ready to (search|start)|proceed)\b/.test(q)) {
    return [
      "Yes, search flights",
      "Skip flights - hotels only",
      "Just the day-by-day itinerary (no flights/hotels)",
    ];
  }
  if (/\b(lock in|pick one|which (one|hotel|flight)|select|more options|want me to)\b/.test(q)) {
    return [
      "Create the full itinerary",
      "Something cheaper",
      "Higher rated",
      "Looks good - continue",
    ];
  }
  if (/\b(meal|breakfast|board|room type)\b/.test(q)) {
    return ["Any room", "With breakfast", "Refundable only"];
  }
  if (/\b(one[- ]?way|round[- ]?trip|return)\b/.test(q)) {
    return ["One way", "Round trip"];
  }

  return null;
}

/**
 * @param {{ userText?: string, replyText?: string, apiSuggestions?: string[]|null, hasCards?: boolean }} opts
 * @returns {string[]}
 */
export function suggestFollowUps({
  userText = "",
  replyText = "",
  apiSuggestions = null,
  hasCards = false,
  pageContext = null,
} = {}) {
  if (Array.isArray(apiSuggestions) && apiSuggestions.length) {
    return apiSuggestions
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .slice(0, 4);
  }

  const intent = detectIntent(userText, replyText);
  const answerChips = answerChipsFromQuestion(replyText);
  if (answerChips?.length) {
    const last = (userText || "").trim().toLowerCase();
    return answerChips.filter((c) => c.trim().toLowerCase() !== last).slice(0, 4);
  }

  // Prefer left-page browsing chips when the user is on flights/hotels results
  // and hasn't steered into another intent yet.
  if (pageContext?.screen === "flights" && pageContext?.search && intent !== "hotels" && intent !== "itinerary") {
    return [
      "Show cheapest nonstop",
      "Morning departures only",
      "Compare top 3 options",
      "Which is best value?",
    ].slice(0, 4);
  }
  if (pageContext?.screen === "hotels" && pageContext?.search && intent !== "flights" && intent !== "itinerary") {
    return [
      "Cheaper stays",
      "4★ and above",
      "With free breakfast",
      "Best rated near center",
    ].slice(0, 4);
  }
  if (pageContext?.screen === "trips" && pageContext?.detail) {
    return [
      "Which terminal?",
      "What's my PNR?",
      "Add a hotel to this trip",
      "Explain this booking",
    ].slice(0, 4);
  }
  if (pageContext?.screen === "help") {
    const topic = pageContext?.help?.topic;
    if (topic === "refund") {
      return ["Start a refund", "Change my dates", "Open My Trips", "Resend confirmation email"].slice(0, 4);
    }
    if (topic === "flight") {
      return ["Track my flight", "Open Flights", "What about bags?", "Open My Trips"].slice(0, 4);
    }
    if (topic === "hotel") {
      return ["Open Hotels", "Wrong stay details", "Open My Trips", "Resend confirmation email"].slice(0, 4);
    }
    if (topic === "train") {
      return ["Check PNR", "Open Trains", "Track a train", "Open My Trips"].slice(0, 4);
    }
    return [
      "Open My Trips",
      "Resend confirmation email",
      "Help with a refund",
      "Talk to support",
    ].slice(0, 4);
  }
  if (pageContext?.screen === "profile") {
    return [
      "Show my upcoming trips",
      "Help me add a traveller",
      "Plan my next trip",
      "Open Flights",
    ].slice(0, 4);
  }
  if (pageContext?.screen === "notifications") {
    const watches = Number(pageContext?.alerts?.watches) || 0;
    if (watches) {
      return [
        "Check my watched routes",
        "Remind me about my next trip",
        "Open My Trips",
        "Watch BOM → DEL",
      ].slice(0, 4);
    }
    return [
      "Help me set a price watch",
      "Open My Trips",
      "How do trip reminders work?",
      "Watch BOM → DEL",
    ].slice(0, 4);
  }

  if (intent === "itinerary") {
    return [
      "Just the day-by-day itinerary (no flights/hotels)",
      "Create the full itinerary with flights and hotels",
      "Flexible mid-range budget",
      "Change dates",
    ].slice(0, 4);
  }

  if (hasCards) {
    return [
      "Create the full itinerary",
      "Something cheaper",
      "Higher rated",
      "Looks good - continue",
    ].slice(0, 4);
  }

  const place = guessPlace(userText, replyText);
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
        place ? `Hotels in ${p}` : "Find hotels",
        place ? `Weather in ${p}` : "Weather at destination",
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
        "Show more hotels",
        "Cheaper stays",
        place ? `Flights to ${p}` : "Search flights",
        place ? `Things to do in ${p}` : "Things to do nearby",
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

  const last = (userText || "").trim().toLowerCase();
  const bogus = (label) =>
    /\b(?:in|to|for|at)\s+my trips\b/i.test(label) ||
    /\bplan 3-day my trips\b/i.test(label);
  return chips
    .filter((c) => c.trim().toLowerCase() !== last)
    .filter((c) => !bogus(c))
    .slice(0, 4);
}
