/** Shared itinerary formatting for package pages. */

export function formatDisplayDate(ymd) {
  if (!ymd) return "";
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export function minsLabel(mins) {
  const m = Number(mins);
  if (!Number.isFinite(m) || m <= 0) return "";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export function dayNarrative(day) {
  return (day?.narrative || day?.description || "").trim();
}

export function formatTransfer(t) {
  if (!t || typeof t !== "object") return "";
  const mode = String(t.mode || "road").replace(/_/g, " ");
  const from = t.origin || t.from || "";
  const to = t.destination || t.to || "";
  const mins = Number(t.estimated_duration_minutes || t.minutes || 0);
  const route = from && to ? `${from} → ${to}` : from || to || "";
  const time = mins ? ` (~${minsLabel(mins)})` : "";
  const src = t.source === "estimate" ? " · estimate" : "";
  return `${mode.charAt(0).toUpperCase()}${mode.slice(1)}${route ? `: ${route}` : ""}${time}${src}`;
}

export function formatEstimateRange(min, max, formatMoney) {
  if (typeof min !== "number" || min <= 0) return "-";
  if (typeof max !== "number" || max <= min) return formatMoney(min);
  return `${formatMoney(min)}-${formatMoney(max)}`;
}
