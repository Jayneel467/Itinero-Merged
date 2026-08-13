export const TOKEN_KEY = "itinero_auth_token";
export const USERDATA_KEY = "userdata";
export const AUTH_EVENT = "itinero-auth";

export function readLocalUser() {
  try {
    const raw = localStorage.getItem(USERDATA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.user || parsed || null;
  } catch {
    return null;
  }
}

export function persistAuthSession({ token, user } = {}) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (user) localStorage.setItem(USERDATA_KEY, JSON.stringify({ user }));
  } catch {
    /* private mode */
  }
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function clearAuthSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USERDATA_KEY);
    localStorage.removeItem("accessToken");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(AUTH_EVENT));
}
