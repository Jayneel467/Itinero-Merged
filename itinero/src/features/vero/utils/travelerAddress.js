const PREFERRED_KEY = "itinero_vero_preferred_name";

function readUser() {
  try {
    const raw = localStorage.getItem("userdata");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.user || parsed || null;
  } catch {
    return null;
  }
}

export function readStoredPreferredName() {
  try {
    return String(localStorage.getItem(PREFERRED_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function persistPreferredName(name) {
  try {
    const clean = String(name || "").trim();
    if (clean) localStorage.setItem(PREFERRED_KEY, clean);
    else localStorage.removeItem(PREFERRED_KEY);
  } catch {
    /* ignore */
  }
}

/** Payload for Vero respect/address policy (name precedence on the server). */
export function travelerAddressPayload() {
  const explicit = readStoredPreferredName();
  const user = readUser() || {};
  const profile =
    String(user.preferredName || user.preferred_name || user.displayName || "").trim();
  const first = String(user.firstName || user.first_name || "").trim();
  const payload = {};
  if (explicit) payload.preferred_name = explicit;
  else if (profile) payload.preferred_name = profile;
  else if (first) payload.first_name = first;

  if (profile) payload.profile_preferred_name = profile.split(/\s+/)[0];
  if (first) payload.account_first_name = first;

  try {
    const raw = localStorage.getItem("itinero_home_location_v1");
    const home = raw ? JSON.parse(raw) : null;
    // Only explicit Regional passport - never countryCode fallback for visa.
    const passport = String(home?.passportCountry || "")
      .toUpperCase()
      .slice(0, 2);
    if (passport) {
      payload.passport_nationality = passport;
      payload.nationality = passport;
    }
    const origin = String(home?.airportCode || "").toUpperCase();
    if (origin) payload.home_airport = origin;
    if (home?.city) payload.home_city = home.city;
  } catch {
    /* ignore */
  }

  return Object.keys(payload).length ? payload : undefined;
}
