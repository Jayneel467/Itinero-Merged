import { APP_CONFIG } from "@/app/config";
import { ENDPOINTS } from "@/services/endpoints";

/** Chat can include LiteAPI search — allow longer than a normal REST call. */
const CHAT_TIMEOUT_MS = 120_000;

/**
 * Vero chat → general_agent orchestrator (user only ever sees Vero).
 * Uses AbortController so the UI never sticks on "thinking…".
 */
async function chat(body) {
  const base = (APP_CONFIG.VERO_API_BASE_URL || APP_CONFIG.API_BASE_URL || "http://127.0.0.1:8001").replace(
    /\/$/,
    ""
  );
  const path = ENDPOINTS.VERO.CHAT.startsWith("/")
    ? ENDPOINTS.VERO.CHAT
    : `/${ENDPOINTS.VERO.CHAT}`;
  const url = `${base}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

  // Normalize payload for general_agent.run (thread_id) while keeping
  // session_id for any older supervisor-compatible clients.
  const payload = {
    message: body.message || body.text || "",
    thread_id: body.thread_id || body.session_id || body.threadId || "itinero-web",
  };

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
      body: JSON.stringify(payload),
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

    const data = await response.json();
    // Never surface internal routing fields to the UI layer.
    return {
      reply: data.reply || data.message || data.content || "",
      cards: data.cards || null,
      thread_id: data.thread_id || payload.thread_id,
      routed_to: "vero",
      active_specialist: "vero",
      route_path: ["vero"],
    };
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
        `Can't reach Vero at ${base}. Start the orchestrator: uvicorn general_agent.run:app --port 8001`
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
