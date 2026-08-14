import { EXPLORE_CATALOG } from "@/features/explore/data/catalog";
import { getTravelIntel } from "@/features/explore/data/travelIntel";

const CITY_HINTS = [
  [/\b(nairobi|kenya|mara)\b/i, "nairobi"],
  [/\b(zanzibar|tanzania)\b/i, "zanzibar"],
  [/\b(bali|ubud)\b/i, "bali"],
  [/\b(leh|ladakh)\b/i, "leh"],
  [/\brishikesh\b/i, "rishikesh"],
  [/\btokyo\b/i, "tokyo"],
  [/\bkyoto\b/i, "kyoto"],
  [/\b(bangkok|thailand)\b/i, "bangkok"],
  [/\bjaipur\b/i, "jaipur"],
  [/\b(cape town|south africa)\b/i, "cape-town"],
  [/\b(kathmandu|nepal)\b/i, "kathmandu"],
  [/\b(maldives|mal[eé])\b/i, "maldives"],
  [/\bdubai\b/i, "dubai"],
  [/\babu dhabi\b/i, "abu-dhabi"],
  [/\bsingapore\b/i, "singapore"],
  [/\bgoa\b/i, "goa"],
  [/\bmanali\b/i, "manali"],
  [/\b(srinagar|kashmir|gulmarg|pahalgam)\b/i, "srinagar"],
  [/\bvaranasi\b/i, "varanasi"],
  [/\b(andaman|port blair|havelock)\b/i, "andaman"],
  [/\budaipur\b/i, "udaipur"],
  [/\b(haridwar|kedarnath|chardham|barkot)\b/i, "rishikesh"],
  [/\bparis\b/i, "paris"],
  [/\bamsterdam\b/i, "amsterdam"],
  [/\brome\b/i, "rome"],
  [/\blondon\b/i, "london"],
  [/\bbarcelona\b/i, "barcelona"],
  [/\bprague\b/i, "prague"],
  [/\b(new york|nyc)\b/i, "new-york"],
  [/\bsydney\b/i, "sydney"],
  [/\bmelbourne\b/i, "melbourne"],
  [/\bistanbul\b/i, "istanbul"],
  [/\blisbon\b/i, "lisbon"],
  [/\bsantorini\b/i, "santorini"],
];

function catalogById(id) {
  return EXPLORE_CATALOG.find((d) => d.id === id) || null;
}

function normCity(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ");
}

function exactCatalogCity(city) {
  const n = normCity(city);
  if (!n) return null;
  return (
    EXPLORE_CATALOG.find((d) => normCity(d.city) === n) ||
    EXPLORE_CATALOG.find((d) => normCity(d.id) === n) ||
    EXPLORE_CATALOG.find((d) => normCity(d.slug) === n) ||
    null
  );
}

function hintMatch(blob) {
  const text = String(blob || "");
  if (!text.trim()) return null;
  for (const [re, id] of CITY_HINTS) {
    if (re.test(text)) return catalogById(id);
  }
  return null;
}

/** Destination cities only — never origin / gateway. */
export function packagePhotoCities(pkg) {
  if (!pkg) return [];
  const anchors = Array.isArray(pkg.requiredAnchors) ? pkg.requiredAnchors.filter(Boolean) : [];
  const dests = Array.isArray(pkg.destinations) ? pkg.destinations.filter(Boolean) : [];
  const extra = [pkg?.stay?.city].filter(Boolean);
  const list = [...(anchors.length ? anchors : dests), ...extra];
  const seen = new Set();
  return list.filter((c) => {
    const k = String(c || "").trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 4);
}

export function destForPackage(pkg) {
  if (!pkg) return null;
  const destFields = [
    ...(pkg.destinations || []),
    ...(pkg.requiredAnchors || []),
    pkg.stay?.city,
  ]
    .map((c) => String(c || "").trim())
    .filter(Boolean);

  for (const city of destFields) {
    const hit = exactCatalogCity(city);
    if (hit) return hit;
  }

  const destBlob = destFields.join(" ");
  const fromDestHints = hintMatch(destBlob);
  if (fromDestHints) return fromDestHints;

  const titleHit = hintMatch(pkg.title || "");
  if (titleHit) return titleHit;

  const lower = destBlob.toLowerCase();
  return (
    EXPLORE_CATALOG.find((d) => lower.includes(String(d.city).toLowerCase())) ||
    null
  );
}

export function intelForPackage(pkg) {
  const dest = destForPackage(pkg);
  return dest ? { dest, intel: getTravelIntel(dest) } : { dest: null, intel: null };
}
