/**
 * Detect when a Vero chat message should filter/sort the left-page results
 * or open a new hotels/flights search on the left.
 */

import {
  AIRPORTS,
  findAirportByCityName,
  findAirportByCode,
} from "@/constants/airports";

const FLIGHT_FILTER_RE =
  /\b(cheap(est)?|lowest|budget|expensive|priciest|highest|fastest|shortest|non[- ]?stop|direct|morning|afternoon|evening|night|under|below|less than|indigo|akasa|vistara|spicejet|air india|emirates|qatar|filter|sort|show (me )?the|best (deal|value|price)|refundable|layover|stops?)\b/i;

const HOTEL_FILTER_RE =
  /\b(cheap(est)?|lowest|budget|under|below|star|rated|breakfast|cancel|airport|aiport|pool|filter|sort|show (me )?the|near|area|4\s*\*|5\s*\*)\b/i;

function iataPair(text) {
  const m = String(text || "").match(/\b([a-z]{3})\s*(?:to|→|-)\s*([a-z]{3})\b/i);
  if (!m) return null;
  return { origin: m[1].toUpperCase(), destination: m[2].toUpperCase() };
}

function resolveCityPair(originName, destName) {
  const o = findAirportByCityName(String(originName || "").trim());
  const d = findAirportByCityName(String(destName || "").trim());
  if (o?.code && d?.code && o.code !== d.code) {
    return { origin: o.code, destination: d.code };
  }
  return null;
}

function cityIataPair(text, { fuzzy = true } = {}) {
  const t = String(text || "");
  const iata = iataPair(t);
  if (iata) return iata;

  const fromTo = t.match(
    /\bfrom\s+([A-Za-z][A-Za-z .']{2,28}?)\s+to\s+([A-Za-z][A-Za-z .']{2,28})/i
  );
  if (fromTo) {
    const pair = resolveCityPair(fromTo[1], fromTo[2]);
    if (pair) return pair;
  }

  const toFrom = t.match(
    /\bto\s+([A-Za-z][A-Za-z .']{2,28}?)\s+from\s+([A-Za-z][A-Za-z .']{2,28})/i
  );
  if (toFrom) {
    const pair = resolveCityPair(toFrom[2], toFrom[1]);
    if (pair) return pair;
  }

  const destFrom = t.match(
    /\b([A-Za-z][A-Za-z .']{2,28}?)\s+from\s+([A-Za-z][A-Za-z .']{2,28})/i
  );
  if (destFrom && !/\bto\b/i.test(destFrom[0])) {
    const pair = resolveCityPair(destFrom[2], destFrom[1]);
    if (pair) return pair;
  }

  const m = t.match(
    /\b([A-Za-z][A-Za-z .']{2,28}?)\s+(?:thi|thaki|to|→|-)\s+([A-Za-z][A-Za-z .']{2,28})/i
  );
  if (m) {
    const pair = resolveCityPair(m[1], m[2]);
    if (pair) return pair;
  }
  if (!fuzzy) return null;
  return extractTwoCitiesInOrder(text);
}

/** Destination advice / saved shortlist - do not hijack into flight search. */
export function extractAdultsFromText(text) {
  if (!text) return null;
  const str = String(text);
  // Match "3 adults", "3 pax", "3 passengers", "3 people", "3 persons", "3 person", "3 travellers", "3 travelers", "3 members", "3 jano", "3 log", "3 adult"
  const m = str.match(/\b(\d+)\s*(?:adults?|passengers?|pax|people|travellers?|travelers?|persons?|person|members?|jano?|log)\b/i);
  if (m) {
    const num = parseInt(m[1], 10);
    if (!Number.isNaN(num) && num >= 1 && num <= 9) return num;
  }
  // Match "for 3 persons", "for 3", "mate 3", "3 mate", "3 ke liye"
  const forMatch = str.match(/\b(?:for|mate|ke liye)\s+(\d+)\b/i) || str.match(/\b(\d+)\s*(?:mate|ke liye)\b/i);
  if (forMatch) {
    const num = parseInt(forMatch[1], 10);
    if (!Number.isNaN(num) && num >= 1 && num <= 9) return num;
  }
  // Word forms
  const wordMatch = str.match(/\b(one|two|three|four|five|six|seven|eight|nine|ek|be|tran|char|paanch|do|teen)\s*(?:adults?|passengers?|pax|people|travellers?|travelers?|persons?|person|members?|jano?|log)?\b/i);
  if (wordMatch) {
    const map = {
      one: 1, ek: 1,
      two: 2, be: 2, do: 2,
      three: 3, tran: 3, teen: 3,
      four: 4, char: 4,
      five: 5, paanch: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
    };
    const hit = map[wordMatch[1].toLowerCase()];
    if (hit) return hit;
  }
  return null;
}

export function extractChildrenFromText(text) {
  if (!text) return 0;
  const m = String(text).match(/\b(\d+)\s*(?:children|child|kids?|kid|bachhe)\b/i);
  if (m) {
    const num = parseInt(m[1], 10);
    if (!Number.isNaN(num) && num >= 0 && num <= 9) return num;
  }
  return 0;
}

export function extractInfantsFromText(text) {
  if (!text) return 0;
  const m = String(text).match(/\b(\d+)\s*(?:infants?|infant|babies|baby)\b/i);
  if (m) {
    const num = parseInt(m[1], 10);
    if (!Number.isNaN(num) && num >= 0 && num <= 9) return num;
  }
  return 0;
}

export function extractRoomsFromText(text) {
  if (!text) return 1;
  const m = String(text).match(/\b(\d+)\s*(?:rooms?|room|kamra|kamre)\b/i);
  if (m) {
    const num = parseInt(m[1], 10);
    if (!Number.isNaN(num) && num >= 1 && num <= 9) return num;
  }
  return 1;
}

const HOTEL_MONTH_NAMES = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

export function extractHotelDatesFromText(text) {
  if (!text) return null;
  const str = String(text);

  // Pattern: "from 3 Oct to 7th Oct" / "from 3rd Oct to 7 Oct" / "from 3 to 7 Oct" / "3 Oct to 7 Oct 2026"
  const rangeMatch = str.match(
    /\b(?:from\s+)?(\d{1,2})(?:st|nd|rd|th)?\s*(?:(?:of\s+)?([a-z]+))?\s*(?:to|-|–|till|until)\s*(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?([a-z]+)(?:\s+(\d{4}))?\b/i
  );
  if (rangeMatch) {
    const day1 = parseInt(rangeMatch[1], 10);
    const m1Str = (rangeMatch[2] || rangeMatch[4] || "").toLowerCase();
    const day2 = parseInt(rangeMatch[3], 10);
    const m2Str = (rangeMatch[4] || "").toLowerCase();
    const yearStr = rangeMatch[5];

    const m1 = HOTEL_MONTH_NAMES[m1Str];
    const m2 = HOTEL_MONTH_NAMES[m2Str];
    if (m1 && m2 && day1 >= 1 && day1 <= 31 && day2 >= 1 && day2 <= 31) {
      const yr = yearStr ? parseInt(yearStr, 10) : new Date().getFullYear();
      const pad = (n) => String(n).padStart(2, "0");
      const checkIn = `${yr}-${pad(m1)}-${pad(day1)}`;
      const checkOut = `${yr}-${pad(m2)}-${pad(day2)}`;
      return { checkIn, checkOut };
    }
  }

  // Pattern ISO: "2026-10-03 to 2026-10-07"
  const isoMatch = str.match(/\b(\d{4}-\d{2}-\d{2})\s*(?:to|-|till)\s*(\d{4}-\d{2}-\d{2})\b/i);
  if (isoMatch) {
    return { checkIn: isoMatch[1], checkOut: isoMatch[2] };
  }

  return null;
}

export function isDestinationAdviceIntent(text) {
  const t = String(text || "");
  if (!t) return false;
  if (FLIGHT_ASK_RE.test(t) && /\b(from\s+.+\s+to\s+|→)\b/i.test(t)) return false;
  return (
    /\b(where should i go|go first|what else should i (?:look at|consider|see|try)|out of (?:my |those )?saves?|i saved|vibe and season|no booking quotes|recommend (?:a )?(?:place|destination|city)|shortlist|inspire me)\b/i.test(
      t
    ) ||
    (/\b(saved|saves)\b/i.test(t) &&
      /\b(where|first|look at|vibe|season|maybe)\b/i.test(t) &&
      !FLIGHT_ASK_RE.test(t))
  );
}

/** "mara surat goa flight book karvi che" → STV → GOI */
function extractTwoCitiesInOrder(text) {
  const lower = String(text || "").toLowerCase();
  if (!lower) return null;
  const ranked = [...AIRPORTS].sort(
    (a, b) => String(b.city || "").length - String(a.city || "").length
  );
  const hits = [];
  const seen = new Set();
  for (const a of ranked) {
    if (!a?.code || seen.has(a.code)) continue;
    const names = [a.city, ...(a.aliases || [])].filter(Boolean);
    let best = -1;
    for (const name of names) {
      const idx = lower.indexOf(String(name).toLowerCase());
      if (idx >= 0 && (best < 0 || idx < best)) best = idx;
    }
    if (best >= 0) {
      hits.push({ idx: best, code: a.code });
      seen.add(a.code);
    }
  }
  hits.sort((x, y) => x.idx - y.idx);
  if (hits.length < 2) return null;
  return { origin: hits[0].code, destination: hits[1].code };
}

export function looksLikeFlightListAction(text, pageContext) {
  if (pageContext?.screen !== "flights" || !pageContext.search?.origin) return false;
  const t = String(text || "").trim();
  if (!t) return false;
  if (/\b(itinerary|plan a trip|hotel stay|package)\b/i.test(t) && !/\bflight/i.test(t)) {
    return false;
  }
  const pair = cityIataPair(t);
  if (pair) {
    const o = String(pageContext.search.origin || "").toUpperCase();
    const d = String(pageContext.search.destination || "").toUpperCase();
    if (pair.origin !== o || pair.destination !== d) return false;
  }
  return FLIGHT_FILTER_RE.test(t);
}

export function looksLikeHotelListAction(text, pageContext) {
  if (pageContext?.screen !== "hotels" || !pageContext.search?.city) return false;
  const t = String(text || "").trim();
  if (!t) return false;
  if (/\b(flight|itinerary|plan a trip)\b/i.test(t)) return false;
  return HOTEL_FILTER_RE.test(t);
}

/** Action to apply on the left page from a chat message, or null. */
export function pageFilterActionFromMessage(text, pageContext) {
  if (pageContext?.screen === "flights" && pageContext.search?.origin) {
    if (isProceedIntent(text)) {
      return { type: "open_passenger_details" };
    }
    const airline = extractAirlinePick(text);
    if (airline && !/\b(hotel|package|itinerary)\b/i.test(text)) {
      return { type: "select_airline", airline, query: String(text).trim() };
    }
  }
  if (looksLikeFlightListAction(text, pageContext)) {
    return { type: "apply_nl_filter", query: String(text).trim() };
  }
  if (looksLikeHotelListAction(text, pageContext)) {
    return { type: "apply_nl_filter", query: String(text).trim() };
  }
  if (pageContext?.screen === "trains" && pageContext.search?.origin && pageContext.search?.destination) {
    const win = extractTrainWindow(text);
    const when = extractTrainWhen(text);
    if (win || when) {
      return {
        type: "search_trains",
        origin: pageContext.search.origin,
        destination: pageContext.search.destination,
        from_code: pageContext.search.from_code || "",
        to_code: pageContext.search.to_code || "",
        when: when || pageContext.search.when || "",
        window: win || pageContext.search.window || "",
      };
    }
  }
  if (
    (pageContext?.screen === "buses" || pageContext?.screen === "transits") &&
    pageContext.search?.origin &&
    pageContext.search?.destination
  ) {
    const win = extractTrainWindow(text);
    const when = extractTrainWhen(text);
    if (win || when) {
      return {
        type: "search_buses",
        origin: pageContext.search.origin,
        destination: pageContext.search.destination,
        when: when || pageContext.search.when || "",
        window: win || pageContext.search.window || "",
      };
    }
  }
  return null;
}

const HOTEL_ASK_RE =
  /\b(hotels?|stays?|accommodation|resorts?|where to stay|book( a)? (room|hotel)|show me hotels|find (a )?hotel|stay in)\b/i;

const FLIGHT_ASK_RE =
  /\b(flights?|fly|airfare|tickets?|tikit|udaan|book\s+kar(?:vi|o|u)?|flight\s+book)\b/i;

export function isBookingAffirmative(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 90) return false;
  return (
    /^(ha+|haan+|han|yes+|yeah|yep|ok+|okay|sure|book(?:\s+it)?|select|vadhara|vadharo|aagad|karo|barabar|બરાબર)\b/i.test(
      t
    ) || /\b(vadhara|aagad\s+vadhar|book\s+kari|haa+\s+vadhar|barabar|બરાબર)\b/i.test(t)
  );
}

const AIRLINE_PICK_RE =
  /\b(akasa(?:\s+air)?|indigo|spicejet|air india express|air india|vistara|emirates|qatar(?:\s+airways)?|etihad|go\s*first|alliance air)\b/i;

export function extractAirlinePick(text) {
  const m = String(text || "").match(AIRLINE_PICK_RE);
  return m ? m[1].trim() : null;
}

/** “proceed / continue / book it” → passenger details after a Vero pick. */
export function isProceedIntent(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 90) return false;
  return /\b(proceed|continue|checkout|check\s*out|passenger|guest\s*detail|go\s+ahead|next\s+step|book\s*(it|this|now)?|log\s+(that|this|it)|save\s+(that|this|it)|lock\s+(that|this|it)|take\s+(that|this|it))\b/i.test(
    t
  );
}

/** User explicitly does not want a hotel. */
export function isHotelDeclined(text) {
  const t = String(text || "");
  return /હોટલ\s*નથી|હોટલ\s*નહી|hotel\s*(nathi|nahi+|nahin|\bno\b|mat)|nathi\s*(book|kar)|don't\s+want\s+(a\s+)?hotel|no\s+hotel|skip\s+hotel|without\s+hotel|flights?\s*only|ફ્લાઇટ\s*જ|only\s+flight/i.test(
    t
  );
}

/** User explicitly does not want a flight. */
export function isFlightDeclined(text) {
  const t = String(text || "");
  return /ફ્લાઇટ\s*નથી|flight\s*(nathi|nahi+|nahin|\bno\b)|no\s+flight|skip\s+flight|hotels?\s*only|હોટલ\s*જ|only\s+hotel|ટ્રેન|train\s*m[aā]rfat|by\s+train|bus\s+thi/i.test(
    t
  );
}

export function isBusPreferred(text) {
  const t = String(text || "");
  return /બસ|\bbuses?\b|\bby\s+bus\b|બસ\s*થી/i.test(t);
}

const CAMPUS_GO_RE =
  /\b(pollock|polok|paterno|pattee|patty|petty pattern|hub|east halls|west halls|state college|penn state|cata|commons|im building|iim building|intramural|ist building)\b/i;

export function isCampusGoIntent(text) {
  const t = String(text || "");
  if (!CAMPUS_GO_RE.test(t)) return false;
  return /\b(from\s+.+\s+to\s+|go(?:ing)?\s+to|get to|how do i get|bus|transit|cata)\b/i.test(t);
}

export function extractCampusGoPair(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  const m = t.match(/\bfrom\s+(.+?)\s+to\s+(.+?)(?:[.?!]|$)/i);
  if (!m) return null;
  const origin = m[1].replace(/\b(please|hey|bro)\b/gi, " ").trim();
  const destination = m[2].replace(/\b(please|hey|bro)\b/gi, " ").trim();
  if (!origin || !destination) return null;
  return { origin, destination };
}

export function isTrainFoodIntent(text) {
  const t = String(text || "");
  if (
    /\b(e-?catering|food on (the )?train|meal (on|to) (the )?(train|berth)|order (food|meal).{0,24}(train|berth|pnr)|pantry car|irctc food)\b/i.test(
      t
    )
  ) {
    return true;
  }
  return /\b(food|meal|thali)\b/i.test(t) && /\b(pnr|berth|e-?cater)\b/i.test(t);
}

export function isTrainPreferred(text) {
  const t = String(text || "");
  if (isBusPreferred(t) || isTrainFoodIntent(t)) return false;
  return /ટ્રેન|ट्रेन|\btrains?\b|rail\b|irctc|\bby\s+car\b|રોડ\s*માર્ગે/i.test(t);
}

function extractTrainCities(text) {
  const t = String(text || "")
    .replace(/\s+/g, " ")
    .replace(
      /\b(via\s+)?(trains?|buses?|bus|railway|rail|irctc|afternoon|evening|morning|night|today|tomorrow|kal|કાલે|આજે|ટ્રેન|ट्रेन|બસ|બપોર|સાંજ|સવાર|lunch|dopahar|dupahar)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
  const toFrom = t.match(
    /\bto\s+([A-Za-z][A-Za-z .']{2,24}?)\s+from\s+([A-Za-z][A-Za-z .']{2,24})/i
  );
  if (toFrom) {
    return { origin: toFrom[2].trim(), destination: toFrom[1].trim() };
  }
  const fromTo = t.match(
    /\bfrom\s+([A-Za-z][A-Za-z .']{2,24}?)\s+(?:to|→)\s+([A-Za-z][A-Za-z .']{2,24})/i
  );
  if (fromTo) {
    return { origin: fromTo[1].trim(), destination: fromTo[2].trim() };
  }
  const destFrom = t.match(
    /\b([A-Za-z][A-Za-z .']{2,24}?)\s+from\s+([A-Za-z][A-Za-z .']{2,24})/i
  );
  if (destFrom && !/\bto\b/i.test(destFrom[0])) {
    return { origin: destFrom[2].trim(), destination: destFrom[1].trim() };
  }
  const arrow = t.match(
    /\b([A-Za-z][A-Za-z .']{2,24}?)\s+(?:thi|thaki|to|→|-)\s+([A-Za-z][A-Za-z .']{2,24})/i
  );
  if (arrow) {
    return { origin: arrow[1].trim(), destination: arrow[2].trim() };
  }
  return null;
}

function extractTrainWindow(text) {
  const t = String(text || "");
  if (/\b(afternoon|dopahar|dupahar|બપોર|lunch)\b/i.test(t)) return "afternoon";
  if (/\b(evening|sanj|સાંજ|शाम)\b/i.test(t)) return "evening";
  if (/\b(morning|savar|સવાર|सुबह)\b/i.test(t)) return "morning";
  if (/\b(night|raat|રાત|रात)\b/i.test(t)) return "night";
  return "";
}

function extractTrainWhen(text) {
  const t = String(text || "");
  if (/\b(tomorrow|kal|કાલે|कल)\b/i.test(t)) return "tomorrow";
  if (/\b(today|tonight|aaj|આજે|आज)\b/i.test(t)) return "today";
  return "";
}

const RAIL_LABELS = {
  ST: "Surat",
  UDN: "Udhna",
  BRC: "Vadodara",
  ADI: "Ahmedabad",
  MMCT: "Mumbai Central",
  CSMT: "Mumbai CSMT",
  BDTS: "Bandra Terminus",
  PUNE: "Pune",
  NDLS: "New Delhi",
  JP: "Jaipur",
  ABR: "Abu Road",
  MAS: "Chennai",
  SBC: "Bengaluru",
  BSB: "Varanasi",
  UDZ: "Udaipur",
  RJT: "Rajkot",
  VRL: "Veraval",
  DWK: "Dwarka",
  SNSI: "Shirdi",
  BME: "Barmer",
  JU: "Jodhpur",
  BKN: "Bikaner",
  AII: "Ajmer",
};

export function railDisplayName(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const code = raw.toUpperCase();
  if (/^[A-Z]{2,5}$/.test(code) && RAIL_LABELS[code]) return RAIL_LABELS[code];
  return raw.replace(/\s+Jn\.?$/i, "").trim() || raw;
}

export function busesSearchPath(action = {}) {
  const params = new URLSearchParams();
  const origin = String(action.origin || action.from || "").trim();
  const destination = String(action.destination || action.to || "").trim();
  if (origin) params.set("from", origin);
  if (destination) params.set("to", destination);
  if (action.when) params.set("when", String(action.when));
  if (action.window) params.set("window", String(action.window));
  if (action.date) params.set("date", String(action.date));
  const qs = params.toString();
  return qs ? `/transits?${qs}` : "/transits";
}

export function trainsSearchPath(action = {}) {
  const params = new URLSearchParams();
  const origin = railDisplayName(action.origin || action.from || action.from_code || "");
  const destination = railDisplayName(action.destination || action.to || action.to_code || "");
  if (origin) params.set("from", origin);
  if (destination) params.set("to", destination);
  if (action.from_code) params.set("fromCode", String(action.from_code).toUpperCase());
  if (action.to_code) params.set("toCode", String(action.to_code).toUpperCase());
  if (action.when) params.set("when", String(action.when));
  if (action.window) params.set("window", String(action.window));
  if (action.date) params.set("date", String(action.date));
  const qs = params.toString();
  return qs ? `/trains?${qs}` : "/trains";
}

export function trackTrainPath(action = {}) {
  const params = new URLSearchParams({ mode: "track" });
  if (action.number) params.set("number", String(action.number).replace(/\D/g, ""));
  if (action.start_day) params.set("start_day", String(action.start_day));
  return `/trains?${params}`;
}

export function trackFlightPath(action = {}) {
  const params = new URLSearchParams();
  const flight = String(action.flight || action.flight_iata || action.number || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
  if (flight) params.set("flight", flight);
  const date = String(action.date || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) params.set("date", date);
  const airport = String(action.airport || action.iata || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
  if (airport) params.set("airport", airport);
  const qs = params.toString();
  return qs ? `/flights/track?${qs}` : "/flights/track";
}

export function trackAirportPath(action = {}) {
  const code = String(action.airport || action.code || action.iata || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase();
  return code ? `/flights/track?airport=${encodeURIComponent(code)}` : "/flights/track";
}

export function openTripsPath(action = {}) {
  const id = String(action.tripId || action.trip_id || action.id || "").trim();
  return id ? `/trips/${encodeURIComponent(id)}` : "/trips";
}

export function pnrPath(action = {}) {
  const params = new URLSearchParams({ mode: "pnr" });
  if (action.pnr) params.set("pnr", String(action.pnr).replace(/\D/g, ""));
  return `/trains?${params}`;
}

export function trainFoodPath(action = {}) {
  const params = new URLSearchParams({ mode: "food" });
  const digits = String(action.pnr || "").replace(/\D/g, "");
  const tab =
    String(action.tab || "").toLowerCase() === "pnr" || /^\d{10}$/.test(digits) ? "pnr" : "train";
  params.set("tab", tab);
  if (/^\d{10}$/.test(digits)) params.set("pnr", digits);
  const number = String(action.number || action.train_number || "").replace(/\D/g, "");
  if (number) params.set("number", number);
  const boarding = String(action.boarding || action.from_code || action.from || "").trim();
  if (boarding) {
    params.set("from", boarding);
    if (/^[A-Za-z]{2,5}$/.test(boarding)) params.set("fromCode", boarding.toUpperCase());
  }
  const whenRaw = String(action.date || action.when || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(whenRaw)) params.set("date", whenRaw);
  else if (/^(today|tonight|aaj)$/i.test(whenRaw)) params.set("date", ymdPlusDays(0));
  else if (/^(tomorrow|kal)$/i.test(whenRaw)) params.set("date", ymdPlusDays(1));
  return `/trains?${params}`;
}

function ymdPlusDays(days = 0, from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const MONTH_INDEX = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

const MONTH_RE =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

function monthIndexFromName(name) {
  const k = String(name || "").toLowerCase();
  if (MONTH_INDEX[k] != null) return MONTH_INDEX[k];
  return MONTH_INDEX[k.slice(0, 3)] ?? MONTH_INDEX[k.slice(0, 4)] ?? null;
}

function toYmd(year, month0, day) {
  const d = new Date(year, month0, day);
  if (Number.isNaN(d.getTime()) || d.getDate() !== Number(day)) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Parse "29 aug", "Aug 29", "2026-08-29", "29/08", "કાલે", "બાવીસ ઓગસ્ટ" → YYYY-MM-DD (future). */
export function extractDepartDateFromText(text, now = new Date()) {
  let t = String(text || "").trim();
  if (!t) return null;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (/આવતી\s*કાલે|પરમ\s*દિવસે|परसों|\bparso\b|\bday\s+after\s+tomorrow\b/i.test(t)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    return toYmd(d.getFullYear(), d.getMonth(), d.getDate());
  }
  if (/કાલે|कल\b|\bkaale\b|\btomorrow\b/i.test(t)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return toYmd(d.getFullYear(), d.getMonth(), d.getDate());
  }

  const gujNum = {
    બાવીસ: 22, તેવીસ: 23, ચોવીસ: 24, પચ્ચીસ: 25, એકવીસ: 21, વીસ: 20,
    ત્રીસ: 30, એકત્રીસ: 31, बाईस: 22, तेईस: 23,
  };
  t = t.replace(/ઓગસ્ટ|ઑગસ્ટ|अगस्त/gi, "August");
  t = t.replace(/જુલાઈ|જુલાઇ|जुलाई/gi, "July");
  Object.entries(gujNum).forEach(([w, n]) => {
    t = t.replace(new RegExp(w, "gi"), String(n));
  });

  let m = t.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return toYmd(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  m = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RE})\\b(?:\\s*,?\\s*(20\\d{2}))?`, "i"));
  if (m) {
    const month0 = monthIndexFromName(m[2]);
    if (month0 == null) return null;
    const yearHint = m[3] ? Number(m[3]) : null;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let year = yearHint || now.getFullYear();
    let ymd = toYmd(year, month0, Number(m[1]));
    if (!ymd) return null;
    const parsed = new Date(year, month0, Number(m[1]));
    if (!yearHint && parsed < today) ymd = toYmd(year + 1, month0, Number(m[1]));
    return ymd;
  }

  m = t.match(new RegExp(`\\b(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:\\s*,?\\s*(20\\d{2}))?`, "i"));
  if (m) {
    const month0 = monthIndexFromName(m[1]);
    if (month0 == null) return null;
    const yearHint = m[3] ? Number(m[3]) : null;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let year = yearHint || now.getFullYear();
    let ymd = toYmd(year, month0, Number(m[2]));
    if (!ymd) return null;
    const parsed = new Date(year, month0, Number(m[2]));
    if (!yearHint && parsed < today) ymd = toYmd(year + 1, month0, Number(m[2]));
    return ymd;
  }

  return null;
}

export function isDateOnlyMessage(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 56 || !extractDepartDateFromText(t)) return false;
  const stripped = t
    .replace(/\b20\d{2}-\d{1,2}-\d{1,2}\b/g, " ")
    .replace(new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(${MONTH_RE})\\b`, "gi"), " ")
    .replace(new RegExp(`\\b(${MONTH_RE})\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, "gi"), " ")
    .replace(/\b(on|for|depart(?:ure)?|leave|leaving|fly|flying|please|the|date|try|instead)\b/gi, " ")
    .replace(/[,\s]+/g, " ")
    .trim();
  return stripped.length < 10;
}

export function extractCityFromText(text) {
  const lower = String(text || "").toLowerCase();
  const ranked = [...AIRPORTS].sort(
    (a, b) => String(b.city || "").length - String(a.city || "").length
  );
  for (const a of ranked) {
    const city = String(a.city || "").toLowerCase();
    if (city && lower.includes(city)) return a.city;
    for (const al of a.aliases || []) {
      if (String(al).toLowerCase() && lower.includes(String(al).toLowerCase())) return a.city;
    }
  }
  const m = String(text || "").match(
    /\b(?:in|to|at|for)\s+([A-Za-z][A-Za-z]+(?:\s+[A-Za-z]+){0,2})/i
  );
  if (!m) return null;
  const cand = m[1]
    .replace(/\b(hotels?|flights?|please|show|me|the|a|an|go)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cand.length < 3) return null;
  const known = findAirportByCityName(cand);
  return known?.city || cand.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** City name or IATA → IATA. "Surat" → STV, "BOM" → BOM. */
export function toIata(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^[A-Za-z]{3}$/.test(raw)) return raw.toUpperCase();
  const inParens = raw.match(/\(([A-Za-z]{3})\)/);
  if (inParens) return inParens[1].toUpperCase();
  const codeFirst = raw.match(/^([A-Za-z]{3})\b/);
  if (codeFirst && findAirportByCode(codeFirst[1])) return codeFirst[1].toUpperCase();
  return findAirportByCityName(raw)?.code || "";
}

export function hotelsSearchPath(action) {
  const city = String(action.city || "").trim();
  const params = new URLSearchParams();
  params.set("city", city);
  params.set("checkIn", action.check_in || action.checkIn || ymdPlusDays(7));
  params.set("checkOut", action.check_out || action.checkOut || ymdPlusDays(10));
  const adults = Number(action.adults || action.guests || 2);
  const children = Number(action.children || 0);
  params.set("adults", String(adults));
  params.set("children", String(children));
  params.set("guests", String(adults + children));
  params.set("rooms", String(action.rooms || 1));
  const ap = findAirportByCityName(city) || findAirportByCode(toIata(city));
  if (ap?.code) params.set("cityCode", ap.code);
  return `/hotels?${params.toString()}`;
}

export function flightsSearchPath(action) {
  const origin = toIata(action.origin);
  const destination = toIata(action.destination);
  const params = new URLSearchParams();
  params.set("from", origin);
  params.set("to", destination);
  params.set("depart", action.depart_date || action.departDate || ymdPlusDays(14));
  if (action.return_date || action.returnDate) {
    params.set("return", action.return_date || action.returnDate);
    params.set("trip", "return");
  } else {
    params.set("trip", action.trip || "oneway");
  }
  params.set("adults", String(action.adults || 1));
  if (action.children) params.set("children", String(action.children));
  if (action.infants) params.set("infants", String(action.infants));
  params.set("cabin", action.cabin || "Economy");
  return `/flights?${params.toString()}`;
}

export function packagesSearchPath(action = {}) {
  const params = new URLSearchParams();
  if (action.q) params.set("q", String(action.q));
  if (action.theme) params.set("theme", String(action.theme));
  if (action.region) params.set("region", String(action.region));
  if (action.max_price || action.maxPrice) {
    params.set("max_price", String(action.max_price || action.maxPrice));
  }
  const qs = params.toString();
  return qs ? `/packages?${qs}` : "/packages";
}

export function eventsSearchPath(action = {}) {
  const params = new URLSearchParams();
  if (action.city) params.set("city", String(action.city));
  if (action.keyword) params.set("keyword", String(action.keyword));
  if (action.classification) params.set("classification", String(action.classification));
  if (action.start || action.start_date) params.set("start", String(action.start || action.start_date));
  if (action.end || action.end_date) params.set("end", String(action.end || action.end_date));
  const qs = params.toString();
  return qs ? `/events?${qs}` : "/events";
}

/** Turn Vero chat cards into a left-page search so results aren't stuck in the drawer. */
export function navActionFromVeroCards(cards) {
  if (!cards || !Array.isArray(cards.items) || !cards.items.length) return null;
  const pick = cards.items[0] || {};
  if (cards.type === "flights") {
    const origin = toIata(pick.origin);
    const destination = toIata(pick.dest || pick.destination);
    if (!origin || !destination) return null;
    return {
      type: "search_flights",
      origin,
      destination,
      depart_date:
        extractDepartDateFromText(cards.subtitle || "") ||
        pick.depart_date ||
        pick.departDate ||
        undefined,
      trip: pick.return_date || pick.returnDate ? "return" : "oneway",
      return_date: pick.return_date || pick.returnDate || undefined,
      adults: pick.adults || extractAdultsFromText(cards.subtitle || "") || extractAdultsFromText(cards.title || "") || 1,
      children: pick.children || extractChildrenFromText(cards.subtitle || "") || 0,
      infants: pick.infants || extractInfantsFromText(cards.subtitle || "") || 0,
      cabin: pick.cabin || "Economy",
    };
  }
  if (cards.type === "hotels") {
    const city = String(pick.city || pick.destination || cards.subtitle || "")
      .replace(/\s+\d{4}-\d{2}-\d{2}.*$/, "")
      .trim();
    if (!city) return null;
    return {
      type: "search_hotels",
      city,
      check_in: pick.check_in || pick.checkIn,
      check_out: pick.check_out || pick.checkOut,
      guests: pick.guests || 2,
    };
  }
  if (cards.type === "packages") {
    return {
      type: "search_packages",
      q: pick.city || pick.destination || pick.title || cards.subtitle || "",
      theme: pick.theme || "",
    };
  }
  if (cards.type === "flight_track" && (pick.flight_iata || pick.flight)) {
    return {
      type: "track_flight",
      flight: pick.flight_iata || pick.flight,
      date: pick.date || "",
    };
  }
  if (cards.type === "airport_board" && (pick.airport || pick.iata || cards.track_path)) {
    return {
      type: "track_airport",
      airport: pick.airport || pick.iata || String(cards.title || "").match(/\b([A-Z]{3,4})\b/)?.[1] || "",
    };
  }
  if (cards.type === "train_track" && pick.number) {
    return { type: "track_train", number: pick.number };
  }
  if (cards.type === "trains") {
    const titlePair = String(cards.title || "").match(/([A-Z]{2,5})\s*[→\-]\s*([A-Z]{2,5})/);
    const origin = pick.from_name || pick.from_code || titlePair?.[1] || "";
    const destination = pick.to_name || pick.to_code || titlePair?.[2] || "";
    if (!origin || !destination) return null;
    return {
      type: "search_trains",
      origin,
      destination,
      from_code: pick.from_code || titlePair?.[1] || "",
      to_code: pick.to_code || titlePair?.[2] || "",
      window: /\b(morning|afternoon|evening|night)\b/i.exec(cards.subtitle || "")?.[1]?.toLowerCase() || "",
    };
  }
  if (cards.type === "buses") {
    const titlePair = String(cards.title || "").match(/(.+?)\s*[→\-]\s*(.+)/);
    const origin = pick.from_name || titlePair?.[1]?.trim() || "";
    const destination = pick.to_name || titlePair?.[2]?.trim() || "";
    if (!origin || !destination) return null;
    return {
      type: "search_buses",
      origin,
      destination,
      when: pick.date || "",
      window: /\b(morning|afternoon|evening|night)\b/i.exec(cards.subtitle || "")?.[1]?.toLowerCase() || "",
    };
  }
  return null;
}

function sameHotelCity(pageContext, city) {
  const current = String(pageContext?.search?.city || "").toLowerCase();
  if (pageContext?.screen !== "hotels" || !current || !city) return false;
  const want = String(city).toLowerCase();
  return current.includes(want) || want.includes(current.split(",")[0].trim());
}

/** Open hotels/flights on the left from chat (new search, not just filter). */
export function pageNavActionFromMessage(text, pageContext, knownRoute = null) {
  const t = String(text || "").trim();
  if (!t) return null;

  // Saved / vibe advice - let Vero answer; don't yank the left page to flights.
  if (isDestinationAdviceIntent(t) && !FLIGHT_ASK_RE.test(t)) {
    return null;
  }

  if (isProceedIntent(t) && pageContext?.screen !== "passenger_info") {
    return { type: "open_passenger_details" };
  }

  if (isCampusGoIntent(t)) {
    const pair = extractCampusGoPair(t);
    if (pair?.origin && pair?.destination) {
      return {
        type: "search_buses",
        origin: pair.origin,
        destination: pair.destination,
      };
    }
  }

  if (isTrainFoodIntent(t)) {
    const foodPnr = (t.match(/\b(?:pnr)\s*[:#-]?\s*(\d{10})\b/i) || t.match(/\b(\d{10})\b/))?.[1] || "";
    const number = (t.match(/\b(\d{4,5})\b/) || [])[1] || "";
    const board =
      (t.match(/\b(?:boarding|board(?:ing)? (?:at|from)|from)\s+([A-Za-z][A-Za-z .']{1,28}|[A-Z]{2,5})\b/i) ||
        [])[1] || "";
    const when = extractTrainWhen(t) || extractDepartDateFromText(t) || "";
    return {
      type: "order_train_food",
      tab: foodPnr ? "pnr" : "train",
      pnr: foodPnr,
      number,
      boarding: board.trim(),
      date: when,
    };
  }

  const pnrMatch = t.match(/\b(?:pnr)\s*[:#-]?\s*(\d{10})\b/i) || t.match(/\b(\d{10})\s*pnr\b/i);
  if (pnrMatch) {
    return { type: "check_pnr", pnr: pnrMatch[1] };
  }
  const airportBoard =
    t.match(
      /\b(?:departures?|arrivals?|on the ground|airport board|what(?:'s| is) (?:flying|departing|leaving))\b[\s\S]{0,40}?\b([A-Z]{3,4})\b/i
    ) ||
    t.match(
      /\b([A-Z]{3,4})\b[\s\S]{0,24}\b(?:departures?|arrivals?|airport board|on the ground)\b/i
    ) ||
    t.match(
      /\b(?:surat|ahmedabad|mumbai|delhi|pune|bengaluru|hyderabad|goa)\s+(?:airport\s+)?(?:departures?|arrivals?|board)\b/i
    );
  if (airportBoard && !/\b(train|vande|irctc|pnr|flight status|gate)\b/i.test(t)) {
    const named = {
      surat: "STV",
      ahmedabad: "AMD",
      mumbai: "BOM",
      delhi: "DEL",
      pune: "PNQ",
      bengaluru: "BLR",
      bangalore: "BLR",
      hyderabad: "HYD",
      goa: "GOI",
    };
    const fromName = Object.entries(named).find(([city]) => t.toLowerCase().includes(city));
    const code = String(airportBoard[1] || fromName?.[1] || "")
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase();
    if (code.length >= 3 && !/^\d+$/.test(code)) {
      return { type: "track_airport", airport: code };
    }
  }
  const flightTrack =
    t.match(
      /\b(?:track|live status|flight status|where(?:'s| is)|gate|delayed)\b[\s\S]{0,48}?\b([A-Z]{2,3}|[A-Z][A-Z0-9])\s*-?\s*(\d{1,4}[A-Z]?)\b/i
    ) ||
    t.match(
      /\b([A-Z]{2,3}|[A-Z][A-Z0-9])\s*-?\s*(\d{1,4}[A-Z]?)\b[\s\S]{0,28}\b(?:track|live status|flight status|where|gate|delayed|departed)\b/i
    );
  if (flightTrack && !/\b(train|vande|irctc|pnr)\b/i.test(t)) {
    const code = `${flightTrack[1]}${flightTrack[2]}`.replace(/\s+/g, "").toUpperCase();
    if (!/^\d{4,5}$/.test(code)) {
      return {
        type: "track_flight",
        flight: code,
        date: extractDepartDateFromText(t) || "",
      };
    }
  }
  const trackMatch =
    t.match(/\b(?:track|live status|running status|where(?:'s| is)|gps)\b[\s\S]{0,40}?\b(\d{4,5})\b/i) ||
    t.match(/\b(?:train|vande bharat)\s+(\d{4,5})\b[\s\S]{0,20}\b(?:track|live|where|status)\b/i);
  if (trackMatch || (/\b(track|live status|running status|where has .+ reached)\b/i.test(t) && /\b\d{4,5}\b/.test(t))) {
    const number = (trackMatch && trackMatch[1]) || (t.match(/\b(\d{4,5})\b/) || [])[1];
    if (number) return { type: "track_train", number };
  }

  if (isBusPreferred(t) && !FLIGHT_ASK_RE.test(t)) {
    const cities = extractTrainCities(t);
    if (cities?.origin && cities?.destination) {
      const win = extractTrainWindow(t);
      const when = extractTrainWhen(t);
      const sameOrigin = String(pageContext?.search?.origin || "").toLowerCase();
      const sameDest = String(pageContext?.search?.destination || "").toLowerCase();
      const sameCorridor =
        pageContext?.screen === "buses" &&
        sameOrigin &&
        sameDest &&
        (sameOrigin.includes(cities.origin.toLowerCase()) ||
          cities.origin.toLowerCase().includes(sameOrigin.split("(")[0].trim())) &&
        (sameDest.includes(cities.destination.toLowerCase()) ||
          cities.destination.toLowerCase().includes(sameDest.split("(")[0].trim()));
      if (sameCorridor && !win && !when) return null;
      if (sameCorridor && win && String(pageContext.search.window || "") === win && !when) return null;
      return {
        type: "search_buses",
        origin: cities.origin,
        destination: cities.destination,
        when,
        window: win,
      };
    }
  }

  if (isTrainPreferred(t) && !FLIGHT_ASK_RE.test(t)) {
    const cities = extractTrainCities(t);
    if (cities?.origin && cities?.destination) {
      const win = extractTrainWindow(t);
      const when = extractTrainWhen(t);
      const sameOrigin = String(pageContext?.search?.origin || "").toLowerCase();
      const sameDest = String(pageContext?.search?.destination || "").toLowerCase();
      const sameCorridor =
        pageContext?.screen === "trains" &&
        sameOrigin &&
        sameDest &&
        (sameOrigin.includes(cities.origin.toLowerCase()) ||
          cities.origin.toLowerCase().includes(sameOrigin.split("(")[0].trim()) ||
          String(pageContext.search.from_code || "").toLowerCase() === cities.origin.toLowerCase()) &&
        (sameDest.includes(cities.destination.toLowerCase()) ||
          cities.destination.toLowerCase().includes(sameDest.split("(")[0].trim()) ||
          String(pageContext.search.to_code || "").toLowerCase() === cities.destination.toLowerCase());
      if (sameCorridor && !win && !when) return null;
      if (sameCorridor && win && String(pageContext.search.window || "") === win && !when) return null;
      return {
        type: "search_trains",
        origin: cities.origin,
        destination: cities.destination,
        when,
        window: win,
      };
    }
  }

  if (HOTEL_ASK_RE.test(t)) {
    const city = extractCityFromText(t);
    if (city) {
      if (sameHotelCity(pageContext, city) && looksLikeHotelListAction(t, pageContext)) {
        return null;
      }
      const explicitAdults = extractAdultsFromText(t);
      const explicitChildren = extractChildrenFromText(t);
      const explicitRooms = extractRoomsFromText(t);
      const explicitDates = extractHotelDatesFromText(t);
      const adults = explicitAdults || 2;
      const children = explicitChildren || 0;
      const rooms = explicitRooms || 1;
      return {
        type: "search_hotels",
        city,
        adults,
        children,
        guests: adults + children,
        rooms,
        check_in: explicitDates?.checkIn,
        check_out: explicitDates?.checkOut,
      };
    }
    if (pageContext?.screen !== "hotels") {
      return { type: "open_hotels" };
    }
  }

  const explicitPair = cityIataPair(t, { fuzzy: false });
  const fuzzyPair =
    !explicitPair && (FLIGHT_ASK_RE.test(t) || /\b(book|search|find|show)\b/i.test(t))
      ? cityIataPair(t, { fuzzy: true })
      : null;
  const pair = explicitPair || fuzzyPair;
  const newDate = extractDepartDateFromText(t);
  const explicitAdults = extractAdultsFromText(t);
  const explicitChildren = extractChildrenFromText(t);
  const explicitInfants = extractInfantsFromText(t);

  // If user is on flights page and specifies a passenger count (e.g. "3 adults", "for 3 people", "3 persons")
  if (
    explicitAdults &&
    pageContext?.screen === "flights" &&
    pageContext.search?.origin &&
    pageContext.search?.destination &&
    Number(pageContext.search.adults || 1) !== explicitAdults
  ) {
    return {
      type: "search_flights",
      origin: String(pageContext.search.origin).toUpperCase(),
      destination: String(pageContext.search.destination).toUpperCase(),
      depart_date: newDate || pageContext.search.depart_date || pageContext.search.departDate,
      trip: pageContext.search.trip_type === "return" || pageContext.search.return_date ? "return" : "oneway",
      return_date: pageContext.search.return_date || undefined,
      adults: explicitAdults,
      children: explicitChildren || pageContext.search.children || 0,
      infants: explicitInfants || pageContext.search.infants || 0,
      cabin: pageContext.search.cabin || "Economy",
    };
  }

  if (pair && (FLIGHT_ASK_RE.test(t) || Boolean(explicitPair))) {
    const sameRoute =
      pageContext?.screen === "flights" &&
      String(pageContext.search?.origin || "").toUpperCase() === pair.origin &&
      String(pageContext.search?.destination || "").toUpperCase() === pair.destination;
    const sameAdults = !explicitAdults || Number(pageContext?.search?.adults || 1) === explicitAdults;
    if (sameRoute && !newDate && sameAdults) return null;
    return {
      type: "search_flights",
      origin: pair.origin,
      destination: pair.destination,
      depart_date: newDate || undefined,
      trip: "oneway",
      adults: explicitAdults || pageContext?.search?.adults || 1,
      children: explicitChildren || pageContext?.search?.children || 0,
      infants: explicitInfants || pageContext?.search?.infants || 0,
      cabin: pageContext?.search?.cabin || "Economy",
    };
  }

  const destOnly = extractCityFromText(t);
  const destCode = destOnly ? toIata(destOnly) : "";
  const retryOrFly =
    FLIGHT_ASK_RE.test(t) ||
    /\b(retry|check(?:ing)?|search(?:ing)?|find|again)\b/i.test(t);
  if (destCode && retryOrFly && !pair) {
    const origin =
      toIata(pageContext?.search?.origin) ||
      toIata(knownRoute?.origin) ||
      "";
    if (origin && origin !== destCode) {
      return {
        type: "search_flights",
        origin,
        destination: destCode,
        depart_date:
          newDate ||
          knownRoute?.depart_date ||
          pageContext?.search?.depart_date ||
          undefined,
        trip: "oneway",
        adults: explicitAdults || pageContext?.search?.adults || knownRoute?.adults || 1,
        children: explicitChildren || pageContext?.search?.children || knownRoute?.children || 0,
        infants: explicitInfants || pageContext?.search?.infants || knownRoute?.infants || 0,
        cabin: pageContext?.search?.cabin || "Economy",
      };
    }
  }

  if (
    newDate &&
    isDateOnlyMessage(t) &&
    pageContext?.screen === "flights" &&
    pageContext.search?.origin &&
    pageContext.search?.destination
  ) {
    if (String(pageContext.search.depart_date || "") === newDate && (!explicitAdults || Number(pageContext.search.adults || 1) === explicitAdults)) return null;
    return {
      type: "search_flights",
      origin: String(pageContext.search.origin).toUpperCase(),
      destination: String(pageContext.search.destination).toUpperCase(),
      depart_date: newDate,
      trip: pageContext.search.trip_type === "return" || pageContext.search.return_date ? "return" : "oneway",
      return_date: pageContext.search.return_date || undefined,
      adults: explicitAdults || pageContext.search.adults || 1,
      children: explicitChildren || pageContext.search.children || 0,
      infants: explicitInfants || pageContext.search.infants || 0,
      cabin: pageContext.search.cabin || "Economy",
    };
  }

  // Bare product switch - leave hotels/help/etc. and open the right left page.
  if (FLIGHT_ASK_RE.test(t) && !pair && !HOTEL_ASK_RE.test(t) && pageContext?.screen !== "flights") {
    return { type: "open_flights" };
  }
  if (HOTEL_ASK_RE.test(t) && !extractCityFromText(t) && pageContext?.screen !== "hotels") {
    return { type: "open_hotels" };
  }
  if (
    /\b(holiday packages?|tour packages?|trip packages?|show (?:me )?packages?|open packages?|search packages?)\b/i.test(
      t
    ) &&
    !/\bnot a package\b|\bpackage price\b|\bpackage prices\b/i.test(t) &&
    pageContext?.screen !== "packages" &&
    pageContext?.screen !== "package_detail"
  ) {
    return { type: "open_packages" };
  }
  if (
    /\b(trains?|irctc|railway)\b/i.test(t) &&
    !FLIGHT_ASK_RE.test(t) &&
    pageContext?.screen !== "trains"
  ) {
    return { type: "open_trains" };
  }
  if (
    /\b(buses?|transit|metro|cata|sitilink)\b/i.test(t) &&
    !FLIGHT_ASK_RE.test(t) &&
    pageContext?.screen !== "buses" &&
    pageContext?.screen !== "transits"
  ) {
    return { type: "open_buses" };
  }
  if (/\b(my trips?|my bookings?|cancel(?:lation)?)\b/i.test(t) && pageContext?.screen !== "trips") {
    return { type: "open_trips" };
  }
  if (
    /\b(buy (?:vero )?credits|vero credits|credit packs?|open plus)\b/i.test(t) &&
    pageContext?.screen !== "plus"
  ) {
    return { type: "open_plus" };
  }
  if (
    /\b(my (account|profile)|account (page|settings)|open (account|profile)|edit (my )?profile|saved travellers)\b/i.test(
      t
    ) &&
    pageContext?.screen !== "profile"
  ) {
    return { type: "open_profile" };
  }

  return null;
}
