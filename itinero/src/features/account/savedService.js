import { storage } from "@/utils/storage";

const KEY = "saved_v1";
const MAX = 80;
export const SAVED_EVENT = "itinero-saved-changed";

const TYPES = new Set(["hotel", "destination", "package", "idea", "explore", "event"]);

let persistTimer = null;

function signedIn() {
  try {
    return Boolean(localStorage.getItem("itinero_auth_token"));
  } catch {
    return false;
  }
}

function emit() {
  try {
    window.dispatchEvent(new Event(SAVED_EVENT));
  } catch {
    /* ignore */
  }
}

function persistSoon() {
  if (!signedIn()) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    import("@/features/profile/accountSync")
      .then((m) => m.persistAccountToServer())
      .catch(() => {});
  }, 400);
}

function sanitizeItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim().slice(0, 80);
  if (!id) return null;
  let url = String(raw.url || "").trim().slice(0, 200);
  if (!url.startsWith("/") || url.startsWith("//") || url.includes("://")) url = "/";
  let type = String(raw.type || "idea").trim().toLowerCase().slice(0, 20) || "idea";
  if (!TYPES.has(type)) type = "idea";
  let image = String(raw.image || "").trim().slice(0, 500);
  const low = image.toLowerCase();
  if (low.startsWith("javascript:") || low.startsWith("data:") || low.startsWith("vbscript:")) {
    image = "";
  }
  return {
    id,
    type,
    title: String(raw.title || "Saved").trim().slice(0, 80) || "Saved",
    subtitle: String(raw.subtitle || "").trim().slice(0, 80),
    url,
    image,
    savedAt: String(raw.savedAt || raw.saved_at || "").trim().slice(0, 40),
  };
}

function sanitizeList(rows) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  const seen = new Set();
  for (const row of rows.slice(0, MAX * 2)) {
    const item = sanitizeItem(row);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
    if (out.length >= MAX) break;
  }
  return out;
}

function read() {
  const rows = storage.get(KEY, []);
  return sanitizeList(Array.isArray(rows) ? rows : []);
}

function write(rows, persist = true) {
  storage.set(KEY, sanitizeList(rows).slice(0, MAX));
  emit();
  if (persist) persistSoon();
}

export function listSaved() {
  return read().sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
}

export function isSaved(id) {
  if (!id) return false;
  return read().some((row) => String(row.id) === String(id));
}

export function mergeSavedLists(left, right) {
  const byId = new Map();
  for (const row of [...sanitizeList(left), ...sanitizeList(right)]) {
    const prev = byId.get(row.id);
    if (!prev || String(row.savedAt || "") > String(prev.savedAt || "")) {
      byId.set(row.id, row);
    }
  }
  return [...byId.values()]
    .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")))
    .slice(0, MAX);
}

export function replaceSaved(rows, { persist = true } = {}) {
  write(sanitizeList(rows), persist);
}

export function toggleSaved(item) {
  const id = String(item?.id || "").trim();
  if (!id) return false;
  const rows = read();
  const idx = rows.findIndex((row) => String(row.id) === id);
  if (idx >= 0) {
    rows.splice(idx, 1);
    write(rows);
    return false;
  }
  rows.unshift({
    id,
    type: item.type || "idea",
    title: item.title || "Saved",
    subtitle: item.subtitle || "",
    url: item.url || "/",
    image: item.image || "",
    savedAt: new Date().toISOString(),
  });
  write(rows);
  return true;
}

export function removeSaved(id) {
  write(read().filter((row) => String(row.id) !== String(id)));
}

export function onSavedChange(fn) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(SAVED_EVENT, fn);
  window.addEventListener("storage", fn);
  window.addEventListener("focus", fn);
  return () => {
    window.removeEventListener(SAVED_EVENT, fn);
    window.removeEventListener("storage", fn);
    window.removeEventListener("focus", fn);
  };
}
