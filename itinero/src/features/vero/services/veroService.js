import { APP_CONFIG } from "@/app/config";
import { ENDPOINTS } from "@/services/endpoints";

/** Chat can include LiteAPI search — allow longer than a normal REST call. */
const CHAT_TIMEOUT_MS = 120_000;

/**
 * Vero chat → supervisor gateway (no mock replies).
 * Uses AbortController so the UI never sticks on "thinking…".
 */
async function chat(body) {
  const base = (APP_CONFIG.API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  const path = ENDPOINTS.VERO.CHAT.startsWith("/")
    ? ENDPOINTS.VERO.CHAT
    : `/${ENDPOINTS.VERO.CHAT}`;
  const url = `${base}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

  try {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    const token = localStorage.getItem("itinero_auth_token");
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const detail =
        errorData.message ||
        errorData.detail ||
        (typeof errorData.error === "string" ? errorData.error : null) ||
        `HTTP ${response.status}`;
      const error = new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      error.status = response.status;
      error.code = `http_${response.status}`;
      throw error;
    }

    return await response.json();
  } catch (err) {
    if (err?.name === "AbortError") {
      const error = new Error(
        "Vero took too long (120s). Try New Chat, then ask again with a date — or use the Flights search bar for the same live fares."
      );
      error.code = "timeout";
      throw error;
    }
    if (err?.code === "unreachable" || err?.message?.includes("Failed to fetch")) {
      const error = new Error(
        `Can't reach Vero at ${base}. Is the supervisor running on port 8000?`
      );
      error.code = "unreachable";
      throw error;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const veroService = {
  chat,
  getSuggestions: async () => null,
};
