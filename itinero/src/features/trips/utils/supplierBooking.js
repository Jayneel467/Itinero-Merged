/** LiteAPI sandbox/live booking ids are UUIDs. Flight PNRs and booking refs are alphanumeric. Local ITN- refs are not. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SUPPLIER_REF_RE = /^[A-Z0-9]{2,10}(-[A-Z0-9]+)+$/i;

export function isSupplierBookingId(id) {
  const s = String(id || "").trim();
  if (!s) return false;
  if (/^(pay_|pi_|trip-|draft-|ITN-)/i.test(s)) return false;
  if (UUID_RE.test(s)) return true;
  if (SUPPLIER_REF_RE.test(s)) return true;
  if (/^[A-Z0-9]{5,36}$/i.test(s)) return true;
  return false;
}

export function pickSupplierBookingId(...candidates) {
  // First pass: prefer exact UUIDs (canonical LiteAPI booking ID)
  for (const c of candidates) {
    const s = String(c || "").trim();
    if (UUID_RE.test(s)) return s;
  }
  // Second pass: accept supplier booking refs / PNRs (e.g. FH-269-UXDLMNCO)
  for (const c of candidates) {
    if (isSupplierBookingId(c)) return String(c).trim();
  }
  return null;
}
