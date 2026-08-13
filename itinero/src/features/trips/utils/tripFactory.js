const STORAGE_KEY = "itinero_trips";
const ABANDON_MS = 48 * 60 * 60 * 1000;

function safeParse(raw) {
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function toIsoDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw.slice(0, 10);
  const m = raw.match(
    /^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?(?:\s+(\d{4}))?$/i
  );
  if (m) {
    const day = Number(m[1]);
    const monMap = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const mon = monMap[m[2].slice(0, 3).toLowerCase()];
    const year = m[3] ? Number(m[3]) : new Date().getFullYear();
    if (Number.isFinite(mon)) {
      const d = new Date(year, mon, day);
      if (!Number.isNaN(d.getTime())) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      }
    }
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function flightDepartIso(flight, fallback) {
  const candidates = [
    flight?.departureAt,
    flight?.segments?.[0]?.departureAt,
    flight?.raw?.depart_date,
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
  return null;
}

export function loadTrips() {
  try {
    return safeParse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveTrips(trips) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
  } catch {
    /* quota / private mode */
  }
}

export function genTripId() {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TRP-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

export function markAbandoned(trips, now = Date.now()) {
  return trips.map((t) => {
    if (t.status !== "draft") return t;
    const updated = new Date(t.updatedAt || t.createdAt).getTime();
    if (Number.isFinite(updated) && now - updated > ABANDON_MS) {
      return { ...t, status: "abandoned", updatedAt: new Date().toISOString() };
    }
    return t;
  });
}

/**
 * Find draft/held trip for the same flight session+offer.
 */
export function findFlightTrip(trips, { sessionId, offerId }) {
  const sid = String(sessionId || "");
  const oid = String(offerId || "");
  if (!sid && !oid) return null;
  return (
    trips.find((t) =>
      (t.legs || []).some(
        (leg) =>
          leg.type === "flight" &&
          (!sid || leg.sessionId === sid) &&
          (!oid || String(leg.offerId) === oid) &&
          (t.status === "draft" || t.status === "held")
      )
    ) || null
  );
}

export function findPackageTrip(trips, { packageId, packageSlug, checkIn }) {
  return (
    trips.find((t) =>
      (t.legs || []).some(
        (leg) =>
          leg.type === "package" &&
          (t.status === "draft" || t.status === "held") &&
          ((packageId && leg.packageId === packageId) ||
            (packageSlug && leg.packageSlug === packageSlug)) &&
          (!checkIn || leg.checkIn === checkIn)
      )
    ) || null
  );
}

export function tripTitleFromRoute(origin, destination, fallback = "Trip") {
  const o = String(origin || "").toUpperCase();
  const d = String(destination || "").toUpperCase();
  if (o && d) return `${o} → ${d}`;
  if (d) return d;
  if (o) return `From ${o}`;
  return fallback;
}

export function createFlightDraftTrip({
  flight,
  sessionId,
  origin,
  destination,
  departDate,
  returnDate,
  adults = 1,
  children = 0,
  infants = 0,
}) {
  const now = new Date().toISOString();
  const o =
    origin ||
    flight?.routeOrigin ||
    flight?.departure?.airport ||
    "";
  const d =
    destination ||
    flight?.routeDestination ||
    flight?.arrival?.airport ||
    "";
  const offerId = String(flight?.offer_id || flight?.offerId || flight?.id || "");
  const price = Number(flight?.price);
  const currency = flight?.currency || "INR";
  const departIso = flightDepartIso(flight, departDate);
  const returnIso = toIsoDate(returnDate);

  return {
    id: genTripId(),
    status: "draft",
    createdAt: now,
    updatedAt: now,
    title: tripTitleFromRoute(o, d, flight?.airline?.name || "Flight trip"),
    origin: String(o).toUpperCase().slice(0, 3),
    destination: String(d).toUpperCase().slice(0, 3),
    departDate: departIso,
    returnDate: returnIso,
    travelers: {
      adults: Math.max(1, Number(adults) || 1),
      children: Math.max(0, Number(children) || 0),
      infants: Math.max(0, Number(infants) || 0),
    },
    contact: null,
    source: "flights",
    channel: null,
    companyName: null,
    legs: [
      {
        type: "flight",
        status: "draft",
        sessionId: sessionId || null,
        offerId: offerId || null,
        prebookId: null,
        bookingId: null,
        pnr: null,
        airline: flight?.airline?.name || flight?.airline || null,
        airlineCode: flight?.airline?.code || null,
        price: Number.isFinite(price) && price > 0 ? price : null,
        currency,
        segmentsSummary: null,
        departureTime: flight?.departure?.time || null,
        arrivalTime: flight?.arrival?.time || null,
        duration: flight?.duration || null,
        stops: flight?.stops ?? flight?.stopCount ?? null,
        departDate: departIso,
        flightSnapshot: flight
          ? {
              id: offerId,
              offer_id: offerId,
              airline: flight.airline || null,
              flightNumber: flight.flightNumber || null,
              departure: flight.departure || null,
              arrival: flight.arrival || null,
              departureAt: flight.departureAt || null,
              duration: flight.duration || null,
              stops: flight.stops || null,
              price: Number.isFinite(price) ? price : null,
              currency: flight.currency || currency,
              cabin: flight.cabin || null,
            }
          : null,
      },
    ],
  };
}

export function createPackageDraftTrip({
  pkg,
  checkIn,
  checkOut,
  guests = 2,
  origin = null,
}) {
  const now = new Date().toISOString();
  const title = pkg?.title || "Package trip";
  return {
    id: genTripId(),
    status: "draft",
    createdAt: now,
    updatedAt: now,
    title,
    origin: origin || null,
    destination: (pkg?.destinations || [])[0] || null,
    departDate: checkIn || null,
    returnDate: checkOut || null,
    travelers: { adults: guests, children: 0, infants: 0 },
    contact: null,
    source: "packages",
    legs: [
      {
        type: "package",
        status: "draft",
        packageId: pkg?.id || null,
        packageSlug: pkg?.slug || null,
        packageTitle: title,
        packageBookingId: null,
        checkIn: checkIn || null,
        checkOut: checkOut || null,
        guests,
        price: pkg?.fromPrice ?? null,
        currency: pkg?.currency || "INR",
      },
    ],
  };
}

export function createHotelDraftTrip({
  hotelName,
  hotelId,
  location,
  checkIn,
  checkOut,
  guests = 2,
  rooms = 1,
  totalPrice = null,
  currency = "INR",
  paymentId = null,
  bookingId = null,
  prebookId = null,
  hotelConfirmationCode = null,
  confirmed = false,
}) {
  const now = new Date().toISOString();
  const status = confirmed ? "confirmed" : "draft";
  const cin = typeof checkIn === "string" ? checkIn : checkIn?.date || null;
  const cout = typeof checkOut === "string" ? checkOut : checkOut?.date || null;
  return {
    id: genTripId(),
    status,
    createdAt: now,
    updatedAt: now,
    title: hotelName || "Hotel stay",
    origin: null,
    destination: location || hotelName || null,
    departDate: cin,
    returnDate: cout,
    travelers: { adults: guests, children: 0, infants: 0 },
    contact: null,
    source: "hotels",
    channel: null,
    companyName: null,
    legs: [
      {
        type: "hotel",
        status,
        hotelId: hotelId || null,
        hotelName: hotelName || null,
        location: location || null,
        checkIn: cin,
        checkOut: cout,
        rooms,
        guests,
        price: totalPrice,
        currency,
        paymentId: paymentId || null,
        bookingId: bookingId || null,
        prebookId: prebookId || null,
        hotelConfirmationCode: hotelConfirmationCode || null,
      },
    ],
  };
}

export function patchHotelLeg(trip, legPatch, tripStatus) {
  const legs = (trip.legs || []).map((leg) =>
    leg.type === "hotel" ? { ...leg, ...legPatch } : leg
  );
  return patchTrip(trip, {
    legs,
    status: tripStatus || trip.status,
  });
}

export function genTrainBookingRef() {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `ITN-TRN-${rand}`;
}

export function createTrainPendingTrip({
  train = {},
  klass = "",
  quota = "GN",
  passengers = [],
  contact = {},
  irctcUser = "",
  itineroRef = "",
  checkoutUrl = "",
} = {}) {
  const now = new Date().toISOString();
  const from = String(train.from_code || "").toUpperCase();
  const to = String(train.to_code || "").toUpperCase();
  const number = String(train.number || "").replace(/\D/g, "");
  const adults = Math.max(1, passengers.length || 1);
  const ref = itineroRef || genTrainBookingRef();
  return {
    id: genTripId(),
    status: "held",
    createdAt: now,
    updatedAt: now,
    title: tripTitleFromRoute(from, to, train.name || `Train ${number}`),
    origin: from,
    destination: to,
    departDate: train.date || null,
    returnDate: null,
    travelers: { adults, children: 0, infants: 0 },
    contact: {
      email: contact.email || null,
      phone: contact.phone || null,
      name: passengers[0]?.name || null,
    },
    passengers,
    source: "trains",
    channel: null,
    companyName: null,
    legs: [
      {
        type: "train",
        status: "held",
        number,
        name: train.name || "",
        from_code: from,
        to_code: to,
        from_name: train.from_name || "",
        to_name: train.to_name || "",
        dep: train.dep || "",
        arr: train.arr || "",
        duration: train.duration || "",
        date: train.date || "",
        class_code: String(klass || "").toUpperCase(),
        quota: String(quota || "GN").toUpperCase(),
        fare: train.fare ?? null,
        currency: "INR",
        pnr: null,
        bookingId: ref,
        irctcUser: String(irctcUser || "").trim() || null,
        checkoutUrl: checkoutUrl || "",
      },
    ],
  };
}

export function patchTrainLeg(trip, legPatch, tripStatus) {
  const legs = (trip.legs || []).map((leg) =>
    leg.type === "train" ? { ...leg, ...legPatch } : leg
  );
  return patchTrip(trip, {
    legs,
    status: tripStatus || trip.status,
  });
}

export function genBusBookingRef() {
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `ITN-BUS-${rand}`;
}

export function createBusPendingTrip({
  bus = {},
  passengers = [],
  contact = {},
  itineroRef = "",
  checkoutUrl = "",
  mapsUrl = "",
} = {}) {
  const now = new Date().toISOString();
  const from = String(bus.from_name || bus.from || "").trim();
  const to = String(bus.to_name || bus.to || "").trim();
  const adults = Math.max(1, passengers.length || 1);
  const ref = itineroRef || genBusBookingRef();
  const kind = bus.kind === "coach" || String(bus.vehicle_type || "").toUpperCase() === "COACH"
    ? "coach"
    : "transit";
  return {
    id: genTripId(),
    status: "held",
    createdAt: now,
    updatedAt: now,
    title: tripTitleFromRoute(from, to, bus.operator || (kind === "coach" ? "Coach" : "Transit")),
    origin: from,
    destination: to,
    departDate: bus.date || null,
    returnDate: null,
    travelers: { adults, children: 0, infants: 0 },
    contact: {
      email: contact.email || null,
      phone: contact.phone || null,
      name: passengers[0]?.name || null,
    },
    passengers,
    source: "transits",
    channel: null,
    companyName: bus.operator || null,
    legs: [
      {
        type: "bus",
        kind,
        status: "held",
        operator: bus.operator || "",
        bus_type: bus.bus_type || "",
        from_name: from,
        to_name: to,
        from_stop: bus.from_stop || "",
        to_stop: bus.to_stop || "",
        dep: bus.dep || "",
        arr: bus.arr || "",
        duration: bus.duration || "",
        date: bus.date || "",
        fare: bus.fare ?? null,
        currency: bus.fare_currency || bus.currency || "INR",
        bookingId: ref,
        checkoutUrl: checkoutUrl || "",
        mapsUrl: mapsUrl || "",
        ac: Boolean(bus.ac),
        sleeper: Boolean(bus.sleeper),
        volvo: Boolean(bus.volvo),
      },
    ],
  };
}

export function patchBusLeg(trip, legPatch, tripStatus) {
  const legs = (trip.legs || []).map((leg) =>
    leg.type === "bus" ? { ...leg, ...legPatch } : leg
  );
  return patchTrip(trip, {
    legs,
    status: tripStatus || trip.status,
  });
}

export function patchTrip(trip, patch) {
  return {
    ...trip,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

export function patchFlightLeg(trip, legPatch, tripStatus) {
  const legs = (trip.legs || []).map((leg) =>
    leg.type === "flight" ? { ...leg, ...legPatch } : leg
  );
  return patchTrip(trip, {
    legs,
    status: tripStatus || trip.status,
  });
}
