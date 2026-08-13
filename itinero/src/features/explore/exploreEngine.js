/**
 * Explore ranking - current intent first, then origin / season / taste.
 * Never: if couple → Bali.
 */

import { EXPLORE_CATALOG } from "./data/catalog";
import {
  CLOSER_BY_ORIGIN,
  CRAVINGS,
  DESTINATION_STORY,
  FEEL_LIKE,
  MOMENTS,
  getStory,
  monthWindowMeta,
} from "./data/editorial";
import { getExploreTaste } from "./exploreTaste";
import { listSaved } from "@/features/account/savedService";
import {
  CLOSER_BY_MARKET,
  exploreMarketBoost,
  isDomesticDestination,
  isInternationalDestination,
  normalizeMarketCode,
} from "@/constants/marketAffinity";

const BEACHY = new Set(["beach", "islands"]);
const COOL = new Set(["hills", "ski"]);
const FOOD = new Set(["food"]);
const ADVENTURE = new Set(["adventure", "trekking", "safari", "wildlife"]);
const THEME_TAGS = new Set([
  "hills",
  "city",
  "pilgrimage",
  "honeymoon",
  "wildlife",
  "culture",
  "wellness",
  "islands",
  "trekking",
  "safari",
  "family",
  "luxury",
  "ski",
  "hiking",
  "backpacking",
  "roadtrip",
  "beach",
  "food",
  "adventure",
]);
const STOP = new Set([
  "the", "and", "for", "with", "from", "that", "this", "have", "want", "somewhere",
  "where", "trip", "full", "can", "my", "our", "you", "me", "a", "an", "to", "of",
  "in", "on", "at", "yr", "year", "years", "old",
]);

function monthNow(now = new Date()) {
  return now.getMonth() + 1;
}

function storyOf(dest) {
  return getStory(dest) || {};
}

function inSeason(dest, month) {
  const months = storyOf(dest).seasonMonths;
  if (!months?.length) return 0.45;
  return months.includes(month) ? 1 : months.some((m) => Math.abs(m - month) <= 1 || Math.abs(m - month) >= 11)
    ? 0.55
    : 0.15;
}

function hoursFromOrigin(dest, originCode) {
  if (!dest) return 12;
  if (["lonavala", "nashik", "alibaug"].includes(dest.id) && originCode === "BOM") {
    return dest.id === "nashik" ? 3 : 2;
  }
  return Number(dest.flightHoursApprox) || 8;
}

export function scoreDestination(dest, ctx = {}) {
  if (!dest) return { score: 0, why: "" };
  const {
    origin = "",
    homeCountry = "",
    month = monthNow(),
    craving = null,
    feel = null,
    query = "",
    mapFilters = [],
    dislikes = {},
    savedIds = [],
    seen = [],
  } = ctx;

  if (dislikes[dest.id]) return { score: -1000, why: "" };

  const story = storyOf(dest);
  const moods = new Set(story.moods || dest.themes || []);
  const themes = new Set(dest.themes || []);
  const q = String(query || "").toLowerCase();
  const market = normalizeMarketCode(homeCountry);

  let score = dest.trendingScore || 50;
  const reasons = [];

  if (craving) {
    const hitTheme = (craving.themes || []).some((t) => themes.has(t));
    const hitMood = (craving.moods || []).some((m) => moods.has(m));
    if (hitTheme || hitMood) {
      score += 42;
      reasons.push(craving.label);
    } else score -= 18;
  }

  if (feel?.destIds?.includes(dest.id)) {
    score += 48;
    reasons.push(feel.title);
  } else if (feel) score -= 8;

  if (q) {
    const tokens = q
      .split(/[^a-z0-9+]+/i)
      .map((t) => t.trim())
      .filter((t) => t.length > 2 && !STOP.has(t));
    const hay = `${dest.city} ${dest.country} ${dest.blurb} ${(story.tagline || "")} ${(story.why || "")} ${(dest.themes || []).join(" ")} ${(story.moods || []).join(" ")}`.toLowerCase();
    if (hay.includes(q)) {
      score += 36;
      reasons.push(`matches “${query.trim()}”`);
    } else {
      const hits = tokens.filter((t) => hay.includes(t));
      if (hits.length) {
        score += Math.min(28, 8 + hits.length * 6);
        if (hits.length >= 2) reasons.push(`fits “${hits.slice(0, 2).join(" · ")}”`);
      }
    }
    if (/\bno beach\b|not beach|skip beach/i.test(q) && [...themes].some((t) => BEACHY.has(t))) {
      score -= 80;
    }
    const romanticAsk =
      /romantic|romance|honeymoon|just us|couple|gf|bf|girlfriend|boyfriend|anniversary|intimate/i.test(q);
    if (romanticAsk && (moods.has("romantic") || themes.has("honeymoon") || themes.has("beach") || themes.has("islands"))) {
      score += 28;
      reasons.push("romantic vibe");
    }
    if (/relax|chill|slow|spa|reset|peaceful|quiet|unplug|full relax/i.test(q) && (moods.has("slow") || moods.has("wellness") || themes.has("beach") || themes.has("hills") || themes.has("wellness"))) {
      score += 22;
      reasons.push("easy to slow down");
    }
    if (/unexpected|never considered|surprise/i.test(q) && dest.trendingScore < 90) score += 14;
    if (/vegetarian|veg /i.test(q) && themes.has("food")) score += 10;
    if (/nightlife|after dark|night/i.test(q) && (moods.has("nightlife") || themes.has("city"))) score += 12;
    if (/warm|heat|sun/i.test(q) && (themes.has("beach") || dest.continent === "asia" || dest.continent === "india" || dest.continent === "americas")) score += 10;
    if (/mountain|hills|trek/i.test(q) && (themes.has("hills") || themes.has("trekking"))) score += 12;
    if (/difficult trek|hard hik/i.test(q) && themes.has("trekking")) score -= 20;
  }

  const season = inSeason(dest, month);
  score += season * 22;
  if (season >= 0.9 && story.best) reasons.push(story.best);

  const hoursRaw = hoursFromOrigin(dest, origin);
  const hours =
    market && isDomesticDestination(dest, market)
      ? Math.min(hoursRaw, market === "US" || market === "CA" ? 4.5 : 3.5)
      : hoursRaw;
  score += Math.max(0, 16 - hours);
  if (hours <= 3) reasons.push("close from here");

  const marketBoost = exploreMarketBoost(dest, market);
  score += marketBoost;
  if (marketBoost >= 40) reasons.push("near home");
  else if (marketBoost >= 20) reasons.push("fits your region");

  if (mapFilters.includes("beach") && ![...themes].some((t) => BEACHY.has(t))) score -= 40;
  if (mapFilters.includes("cool") && ![...themes].some((t) => COOL.has(t))) score -= 30;
  if (mapFilters.includes("food") && ![...themes].some((t) => FOOD.has(t))) score -= 25;
  if (mapFilters.includes("adventure") && ![...themes].some((t) => ADVENTURE.has(t))) score -= 25;
  for (const filterId of mapFilters) {
    if (THEME_TAGS.has(filterId) && !themes.has(filterId)) score -= 35;
  }
  if (mapFilters.includes("under8h") && hours > 8) score -= 50;
  if (mapFilters.includes("this-month") && season < 0.5) score -= 35;
  if (mapFilters.includes("visa-light") && story.visaLight && /schengen|visa required|check/i.test(story.visaLight)) {
    score -= 12;
  }
  if (mapFilters.includes("domestic") && !isDomesticDestination(dest, market || "IN")) {
    score -= 220;
  }
  if (mapFilters.includes("international") && !isInternationalDestination(dest, market || "IN")) {
    score -= 220;
  }

  if (savedIds.includes(`explore:${dest.slug || dest.id}`)) score += 10;
  if (seen.includes(dest.id)) score -= 6;

  // Prefer scored reasons so “Vero thinks you’d like” feels personal,
  // not a static catalog blurb.
  const why =
    reasons.length > 0
      ? reasons.slice(0, 2).join(" · ")
      : story.why || dest.blurb || "";

  return { score, why, reasons: reasons.slice(0, 3), hours, season };
}

export function rankDestinations(list = EXPLORE_CATALOG, ctx = {}) {
  const taste = getExploreTaste();
  const savedIds = listSaved()
    .filter((r) => r.type === "destination")
    .map((r) => r.id);
  const full = { ...ctx, dislikes: taste.dislikes, seen: taste.seen, savedIds };
  return [...list]
    .map((d) => ({ dest: d, ...scoreDestination(d, full) }))
    .filter((x) => x.score > -200)
    .sort((a, b) => b.score - a.score);
}

export function worthGoingNow(now = new Date(), ctx = {}) {
  const month = monthNow(now);
  const ranked = rankDestinations(EXPLORE_CATALOG, { month, ...ctx });
  const seasonal = ranked.filter((x) => {
    const months = storyOf(x.dest).seasonMonths;
    return months?.includes(month);
  });
  const pool = (seasonal.length >= 3 ? seasonal : ranked).slice(0, 6);
  return pool.slice(0, 3).map((x) => {
    const story = storyOf(x.dest);
    const meta = monthWindowMeta(story.seasonMonths || [month], now);
    const timely =
      month >= 9 && month <= 11 && x.dest.id === "kyoto"
        ? "Autumn is beginning"
        : month >= 6 && month <= 9 && x.dest.id === "udaipur"
          ? "Monsoon makes the lakes and hills come alive"
          : month >= 6 && month <= 8 && x.dest.id === "reykjavik"
            ? "Long evenings and open landscapes"
            : story.best
              ? `Best window: ${story.best}`
              : x.dest.blurb;
    return {
      dest: x.dest,
      timely,
      tags: (x.dest.themes || []).slice(0, 3),
      why: x.why,
      meta: { ...meta, reason: "good_weather_window", confidence: x.season >= 0.9 ? "high" : "medium" },
    };
  });
}

export function veroPicks(ctx = {}) {
  const from = String(ctx.originLabel || ctx.origin || "your city");
  return rankDestinations(EXPLORE_CATALOG, ctx)
    .filter((x) => !["lonavala", "nashik", "alibaug"].includes(x.dest.id))
    .slice(0, 3)
    .map((x) => {
      const chips = (x.reasons || []).slice(0, 3);
      const line =
        chips.length > 0
          ? `I’d put ${x.dest.city} on your shortlist from ${from} - ${chips.join(" · ")}.`
          : x.why || storyOf(x.dest).why || x.dest.blurb;
      return {
        dest: x.dest,
        why: line,
        reasons: chips,
      };
    });
}

function resolveSavedDest(row) {
  if (!row) return null;
  const raw = String(row.id || "").replace(/^explore:/, "");
  const urlSlug = String(row.url || "").match(/\/explore\/([^/?#]+)/)?.[1];
  const key = (raw || urlSlug || "").toLowerCase();
  if (!key) return null;
  return (
    EXPLORE_CATALOG.find(
      (d) =>
        d.id === key ||
        d.slug === key ||
        d.slug === raw ||
        d.id === raw ||
        String(d.city).toLowerCase() === String(row.title || "").toLowerCase()
    ) || null
  );
}

/**
 * Vero Insights - rank saved places (go here first) + similar places not saved yet.
 */
export function veroInsights(ctx = {}) {
  const from = String(ctx.originLabel || ctx.origin || "your city");
  const rows = listSaved().filter(
    (r) => r.type === "destination" || String(r.id || "").startsWith("explore:") || /\/explore\//.test(String(r.url || ""))
  );
  const savedDests = [];
  const seenIds = new Set();
  for (const row of rows) {
    const dest = resolveSavedDest(row);
    if (!dest || seenIds.has(dest.id)) continue;
    seenIds.add(dest.id);
    savedDests.push(dest);
  }

  const rankedSaved = rankDestinations(savedDests, ctx).filter((x) => x.score > -200);
  const goFirst = rankedSaved[0]
    ? {
        dest: rankedSaved[0].dest,
        why:
          rankedSaved[0].reasons?.length > 0
            ? `Out of your saves, start with ${rankedSaved[0].dest.city} - ${rankedSaved[0].reasons.slice(0, 2).join(" · ")}.`
            : `Out of your saves, ${rankedSaved[0].dest.city} fits best from ${from} right now.`,
        reasons: ["From your saves", ...(rankedSaved[0].reasons || []).slice(0, 2)],
        hours: rankedSaved[0].hours,
      }
    : null;
  const otherSaved = rankedSaved.slice(1, 4).map((x) => ({
    dest: x.dest,
    why: x.reasons?.length ? x.reasons.slice(0, 2).join(" · ") : x.why || storyOf(x.dest).why || x.dest.blurb,
    reasons: x.reasons || [],
  }));

  const themeVotes = new Map();
  const moodVotes = new Map();
  for (const d of savedDests) {
    const story = storyOf(d);
    for (const t of d.themes || []) themeVotes.set(t, (themeVotes.get(t) || 0) + 2);
    for (const m of story.moods || []) moodVotes.set(m, (moodVotes.get(m) || 0) + 2);
  }
  const topThemes = [...themeVotes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);
  const topMoods = [...moodVotes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
  const affinityQuery = [ctx.query, ...topMoods, ...topThemes].filter(Boolean).join(" ");

  const alsoTry = rankDestinations(EXPLORE_CATALOG, { ...ctx, query: affinityQuery || ctx.query })
    .filter((x) => !seenIds.has(x.dest.id) && !["lonavala", "nashik", "alibaug"].includes(x.dest.id))
    .slice(0, 3)
    .map((x, i) => {
      const story = storyOf(x.dest);
      const chips = (x.reasons || []).slice(0, 3);
      const hook =
        story.why ||
        x.dest.blurb ||
        chips[0] ||
        (topThemes[0] ? `Pairs with your ${topThemes[0]} saves` : "Worth a look next");
      const hooks = [
        hook,
        chips[0] && chips[0] !== hook ? chips[0] : null,
        x.hours != null && x.hours <= 6 ? `~${Math.round(x.hours)}h from ${from}` : null,
      ].filter(Boolean);
      return {
        dest: x.dest,
        why: hooks[i % hooks.length] || hook,
        reasons: chips.length ? chips : [hook],
      };
    });

  const savedCount = savedDests.length;
  const headline = savedCount
    ? "Vero Insights"
    : "Vero Insights";
  const lede = savedCount
    ? `From ${savedCount} saved place${savedCount === 1 ? "" : "s"} · flying from ${from}${
        ctx.query ? ` · reading “${String(ctx.query).trim()}”` : ""
      }`
    : `Save places you like - I’ll pick which to book first from ${from}, then show fresh options.`;

  return {
    savedCount,
    headline,
    lede,
    goFirst,
    otherSaved,
    alsoTry,
    tasteLabels: [...topMoods, ...topThemes].slice(0, 4),
  };
}

export function surprisePick(excludeIds = [], ctx = {}) {
  const ranked = rankDestinations(EXPLORE_CATALOG, {
    ...ctx,
    query: `${ctx.query || ""} unexpected surprise`,
  }).filter((x) => !excludeIds.includes(x.dest.id) && x.dest.iata);
  const pool = ranked.slice(0, 12);
  if (!pool.length) return null;
  const idx = Math.min(pool.length - 1, Math.floor(Math.random() * Math.min(6, pool.length)));
  const pick = pool[idx];
  return {
    dest: pick.dest,
    why: storyOf(pick.dest).why || pick.why || pick.dest.blurb,
  };
}

export function closerThanYouThink(origin = "", homeCountry = "") {
  const code = String(origin || "").toUpperCase();
  const market = normalizeMarketCode(homeCountry);
  const rows =
    CLOSER_BY_ORIGIN[code] ||
    CLOSER_BY_MARKET[market] ||
    (market === "IN" ? CLOSER_BY_ORIGIN.BOM : CLOSER_BY_MARKET.US) ||
    [];
  return rows
    .map((row) => {
      const dest = EXPLORE_CATALOG.find((d) => d.id === row.id);
      return dest ? { dest, label: row.label, mode: row.mode } : null;
    })
    .filter(Boolean);
}

export function activeMoments(now = new Date()) {
  const m = monthNow(now);
  return MOMENTS.filter((moment) => {
    const meta = monthWindowMeta(moment.months, now);
    const soon = moment.months.some((x) => {
      const diff = (x - m + 12) % 12;
      return diff <= 1;
    });
    return meta.active || soon;
  }).map((moment) => ({
    ...moment,
    meta: { ...monthWindowMeta(moment.months, now), reason: "seasonal_moment", confidence: "high" },
    destinations: moment.destIds
      .map((id) => EXPLORE_CATALOG.find((d) => d.id === id || d.slug === id))
      .filter(Boolean),
  }));
}

export function collectionById(kind, id) {
  if (kind === "craving") {
    const craving = CRAVINGS.find((c) => c.id === id);
    if (!craving) return null;
    const ranked = rankDestinations(EXPLORE_CATALOG, { craving });
    return {
      kind,
      id,
      title: craving.label,
      blurb: craving.blurb,
      items: ranked.slice(0, 12).map((x) => x.dest),
    };
  }
  if (kind === "feel") {
    const feel = FEEL_LIKE.find((f) => f.id === id);
    if (!feel) return null;
    return {
      kind,
      id,
      title: feel.title,
      blurb: feel.blurb,
      items: feel.destIds.map((did) => EXPLORE_CATALOG.find((d) => d.id === did)).filter(Boolean),
    };
  }
  if (kind === "moment") {
    const moment = MOMENTS.find((m) => m.id === id);
    if (!moment) return null;
    return {
      kind,
      id,
      title: moment.title,
      blurb: `${moment.place} · ${moment.reason}`,
      items: moment.destIds.map((did) => EXPLORE_CATALOG.find((d) => d.id === did || d.slug === did)).filter(Boolean),
    };
  }
  return null;
}

export function lightAlert(dest, intel) {
  const story = storyOf(dest);
  const month = monthNow();
  if (story.seasonMonths?.includes(7) && story.seasonMonths?.includes(8) && [6, 7, 8, 9].includes(month) && dest.continent === "india") {
    return "Monsoon season";
  }
  if (intel?.health?.altitude && /high|altitude/i.test(intel.health.altitude)) return "High altitude";
  if (intel?.alerts?.some((a) => /visa/i.test(a.label))) return "Visa required";
  if (story.visaLight && /schengen|visa required|e-visa|evisa/i.test(story.visaLight) && dest.continent !== "india") {
    return /schengen/i.test(story.visaLight) ? "Visa required" : story.visaLight.split(/[·.]/)[0].trim();
  }
  return "";
}

export { DESTINATION_STORY, CRAVINGS, FEEL_LIKE };
