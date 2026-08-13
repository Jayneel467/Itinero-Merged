import { storage } from "@/utils/storage";

const KEY = "saved_v1";

function read() {
  const rows = storage.get(KEY, []);
  return Array.isArray(rows) ? rows : [];
}

function write(rows) {
  storage.set(KEY, rows.slice(0, 80));
}

export function listSaved() {
  return read().sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
}

export function isSaved(id) {
  if (!id) return false;
  return read().some((row) => String(row.id) === String(id));
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
