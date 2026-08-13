import { EXPLORE_CATALOG } from "@/features/explore/data/catalog";
import { getTravelIntel } from "@/features/explore/data/travelIntel";

const CITY_HINTS = [
  [/nairobi|kenya|mara/i, "nairobi"],
  [/zanzibar|tanzania/i, "zanzibar"],
  [/bali|ubud/i, "bali"],
  [/leh|ladakh/i, "leh"],
  [/rishikesh/i, "rishikesh"],
  [/tokyo/i, "tokyo"],
  [/kyoto/i, "kyoto"],
  [/bangkok|thailand/i, "bangkok"],
  [/jaipur/i, "jaipur"],
  [/cape town|south africa/i, "cape-town"],
  [/kathmandu|nepal/i, "kathmandu"],
  [/maldives|mal[eé]/i, "maldives"],
  [/dubai/i, "dubai"],
  [/abu dhabi/i, "abu-dhabi"],
  [/singapore/i, "singapore"],
  [/goa/i, "goa"],
  [/manali/i, "manali"],
  [/srinagar|kashmir|gulmarg|pahalgam/i, "srinagar"],
  [/varanasi/i, "varanasi"],
  [/andaman|port blair|havelock/i, "andaman"],
  [/udaipur/i, "udaipur"],
  [/haridwar|kedarnath|chardham|barkot/i, "rishikesh"],
  [/paris/i, "paris"],
  [/amsterdam/i, "amsterdam"],
  [/rome/i, "rome"],
  [/london/i, "london"],
  [/barcelona/i, "barcelona"],
  [/prague/i, "prague"],
  [/new york|\bnyc\b/i, "new-york"],
  [/sydney/i, "sydney"],
  [/melbourne/i, "melbourne"],
  [/istanbul/i, "istanbul"],
  [/lisbon/i, "lisbon"],
  [/santorini/i, "santorini"],
];

export function destForPackage(pkg) {
  if (!pkg) return null;
  const blob = [
    ...(pkg.destinations || []),
    pkg.title,
    pkg.stay?.city,
    pkg.flight?.gatewayCity,
    pkg.flightGateway?.city,
  ]
    .filter(Boolean)
    .join(" ");
  for (const [re, id] of CITY_HINTS) {
    if (re.test(blob)) return EXPLORE_CATALOG.find((d) => d.id === id) || null;
  }
  const lower = blob.toLowerCase();
  return (
    EXPLORE_CATALOG.find((d) => lower.includes(String(d.city).toLowerCase())) ||
    EXPLORE_CATALOG.find((d) => lower.includes(String(d.country).toLowerCase())) ||
    null
  );
}

export function intelForPackage(pkg) {
  const dest = destForPackage(pkg);
  return dest ? { dest, intel: getTravelIntel(dest) } : { dest: null, intel: null };
}
