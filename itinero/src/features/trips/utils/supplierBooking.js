/** LiteAPI sandbox/live booking ids are UUIDs. Local ITN- refs are not. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isSupplierBookingId(id) {
  return UUID_RE.test(String(id || "").trim());
}

export function pickSupplierBookingId(...candidates) {
  for (const c of candidates) {
    if (isSupplierBookingId(c)) return String(c).trim();
  }
  return null;
}
