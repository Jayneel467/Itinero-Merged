/**
 * On-device account preferences (home airport, alerts, GST invoice fields).
 */
const KEY = "itinero_account_prefs_v1";

const DEFAULTS = {
  homeAirport: "",
  homeCity: "",
  priceAlerts: true,
  tripReminders: true,
  gstin: "",
  companyName: "",
  invoiceEmail: "",
};

export function loadAccountPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!raw || typeof raw !== "object") return { ...DEFAULTS };
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveAccountPrefs(patch) {
  const next = { ...loadAccountPrefs(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
