/**
 * On-device price watches + alert feed.
 * Prices come from live price-calendar only - never invented.
 */
import { flightService } from "@/features/flights/services/flightService";
import { sampleNearTermDates } from "@/features/flights/hooks/useLiveRoutePrices";
import { findAirportByCode } from "@/constants/airports";
import { loadAccountPrefs } from "@/features/profile/accountPrefs";

const WATCH_KEY = "itinero_price_watches_v1";
const FEED_KEY = "itinero_alert_feed_v1";
const READ_KEY = "itinero_alert_read_at_v1";

function uid() {
  return `w_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function cityLabel(code) {
  const a = findAirportByCode(code);
  return a ? `${a.city} (${a.code})` : String(code || "").toUpperCase();
}

function readJson(key, fallback) {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null");
    return raw ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota */
  }
}

export function listWatches() {
  const rows = readJson(WATCH_KEY, []);
  return Array.isArray(rows) ? rows : [];
}

export function saveWatches(rows) {
  writeJson(WATCH_KEY, rows);
  return rows;
}

export function addWatch({ origin, destination, currency = "INR" }) {
  const from = String(origin || "").trim().toUpperCase();
  const to = String(destination || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to) || from === to) {
    return { ok: false, error: "Pick two different airport codes (e.g. BOM → DEL)." };
  }
  const prefs = loadAccountPrefs();
  if (!prefs.priceAlerts) {
    return { ok: false, error: "Turn on Price alerts first." };
  }
  const existing = listWatches();
  if (existing.some((w) => w.origin === from && w.destination === to)) {
    return { ok: false, error: "You’re already watching that route." };
  }
  if (existing.length >= 8) {
    return { ok: false, error: "You can watch up to 8 routes on this device." };
  }
  const row = {
    id: uid(),
    origin: from,
    destination: to,
    originLabel: cityLabel(from),
    destinationLabel: cityLabel(to),
    currency: String(currency || "INR").toUpperCase(),
    createdAt: new Date().toISOString(),
    baselinePrice: null,
    lastPrice: null,
    bestDate: null,
    lastCheckedAt: null,
    lastError: null,
  };
  saveWatches([row, ...existing]);
  return { ok: true, watch: row };
}

export function removeWatch(id) {
  saveWatches(listWatches().filter((w) => w.id !== id));
}

export function listFeed() {
  const rows = readJson(FEED_KEY, []);
  return Array.isArray(rows) ? rows : [];
}

function pushFeed(item) {
  const next = [item, ...listFeed()].slice(0, 40);
  writeJson(FEED_KEY, next);
  return next;
}

export function clearFeed() {
  writeJson(FEED_KEY, []);
}

export function getAlertsReadAt() {
  try {
    return Number(localStorage.getItem(READ_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

export function markAlertsRead() {
  const at = Date.now();
  try {
    localStorage.setItem(READ_KEY, String(at));
  } catch {
    /* ignore */
  }
  return at;
}

export function unreadAlertCount(feed = listFeed()) {
  const readAt = getAlertsReadAt();
  return feed.filter((a) => {
    const t = Date.parse(a.at || 0);
    return Number.isFinite(t) && t > readAt;
  }).length;
}

async function probeRouteMin(origin, destination, currency) {
  const dates = sampleNearTermDates(6);
  const res = await flightService.priceCalendar({
    origin,
    destination,
    dates,
    adults: 1,
    children: 0,
    infants: 0,
    cabin: "ECONOMY",
    currency,
  });
  const rows = Array.isArray(res?.dates) ? res.dates : [];
  let min = null;
  let bestDate = null;
  for (const row of rows) {
    const p = row?.minPrice;
    if (typeof p === "number" && p > 0 && (min == null || p < min)) {
      min = p;
      bestDate = row.date || null;
    }
  }
  if (min == null) {
    return {
      ok: false,
      error: res?.message || "No live fare on the sampled dates yet.",
      mode: res?.mode || "empty",
    };
  }
  return { ok: true, minPrice: min, bestDate, currency: res?.currency || currency };
}

/**
 * Refresh one watch against live price-calendar.
 * Drops ≥3% (or ₹500 / $5) vs baseline create a feed item.
 */
export async function refreshWatch(id) {
  const watches = listWatches();
  const idx = watches.findIndex((w) => w.id === id);
  if (idx < 0) return { ok: false, error: "Watch not found." };
  const prefs = loadAccountPrefs();
  if (!prefs.priceAlerts) {
    return { ok: false, error: "Price alerts are off." };
  }

  const watch = watches[idx];
  const probe = await probeRouteMin(watch.origin, watch.destination, watch.currency);
  const now = new Date().toISOString();

  if (!probe.ok) {
    watches[idx] = { ...watch, lastCheckedAt: now, lastError: probe.error };
    saveWatches(watches);
    return { ok: false, error: probe.error, watch: watches[idx] };
  }

  const prevBaseline = watch.baselinePrice;
  const prevLast = watch.lastPrice;
  const next = {
    ...watch,
    lastPrice: probe.minPrice,
    bestDate: probe.bestDate,
    baselinePrice: prevBaseline == null ? probe.minPrice : prevBaseline,
    lastCheckedAt: now,
    lastError: null,
  };

  let alert = null;
  const compareAgainst = prevLast != null ? prevLast : prevBaseline;
  if (typeof compareAgainst === "number" && probe.minPrice < compareAgainst) {
    const drop = compareAgainst - probe.minPrice;
    const pct = (drop / compareAgainst) * 100;
    const minDrop = watch.currency === "INR" ? 500 : 5;
    if (pct >= 3 || drop >= minDrop) {
      alert = {
        id: `a_${Date.now().toString(36)}`,
        type: "price_drop",
        at: now,
        watchId: watch.id,
        origin: watch.origin,
        destination: watch.destination,
        title: `${watch.origin} → ${watch.destination} dropped`,
        body: `Live min ${formatMoney(probe.minPrice, watch.currency)} (was ${formatMoney(compareAgainst, watch.currency)})${
          probe.bestDate ? ` · best ${probe.bestDate}` : ""
        }.`,
        price: probe.minPrice,
        wasPrice: compareAgainst,
        currency: watch.currency,
        bestDate: probe.bestDate,
        url: `/flights?from=${watch.origin}&to=${watch.destination}${
          probe.bestDate ? `&depart=${probe.bestDate}` : ""
        }`,
      };
      pushFeed(alert);
      // Reset baseline to new low so we alert on further drops.
      next.baselinePrice = probe.minPrice;
    }
  }

  // First successful check: confirm watch is live (not a fake drop).
  if (prevBaseline == null && prevLast == null) {
    pushFeed({
      id: `a_${Date.now().toString(36)}_on`,
      type: "watch_on",
      at: now,
      watchId: watch.id,
      origin: watch.origin,
      destination: watch.destination,
      title: `Watching ${watch.origin} → ${watch.destination}`,
      body: `Live min ${formatMoney(probe.minPrice, watch.currency)}${
        probe.bestDate ? ` around ${probe.bestDate}` : ""
      }. We’ll flag real drops on this device.`,
      price: probe.minPrice,
      currency: watch.currency,
      bestDate: probe.bestDate,
      url: `/flights?from=${watch.origin}&to=${watch.destination}`,
    });
  }

  watches[idx] = next;
  saveWatches(watches);
  return { ok: true, watch: next, alert };
}

export async function refreshAllWatches() {
  const prefs = loadAccountPrefs();
  if (!prefs.priceAlerts) {
    return { ok: false, error: "Price alerts are off.", results: [] };
  }
  const results = [];
  for (const w of listWatches()) {
    // Sequential to avoid hammering LiteAPI.
    // eslint-disable-next-line no-await-in-loop
    results.push(await refreshWatch(w.id));
  }
  return { ok: true, results };
}

/** Build soft trip reminders from booked trips (no invented gates). */
export function syncTripReminders(trips = []) {
  const prefs = loadAccountPrefs();
  if (!prefs.tripReminders) return listFeed();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const feed = listFeed();
  const existingKeys = new Set(
    feed.filter((a) => a.type === "trip_reminder").map((a) => a.dedupeKey).filter(Boolean)
  );

  let changed = false;
  for (const trip of trips) {
    const depart = parseTripDate(trip?.departDate || trip?.departureDate || trip?.startDate);
    if (!depart) continue;
    const days = Math.round((depart.getTime() - today.getTime()) / 86400000);
    if (days < 0 || days > 3) continue;
    const id = trip.id || trip.bookingId || trip.pnr || trip.title;
    if (!id) continue;
    const dedupeKey = `reminder:${id}:${days}`;
    if (existingKeys.has(dedupeKey)) continue;

    const title =
      trip.title ||
      [trip.origin, trip.destination].filter(Boolean).join(" → ") ||
      "Upcoming trip";
    const when =
      days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
    pushFeed({
      id: `a_${Date.now().toString(36)}_${id}`,
      type: "trip_reminder",
      dedupeKey,
      at: new Date().toISOString(),
      title: `Trip ${when}`,
      body: `${title}${trip.departDate ? ` · ${trip.departDate}` : ""}. Open My Trips for ticket details - we don’t invent gates.`,
      url: trip.id ? `/trips/${trip.id}` : "/trips",
    });
    existingKeys.add(dedupeKey);
    changed = true;
  }
  return changed ? listFeed() : feed;
}

function parseTripDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(String(value))) {
    const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatMoney(amount, currency = "INR") {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "-";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount)}`;
  }
}
