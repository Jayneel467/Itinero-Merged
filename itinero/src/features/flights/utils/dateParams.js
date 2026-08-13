/**
 * Shared flight URL / trip date helpers.
 * Resume links must use `depart=YYYY-MM-DD` (not display strings like "21 Aug").
 */

export function toIsoDate(value) {
  if (!value) return "";
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw.slice(0, 10);

  // "21 Aug" / "21 Aug 2026" / "21 August 2026"
  const m = raw.match(
    /^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?(?:\s+(\d{4}))?$/i
  );
  if (m) {
    const day = Number(m[1]);
    const mon = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dec: 11,
    }[m[2].slice(0, 3).toLowerCase()];
    const year = m[3] ? Number(m[3]) : new Date().getFullYear();
    if (Number.isFinite(mon) && day >= 1 && day <= 31) {
      const d = new Date(year, mon, day);
      if (!Number.isNaN(d.getTime())) {
        const y = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${y}-${mm}-${dd}`;
      }
    }
  }

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

/** Prefer real ISO timestamps from a mapped LiteAPI offer card. */
export function flightDepartIso(flight, fallback = "") {
  const candidates = [
    flight?.departureAt,
    flight?.segments?.[0]?.departureAt,
    flight?.raw?.depart_date,
    flight?.raw?.departure_date,
    typeof flight?.raw?.segments?.[0]?.departure === "string"
      ? flight.raw.segments[0].departure
      : null,
    fallback,
    flight?.departure?.date,
  ];
  for (const c of candidates) {
    const iso = toIsoDate(c);
    if (iso) return iso;
  }
  return "";
}

/**
 * Build /flights?... query for resuming a draft/held trip.
 * Uses `depart` (ISO) - the param useFlightSearch actually reads.
 */
export function buildFlightResumeSearchParams(trip) {
  const flightLeg = (trip?.legs || []).find((l) => l.type === "flight") || {};
  const qs = new URLSearchParams();
  if (trip?.origin) qs.set("from", String(trip.origin).toUpperCase().slice(0, 3));
  if (trip?.destination) qs.set("to", String(trip.destination).toUpperCase().slice(0, 3));
  qs.set("trip", trip?.returnDate ? "return" : "oneway");

  const depart = toIsoDate(trip?.departDate) || toIsoDate(flightLeg.departDate);
  const ret = toIsoDate(trip?.returnDate);
  if (depart) qs.set("depart", depart);
  if (ret) qs.set("return", ret);

  const adults = Math.max(1, Number(trip?.travelers?.adults) || 1);
  const children = Math.max(0, Number(trip?.travelers?.children) || 0);
  const infants = Math.max(0, Number(trip?.travelers?.infants) || 0);
  qs.set("adults", String(adults));
  if (children) qs.set("children", String(children));
  if (infants) qs.set("infants", String(infants));

  if (trip?.id) qs.set("resumeTrip", trip.id);
  if (flightLeg.offerId) qs.set("resumeOffer", String(flightLeg.offerId));
  return qs;
}
