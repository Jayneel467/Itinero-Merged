import { storage } from "@/utils/storage";

const KEY = "itinero_explore_taste_v1";

function read() {
  const row = storage.get(KEY, null);
  if (!row || typeof row !== "object") {
    return { dislikes: {}, seen: [] };
  }
  return {
    dislikes: row.dislikes && typeof row.dislikes === "object" ? row.dislikes : {},
    seen: Array.isArray(row.seen) ? row.seen : [],
  };
}

function write(next) {
  storage.set(KEY, next);
}

export function getExploreTaste() {
  return read();
}

export function markExploreSeen(destId) {
  const id = String(destId || "");
  if (!id) return;
  const cur = read();
  const seen = [id, ...cur.seen.filter((x) => x !== id)].slice(0, 40);
  write({ ...cur, seen });
}

export function dislikeDestination(destId, reason = "not_my_vibe") {
  const id = String(destId || "");
  if (!id) return getExploreTaste();
  const cur = read();
  const next = {
    ...cur,
    dislikes: {
      ...cur.dislikes,
      [id]: { reason: String(reason || "not_my_vibe"), at: new Date().toISOString() },
    },
  };
  write(next);
  return next;
}

export function clearDestinationDislike(destId) {
  const id = String(destId || "");
  const cur = read();
  if (!cur.dislikes[id]) return cur;
  const dislikes = { ...cur.dislikes };
  delete dislikes[id];
  const next = { ...cur, dislikes };
  write(next);
  return next;
}

export const DISLIKE_REASONS = [
  { id: "too_expensive", label: "Too expensive" },
  { id: "too_far", label: "Too far" },
  { id: "not_my_vibe", label: "Not my vibe" },
  { id: "already_visited", label: "Already visited" },
];
