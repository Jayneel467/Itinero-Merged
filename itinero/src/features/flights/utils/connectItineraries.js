import { isFakeAirline } from "./airlineIdentity";

/** Minimum connection time at the hub (self-connect, not protected MCT). */
const MCT_MIN = 90;
/** Google-style long layover cap (STV→DEL overnight ~21h still pairs). */
const LAYOVER_MAX = 26 * 60;
const MAX_ITINS = 16;
const MAX_PER_FEEDER = 3;

function segs(offer) {
  if (Array.isArray(offer?.outbound_segments) && offer.outbound_segments.length) {
    return offer.outbound_segments;
  }
  if (Array.isArray(offer?.segments) && offer.segments.length) {
    return offer.segments.filter(
      (s) => String(s?.direction || "").toUpperCase() !== "INBOUND"
    );
  }
  return [];
}

function parseIso(iso) {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? t : NaN;
}

function arriveMs(offer) {
  const list = segs(offer);
  const last = list[list.length - 1] || {};
  return parseIso(last.arrival || last.arrive);
}

function departMs(offer) {
  const list = segs(offer);
  const first = list[0] || {};
  return parseIso(first.departure || first.depart);
}

function formatDur(mins) {
  if (!Number.isFinite(mins) || mins <= 0) return "-";
  const total = Math.round(mins);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function timeOf(iso) {
  if (!iso) return "--:--";
  const s = String(iso);
  const tIdx = s.indexOf("T");
  if (tIdx >= 0 && s.length >= tIdx + 6) return s.slice(tIdx + 1, tIdx + 6);
  if (s.length >= 5 && s[2] === ":") return s.slice(0, 5);
  return "--:--";
}

function realOffer(offer) {
  if (!offer) return false;
  return !isFakeAirline(
    offer.airline,
    offer.airline_code || offer.airlineCode,
    offer.flight_number || offer.flightNumber
  );
}

/**
 * Pair origin→hub feeders with hub→dest long-hauls (Google Flights style).
 * Worldwide: any thin origin that can fly domestic/regional to a hub.
 */
export function stitchHubConnections({
  origin,
  destination,
  hub,
  feeders = [],
  hauls = [],
  max = MAX_ITINS,
} = {}) {
  const o = String(origin || "").toUpperCase();
  const d = String(destination || "").toUpperCase();
  const h = String(hub || "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(o) || !/^[A-Z]{3}$/.test(d) || !/^[A-Z]{3}$/.test(h)) {
    return [];
  }

  const liveFeeders = (Array.isArray(feeders) ? feeders : []).filter(realOffer);
  const liveHauls = (Array.isArray(hauls) ? hauls : []).filter(realOffer);
  const out = [];

  for (const feeder of liveFeeders) {
    const arr = arriveMs(feeder);
    const fDep = departMs(feeder);
    if (!Number.isFinite(arr) || !Number.isFinite(fDep)) continue;
    const fSegs = segs(feeder);
    if (!fSegs.length) continue;

    for (const haul of liveHauls) {
      const dep = departMs(haul);
      const hArr = arriveMs(haul);
      if (!Number.isFinite(dep) || !Number.isFinite(hArr)) continue;
      const wait = (dep - arr) / 60000;
      if (wait < MCT_MIN || wait > LAYOVER_MAX) continue;

      const total = (hArr - fDep) / 60000;
      if (!Number.isFinite(total) || total <= 0 || total > 60 * 48) continue;

      const hSegs = segs(haul);
      if (!hSegs.length) continue;
      const all = [...fSegs, ...hSegs];
      const feederId = feeder.offer_id || feeder.id;
      const haulId = haul.offer_id || haul.id;
      if (!feederId || !haulId) continue;

      const airlines = [feeder.airline, haul.airline].filter(Boolean);
      const uniqueAirlines = [...new Set(airlines)];

      out.push({
        id: `connect:${feederId}:${haulId}`,
        offer_id: haulId,
        feeder_offer_id: feederId,
        haul_offer_id: haulId,
        self_connect: true,
        connect_hub: h,
        airline: uniqueAirlines.join(" + ") || haul.airline || feeder.airline,
        airline_code: feeder.airline_code || haul.airline_code,
        airline_logo: feeder.airline_logo || haul.airline_logo,
        flight_number: [feeder.flight_number, haul.flight_number]
          .filter(Boolean)
          .join(" / "),
        origin: o,
        destination: d,
        depart_time: feeder.depart_time || timeOf(fSegs[0]?.departure || fSegs[0]?.depart),
        arrive_time:
          haul.arrive_time ||
          timeOf(hSegs[hSegs.length - 1]?.arrival || hSegs[hSegs.length - 1]?.arrive),
        duration: formatDur(total),
        stops: Math.max(1, all.length - 1),
        price: Number(feeder.price || 0) + Number(haul.price || 0),
        currency: feeder.currency || haul.currency || "INR",
        cabin: haul.cabin || feeder.cabin,
        segments: all,
        outbound_segments: all,
        inbound_segments: [],
        baggage: feeder.baggage,
        baggage_detail: feeder.baggage_detail || haul.baggage_detail,
      });
    }
  }

  out.sort((a, b) => {
    const dp = (a.price || 0) - (b.price || 0);
    if (dp) return dp;
    return String(a.duration).localeCompare(String(b.duration));
  });

  const perFeeder = new Map();
  const trimmed = [];
  for (const it of out) {
    const n = perFeeder.get(it.feeder_offer_id) || 0;
    if (n >= MAX_PER_FEEDER) continue;
    perFeeder.set(it.feeder_offer_id, n + 1);
    trimmed.push(it);
    if (trimmed.length >= max) break;
  }
  return trimmed;
}
