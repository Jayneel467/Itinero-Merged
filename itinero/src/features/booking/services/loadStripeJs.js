/**
 * Shared Stripe.js loader with retries and a single in-flight promise.
 * Fixes the common hang when a previous <script> already failed/loaded.
 */

let _inflight = null;

function removeBrokenStripeScripts() {
  if (typeof document === "undefined") return;
  document.querySelectorAll('script[src*="js.stripe.com/v3"]').forEach((node) => {
    if (typeof window !== "undefined" && window.Stripe) return;
    try {
      node.remove();
    } catch {
      /* ignore */
    }
  });
}

/**
 * @returns {Promise<typeof window.Stripe>}
 */
export function loadStripeJs() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Stripe.js requires a browser window."));
  }
  if (window.Stripe) return Promise.resolve(window.Stripe);
  if (_inflight) return _inflight;

  _inflight = new Promise((resolve, reject) => {
    const finishOk = () => {
      _inflight = null;
      if (window.Stripe) resolve(window.Stripe);
      else {
        reject(
          new Error(
            "Stripe.js loaded but Stripe is unavailable. Allow js.stripe.com, then tap Retry card form."
          )
        );
      }
    };
    const finishErr = (msg) => {
      _inflight = null;
      reject(new Error(msg));
    };

    const attempt = (n) => {
      if (window.Stripe) {
        finishOk();
        return;
      }
      removeBrokenStripeScripts();
      const script = document.createElement("script");
      script.src =
        n === 0
          ? "https://js.stripe.com/v3/"
          : `https://js.stripe.com/v3/?r=${Date.now()}`;
      script.async = true;
      script.dataset.itineroStripe = "1";
      script.onload = () => {
        if (window.Stripe) finishOk();
        else if (n < 2) attempt(n + 1);
        else {
          finishErr(
            "Stripe.js loaded but Stripe is unavailable. Allow js.stripe.com, then tap Retry card form."
          );
        }
      };
      script.onerror = () => {
        try {
          script.remove();
        } catch {
          /* ignore */
        }
        if (n < 2) {
          setTimeout(() => attempt(n + 1), 350 * (n + 1));
        } else {
          finishErr(
            "Stripe.js could not load (often blocked by an ad blocker). Allow js.stripe.com for this site, then tap Retry card form."
          );
        }
      };
      (document.head || document.body).appendChild(script);
    };

    attempt(0);
  });

  return _inflight;
}

/** Reset loader state so Retry can try again after a hard fail. */
export function resetStripeJsLoader() {
  _inflight = null;
  removeBrokenStripeScripts();
}
