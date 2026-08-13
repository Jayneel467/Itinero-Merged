/**
 * Travelpayouts → Klook tracked deep links.
 * Destination URLs are real Klook search/category pages (not the homepage).
 * Wrap with tp.media/r so marker 723913 (or env override) earns on checkout.
 */
import { APP_CONFIG } from "@/app/config";

const TP_BASE = "https://tp.media/r";
const KLOOK_ORIGIN = "https://www.klook.com";

export function isKlookEnabled() {
  return Boolean(String(APP_CONFIG.KLOOK?.marker || "").trim());
}

export function klookTrackUrl(klookUrl) {
  const cfg = APP_CONFIG.KLOOK || {};
  const dest = String(klookUrl || `${KLOOK_ORIGIN}/`).trim() || `${KLOOK_ORIGIN}/`;
  const marker = String(cfg.marker || "").trim();
  if (!marker) return dest;
  const params = new URLSearchParams();
  if (cfg.campaignId) params.set("campaign_id", String(cfg.campaignId));
  params.set("marker", marker);
  if (cfg.p) params.set("p", String(cfg.p));
  if (cfg.trs) params.set("trs", String(cfg.trs));
  params.set("u", dest);
  return `${TP_BASE}?${params.toString()}`;
}

function localePath() {
  return String(APP_CONFIG.KLOOK?.locale || "en-IN").trim() || "en-IN";
}

function searchUrl(query) {
  const loc = localePath();
  return `${KLOOK_ORIGIN}/${loc}/search/?query=${encodeURIComponent(String(query || "").trim())}`;
}

export function klookDeepUrl(kind, { city, iata, query } = {}) {
  const loc = localePath();
  const place = String(city || "").trim();
  const code = String(iata || "").trim().toUpperCase();
  const q = String(query || "").trim();

  switch (kind) {
    case "cars":
      return place ? searchUrl(`${place} car rental`) : `${KLOOK_ORIGIN}/${loc}/car-rentals/`;
    case "transfers":
      return searchUrl(code ? `${code} airport transfer` : `${place || "airport"} airport transfer`);
    case "esim":
      return place ? searchUrl(`${place} esim`) : `${KLOOK_ORIGIN}/${loc}/esim/`;
    case "bikes":
      return searchUrl(q || (place ? `${place} bike rental` : "bike rental"));
    case "scuba":
      return searchUrl(q || (place ? `${place} scuba diving` : "scuba diving"));
    case "ski":
      return searchUrl(q || (place ? `${place} ski rental` : "ski rental"));
    case "rafting":
      return searchUrl(q || (place ? `${place} rafting` : "rafting"));
    case "safari":
      return searchUrl(q || (place ? `${place} safari` : "safari"));
    case "search":
      return searchUrl(q || place);
    case "activities":
    default:
      return q ? searchUrl(q) : place ? searchUrl(place) : `${KLOOK_ORIGIN}/${loc}/`;
  }
}

export function klookHref(kind, opts) {
  return klookTrackUrl(klookDeepUrl(kind, opts));
}

export function openKlook(kind, opts) {
  if (typeof window === "undefined" || !isKlookEnabled()) return;
  window.open(klookHref(kind, opts), "_blank", "noopener,noreferrer");
}
