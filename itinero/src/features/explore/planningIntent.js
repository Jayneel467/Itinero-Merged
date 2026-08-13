const KEY = "itinero_planning_intent";

export function startPlanningIntent(dest, extra = {}) {
  const intent = {
    destination: dest?.city || "",
    slug: dest?.slug || "",
    iata: dest?.iata || "",
    origin: extra.origin || "BOM",
    theme: extra.theme || (dest?.themes || [])[0] || "",
    season: extra.season || "",
    saved_context: extra.context || extra.saved_context || "",
    from: "explore",
    at: new Date().toISOString(),
  };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(intent));
  } catch {
    /* ignore */
  }
  return intent;
}

export function readPlanningIntent() {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
