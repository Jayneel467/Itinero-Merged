/**
 * Capture UTMs + referral on first visit for acquisition attribution.
 */
const KEY = "itinero_attribution_v1";
const REF_KEY = "itinero_ref_code";

function readQs() {
  if (typeof window === "undefined") return {};
  const p = new URLSearchParams(window.location.search);
  return {
    utm_source: p.get("utm_source") || "",
    utm_medium: p.get("utm_medium") || "",
    utm_campaign: p.get("utm_campaign") || "",
    utm_content: p.get("utm_content") || "",
    utm_term: p.get("utm_term") || "",
    ref: p.get("ref") || "",
  };
}

export function captureAttributionFromUrl() {
  if (typeof window === "undefined") return getAttribution();
  const qs = readQs();
  const existing = getAttribution();
  const next = {
    acq_source: qs.utm_source || existing.acq_source || "",
    acq_medium: qs.utm_medium || existing.acq_medium || "",
    acq_campaign: qs.utm_campaign || existing.acq_campaign || "",
    landing_path: existing.landing_path || `${window.location.pathname}${window.location.search}`,
    captured_at: existing.captured_at || new Date().toISOString(),
  };
  if (qs.utm_source || qs.utm_campaign || !existing.landing_path) {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(next));
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  if (qs.ref) {
    try {
      localStorage.setItem(REF_KEY, qs.ref.trim().toUpperCase());
    } catch {
      /* ignore */
    }
  }
  return next;
}

export function getAttribution() {
  try {
    const raw = sessionStorage.getItem(KEY) || localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {
    acq_source: "",
    acq_medium: "",
    acq_campaign: "",
    landing_path: "",
  };
}

export function getReferralCode() {
  try {
    return (localStorage.getItem(REF_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function attributionForSignup() {
  const a = getAttribution();
  const ref = getReferralCode();
  return {
    acq_source: a.acq_source || undefined,
    acq_medium: a.acq_medium || undefined,
    acq_campaign: a.acq_campaign || undefined,
    landing_path: a.landing_path || undefined,
    referral_code: ref || undefined,
  };
}
