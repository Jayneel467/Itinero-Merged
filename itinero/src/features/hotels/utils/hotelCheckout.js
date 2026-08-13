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
