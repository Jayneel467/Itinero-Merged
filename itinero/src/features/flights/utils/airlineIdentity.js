/**
 * Canonical airline identity - collapse IATA codes + name variants into one
 * display name so IndiGo (6E), Akasa (QP), etc. aren't split across buckets
 * and buried under Air India fare walls.
 */

const CODE_TO_NAME = {
  "6E": "IndiGo",
  QP: "Akasa Air",
  SG: "SpiceJet",
  IX: "Air India Express",
  AI: "Air India",
  UK: "Vistara",
  "9I": "Alliance Air",
  S5: "Star Air",
  OG: "Flybig",
  "2T": "TruJet",
  G8: "Go First",
  I5: "AirAsia India",
  EK: "Emirates",
  EY: "Etihad Airways",
  QR: "Qatar Airways",
  SQ: "Singapore Airlines",
  TG: "Thai Airways",
  BA: "British Airways",
  LH: "Lufthansa",
  AF: "Air France",
  KL: "KLM",
  TK: "Turkish Airlines",
  CX: "Cathay Pacific",
  MH: "Malaysia Airlines",
  UL: "SriLankan Airlines",
  WY: "Oman Air",
  FZ: "flydubai",
  XY: "flynas",
  J9: "Jazeera Airways",
  G9: "Air Arabia",
  GF: "Gulf Air",
  SV: "Saudia",
  KU: "Kuwait Airways",
  MS: "EgyptAir",
  RJ: "Royal Jordanian",
};

const NAME_ALIASES = [
  [/^\s*indigo\s*$/i, "IndiGo"],
  [/^\s*akasa(\s*air)?\s*$/i, "Akasa Air"],
  [/^\s*spice\s*jet\s*$/i, "SpiceJet"],
  [/^\s*air\s*india\s*express\s*$/i, "Air India Express"],
  [/^\s*airindia\s*express\s*$/i, "Air India Express"],
  [/^\s*vistara\s*$/i, "Vistara"],
  [/^\s*air\s*india\s*$/i, "Air India"],
  [/^\s*alliance\s*air\s*$/i, "Alliance Air"],
  [/^\s*go\s*(first|air)\s*$/i, "Go First"],
  [/^\s*gulf\s*air\s*$/i, "Gulf Air"],
  [/^\s*saudia\s*$/i, "Saudia"],
  [/^\s*flydubai\s*$/i, "flydubai"],
  [/^\s*emirates\s*$/i, "Emirates"],
  [/^\s*etihad(\s*airways)?\s*$/i, "Etihad Airways"],
  [/^\s*qatar(\s*airways)?\s*$/i, "Qatar Airways"],
];

/** Priority for Recommended / first-page seeding (India domestic first). */
export const AIRLINE_PRIORITY = [
  "IndiGo",
  "Akasa Air",
  "SpiceJet",
  "Air India Express",
  "Vistara",
  "Air India",
  "Alliance Air",
];

export function normalizeAirlineCode(raw) {
  const s = String(raw || "").trim().toUpperCase();
  if (/^[A-Z0-9]{2}$/.test(s)) return s;
  // Sometimes flight number embeds code: "6E 310" / "AI-864"
  const m = s.match(/^([A-Z0-9]{2})\b/);
  return m ? m[1] : "";
}

/**
 * Display label like "6E 2324" from IATA code + marketing number.
 * Never invents a number - returns code-only or raw if that's all we have.
 */
export function formatFlightLabel(code, number) {
  const c = normalizeAirlineCode(code);
  let n = String(number || "").trim().toUpperCase().replace(/^FLIGHT\s+/i, "");
  if (!n && !c) return "";

  // Already "6E2324" or "6E 2324" or "6E-2324" - code must start with a letter
  // (avoid "5958" → "59 58").
  const embedded = n.match(/^([A-Z][A-Z0-9])\s*[--]?\s*(\d{1,5}[A-Z]?)$/);
  if (embedded) {
    return `${embedded[1]} ${embedded[2]}`;
  }

  // Pure digits / alphanumeric marketing number
  const digits = n.match(/^(\d{1,5}[A-Z]?)$/);
  if (digits && c) return `${c} ${digits[1]}`;
  if (digits) return digits[1];

  // Number already includes spaces / full label
  if (c && n && !n.startsWith(c)) return `${c} ${n}`;
  return n || c;
}

const FAKE_AIRLINE_RE = /nuit[eé]e|nuitee|\bsandbox\b|test\s*air|dummy\s*air|fake\s*air|mock\s*air/i;

export function isFakeAirline(name, code, flightNumber) {
  const n = String(name || "");
  const c = String(code || "").trim().toUpperCase();
  const fn = String(flightNumber || "").trim().toUpperCase().replace(/\s+/g, "");
  if (FAKE_AIRLINE_RE.test(n)) return true;
  if (c === "ND") return true;
  if (fn.startsWith("ND")) return true;
  return false;
}

export function canonicalizeAirlineName(name, code) {
  const c = normalizeAirlineCode(code);
  if (c && CODE_TO_NAME[c]) return CODE_TO_NAME[c];

  const n = String(name || "").trim();
  if (!n) return c || "Airline";

  // Name is actually a 2-letter code
  const asCode = normalizeAirlineCode(n);
  if (asCode && CODE_TO_NAME[asCode] && n.length <= 3) return CODE_TO_NAME[asCode];

  for (const [re, canon] of NAME_ALIASES) {
    if (re.test(n)) return canon;
  }
  return n;
}

/** IATA from name, flight number ("GF 57"), or explicit code. */
export function inferAirlineCode(name, flightNumber, explicitCode) {
  const explicit = normalizeAirlineCode(explicitCode);
  if (explicit) return explicit;

  const fromFn = String(flightNumber || "").trim().toUpperCase();
  const embedded = fromFn.match(/^([A-Z][A-Z0-9])\s*[--]?\s*\d/);
  if (embedded) return embedded[1];
  const two = normalizeAirlineCode(fromFn);
  if (two) return two;

  const canon = canonicalizeAirlineName(name, "");
  const canonLower = String(canon || "").toLowerCase();
  for (const [code, nm] of Object.entries(CODE_TO_NAME)) {
    if (nm.toLowerCase() === canonLower) return code;
  }
  const lower = String(name || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (lower) {
    for (const [code, nm] of Object.entries(CODE_TO_NAME)) {
      if (lower.includes(nm.toLowerCase()) || nm.toLowerCase().includes(lower)) {
        return code;
      }
    }
  }
  return "";
}

export function airlineLogoUrl(code, stored) {
  if (stored && /^https?:\/\//i.test(String(stored))) return String(stored);
  const c = normalizeAirlineCode(code);
  if (!c) return "";
  return `https://pics.avs.io/al_square/80/80/${c}.png`;
}

export function airlineLogoFallbacks(code, stored) {
  const urls = [];
  if (stored && /^https?:\/\//i.test(String(stored))) urls.push(String(stored));
  const c = normalizeAirlineCode(code);
  if (c) {
    urls.push(`https://pics.avs.io/al_square/200/200/${c}.png`);
    urls.push(`https://pics.avs.io/al_square/80/80/${c}.png`);
    urls.push(`https://www.gstatic.com/flights/airline_logos/70px/${c}.png`);
    urls.push(`https://images.kiwi.com/airlines/64x64/${c}.png`);
    urls.push(`https://images.kiwi.com/airlines/64/${c}.png`);
  }
  return [...new Set(urls)];
}

export function airlinePriority(name) {
  const n = String(name || "").trim();
  const idx = AIRLINE_PRIORITY.findIndex(
    (p) => p.toLowerCase() === n.toLowerCase() || n.toLowerCase().includes(p.toLowerCase())
  );
  return idx === -1 ? 1000 + (n.charCodeAt(0) || 0) : idx;
}

/**
 * Round-robin across airlines so the first page always shows every carrier.
 * Buckets keep their incoming order (already price/duration sorted).
 */
export function diversifyByAirline(list) {
  if (!Array.isArray(list) || list.length < 2) return list;
  const buckets = new Map();
  for (const f of list) {
    const name = canonicalizeAirlineName(f.airline?.name, f.airline?.code);
    if (!buckets.has(name)) buckets.set(name, []);
    buckets.get(name).push(f);
  }
  if (buckets.size <= 1) return list;
  const queues = [...buckets.entries()]
    .sort((a, b) => airlinePriority(a[0]) - airlinePriority(b[0]))
    .map(([, q]) => q);
  const out = [];
  let added = true;
  while (added) {
    added = false;
    for (const q of queues) {
      if (q.length) {
        out.push(q.shift());
        added = true;
      }
    }
  }
  return out;
}
