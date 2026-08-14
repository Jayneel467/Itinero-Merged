import { useEffect, useMemo, useState } from "react";
import { APP_CONFIG } from "@/app/config";
import api from "@/services/api";
import { ENDPOINTS } from "@/services/endpoints";

const MEM = new Map();
const LS_PREFIX = "itinero.placesPhoto.v4:";
const LS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function cacheKey(parts) {
  return parts
    .map((p) => String(p || "").trim().toLowerCase())
    .filter(Boolean)
    .join("|");
}

function isUsableSrc(url) {
  const u = String(url || "");
  if (!u) return false;
  // Prefer same-origin proxy; ignore legacy Google CDN cache entries
  if (u.includes("googleusercontent.com") || u.includes("places.googleapis.com")) {
    return false;
  }
  return true;
}

function readLocal(key) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.url || !parsed?.at) return null;
    if (Date.now() - parsed.at > LS_TTL_MS) return null;
    if (!isUsableSrc(parsed.url)) return null;
    return parsed.url;
  } catch {
    return null;
  }
}

function writeLocal(key, url) {
  if (!isUsableSrc(url)) return;
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify({ url, at: Date.now() }));
  } catch {
    /* quota */
  }
}

/** Same-origin Places photo proxy - works through Vite / Opera VPN. */
export function placesPhotoProxyUrl({
  query = "",
  city = "",
  country = "",
  maxPx = 900,
  index = 0,
} = {}) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (city) params.set("city", city);
  if (country) params.set("country", country);
  params.set("max_px", String(maxPx || 900));
  const i = Math.max(0, Math.min(Number(index) || 0, 7));
  if (i) params.set("i", String(i));
  const path = `${ENDPOINTS.PLACES.PHOTO}/img?${params.toString()}`;
  const base = (APP_CONFIG.API_BASE_URL || "").replace(/\/$/, "");
  return base ? `${base}${path}` : path;
}

/**
 * Live Google Places landmark photo via same-origin `/api/places/photo/img`.
 * Returns the proxy URL immediately; falls back only after the <img> errors.
 */
export function usePlacesPhoto({
  query = "",
  city = "",
  country = "",
  fallback = "",
  enabled = true,
} = {}) {
  const key = cacheKey([query, city, country]);
  const proxy = useMemo(() => {
    if (!enabled || !key) return "";
    return placesPhotoProxyUrl({ query, city, country, maxPx: 900 });
  }, [enabled, key, query, city, country]);

  const [dead, setDead] = useState(false);

  useEffect(() => {
    setDead(false);
    if (!enabled || !key || !proxy) return undefined;

    // Warm Places resolve + byte cache on the server (non-blocking).
    let alive = true;
    api
      .get(
        ENDPOINTS.PLACES.PHOTO,
        {
          ...(query ? { q: query } : {}),
          ...(city ? { city } : {}),
          ...(country ? { country } : {}),
          max_px: 900,
        },
        { timeoutMs: 12_000 }
      )
      .then((res) => {
        if (!alive) return;
        if (res?.ok === false) {
          setDead(true);
          return;
        }
        MEM.set(key, proxy);
        writeLocal(key, proxy);
      })
      .catch(() => {
        /* img request will still hit /img and resolve */
      });

    return () => {
      alive = false;
    };
  }, [key, query, city, country, proxy, enabled]);

  if (!enabled || !key) return fallback || "";
  if (dead) return fallback || "";
  return proxy || fallback || "";
}

/**
 * Build a multi-slide gallery for package / destination cards.
 * Mixes cities, theme queries, and photo index so carousels feel rich.
 */
export function usePlacesGallery({
  cities = [],
  country = "",
  theme = "",
  fallbacks = [],
  maxSlides = 5,
  enabled = true,
} = {}) {
  return useMemo(() => {
    const list = (Array.isArray(cities) ? cities : [])
      .map((c) => String(c || "").trim())
      .filter(Boolean);
    const cover = (Array.isArray(fallbacks) ? fallbacks : [fallbacks])
      .map((u) => String(u || "").trim())
      .filter(Boolean);
    if (!enabled || (!list.length && !cover.length)) return cover.slice(0, maxSlides);

    const themeWord = String(theme || "").replace(/_/g, " ").trim();
    const slides = [];
    const seen = new Set();
    const push = (url) => {
      if (!url || seen.has(url) || slides.length >= maxSlides) return;
      seen.add(url);
      slides.push(url);
    };

    // Places landmarks first - catalog covers can be wrong (e.g. Goa beach for Udaipur).
    // PlacesCarousel shows the cover as a wait-state until a Places slide loads.
    list.slice(0, 3).forEach((city, cityIdx) => {
      // Avoid theme words like "honeymoon" - they pull tour-operator ads on Places.
      push(
        placesPhotoProxyUrl({
          city,
          country,
          query: `${city} famous landmark scenic view`,
          index: 0,
          maxPx: 900,
        })
      );
      push(
        placesPhotoProxyUrl({
          city,
          country,
          query: `${city} iconic tourist attraction`,
          index: (cityIdx + 1) % 3,
          maxPx: 900,
        })
      );
      if (cityIdx === 0) {
        push(
          placesPhotoProxyUrl({
            city,
            country,
            query: themeWord
              ? `${city} ${themeWord} landmark`
              : `${city} city skyline viewpoint`,
            index: 2,
            maxPx: 900,
          })
        );
      }
    });
    cover.forEach(push);

    return slides.length ? slides : cover.slice(0, maxSlides);
  }, [cities, country, theme, fallbacks, maxSlides, enabled]);
}

export default usePlacesPhoto;
