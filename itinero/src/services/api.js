import { APP_CONFIG } from "@/app/config";
import { getDeviceId } from "@/features/trips/utils/deviceId";

/**
 * HTTP client for the booking / flight-search API.
 * (Separate from Vero chat - same host may serve /api/chat, but this client is for REST search.)
 */

/** Default fetch timeout - prevents Review "Working…" from hanging forever. */
const DEFAULT_TIMEOUT_MS = 45_000;

async function request(
  method,
  endpoint,
  { params, data, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}
) {
  const base = (APP_CONFIG.API_BASE_URL || "").replace(/\/$/, "");
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = base
    ? new URL(`${base}${path}`)
    : new URL(path, typeof window !== "undefined" ? window.location.origin : "http://127.0.0.1:5173");

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.append(key, value);
      }
    });
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer =
    controller && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...headers,
    },
    signal: controller?.signal,
  };

  const token = localStorage.getItem("itinero_auth_token");
  if (token) {
    options.headers.Authorization = `Bearer ${token}`;
  }
  const deviceId = getDeviceId();
  if (deviceId) {
    options.headers["X-Itinero-Device"] = deviceId;
  }

  if (data && method !== "GET") {
    options.body = JSON.stringify(data);
  }

  let response;
  try {
    response = await fetch(url.toString(), options);
  } catch (networkErr) {
    const aborted =
      networkErr?.name === "AbortError" ||
      controller?.signal?.aborted ||
      /aborted/i.test(String(networkErr?.message || ""));
    const error = new Error(
      aborted
        ? `Request timed out after ${Math.round(timeoutMs / 1000)}s. The booking service may be stuck - try again, or restart the API on port 8000.`
        : `Can't reach the Itinero API at ${base}. Is the supervisor running on port 8000?`
    );
    error.code = aborted ? "timeout" : "unreachable";
    error.cause = networkErr;
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const detail =
      errorData.message ||
      (typeof errorData.detail === "string" ? errorData.detail : null) ||
      (typeof errorData.error === "string" ? errorData.error : null) ||
      (response.status === 502
        ? "API gateway error (502) - is supervisor running on :8000?"
        : `HTTP ${response.status}`);
    const error = new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    error.status = response.status;
    error.data = errorData;
    error.code = `http_${response.status}`;
    throw error;
  }

  if (response.status === 204) return null;

  try {
    return await response.json();
  } catch {
    const error = new Error("Flight search returned an invalid response.");
    error.status = response.status;
    error.code = "invalid_json";
    throw error;
  }
}

const api = {
  get: (endpoint, params, opts) => request("GET", endpoint, { params, ...opts }),
  post: (endpoint, data, opts) => request("POST", endpoint, { data, ...opts }),
  put: (endpoint, data, opts) => request("PUT", endpoint, { data, ...opts }),
  patch: (endpoint, data, opts) => request("PATCH", endpoint, { data, ...opts }),
  delete: (endpoint, opts) => request("DELETE", endpoint, { ...opts }),
};

export default api;
