import api from "@/services/api";
import { ENDPOINTS } from "@/services/endpoints";

const CACHE_KEY = "itinero_fx_bundle_v2";
const TTL_MS = 6 * 60 * 60 * 1000;

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.rates || !parsed?.fetchedAt) return null;
    if (Date.now() - Number(parsed.fetchedAt) > TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(bundle) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ...bundle, fetchedAt: Date.now() })
    );
  } catch {
    /* ignore quota */
  }
}

export async function loadFxRates(base = "INR", quotes) {
  const cached = readCache();
  if (cached && (!base || cached.base === String(base).toUpperCase())) {
    return cached;
  }
  const res = await api.get(ENDPOINTS.FX.RATES, {
    base,
    quotes: Array.isArray(quotes) ? quotes.join(",") : quotes,
  });
  const bundle = {
    base: String(res?.base || base).toUpperCase(),
    date: res?.date || "",
    rates: res?.rates && typeof res.rates === "object" ? res.rates : {},
    source: res?.source || "frankfurter",
    mode: res?.mode || "degraded",
  };
  if (bundle.mode === "ok" && Object.keys(bundle.rates).length) {
    writeCache(bundle);
  }
  return bundle;
}

/** Convert using a rate table: rates[X] = X per 1 base (usually USD). */
export function convertWithRates(amount, from, to, bundle) {
  const n = Number(amount);
  const src = String(from || "").toUpperCase();
  const dst = String(to || "").toUpperCase();
  if (!Number.isFinite(n)) return null;
  if (!src || !dst || src === dst) return n;
  const base = String(bundle?.base || "USD").toUpperCase();
  const rates = bundle?.rates || {};
  const rateOf = (code) => {
    if (code === base) return 1;
    const r = Number(rates[code]);
    return Number.isFinite(r) && r > 0 ? r : null;
  };
  const srcR = rateOf(src);
  const dstR = rateOf(dst);
  if (srcR == null || dstR == null) return null;
  // n src → base → dst
  return n * (dstR / srcR);
}
