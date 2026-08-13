const CITY_SLUG = {
  baroda: "baroda",
  vadodara: "baroda",
  "vadodara-jn": "baroda",
  bombay: "mumbai",
  bengaluru: "bangalore",
  madras: "chennai",
  calcutta: "kolkata",
  gurugram: "gurgaon",
  "new-delhi": "delhi",
};

const CITY_ID = {
  surat: "473",
  ahmedabad: "551",
  baroda: "1003",
  vadodara: "1003",
  mumbai: "462",
  pune: "130",
  delhi: "733",
  "new-delhi": "733",
  chennai: "123",
  bangalore: "122",
  bengaluru: "122",
  hyderabad: "124",
  bhopal: "979",
  indore: "313",
  agra: "1290",
  manali: "757",
  goa: "210",
  mahabaleshwar: "445",
};

function slug(city) {
  const raw = String(city || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return CITY_SLUG[raw] || raw || "city";
}

function cityId(city) {
  const raw = String(city || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return CITY_ID[raw] || CITY_ID[slug(city)] || "";
}

function onwardFromYmd(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return "";
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  const mon = d.toLocaleDateString("en-GB", { month: "short" });
  const day = String(d.getDate()).padStart(2, "0");
  return `${day}-${mon}-${d.getFullYear()}`;
}

function busTypeParam({ bus_type = "", ac, sleeper, volvo } = {}) {
  const t = `${bus_type} ${volvo ? "volvo" : ""} ${ac ? "ac" : ""} ${sleeper ? "sleeper" : ""}`.toLowerCase();
  if (/\bvolvo\b/.test(t)) return "AC";
  if (/\bsleeper\b/.test(t) && /\bac\b/.test(t)) return "SLEEPER";
  if (/\bsleeper\b/.test(t)) return "SLEEPER";
  if (/\bac\b/.test(t)) return "AC";
  if (/\bseater\b/.test(t)) return "SEATER";
  return "Any";
}

function gsrtcTypeSlug(meta = {}) {
  const t = `${meta.bus_type || ""}`.toLowerCase();
  if (meta.volvo || /\bvolvo\b/.test(t)) {
    return meta.sleeper || /sleeper/.test(t) ? "volvo-ac-sleeper-2-2" : "volvo-ac";
  }
  if (meta.sleeper || /sleeper/.test(t)) return meta.ac === false ? "sleeper" : "ac-sleeper";
  if (meta.ac || /\bac\b/.test(t)) return "ac";
  return "express";
}

function isGsrtc(operator) {
  return /gsrtc|gujarat state road/i.test(String(operator || ""));
}

function normOp(operator) {
  return String(operator || "")
    .toLowerCase()
    .replace(/®/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Partner operator IDs. Empty = all operators on the corridor. */
export function operatorOpIds(operator) {
  const n = normOp(operator);
  if (!n) return "";
  if (/ankit\s+shrinath/.test(n)) return "34182";
  if (/shrinath\s+solitaire/.test(n)) return "5621";
  if (/shrinath/.test(n) && /agency/.test(n)) return "8674";
  if (/shrinath/.test(n)) return "8674,5621,34182";
  if (/samay\s+travels/.test(n)) return "31489";
  if (/shivay\s+travels/.test(n)) return "22035";
  if (/raj\s+ratan/.test(n)) return "4251";
  if (/patel\s+travels/.test(n)) return "24533";
  if (/shihori/.test(n)) return "31898";
  if (/babaraj/.test(n)) return "23379";
  if (/gujarat\s+travels/.test(n)) return "35026,34965";
  if (/\bgsrtc\b|gujarat state road/.test(n)) return "34300";
  if (/\brsrtc\b/.test(n)) return "15499";
  return "";
}

export function coachFindLine({ operator = "", dep = "", bus_type = "" } = {}) {
  return [operator, dep, bus_type].map((x) => String(x || "").trim()).filter(Boolean).join(" · ");
}

const US_KEYS = new Set([
  "new york", "nyc", "manhattan", "state college", "penn state", "boston",
  "philadelphia", "philly", "washington", "washington dc", "chicago",
  "los angeles", "san francisco", "seattle", "miami", "atlanta", "pittsburgh",
  "baltimore", "newark", "albany", "buffalo", "ithaca", "harrisburg", "hershey",
  "toronto", "montreal", "vancouver",
]);
const EU_KEYS = new Set([
  "london", "paris", "berlin", "amsterdam", "rome", "milan", "barcelona",
  "madrid", "lisbon", "prague", "vienna", "munich", "brussels", "zurich",
]);

function cityKey(name) {
  let k = String(name || "")
    .toLowerCase()
    .replace(/\b(jn|junction|bus stand)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (k !== "state college") k = k.replace(/\bcity\b/g, " ").trim();
  k = k.replace(/\b(pa|ny|nj|ma|md|va|dc|ca|tx|fl|il|wa|ga|on|qc|bc)\b$/g, "").trim();
  if (k.endsWith(" dc")) k = k.slice(0, -3).trim();
  return k;
}

export function busRegion(from, to) {
  const a = cityKey(from);
  const b = cityKey(to);
  const classOf = (k) => {
    if (US_KEYS.has(k)) return "US";
    if (EU_KEYS.has(k)) return "EU";
    if (CITY_ID[k.replace(/\s+/g, "-")] || CITY_ID[slug(k)]) return "IN";
    return "UNK";
  };
  const x = classOf(a);
  const y = classOf(b);
  if (x === "IN" && y === "IN") return "IN";
  if (x === "US" && y === "US") return "US";
  if (x === "EU" && y === "EU") return "EU";
  if ((x === "US" || y === "US") && x !== "IN" && y !== "IN") return "US";
  if ((x === "EU" || y === "EU") && x !== "IN" && y !== "IN") return "EU";
  if (x === "IN" || y === "IN") return "IN";
  return "INTL";
}

const SURAT_HOOD = new Set([
  "adajan",
  "adajan gam",
  "vesu",
  "athwa",
  "piplod",
  "city light",
  "varachha",
  "katargam",
  "rander",
  "pal",
  "althan",
  "udhna",
  "sachin",
  "amroli",
  "yogi chowk",
  "sarthana",
]);

const PSU_HOOD = new Set([
  "pollock commons",
  "pollock",
  "polok commons",
  "findlay commons",
  "redifer commons",
  "hub",
  "hub robeson",
  "university park",
  "penn state",
  "east halls",
  "west halls",
  "college avenue",
  "pattee paterno",
  "paterno",
  "pattee",
  "im building",
  "iim building",
  "ist building",
  "rec hall",
]);

const STATION_RE = /railway\s+station|rail\s+station|train\s+station|\bjn\b|junction|bus\s+stand|st\s+station|\bstation\b/i;

export function isLocalCityBus(from, to) {
  const a = cityKey(from);
  const b = cityKey(to);
  if (!a || !b) return false;
  const hoodA =
    SURAT_HOOD.has(a) ||
    PSU_HOOD.has(a) ||
    [...SURAT_HOOD, ...PSU_HOOD].some((h) => a.startsWith(`${h} `));
  const hoodB =
    SURAT_HOOD.has(b) ||
    PSU_HOOD.has(b) ||
    [...SURAT_HOOD, ...PSU_HOOD].some((h) => b.startsWith(`${h} `));
  const station = STATION_RE.test(String(from || "")) || STATION_RE.test(String(to || ""));
  const suratA = a === "surat" || (SURAT_HOOD.has(a) || /surat/.test(a));
  const suratB = b === "surat" || (SURAT_HOOD.has(b) || /surat/.test(b));
  const psuA =
    a === "state college" ||
    PSU_HOOD.has(a) ||
    /state college|penn state|pollock|paterno|pattee|im building|iim/.test(a);
  const psuB =
    b === "state college" ||
    PSU_HOOD.has(b) ||
    /state college|penn state|pollock|paterno|pattee|im building|iim/.test(b);
  if (psuA && psuB && (hoodA || hoodB || station || a === "state college" || b === "state college")) return true;
  return suratA && suratB && (hoodA || hoodB || station);
}

export function cityDirectionsUrl(fromName, toName, { fromStop = "", toStop = "" } = {}) {
  const qs = new URLSearchParams({
    api: "1",
    origin: String(fromStop || fromName || "").trim(),
    destination: String(toStop || toName || "").trim(),
    travelmode: "transit",
  });
  return `https://www.google.com/maps/dir/?${qs}`;
}

/** Coach handoff. Do not show the partner name in UI. */
export function busBookUrl({
  from,
  to,
  date = "",
  dep = "",
  operator = "",
  bus_type = "",
  ac,
  sleeper,
  volvo,
  local = false,
  fromStop = "",
  toStop = "",
  operator_id = "",
} = {}) {
  const fromName = String(from || "").replace(/\s*\([^)]*\)\s*$/, "").trim() || from;
  const toName = String(to || "").replace(/\s*\([^)]*\)\s*$/, "").trim() || to;
  if (local || isLocalCityBus(fromName, toName)) {
    return cityDirectionsUrl(fromName, toName, { fromStop, toStop });
  }
  const region = busRegion(fromName, toName);
  const ymd = /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) ? date : "";

  if (region === "US") {
    const qs = new URLSearchParams();
    if (ymd) qs.set("departDate", ymd);
    const q = qs.toString();
    return `https://www.wanderu.com/en-us/depart/${encodeURIComponent(fromName)}/${encodeURIComponent(toName)}${q ? `?${q}` : ""}`;
  }
  if (region === "EU") {
    const qs = new URLSearchParams();
    qs.set("departureCity", fromName);
    qs.set("arrivalCity", toName);
    qs.set("adult", "1");
    if (ymd) {
      const [y, m, d] = ymd.split("-");
      qs.set("rideDate", `${d}.${m}.${y}`);
    }
    return `https://shop.flixbus.com/search?${qs}`;
  }
  if (region === "INTL") {
    return cityDirectionsUrl(fromName, toName, { fromStop, toStop });
  }

  const o = slug(from);
  const d = slug(to);
  const onward = onwardFromYmd(date);
  const type = busTypeParam({ bus_type, ac, sleeper, volvo });
  const qs = new URLSearchParams();
  if (onward) {
    qs.set("onward", onward);
    qs.set("doj", onward);
  }
  qs.set("fromCityName", fromName);
  qs.set("toCityName", toName);
  qs.set("srcCountry", "IND");
  qs.set("destCountry", "IND");
  qs.set("busType", type);
  const fid = cityId(from);
  const tid = cityId(to);
  if (fid) qs.set("fromCityId", fid);
  if (tid) qs.set("toCityId", tid);
  const opIds = String(operator_id || "").trim() || operatorOpIds(operator);
  qs.set("opId", opIds || "0");

  if (isGsrtc(operator) && o && d) {
    const kind = gsrtcTypeSlug({ bus_type, ac, sleeper, volvo });
    return `https://www.redbus.in/online-booking/gsrtc/${kind}-bus-${o}-to-${d}?${qs}`;
  }

  return `https://www.redbus.in/bus-tickets/${o}-to-${d}?${qs}`;
}
