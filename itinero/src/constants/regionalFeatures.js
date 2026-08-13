/**
 * Product surfaces that only work in certain markets.
 * Trains = IRCTC / Indian Railways corridors (India-only).
 * Transits = global city transit + coaches (feeds vary by region).
 */

export const REGIONAL_FEATURES = {
  trains: {
    id: "trains",
    label: "Trains",
    markets: ["IN"],
    path: "/trains",
    reason: "Indian Railways / IRCTC corridors only",
  },
  transits: {
    id: "transits",
    label: "Transits",
    markets: ["*"],
    path: "/transits",
    reason: "City transit and coaches worldwide where feeds exist",
  },
};

function normalizeCc(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .slice(0, 2);
}

/**
 * @param {{ countryCode?: string, passportCountry?: string }} loc
 * @param {{ markets: string[] }} feature
 */
export function isFeatureAvailableIn(loc = {}, feature) {
  const markets = feature?.markets || ["*"];
  if (markets.includes("*")) return true;
  const country = normalizeCc(loc.countryCode);
  const passport = normalizeCc(loc.passportCountry);
  return markets.some((m) => m === country || m === passport);
}

export function isTrainsMarket(loc = {}) {
  const country = normalizeCc(loc.countryCode);
  const passport = normalizeCc(loc.passportCountry);
  if (country === "IN" || passport === "IN") return true;
  // No home/passport yet - keep India-first discovery until Regional is set.
  if (!country && !passport) return true;
  return false;
}

export function isTransitsMarket(loc = {}) {
  return isFeatureAvailableIn(loc, REGIONAL_FEATURES.transits);
}

/** Active market codes for the current home/passport (for badges / copy). */
export function activeMarketCodes(loc = {}) {
  const out = [];
  const country = normalizeCc(loc.countryCode);
  const passport = normalizeCc(loc.passportCountry);
  if (country) out.push(country);
  if (passport && passport !== country) out.push(passport);
  return out;
}
