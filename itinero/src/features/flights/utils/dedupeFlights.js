/** Normalize flight number labels for stable comparison. */
function normFn(raw) {
  return String(raw || "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function timeKey(raw) {
  return String(raw || "").slice(0, 5);
}

function priceKey(raw) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/**
 * Group key for near-duplicate itineraries.
 * Collapses multiple feeder flights into the same hub long-haul (same arrival + price).
 */
export function flightDedupeKey(flight) {
  const origin = String(flight.routeOrigin || flight.departure?.airport || "").toUpperCase();
  const dest = String(flight.routeDestination || flight.arrival?.airport || "").toUpperCase();
  const segs = (flight.segmentFlightNos || []).map(normFn).filter(Boolean);
  const hubs = (flight.layoverCodes || [])
    .map((c) => String(c).toUpperCase())
    .filter(Boolean)
    .join("+");
  const arr = timeKey(flight.arrival?.time);
  const day = Number(flight.dayOffset) || 0;
  const price = priceKey(flight.price);
  const cabin = String(flight.cabin || flight.fares?.[0]?.cabin || "").toUpperCase();

  if (segs.length <= 1) {
    return `${origin}|${dest}|${segs[0] || ""}|${timeKey(flight.departure?.time)}|${arr}|${day}|${price}|${cabin}`;
  }

  const tail = segs.slice(1).join(">");
  return `${origin}|${dest}|${hubs}|${tail}|${arr}|${day}|${price}|${cabin}`;
}

/** Lower score = preferred representative when collapsing duplicates. */
function flightRank(flight) {
  let score = 0;
  if (flight.isSelfConnect) score += 10_000;
  score += Number(flight.durationMins) || 99_999;
  const dep = timeKey(flight.departure?.time);
  const [h, m] = dep.split(":").map(Number);
  score += (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  return score;
}

/**
 * Remove repeated cards for the same trip experience.
 * Keeps the best published itinerary when several feeders share a hub flight.
 */
export function dedupeFlights(list) {
  if (!Array.isArray(list) || list.length < 2) return list;

  const groups = new Map();
  for (const flight of list) {
    const key = flightDedupeKey(flight);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(flight);
  }

  const kept = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      kept.push(group[0]);
      continue;
    }
    group.sort((a, b) => flightRank(a) - flightRank(b));
    kept.push(group[0]);
  }

  const order = new Map();
  list.forEach((f, i) => {
    if (!order.has(f.id)) order.set(f.id, i);
  });

  return kept.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}
