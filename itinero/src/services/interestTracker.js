import api from "@/services/api";
import { ENDPOINTS } from "@/services/endpoints";
import { getAttribution } from "@/services/attribution";

const QUEUE_KEY = "itinero_interest_queue_v1";
let flushTimer = null;
let flushing = false;

function loadQueue() {
  try {
    return JSON.parse(sessionStorage.getItem(QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveQueue(q) {
  try {
    sessionStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-40)));
  } catch {
    /* ignore */
  }
}

export function trackInterestEvent(type, payload = {}, weight = 1) {
  const attr = getAttribution();
  const event = {
    type,
    weight,
    payload: {
      ...payload,
      path: typeof window !== "undefined" ? window.location.pathname : "",
      acq_campaign: attr.acq_campaign || undefined,
    },
  };
  const q = loadQueue();
  q.push(event);
  saveQueue(q);

  const urgent = type === "search" || type === "booking_confirm";
  if (flushTimer) clearTimeout(flushTimer);
  if (urgent) {
    flushInterestEvents();
  } else {
    flushTimer = setTimeout(() => {
      flushInterestEvents();
    }, 1200);
  }

  try {
    if (typeof window !== "undefined" && window.gtag) {
      window.gtag("event", type, payload);
    }
    if (typeof window !== "undefined" && window.fbq) {
      window.fbq("trackCustom", type, payload);
    }
  } catch {
    /* ignore */
  }
}

export async function flushInterestEvents() {
  if (flushing) return;
  const q = loadQueue();
  if (!q.length) return;
  flushing = true;
  saveQueue([]);
  try {
    await api.post(ENDPOINTS.MARKETING.EVENTS, { events: q });
  } catch {
    saveQueue([...q, ...loadQueue()].slice(-40));
  } finally {
    flushing = false;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushInterestEvents();
  });
  window.addEventListener("pagehide", () => {
    flushInterestEvents();
  });
}

export const interestService = {
  get: () => api.get(ENDPOINTS.MARKETING.INTERESTS),
  put: (body) => api.put(ENDPOINTS.MARKETING.INTERESTS, body),
  events: (events) => api.post(ENDPOINTS.MARKETING.EVENTS, { events }),
  subscribe: (body) => api.post(ENDPOINTS.MARKETING.SUBSCRIBE, body),
  offers: (params) => api.get(ENDPOINTS.MARKETING.OFFERS, params),
  validateOffer: (code, vibes) =>
    api.post(ENDPOINTS.MARKETING.VALIDATE_OFFER, { code, vibes }),
  score: () => api.get(ENDPOINTS.MARKETING.SCORE),
  goCampaign: (slug) => api.get(ENDPOINTS.MARKETING.GO(slug)),
  goList: () => api.get(ENDPOINTS.MARKETING.GO_LIST),
};
