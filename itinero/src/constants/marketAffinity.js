/**
 * Home-market affinity for Explore + Packages.
 * Domestic is relative to the traveller’s home country - never hardcode India for everyone.
 */

const COUNTRY_ALIASES = {
  USA: "US",
  "UNITED STATES": "US",
  "UNITED STATES OF AMERICA": "US",
  UK: "GB",
  "UNITED KINGDOM": "GB",
  "GREAT BRITAIN": "GB",
  UAE: "AE",
  "UNITED ARAB EMIRATES": "AE",
  "SOUTH KOREA": "KR",
  KOREA: "KR",
  "SRI LANKA": "LK",
  "CZECH REPUBLIC": "CZ",
  CZECHIA: "CZ",
};

/** Explore catalog `country` string → ISO-ish home code. */
export const EXPLORE_COUNTRY_TO_CODE = {
  India: "IN",
  USA: "US",
  Canada: "CA",
  Mexico: "MX",
  Japan: "JP",
  Thailand: "TH",
  Singapore: "SG",
  Indonesia: "ID",
  Maldives: "MV",
  Nepal: "NP",
  "Sri Lanka": "LK",
  "South Korea": "KR",
  China: "CN",
  Vietnam: "VN",
  Malaysia: "MY",
  UAE: "AE",
  Qatar: "QA",
  Turkey: "TR",
  Georgia: "GE",
  France: "FR",
  Italy: "IT",
  UK: "GB",
  Spain: "ES",
  Netherlands: "NL",
  Greece: "GR",
  Czechia: "CZ",
  Austria: "AT",
  Switzerland: "CH",
  Iceland: "IS",
  Portugal: "PT",
  Germany: "DE",
  Kenya: "KE",
  Tanzania: "TZ",
  "South Africa": "ZA",
  Australia: "AU",
  "New Zealand": "NZ",
  Brazil: "BR",
  Egypt: "EG",
  Morocco: "MA",
};

/** Preferred continents when ranking for a home market (first = strongest). */
export const HOME_CONTINENT_PREFS = {
  IN: ["india", "asia", "middle_east", "europe", "americas", "africa", "oceania"],
  US: ["americas", "europe", "middle_east", "asia", "oceania", "africa", "india"],
  CA: ["americas", "europe", "asia", "middle_east", "oceania", "africa", "india"],
  GB: ["europe", "middle_east", "asia", "americas", "africa", "oceania", "india"],
  AE: ["middle_east", "asia", "europe", "africa", "india", "americas", "oceania"],
  SG: ["asia", "oceania", "middle_east", "europe", "americas", "india", "africa"],
  AU: ["oceania", "asia", "americas", "europe", "middle_east", "africa", "india"],
  JP: ["asia", "oceania", "americas", "europe", "middle_east", "india", "africa"],
};

const INDIA_DOMESTIC_MARKERS = /\b(india|indian|chardham|kedarnath|varanasi|haridwar|goa|manali|kashmir|leh|rishikesh|udaipur|jaipur|andaman|srinagar|nubra|pahalgam|gulmarg|guptkashi|yamunotri|gangotri|badrinath|dehradun)\b/i;

export function normalizeMarketCode(code) {
  const raw = String(code || "")
    .trim()
    .toUpperCase();
  if (!raw) return "";
  if (raw.length === 2) return raw;
  return COUNTRY_ALIASES[raw] || raw.slice(0, 2);
}

export function exploreDestMarketCode(dest) {
  if (!dest) return "";
  const fromCountry = EXPLORE_COUNTRY_TO_CODE[dest.country];
  if (fromCountry) return fromCountry;
  if (dest.continent === "india") return "IN";
  return "";
}

export function isDomesticDestination(dest, homeCountry) {
  const home = normalizeMarketCode(homeCountry);
  if (!home || !dest) return false;
  const destCode = exploreDestMarketCode(dest);
  if (destCode && destCode === home) return true;
  // Soft domestic: same continent for multi-country homes (e.g. US → Americas).
  if (home === "US" || home === "CA" || home === "MX") {
    return dest.continent === "americas" && destCode === home;
  }
  if (home === "IN") return dest.continent === "india" || dest.country === "India";
  return false;
}

export function isInternationalDestination(dest, homeCountry) {
  return !isDomesticDestination(dest, homeCountry);
}

/**
 * Score boost for Explore ranking (-big … +big).
 * US home → USA first, then Americas; demote India circuits.
 */
export function exploreMarketBoost(dest, homeCountry) {
  const home = normalizeMarketCode(homeCountry);
  if (!home || !dest) return 0;
  let boost = 0;
  const destCode = exploreDestMarketCode(dest);
  const prefs = HOME_CONTINENT_PREFS[home] || HOME_CONTINENT_PREFS.US;
  const continentIdx = prefs.indexOf(dest.continent || "");
  if (continentIdx >= 0) boost += Math.max(0, 28 - continentIdx * 5);
  if (destCode === home) boost += 48;
  if (home !== "IN" && (dest.continent === "india" || dest.country === "India")) {
    boost -= 55;
  }
  if (home === "IN" && dest.continent === "india") boost += 18;
  return boost;
}

/** Fallback closer lists when airport-specific table is missing. */
export const CLOSER_BY_MARKET = {
  IN: [
    { id: "goa", label: "short flight", mode: "flight" },
    { id: "jaipur", label: "short hop", mode: "flight" },
    { id: "udaipur", label: "short flight", mode: "flight" },
    { id: "manali", label: "weekend hills", mode: "flight" },
    { id: "mumbai", label: "city break", mode: "flight" },
  ],
  US: [
    { id: "new-york", label: "city break", mode: "flight" },
    { id: "miami", label: "beach hop", mode: "flight" },
    { id: "los-angeles", label: "west coast", mode: "flight" },
    { id: "san-francisco", label: "short hop", mode: "flight" },
    { id: "toronto", label: "quick border", mode: "flight" },
    { id: "cancun", label: "sun escape", mode: "flight" },
  ],
  GB: [
    { id: "paris", label: "~1h20", mode: "flight" },
    { id: "amsterdam", label: "~1h", mode: "flight" },
    { id: "barcelona", label: "~2h", mode: "flight" },
    { id: "lisbon", label: "~2h30", mode: "flight" },
    { id: "london", label: "home base", mode: "flight" },
  ],
  AE: [
    { id: "dubai", label: "home Gulf", mode: "flight" },
    { id: "abu-dhabi", label: "short drive", mode: "drive" },
    { id: "doha", label: "quick hop", mode: "flight" },
    { id: "istanbul", label: "weekend", mode: "flight" },
    { id: "maldives", label: "island escape", mode: "flight" },
  ],
};

/**
 * Packages: legacy `region: "domestic"` meant India circuits.
 * Prefer explicit `markets` when present; otherwise fall back to region/blob heuristics.
 */
export function packageLooksIndiaDomestic(pkg = {}) {
  const markets = (pkg.markets || []).map((m) => String(m || "").toUpperCase());
  if (markets.length) {
    if (markets.includes("*") || markets.includes("GLOBAL")) return false;
    if (markets.includes("IN") && markets.length === 1) {
      const region = String(pkg.region || "").toLowerCase();
      return region === "domestic" || INDIA_DOMESTIC_MARKERS.test(
        [pkg.title, ...(pkg.destinations || [])].filter(Boolean).join(" ")
      );
    }
    if (!markets.includes("IN")) return false;
  }
  const region = String(pkg.region || "").toLowerCase();
  if (region === "domestic") return true;
  const blob = [
    pkg.title,
    pkg.tagline,
    ...(pkg.destinations || []),
    pkg.flight?.gatewayCity,
    pkg.flight?.gatewayAirport,
  ]
    .filter(Boolean)
    .join(" ");
  return INDIA_DOMESTIC_MARKERS.test(blob);
}

export function packageVisibleInMarket(pkg, homeCountry) {
  const home = normalizeMarketCode(homeCountry);
  if (!home || !pkg) return true;
  const markets = (pkg.markets || []).map((m) => String(m || "").toUpperCase());
  if (!markets.length) return !shouldHideIndiaDomesticPackages(home) || !packageLooksIndiaDomestic(pkg);
  if (markets.includes("*") || markets.includes("GLOBAL")) return true;
  return markets.includes(home);
}

export function packageMarketScore(pkg, homeCountry) {
  const home = normalizeMarketCode(homeCountry);
  if (!home) return 0;
  const markets = (pkg.markets || []).map((m) => String(m || "").toUpperCase());
  const indiaDom = packageLooksIndiaDomestic(pkg);
  const region = String(pkg.region || "").toLowerCase();
  let score = 0;

  if (markets.includes(home)) score += 60;
  if (markets.includes("*") || markets.includes("GLOBAL")) score += 12;

  if (home === "IN") {
    if (indiaDom || region === "domestic") score += 40;
    else score += 8;
    return score;
  }

  // Outside India: bury India domestic circuits unless user asked for them.
  if (indiaDom) score -= 120;
  if (region === "international") score += 35;
  if (region === "domestic" && markets.includes(home)) score += 45;

  const blob = [
    pkg.title,
    ...(pkg.destinations || []),
    pkg.flight?.gatewayCity,
    ...(pkg.themes || []),
    pkg.theme,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (home === "US" || home === "CA") {
    if (/mexico|cancun|toronto|canada|caribbean|hawaii|vegas|california|new york|miami|orlando|los angeles/i.test(blob)) {
      score += 50;
    }
    if (/europe|paris|rome|london|barcelona|iceland/i.test(blob)) score += 18;
    if (/dubai|maldives|bali|tokyo|bangkok|singapore|kenya|zanzibar|cape town|kathmandu/i.test(blob)) {
      score += 6;
    }
  } else if (home === "GB" || home === "IE") {
    if (/europe|paris|rome|barcelona|amsterdam|lisbon|iceland|dubai/i.test(blob)) score += 28;
  } else if (home === "AE" || home === "SA" || home === "QA") {
    if (/dubai|abu dhabi|maldives|istanbul|europe|bali/i.test(blob)) score += 28;
  } else if (home === "SG" || home === "MY" || home === "AU" || home === "JP") {
    if (/tokyo|bangkok|singapore|bali|maldives|sydney|melbourne|asia/i.test(blob)) score += 28;
  }

  return score;
}

/** Whether default packages list should hide India domestic rows. */
export function shouldHideIndiaDomesticPackages(homeCountry) {
  const home = normalizeMarketCode(homeCountry);
  return Boolean(home) && home !== "IN";
}

export function domesticRegionLabel(homeCountry) {
  const home = normalizeMarketCode(homeCountry);
  if (home === "IN" || !home) return "Domestic (India)";
  if (home === "US") return "USA domestic";
  return "Domestic";
}
