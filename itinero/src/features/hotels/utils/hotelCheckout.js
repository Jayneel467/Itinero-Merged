const CONFIRM_KEY = "itinero_hotel_confirmation";

export function saveHotelConfirmation(payload) {
  if (!payload?.bookingId || !payload?.bookingData) return null;
  try {
    sessionStorage.setItem(CONFIRM_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
  return payload;
}

export function readHotelConfirmation() {
  try {
    return JSON.parse(sessionStorage.getItem(CONFIRM_KEY) || "null");
  } catch {
    return null;
  }
}

export function resolveHotelConfirmation(routeState) {
  if (routeState?.bookingId && routeState?.bookingData) {
    return routeState;
  }
  const saved = readHotelConfirmation();
  if (saved?.bookingId && saved?.bookingData) return saved;
  return null;
}

function dateObj(value) {
  if (value && typeof value === "object" && value.date) return value;
  const s = String(value || "").trim();
  return { date: s || "-", day: "" };
}

export function confirmationFromHotelBooking(booking, extra = {}) {
  const b = booking?.booking && typeof booking.booking === "object" ? booking.booking : booking;
  if (!b || typeof b !== "object") return null;
  const bid = String(b.booking_id || b.bookingId || extra.bookingId || "").trim();
  if (!bid) return null;
  const raw = b.raw && typeof b.raw === "object" ? b.raw : {};
  const hotel = raw.hotel && typeof raw.hotel === "object" ? raw.hotel : {};
  const holder = raw.holder && typeof raw.holder === "object" ? raw.holder : {};
  const checkIn = b.checkin || b.checkIn || raw.checkin || raw.checkIn || extra.checkIn;
  const checkOut = b.checkout || b.checkOut || raw.checkout || raw.checkOut || extra.checkOut;
  return {
    paymentId: extra.paymentId || b.payment_id || raw.paymentId || null,
    bookingId: bid,
    prebookId: extra.prebookId || b.prebook_id || raw.prebookId || null,
    hotelConfirmationCode: b.hotel_confirmation_code || raw.hotelConfirmationCode || null,
    bookingData: {
      hotelName: extra.hotelName || hotel.name || raw.hotelName || extra.title || "Stay",
      location: extra.location || hotel.city || hotel.address || raw.city || "",
      checkIn: dateObj(checkIn),
      checkOut: dateObj(checkOut),
      checkInIso: String(checkIn || "").slice(0, 10),
      checkOutIso: String(checkOut || "").slice(0, 10),
      guests: extra.guests || raw.adults || raw.guests || 2,
      rooms: extra.rooms || raw.rooms || 1,
      nights: extra.nights || raw.nights || null,
      totalPrice: Number(b.price || extra.totalPrice) || 0,
      roomsTotal: Number(extra.roomsTotal || b.price) || 0,
      taxesTotal: Number(extra.taxesTotal) || 0,
      addons: Array.isArray(extra.addons) ? extra.addons : (Array.isArray(b.addons) ? b.addons : []),
      currency: b.currency || extra.currency || "INR",
      guestName: extra.guestName || [holder.firstName, holder.lastName].filter(Boolean).join(" "),
      email: extra.email || holder.email || "",
      phone: extra.phone || holder.phone || "",
    },
  };
}

export function confirmationFromHotelTrip(trip) {
  if (!trip) return null;
  const leg = (trip.legs || []).find((l) => l.type === "hotel" && l.bookingId);
  if (!leg) return null;
  return {
    paymentId: leg.paymentId || null,
    bookingId: leg.bookingId,
    prebookId: leg.prebookId || null,
    hotelConfirmationCode: leg.hotelConfirmationCode || null,
    bookingData: {
      hotelName: leg.hotelName || trip.title || "Stay",
      location: leg.location || trip.destination || "",
      checkIn: dateObj(leg.checkIn),
      checkOut: dateObj(leg.checkOut),
      checkInIso: leg.checkIn,
      checkOutIso: leg.checkOut,
      guests: leg.guests || trip.travelers?.adults || 2,
      rooms: leg.rooms || 1,
      nights: leg.nights || null,
      totalPrice: Number(leg.price) || 0,
      roomsTotal: Number(leg.price) || 0,
      taxesTotal: 0,
      currency: leg.currency || "INR",
      guestName: trip.contact?.name || "",
      email: trip.contact?.email || "",
      phone: trip.contact?.phone || "",
    },
  };
}
