/**
 * LiteAPI Payment SDK helpers.
 *
 * Official flow (docs.liteapi.travel/docs/user-payment):
 *   1) prebook with usePaymentSdk=true → secretKey + transactionId
 *   2) load https://payment-wrapper.liteapi.travel/dist/liteAPIPayment.js
 *   3) new LiteAPIPayment({ publicKey: "sandbox"|"live", secretKey, targetElement, returnUrl }).handlePayment()
 *
 * That mounts Stripe Payment Element (accordion) - not a bare Card Element.
 */

const CONFIG_URL = "https://payment-wrapper.liteapi.travel/config";
const SCRIPT_URL = "https://payment-wrapper.liteapi.travel/dist/liteAPIPayment.js?v=a1";
const CHECKOUT_STORAGE_PREFIX = "itinero.liteapi.checkout.";

const _cache = Object.create(null);
const _inflight = Object.create(null);
let _scriptPromise = null;

export function liteApiSdkEnv(holdOrHint) {
  if (typeof holdOrHint === "string") {
    const s = holdOrHint.trim().toLowerCase();
    if (s === "live" || s === "prod" || s === "production") return "live";
    return "sandbox";
  }
  const hint = holdOrHint || {};
  if (hint.sdk_public_key === "live" || hint.payment_env === "live") return "live";
  const pk = String(hint.publishable_key || "");
  if (pk.startsWith("pk_live_")) return "live";
  return "sandbox";
}

/** Prefer an explicit pk_…, else fall back to Vite env if present. */
export function readLocalStripePublishableKey(raw) {
  const key = String(raw || "").trim();
  if (key.startsWith("pk_")) return key;
  try {
    const env = String(import.meta.env?.VITE_STRIPE_PUBLISHABLE_KEY || "").trim();
    if (env.startsWith("pk_")) return env;
  } catch {
    /* ignore */
  }
  return null;
}

async function fetchLiteApiConfig(env, attempt = 0) {
  const res = await fetch(CONFIG_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ publicKey: env }),
  });
  if (res.status === 429 && attempt < 3) {
    await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    return fetchLiteApiConfig(env, attempt + 1);
  }
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error(
        "LiteAPI Payment SDK is rate-limited right now. Wait a few seconds and try again."
      );
    }
    throw new Error("Could not load LiteAPI Payment SDK config.");
  }
  return res.json();
}

/**
 * Resolve the Stripe publishable key LiteAPI expects for Payment SDK.
 * Dedupes concurrent calls and caches by sandbox|live.
 * @param {string | object} [envOrHold]
 * @returns {Promise<string>}
 */
export async function resolveLiteApiPublishableKey(envOrHold = "sandbox") {
  const local = readLocalStripePublishableKey(
    typeof envOrHold === "object" ? envOrHold?.publishable_key : null
  );
  if (local) return local;

  const env = liteApiSdkEnv(envOrHold);
  if (_cache[env]) return _cache[env];
  if (_inflight[env]) return _inflight[env];

  _inflight[env] = (async () => {
    try {
      const data = await fetchLiteApiConfig(env);
      const pk = String(data?.publicKey || "").trim();
      if (!pk.startsWith("pk_")) {
        throw new Error("LiteAPI Payment SDK did not return a Stripe publishable key.");
      }
      _cache[env] = pk;
      return pk;
    } finally {
      delete _inflight[env];
    }
  })();

  return _inflight[env];
}

/** Load the official LiteAPIPayment constructor (window.LiteAPIPayment). */
export function loadLiteApiPaymentScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("LiteAPI Payment SDK requires a browser."));
  }
  if (typeof window.LiteAPIPayment === "function") {
    return Promise.resolve(window.LiteAPIPayment);
  }
  if (_scriptPromise) return _scriptPromise;

  _scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src^="https://payment-wrapper.liteapi.travel/dist/liteAPIPayment.js"]`);
    if (existing) {
      existing.addEventListener("load", () => {
        if (typeof window.LiteAPIPayment === "function") resolve(window.LiteAPIPayment);
        else reject(new Error("LiteAPI Payment SDK loaded without LiteAPIPayment."));
      });
      existing.addEventListener("error", () =>
        reject(new Error("LiteAPI Payment SDK script failed to load."))
      );
      if (typeof window.LiteAPIPayment === "function") resolve(window.LiteAPIPayment);
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (typeof window.LiteAPIPayment === "function") resolve(window.LiteAPIPayment);
      else reject(new Error("LiteAPI Payment SDK loaded without LiteAPIPayment."));
    };
    script.onerror = () => {
      _scriptPromise = null;
      reject(
        new Error(
          "LiteAPI Payment SDK could not load (blocked?). Allow payment-wrapper.liteapi.travel."
        )
      );
    };
    document.head.appendChild(script);
  });

  return _scriptPromise;
}

/**
 * Mount the official LiteAPI Payment Element into `targetSelector`.
 * @returns {Promise<{ env: string }>}
 */
export async function launchLiteApiPayment({
  hold,
  targetSelector,
  returnUrl,
  businessName = "Itinero",
  theme = "flat",
} = {}) {
  const secretKey = String(hold?.client_secret || hold?.secretKey || "").trim();
  if (!secretKey) throw new Error("Missing LiteAPI Payment SDK secret.");
  if (!targetSelector) throw new Error("Missing payment mount target.");
  if (!returnUrl) throw new Error("Missing payment return URL.");

  const env = liteApiSdkEnv(hold);
  const LiteAPIPayment = await loadLiteApiPaymentScript();

  const node =
    typeof targetSelector === "string"
      ? document.querySelector(targetSelector)
      : targetSelector;
  if (!node) throw new Error("Payment mount target was not found in the page.");
  node.innerHTML = "";

  const selector =
    typeof targetSelector === "string"
      ? targetSelector
      : `#${node.id || (node.id = `liteapi-pay-${Date.now()}`)}`;

  const liteAPIPayment = new LiteAPIPayment({
    publicKey: env,
    appearance: { theme },
    options: {
      business: { name: businessName },
    },
    targetElement: selector,
    secretKey,
    returnUrl,
  });
  await Promise.resolve(liteAPIPayment.handlePayment());
  return { env, instance: liteAPIPayment };
}

export function saveLiteApiCheckout(prebookId, payload) {
  const id = String(prebookId || "").trim();
  if (!id || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      `${CHECKOUT_STORAGE_PREFIX}${id}`,
      JSON.stringify({ ...payload, savedAt: Date.now() })
    );
  } catch {
    /* ignore quota */
  }
}

export function readLiteApiCheckout(prebookId) {
  const id = String(prebookId || "").trim();
  if (!id || typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${CHECKOUT_STORAGE_PREFIX}${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearLiteApiCheckout(prebookId) {
  const id = String(prebookId || "").trim();
  if (!id || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(`${CHECKOUT_STORAGE_PREFIX}${id}`);
  } catch {
    /* ignore */
  }
}

/** Build an absolute return URL for LiteAPI → Stripe redirect. */
export function buildLiteApiReturnUrl({ path, prebookId, transactionId }) {
  const base = String(import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
  const cleanPath = String(path || "").replace(/^\//, "");
  const url = new URL(`${base}${cleanPath}`, window.location.origin);
  if (prebookId) url.searchParams.set("prebookId", prebookId);
  if (transactionId) url.searchParams.set("transactionId", transactionId);
  url.searchParams.set("pay_return", "1");
  return url.toString();
}
