/**
 * Common airports for the search pickers (instant local results).
 * Full place search goes through supervisor GET /api/flights/airports.
 * Codes are IATA - used directly against LiteAPI via supervisor.
 */
export const AIRPORTS = [
  {
    id: "bom",
    city: "Mumbai",
    state: "Maharashtra, India",
    name: "Chhatrapati Shivaji Maharaj",
    code: "BOM",
    aliases: ["bombay"],
  },
  {
    id: "del",
    city: "New Delhi",
    state: "Delhi, India",
    name: "Indira Gandhi",
    code: "DEL",
    aliases: ["delhi"],
  },
  {
    id: "blr",
    city: "Bengaluru",
    state: "Karnataka, India",
    name: "Kempegowda",
    code: "BLR",
    aliases: ["bangalore"],
  },
  {
    id: "amd",
    city: "Ahmedabad",
    state: "Gujarat, India",
    name: "Sardar Vallabhbhai Patel",
    code: "AMD",
  },
  {
    id: "stv",
    city: "Surat",
    state: "Gujarat, India",
    name: "Surat",
    code: "STV",
  },
  {
    id: "hyd",
    city: "Hyderabad",
    state: "Telangana, India",
    name: "Rajiv Gandhi",
    code: "HYD",
  },
  {
    id: "maa",
    city: "Chennai",
    state: "Tamil Nadu, India",
    name: "Chennai International",
    code: "MAA",
    aliases: ["madras"],
  },
  {
    id: "ccu",
    city: "Kolkata",
    state: "West Bengal, India",
    name: "Netaji Subhas Chandra Bose",
    code: "CCU",
    aliases: ["calcutta"],
  },
  {
    id: "goi",
    city: "Goa",
    state: "Goa, India",
    name: "Goa International (Dabolim)",
    code: "GOI",
    aliases: ["dabolim", "goa dabolim"],
  },
  {
    id: "gox",
    city: "Goa",
    state: "Goa, India",
    name: "Manohar Intl (Mopa)",
    code: "GOX",
    aliases: ["mopa", "goa mopa"],
  },
  {
    id: "dxb",
    city: "Dubai",
    state: "UAE",
    name: "Dubai International",
    code: "DXB",
  },
  {
    id: "lon",
    city: "London",
    state: "UK",
    name: "Heathrow",
    code: "LHR",
  },
  {
    id: "nyc",
    city: "New York",
    state: "USA",
    name: "John F. Kennedy",
    code: "JFK",
    aliases: ["nyc", "jfk"],
  },
  {
    id: "cdg",
    city: "Paris",
    state: "France",
    name: "Charles de Gaulle",
    code: "CDG",
  },
  {
    id: "nrt",
    city: "Tokyo",
    state: "Japan",
    name: "Narita",
    code: "NRT",
  },
  {
    id: "dps",
    city: "Bali",
    state: "Indonesia",
    name: "Ngurah Rai",
    code: "DPS",
  },
  {
    id: "ixb",
    city: "Bagdogra",
    state: "West Bengal, India",
    name: "Bagdogra (Darjeeling region)",
    code: "IXB",
  },
  {
    id: "urt",
    city: "Surat Thani",
    state: "Thailand",
    name: "Surat Thani",
    code: "URT",
  },
  {
    id: "usm",
    city: "Ko Samui",
    state: "Thailand",
    name: "Ko Samui",
    code: "USM",
  },
  {
    id: "sub",
    city: "Surabaya",
    state: "East Java, Indonesia",
    name: "Juanda",
    code: "SUB",
  },
  {
    id: "sce",
    city: "State College",
    state: "Pennsylvania, USA",
    name: "University Park Airport",
    code: "SCE",
    aliases: [
      "state college",
      "penn state",
      "university park",
      "university park airport",
    ],
  },
  {
    id: "phl",
    city: "Philadelphia",
    state: "Pennsylvania, USA",
    name: "Philadelphia International",
    code: "PHL",
  },
  {
    id: "pit",
    city: "Pittsburgh",
    state: "Pennsylvania, USA",
    name: "Pittsburgh International",
    code: "PIT",
  },
  {
    id: "lax",
    city: "Los Angeles",
    state: "California, USA",
    name: "Los Angeles International",
    code: "LAX",
  },
  {
    id: "sfo",
    city: "San Francisco",
    state: "California, USA",
    name: "San Francisco International",
    code: "SFO",
  },
  {
    id: "ord",
    city: "Chicago",
    state: "Illinois, USA",
    name: "O'Hare International",
    code: "ORD",
  },
  {
    id: "ewr",
    city: "Newark",
    state: "New Jersey, USA",
    name: "Newark Liberty International",
    code: "EWR",
  },
  {
    id: "sin",
    city: "Singapore",
    state: "Singapore",
    name: "Changi",
    code: "SIN",
  },
  {
    id: "bkk",
    city: "Bangkok",
    state: "Thailand",
    name: "Suvarnabhumi",
    code: "BKK",
  },
];

/** Same-city airports - search all when the user picks the city. */
export const CITY_AIRPORT_GROUPS = {
  GOI: ["GOI", "GOX"],
  GOX: ["GOI", "GOX"],
  LHR: ["LHR", "LGW", "STN"],
  LGW: ["LHR", "LGW", "STN"],
  STN: ["LHR", "LGW", "STN"],
  JFK: ["JFK", "EWR", "LGA"],
  EWR: ["JFK", "EWR", "LGA"],
  LGA: ["JFK", "EWR", "LGA"],
};

/** Same-city metro fallback when the expand API is offline. */
export function expandAirportSearch(codes) {
  const out = [];
  const seen = new Set();
  for (const raw of codes || []) {
    const c = String(raw || "").toUpperCase();
    if (!/^[A-Z]{3}$/.test(c)) continue;
    const group = CITY_AIRPORT_GROUPS[c] || [c];
    for (const x of group) {
      if (!seen.has(x)) {
        seen.add(x);
        out.push(x);
      }
    }
  }
  return out.slice(0, 3);
}

export function findAirportByCode(code) {
  if (!code) return null;
  const c = String(code).toUpperCase();
  return AIRPORTS.find((a) => a.code === c) || null;
}

/** Known terminal hints only - never invent a gate. */
const AIRPORT_TIPS = {
  BOM: { terminals: "Terminal 1 & 2", tip: "Akasa and IndiGo domestic usually T2; SpiceJet often T1. Arrive 2 hours before departure." },
  DEL: { terminals: "Terminal 1, 2 & 3", tip: "Confirm T1 vs T3 on your e-ticket. Morning banks get busy - reach 2.5 hours early." },
  BLR: { terminals: "Terminal 1 & 2", tip: "Domestic usually T1. Follow Kempegowda signage for metro and cabs." },
  HYD: { terminals: "Domestic & International", tip: "One main terminal complex. Allow time for the airport metro / shuttle." },
  MAA: { terminals: "T1 (domestic) · T4 (international)", tip: "Check your e-ticket for terminal before you leave Chennai." },
  CCU: { terminals: "Domestic & International", tip: "Netaji Bose has separate wings - follow airline screens on arrival." },
  AMD: { terminals: "Domestic & International", tip: "Sardar Vallabhbhai Patel - arrive 2 hours early for morning flights." },
  STV: { terminals: "Domestic", tip: "Surat is a compact domestic airport. Reach 90 minutes before departure." },
  GOI: { terminals: "Dabolim", tip: "Older Goa airport (Dabolim / GOI). Confirm GOI vs Mopa (GOX) on your ticket." },
  GOX: { terminals: "Mopa", tip: "Manohar Intl (Mopa) is North Goa. Do not go to Dabolim if your ticket says GOX." },
  DXB: { terminals: "T1, T2 & T3", tip: "Gulf Air typically T1. Metro and taxis are well signed from arrivals." },
  LHR: { terminals: "T2, T3, T4 & T5", tip: "Heathrow terminal is on your e-ticket. Elizabeth Line / Piccadilly into central London." },
  JFK: { terminals: "T1, T4, T5, T7 & T8", tip: "JFK terminals are separate - check your airline before AirTrain." },
  EWR: { terminals: "A, B & C", tip: "Newark Liberty - AirTrain to NJ Transit / Amtrak at Newark Airport station." },
  SIN: { terminals: "T1-T4", tip: "Changi: follow flight number screens. Jewel / MRT is well signed from arrivals." },
  BKK: { terminals: "Main terminal", tip: "Suvarnabhumi - Airport Rail Link to downtown. Allow extra time at immigration." },
};

export function describeAirport(code) {
  const c = String(code || "").toUpperCase().slice(0, 3);
  const a = findAirportByCode(c);
  const tip = AIRPORT_TIPS[c] || {};
  return {
    code: c || "-",
    name: a?.name || c || "Airport",
    city: a?.city || "",
    region: a?.state || "",
    fullName: a ? `${a.name} Airport` : c ? `${c} Airport` : "Airport",
    location: [a?.city, a?.state].filter(Boolean).join(", "),
    terminals: tip.terminals || null,
    tip: tip.tip || "Check the airline app for terminal, gate and baggage belt before you leave.",
  };
}

/** Match a city/alias string (e.g. Mumbai, bombay, Delhi) to a known airport. */
export function findAirportByCityName(name) {
  const q = String(name || "").trim().toLowerCase();
  if (!q) return null;
  const ranked = [...AIRPORTS].sort(
    (a, b) => String(b.city || "").length - String(a.city || "").length
  );
  for (const a of ranked) {
    if (String(a.city || "").toLowerCase() === q) return a;
    if ((a.aliases || []).some((al) => String(al).toLowerCase() === q)) return a;
  }
  for (const a of ranked) {
    if (q.includes(String(a.city || "").toLowerCase())) return a;
    if ((a.aliases || []).some((al) => q.includes(String(al).toLowerCase()))) return a;
  }
  return null;
}

/** Local filter used before / alongside live suggest. */
export function filterAirportsLocal(searchQuery, list = AIRPORTS) {
  const q = String(searchQuery || "")
    .trim()
    .toLowerCase();
  if (!q) return list.slice(0, 12);
  const tokens = q.split(/[^a-z0-9]+/).filter(Boolean);
  return list.filter((airport) => {
    const aliases = (airport.aliases || []).join(" ");
    const hay = [
      airport.city,
      airport.name,
      airport.code,
      airport.state,
      aliases,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (hay.includes(q)) return true;
    return tokens.length > 0 && tokens.every((t) => hay.includes(t));
  });
}
