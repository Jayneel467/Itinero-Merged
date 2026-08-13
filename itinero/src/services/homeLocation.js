/**
 * Home location / passport helpers - single source for origin-aware UI.
 * Never silently force Mumbai (BOM) or Indian passport for global users.
 */

import { AIRPORTS, findAirportByCode } from "@/constants/airports";
import { EXPLORE_CATALOG } from "@/features/explore/data/catalog";

export const HOME_LOCATION_KEY = "itinero_home_location_v1";
export const HOME_ORIGIN_SESSION_KEY = "itinero_explore_origin";

/** Country ISO-2 → display currency + typical hub airport. */
export const COUNTRY_DEFAULTS = {
  IN: { currency: "INR", airport: "", city: "", label: "India" },
  US: { currency: "USD", airport: "JFK", city: "New York", label: "United States" },
  GB: { currency: "GBP", airport: "LHR", city: "London", label: "United Kingdom" },
  AE: { currency: "AED", airport: "DXB", city: "Dubai", label: "United Arab Emirates" },
  SA: { currency: "SAR", airport: "RUH", city: "Riyadh", label: "Saudi Arabia" },
  SG: { currency: "SGD", airport: "SIN", city: "Singapore", label: "Singapore" },
  AU: { currency: "AUD", airport: "SYD", city: "Sydney", label: "Australia" },
  CA: { currency: "CAD", airport: "YYZ", city: "Toronto", label: "Canada" },
  JP: { currency: "JPY", airport: "NRT", city: "Tokyo", label: "Japan" },
  CN: { currency: "CNY", airport: "PVG", city: "Shanghai", label: "China" },
  HK: { currency: "HKD", airport: "HKG", city: "Hong Kong", label: "Hong Kong" },
  TH: { currency: "THB", airport: "BKK", city: "Bangkok", label: "Thailand" },
  FR: { currency: "EUR", airport: "CDG", city: "Paris", label: "France" },
  DE: { currency: "EUR", airport: "FRA", city: "Frankfurt", label: "Germany" },
  ES: { currency: "EUR", airport: "MAD", city: "Madrid", label: "Spain" },
  IT: { currency: "EUR", airport: "FCO", city: "Rome", label: "Italy" },
  NL: { currency: "EUR", airport: "AMS", city: "Amsterdam", label: "Netherlands" },
  IE: { currency: "EUR", airport: "DUB", city: "Dublin", label: "Ireland" },
  PT: { currency: "EUR", airport: "LIS", city: "Lisbon", label: "Portugal" },
  BR: { currency: "BRL", airport: "GRU", city: "São Paulo", label: "Brazil" },
  ID: { currency: "IDR", airport: "CGK", city: "Jakarta", label: "Indonesia" },
  MY: { currency: "MYR", airport: "KUL", city: "Kuala Lumpur", label: "Malaysia" },
  KR: { currency: "KRW", airport: "ICN", city: "Seoul", label: "South Korea" },
  TR: { currency: "TRY", airport: "IST", city: "Istanbul", label: "Turkey" },
  NZ: { currency: "NZD", airport: "AKL", city: "Auckland", label: "New Zealand" },
  ZA: { currency: "ZAR", airport: "JNB", city: "Johannesburg", label: "South Africa" },
  CH: { currency: "CHF", airport: "ZRH", city: "Zurich", label: "Switzerland" },
  MX: { currency: "MXN", airport: "MEX", city: "Mexico City", label: "Mexico" },
  PH: { currency: "PHP", airport: "MNL", city: "Manila", label: "Philippines" },
  VN: { currency: "VND", airport: "SGN", city: "Ho Chi Minh City", label: "Vietnam" },
  SE: { currency: "SEK", airport: "ARN", city: "Stockholm", label: "Sweden" },
  NO: { currency: "NOK", airport: "OSL", city: "Oslo", label: "Norway" },
  DK: { currency: "DKK", airport: "CPH", city: "Copenhagen", label: "Denmark" },
  PL: { currency: "PLN", airport: "WAW", city: "Warsaw", label: "Poland" },
  CZ: { currency: "CZK", airport: "PRG", city: "Prague", label: "Czechia" },
  HU: { currency: "HUF", airport: "BUD", city: "Budapest", label: "Hungary" },
  RO: { currency: "RON", airport: "OTP", city: "Bucharest", label: "Romania" },
  IL: { currency: "ILS", airport: "TLV", city: "Tel Aviv", label: "Israel" },
  QA: { currency: "QAR", airport: "DOH", city: "Doha", label: "Qatar" },
};

const TZ_COUNTRY = {
  "Asia/Kolkata": "IN",
  "Asia/Calcutta": "IN",
  "Asia/Dubai": "AE",
  "Asia/Riyadh": "SA",
  "Asia/Singapore": "SG",
  "Asia/Tokyo": "JP",
  "Asia/Shanghai": "CN",
  "Asia/Hong_Kong": "HK",
  "Asia/Bangkok": "TH",
  "Asia/Jakarta": "ID",
  "Asia/Kuala_Lumpur": "MY",
  "Asia/Seoul": "KR",
  "Asia/Istanbul": "TR",
  "Europe/London": "GB",
  "Europe/Dublin": "IE",
  "Europe/Paris": "FR",
  "Europe/Berlin": "DE",
  "Europe/Madrid": "ES",
  "Europe/Rome": "IT",
  "Europe/Amsterdam": "NL",
  "Europe/Lisbon": "PT",
  "America/New_York": "US",
  "America/Chicago": "US",
  "America/Denver": "US",
  "America/Los_Angeles": "US",
  "America/Toronto": "CA",
  "America/Vancouver": "CA",
  "America/Sao_Paulo": "BR",
  "Australia/Sydney": "AU",
  "Australia/Melbourne": "AU",
  "Pacific/Auckland": "NZ",
  "Africa/Johannesburg": "ZA",
};

const US_TZ_AIRPORT = {
  "America/New_York": { airport: "JFK", city: "New York" },
  "America/Chicago": { airport: "ORD", city: "Chicago" },
  "America/Denver": { airport: "DEN", city: "Denver" },
  "America/Los_Angeles": { airport: "LAX", city: "Los Angeles" },
};

export function emptyHomeLocation() {
  return {
    airportCode: "",
    city: "",
    countryCode: "",
    passportCountry: "",
    source: "",
    detectedAt: 0,
    userSet: false,
  };
}

export function readStoredHomeLocation() {
  try {
    const raw = localStorage.getItem(HOME_LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return {
      ...emptyHomeLocation(),
      ...parsed,
      airportCode: String(parsed.airportCode || "").toUpperCase(),
      countryCode: String(parsed.countryCode || "").toUpperCase(),
      passportCountry: String(parsed.passportCountry || "").toUpperCase(),
      city: String(parsed.city || "").trim(),
    };
  } catch {
    return null;
  }
}

export function writeStoredHomeLocation(loc) {
  try {
    localStorage.setItem(HOME_LOCATION_KEY, JSON.stringify(loc));
  } catch {
    /* quota */
  }
  if (loc?.airportCode) {
    try {
      sessionStorage.setItem(HOME_ORIGIN_SESSION_KEY, loc.airportCode);
    } catch {
      /* ignore */
    }
  }
}

export function countryFromLocale(locale = "") {
  const tag = String(locale || "").trim();
  if (!tag) return "";
  const parts = tag.replace("_", "-").split("-");
  if (parts.length >= 2) {
    const region = parts[parts.length - 1].toUpperCase();
    if (/^[A-Z]{2}$/.test(region)) return region;
  }
  return "";
}

export function inferCountryFromEnvironment() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
  } catch {
    /* ignore */
  }
  if (typeof navigator !== "undefined") {
    const locales = navigator.languages?.length
      ? navigator.languages
      : [navigator.language || ""];
    for (const loc of locales) {
      const cc = countryFromLocale(loc);
      if (cc) return cc;
    }
  }
  return "";
}

export function countryFlagUrl(cc) {
  const code = String(cc || "").toLowerCase();
  if (!/^[a-z]{2}$/.test(code)) return "";
  return `https://flagcdn.com/w40/${code}.png`;
}

export function currencyForCountry(cc) {
  return COUNTRY_DEFAULTS[String(cc || "").toUpperCase()]?.currency || "";
}

export function passportLabel(cc) {
  const code = String(cc || "").toUpperCase();
  if (!code) return "your passport";
  const names = {
    IN: "Indian",
    US: "US",
    GB: "UK",
    AE: "UAE",
    SG: "Singapore",
    AU: "Australian",
    CA: "Canadian",
    JP: "Japanese",
    FR: "French",
    DE: "German",
    EU: "EU",
  };
  return names[code] ? `${names[code]} passport` : `${code} passport`;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Nearest explore destination that has an IATA code. */
export function nearestCatalogAirport(lat, lng) {
  let best = null;
  let bestKm = Infinity;
  for (const d of EXPLORE_CATALOG) {
    if (!d?.iata || d.lat == null || d.lng == null) continue;
    const km = haversineKm(lat, lng, d.lat, d.lng);
    if (km < bestKm) {
      bestKm = km;
      best = d;
    }
  }
  if (!best || bestKm > 1200) return null;
  return {
    airportCode: best.iata,
    city: best.city,
    countryCode: countryCodeFromCatalog(best),
    km: bestKm,
  };
}

function countryCodeFromCatalog(dest) {
  const country = String(dest?.country || "").toLowerCase();
  const map = {
    india: "IN",
    japan: "JP",
    thailand: "TH",
    singapore: "SG",
    indonesia: "ID",
    maldives: "MV",
    nepal: "NP",
    "sri lanka": "LK",
    "south korea": "KR",
    china: "CN",
    uae: "AE",
    qatar: "QA",
    turkey: "TR",
    georgia: "GE",
    france: "FR",
    italy: "IT",
    uk: "GB",
    spain: "ES",
    netherlands: "NL",
    greece: "GR",
    czechia: "CZ",
    austria: "AT",
    switzerland: "CH",
    iceland: "IS",
    portugal: "PT",
    germany: "DE",
    usa: "US",
    canada: "CA",
    mexico: "MX",
    brazil: "BR",
    "south africa": "ZA",
    egypt: "EG",
    morocco: "MA",
    kenya: "KE",
    tanzania: "TZ",
    australia: "AU",
    "new zealand": "NZ",
    fiji: "FJ",
    malaysia: "MY",
    vietnam: "VN",
  };
  return map[country] || "";
}

export function inferHomeLocationFromEnvironment() {
  let tz = "";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    tz = "";
  }
  const countryCode = inferCountryFromEnvironment();
  if (!countryCode) return emptyHomeLocation();

  const defaults = COUNTRY_DEFAULTS[countryCode] || {
    currency: "",
    airport: "",
    city: "",
    label: countryCode,
  };

  let airportCode = defaults.airport || "";
  let city = defaults.city || "";

  if (countryCode === "US" && US_TZ_AIRPORT[tz]) {
    airportCode = US_TZ_AIRPORT[tz].airport;
    city = US_TZ_AIRPORT[tz].city;
  }

  // India shares one timezone - do not invent Mumbai/Delhi without geo or user pick.
  if (countryCode === "IN") {
    airportCode = "";
    city = "";
  }

  return {
    airportCode,
    city,
    countryCode,
    // Passport is Regional-settings SOT - never invent nationality from locale/geo.
    passportCountry: "",
    source: "locale",
    detectedAt: Date.now(),
    userSet: false,
  };
}

export function resolveAirportMeta(code) {
  const hit = findAirportByCode(code);
  if (hit) return hit;
  const dest = EXPLORE_CATALOG.find((d) => d.iata === String(code || "").toUpperCase());
  if (dest) {
    return {
      code: dest.iata,
      city: dest.city,
      name: dest.city,
      state: dest.country,
    };
  }
  return null;
}

export function homeLocationLabel(loc) {
  if (!loc) return "your city";
  if (loc.city && loc.airportCode) return `${loc.city} (${loc.airportCode})`;
  if (loc.airportCode) return loc.airportCode;
  if (loc.city) return loc.city;
  if (loc.countryCode) {
    return COUNTRY_DEFAULTS[loc.countryCode]?.label || loc.countryCode;
  }
  return "your city";
}

/** Popular airports shown in Regional location picker. */
export function popularHomeAirports() {
  const preferred = [
    "BOM",
    "DEL",
    "BLR",
    "HYD",
    "MAA",
    "CCU",
    "AMD",
    "GOI",
    "JFK",
    "LAX",
    "ORD",
    "SFO",
    "LHR",
    "CDG",
    "FRA",
    "AMS",
    "DXB",
    "SIN",
    "BKK",
    "NRT",
    "SYD",
    "YYZ",
    "HKG",
    "IST",
  ];
  const out = [];
  const seen = new Set();
  for (const code of preferred) {
    const a = findAirportByCode(code);
    if (a && !seen.has(a.code)) {
      seen.add(a.code);
      out.push(a);
    }
  }
  for (const a of AIRPORTS) {
    if (a?.code && !seen.has(a.code) && out.length < 40) {
      seen.add(a.code);
      out.push(a);
    }
  }
  return out;
}

export function requestBrowserPosition(timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 6 * 60 * 60 * 1000 }
    );
  });
}

export async function detectHomeLocation({ allowGeo = true } = {}) {
  const stored = readStoredHomeLocation();
  if (stored?.userSet && (stored.airportCode || stored.countryCode)) {
    return stored;
  }

  if (allowGeo) {
    const pos = await requestBrowserPosition();
    if (pos) {
      const near = nearestCatalogAirport(pos.lat, pos.lng);
      if (near) {
        const next = {
          airportCode: near.airportCode,
          city: near.city,
          countryCode: near.countryCode || inferCountryFromEnvironment(),
          // Keep any user-set passport; otherwise leave blank until Regional pick.
          passportCountry: stored?.passportCountry || "",
          source: "geo",
          detectedAt: Date.now(),
          userSet: false,
        };
        writeStoredHomeLocation(next);
        return next;
      }
    }
  }

  if (stored?.airportCode || stored?.countryCode) return stored;

  const inferred = inferHomeLocationFromEnvironment();
  if (inferred.countryCode || inferred.airportCode) {
    writeStoredHomeLocation(inferred);
  }
  return inferred;
}
