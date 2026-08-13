/** Partner deep-links that open THIS train (RailYatri / ConfirmTkt / IRCTC). */

function ymdParts(value) {
  const ymd = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-");
  return { y, m, d, dmy: `${d}-${m}-${y}` };
}

export function trainBookUrl(train = {}, journeyDate = "", cls = "", quota = "GN") {
  const number = String(train.number || "").replace(/\D/g, "");
  const klass = String(cls || train.class_code || "").toUpperCase();
  const existing = String(train.book_url || "");
  if (
    existing &&
    number &&
    existing.includes(number) &&
    !/tbs-booking/i.test(existing) &&
    !/irctc\.co\.in/i.test(existing) &&
    (!klass || existing.toUpperCase().includes(klass))
  ) {
    return existing;
  }
  if (!number) return irctcBookUrl(train, journeyDate, klass);
  const from = String(train.from_code || "").toUpperCase();
  const to = String(train.to_code || "").toUpperCase();
  const parts = ymdParts(train.date || journeyDate);
  const qta = String(quota || train.quota || "GN").toUpperCase() || "GN";
  if (from && to && parts && klass) {
    return `https://www.confirmtkt.com/rbooking/seat-availability/${number}/${from}/${to}/${klass}/${qta}/${parts.dmy}`;
  }
  if (from && to && parts) {
    return `https://www.confirmtkt.com/rbooking/trains/from/${from}/to/${to}/${parts.dmy}`;
  }
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (parts) params.set("date", parts.dmy);
  const qs = params.toString();
  return `https://www.railyatri.in/seat-availability/${number}${qs ? `?${qs}` : ""}`;
}

export function trainSeatsUrl(train = {}, journeyDate = "") {
  const number = String(train.number || "").replace(/\D/g, "");
  if (!number) return irctcBookUrl(train, journeyDate);
  const from = String(train.from_code || "").toUpperCase();
  const to = String(train.to_code || "").toUpperCase();
  const parts = ymdParts(train.date || journeyDate);
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (parts) params.set("date", parts.dmy);
  const qs = params.toString();
  return `https://www.railyatri.in/seat-availability/${number}${qs ? `?${qs}` : ""}`;
}

export function trainLiveUrl(train = {}) {
  const number = String(train.number || "").replace(/\D/g, "");
  if (train.live_url) return train.live_url;
  if (!number) return "";
  return `https://www.railyatri.in/live-train-status/${number}`;
}

export function irctcBookUrl(train = {}, journeyDate = "", cls = "") {
  const number = String(train.number || "").replace(/\D/g, "");
  const from = String(train.from_code || "").toUpperCase();
  const to = String(train.to_code || "").toUpperCase();
  const parts = ymdParts(train.date || journeyDate);
  const klass = String(cls || train.class_code || "").toUpperCase();
  const params = new URLSearchParams();
  if (number) params.set("trainNo", number);
  if (from) {
    params.set("fromStnCode", from);
    params.set("from", from);
  }
  if (to) {
    params.set("toStnCode", to);
    params.set("to", to);
  }
  if (parts) {
    params.set("doj", `${parts.d}/${parts.m}/${parts.y}`);
    params.set("journeyDate", `${parts.d}-${parts.m}-${parts.y}`);
  }
  if (klass) {
    params.set("classType", klass);
    params.set("journeyClass", klass);
  }
  const qs = params.toString();
  return qs
    ? `https://www.irctc.co.in/nget/train-search?${qs}`
    : train.irctc_url || "https://www.irctc.co.in/nget/train-search";
}

export function trainScheduleUrl(train = {}) {
  const number = String(train.number || "").replace(/\D/g, "");
  if (train.schedule_url) return train.schedule_url;
  if (!number) return "";
  return `https://www.indianrail.gov.in/enquiry/SCHEDULE/TrainSchedule.html?trainNo=${number}`;
}

export function toDmy(value) {
  const raw = String(value || "").trim();
  if (/^\d{2}-\d{2}-\d{4}$/.test(raw)) return raw;
  const ymd = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const [y, m, d] = ymd.split("-");
    return `${d}-${m}-${y}`;
  }
  return "";
}

export function toYmdDate(value) {
  const raw = String(value || "").trim();
  const d = new Date();
  const ymdOf = (dt) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  if (/^(today|tonight|aaj)$/i.test(raw)) return ymdOf(d);
  if (/^(tomorrow|kal)$/i.test(raw)) {
    d.setDate(d.getDate() + 1);
    return ymdOf(d);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw.slice(0, 10))) return raw.slice(0, 10);
  const dmy = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return "";
}

/** Pull IR station code from "Chandigarh (CDG)" or a bare code. */
export function stationCodeFrom(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const paren = raw.match(/\(([A-Za-z]{2,5})\)\s*$/);
  if (paren) return paren[1].toUpperCase();
  if (/^[A-Za-z]{2,5}$/.test(raw)) return raw.toUpperCase();
  return "";
}

/** Official IRCTC eCatering - Food on Track. */
export function irctcFoodUrl({ pnr = "", trainNumber = "", station = "", date = "" } = {}) {
  const params = new URLSearchParams();
  const digits = String(pnr || "").replace(/\D/g, "");
  if (/^\d{10}$/.test(digits)) params.set("pnr", digits);
  const num = String(trainNumber || "").replace(/\D/g, "");
  if (num) params.set("trainNo", num);
  const stn = stationCodeFrom(station) || String(station || "").trim().toUpperCase();
  if (stn && /^[A-Z]{2,5}$/.test(stn)) params.set("stnCode", stn);
  const dmy = toDmy(date);
  if (dmy) {
    params.set("doj", dmy);
    params.set("date", dmy);
  }
  const qs = params.toString();
  return qs ? `https://www.ecatering.irctc.co.in/?${qs}` : "https://www.ecatering.irctc.co.in/";
}

/** In-site Food on train panel. */
export function trainFoodPagePath({
  tab = "",
  pnr = "",
  trainNumber = "",
  boarding = "",
  boardingName = "",
  date = "",
} = {}) {
  const params = new URLSearchParams({ mode: "food" });
  const digits = String(pnr || "").replace(/\D/g, "");
  const wantPnr = String(tab || "").toLowerCase() === "pnr" || /^\d{10}$/.test(digits);
  params.set("tab", wantPnr ? "pnr" : "train");
  if (/^\d{10}$/.test(digits)) params.set("pnr", digits);
  const num = String(trainNumber || "").replace(/\D/g, "");
  if (num) params.set("number", num);
  const stn = String(boarding || "").trim().toUpperCase();
  if (stn) {
    params.set("from", stn);
    params.set("fromCode", stn);
  }
  if (boardingName) params.set("boarding", String(boardingName).trim());
  const ymd = toYmdDate(date);
  if (ymd) params.set("date", ymd);
  return `/trains?${params}`;
}

/** Partner food-on-train handoff. PNR prefills; train+station does not - use IRCTC then. */
export function trainFoodUrl({ pnr = "", trainNumber = "", from = "", to = "", date = "" } = {}) {
  const digits = String(pnr || "").replace(/\D/g, "");
  if (/^\d{10}$/.test(digits)) {
    return `https://www.railyatri.in/link-food-in-train?pnr=${digits}`;
  }
  return irctcFoodUrl({ trainNumber, station: from || to, date });
}
