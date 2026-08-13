import { APP_CONFIG } from "@/app/config";

/**
 * Load GA4 + Meta Pixel when env ids are set (acquisition measurement).
 */
export function initAcquisitionPixels() {
  if (typeof document === "undefined") return;

  const ga = (APP_CONFIG.GA_MEASUREMENT_ID || "").trim();
  const meta = (APP_CONFIG.META_PIXEL_ID || "").trim();

  if (ga && !document.getElementById("itinero-ga4")) {
    const s = document.createElement("script");
    s.id = "itinero-ga4";
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga)}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", ga, { send_page_view: true });
  }

  if (meta && !document.getElementById("itinero-meta-pixel")) {
    /* eslint-disable */
    !(function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = "2.0";
      n.queue = [];
      t = b.createElement(e);
      t.async = true;
      t.src = v;
      t.id = "itinero-meta-pixel";
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    /* eslint-enable */
    window.fbq("init", meta);
    window.fbq("track", "PageView");
  }
}

export function trackSignupComplete() {
  try {
    if (window.gtag) window.gtag("event", "sign_up");
    if (window.fbq) window.fbq("track", "CompleteRegistration");
  } catch {
    /* ignore */
  }
}

export function trackPurchase(value, currency = "INR") {
  try {
    if (window.gtag) window.gtag("event", "purchase", { value, currency });
    if (window.fbq) window.fbq("track", "Purchase", { value, currency });
  } catch {
    /* ignore */
  }
}
