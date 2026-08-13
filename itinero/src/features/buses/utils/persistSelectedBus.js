const KEY = "itinero_selected_bus";

export function persistSelectedBus(bus = {}, extra = {}) {
  if (!bus?.operator && !bus?.id && !extra.operator) return null;
  const payload = {
    id: bus.id || extra.id || "",
    operator: bus.operator || extra.operator || "",
    name: bus.name || extra.name || "",
    bus_type: bus.bus_type || extra.bus_type || "",
    from_name: bus.from_name || extra.from_name || "",
    to_name: bus.to_name || extra.to_name || "",
    from_stop: bus.from_stop || extra.from_stop || "",
    to_stop: bus.to_stop || extra.to_stop || "",
    dep: bus.dep || extra.dep || "",
    arr: bus.arr || extra.arr || "",
    duration: bus.duration || extra.duration || "",
    kind: bus.kind || extra.kind || "",
    fare: extra.fare ?? bus.fare ?? null,
    fare_label: extra.fare_label || bus.fare_label || "",
    fare_currency: extra.fare_currency || bus.fare_currency || bus.currency || "",
    rating: extra.rating ?? bus.rating ?? null,
    seats: extra.seats ?? bus.seats ?? null,
    live_tracking: extra.live_tracking ?? bus.live_tracking,
    name_short: bus.name_short || extra.name_short || "",
    agency_uri: extra.agency_uri || bus.agency_uri || "",
    agency_phone: extra.agency_phone || bus.agency_phone || "",
    date: extra.date || bus.date || "",
    amenities: bus.amenities || extra.amenities || [],
    ac: extra.ac ?? bus.ac,
    sleeper: extra.sleeper ?? bus.sleeper,
    volvo: extra.volvo ?? bus.volvo,
    book_url: extra.book_url || bus.book_url || "",
    maps_url: extra.maps_url || bus.maps_url || "",
    vehicle: bus.vehicle || extra.vehicle || "",
    local: extra.local ?? bus.local,
    legs: bus.legs || extra.legs || [],
    modes: bus.modes || extra.modes || [],
    headway: bus.headway || extra.headway || "",
    trip_short: bus.trip_short || extra.trip_short || "",
    warnings: bus.warnings || extra.warnings || [],
    agencies: bus.agencies || extra.agencies || [],
    distance: bus.distance || extra.distance || "",
    overnight: extra.overnight ?? bus.overnight,
    savedAt: Date.now(),
  };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
  return payload;
}

export function readSelectedBus() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}
