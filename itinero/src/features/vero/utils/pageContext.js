/**
 * Build / format left-page browsing context for Vero (side panel).
 * Keep payloads small - summary + a few sample offers, not full result lists.
 */

import { AIRPORTS } from "@/constants/airports";
import { inferAirlineCode } from "@/features/flights/utils/airlineIdentity";

function airportLabel(code) {
  const c = String(code || "").toUpperCase().slice(0, 3);
  if (!c) return null;
  const hit = AIRPORTS.find((a) => String(a.code).toUpperCase() === c);
  return hit ? `${hit.city} (${c})` : c;
}

function pickTerminal(...candidates) {
  for (const v of candidates) {
    const s = v == null ? "" : String(v).trim();
    if (s) return s;
  }
  return null;
}

function flightLegContext(leg = {}, trip = {}) {
  const snap = leg.flightSnapshot && typeof leg.flightSnapshot === "object" ? leg.flightSnapshot : {};
  const segs = Array.isArray(leg.segmentsSummary)
    ? leg.segmentsSummary
    : Array.isArray(snap.segments)
      ? snap.segments
      : [];
  const first = segs[0] || {};
  const last = segs[segs.length - 1] || {};
  const origin = trip.origin || first.from || snap.departure?.airport || null;
  const destination = trip.destination || last.to || snap.arrival?.airport || null;
  return {
    type: "flight",
    status: leg.status || null,
    airline: leg.airline || snap.airline?.name || snap.airline || first.airline || null,
    airline_code:
      inferAirlineCode(
        leg.airline || snap.airline?.name || snap.airline || first.airline,
        snap.flightNumber || snap.flight_number || first.flight_number,
        leg.airlineCode || snap.airline?.code || first.airline_code
      ) || null,
    flight_number:
      snap.flightNumber ||
      snap.flight_number ||
      first.flight_number ||
      first.flightNumber ||
      null,
    origin,
    destination,
    origin_label: airportLabel(origin),
    destination_label: airportLabel(destination),
    depart_date: leg.departDate || trip.departDate || null,
    depart_time: leg.departureTime || snap.departure?.time || null,
    arrive_time: leg.arrivalTime || snap.arrival?.time || null,
    duration: leg.duration || snap.duration || null,
    pnr: leg.pnr || null,
    booking_id: leg.bookingId || null,
    dep_terminal: pickTerminal(
      leg.depTerminal,
      snap.departure?.terminal,
      first.departure_terminal,
      first.dep_terminal,
      first.terminal,
      first.departure?.terminal
    ),
    arr_terminal: pickTerminal(
      leg.arrTerminal,
      snap.arrival?.terminal,
      last.arrival_terminal,
      last.arr_terminal,
      last.arrival?.terminal
    ),
    cabin: snap.cabin || snap.fare_family || first.cabin || null,
    baggage_cabin:
      snap.baggage?.cabin ||
      snap.baggage_detail?.cabin ||
      first.baggage_cabin ||
      null,
    baggage_checked:
      snap.baggage?.checked ||
      snap.baggage_detail?.checked_kg ||
      first.baggage_checked ||
      null,
    refundable:
      typeof snap.refundable === "boolean"
        ? snap.refundable
        : typeof first.refundable === "boolean"
          ? first.refundable
          : null,
    changeable:
      typeof snap.changeable === "boolean"
        ? snap.changeable
        : typeof first.changeable === "boolean"
          ? first.changeable
          : null,
  };
}

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.round(v * 100) / 100;
}

export function buildFlightsPageContext({
  search,
  filtered = [],
  totalOffers = 0,
  isLoading = false,
  filters = null,
  sortBy = "recommended",
  isReturnFlow = false,
  rtStep = null,
  currency = "USD",
} = {}) {
  if (!search?.origin || !search?.destination) {
    return {
      screen: "flights",
      path: "/flights",
      search: null,
      results_summary: { count: 0, loading: Boolean(isLoading) },
      help_hint: "User is on the Flights page but has not completed a search yet.",
    };
  }

  const toFlightPick = (f) =>
    f
      ? {
          airline: f?.airline?.name || f?.airline || "Airline",
          flight_number: f?.airline?.code || f?.flightNumber || null,
          dep_time: f?.departure?.time || null,
          arr_time: f?.arrival?.time || null,
          stops: f?.stops ?? f?.stopCount ?? null,
          duration: f?.duration || null,
          price: money(f?.price),
          currency: f?.currency || currency,
        }
      : null;

  const samples = (filtered || []).slice(0, 5).map((f, i) => ({
    index: i + 1,
    ...toFlightPick(f),
  }));

  const durationMinutes = (d) => {
    if (d == null) return Number.POSITIVE_INFINITY;
    if (typeof d === "number") return d;
    const s = String(d);
    const h = /(\d+)\s*h/i.exec(s);
    const m = /(\d+)\s*m/i.exec(s);
    const total = (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
    return total || Number.POSITIVE_INFINITY;
  };

  const priced = (filtered || []).filter((f) => money(f?.price) != null);
  const byPrice = [...priced].sort((a, b) => money(a.price) - money(b.price));
  const byFast = [...priced].sort(
    (a, b) => durationMinutes(a.duration) - durationMinutes(b.duration)
  );
  const picks =
    byPrice.length > 0
      ? {
          cheapest: toFlightPick(byPrice[0]),
          expensive: toFlightPick(byPrice[byPrice.length - 1]),
          fastest: toFlightPick(byFast[0]),
        }
      : null;

  const prices = (picks ? [picks.cheapest?.price] : samples.map((s) => s.price)).filter(
    (p) => p != null
  );
  const minPrice = prices.length ? Math.min(...prices) : money(filtered[0]?.price);

  const activeFilters = {};
  if (filters) {
    if (filters.airlines?.length) activeFilters.airlines = filters.airlines.slice(0, 8);
    if (filters.stops?.length) activeFilters.stops = filters.stops;
    if (filters.maxPrice != null) activeFilters.max_price = filters.maxPrice;
    if (filters.departureTimes?.length) activeFilters.departure_times = filters.departureTimes;
  }

  return {
    screen: "flights",
    path: "/flights",
    search: {
      origin: search.origin,
      destination: search.destination,
      depart_date: search.departDate || null,
      return_date: search.returnDate || null,
      trip_type: search.tripType || null,
      adults: search.adults ?? 1,
      children: search.children ?? 0,
      infants: search.infants ?? 0,
      cabin: search.cabin || "ECONOMY",
    },
    results_summary: {
      count: filtered.length,
      total_offers: totalOffers || filtered.length,
      loading: Boolean(isLoading),
      min_price: minPrice,
      currency,
      sort_by: sortBy,
      return_step: isReturnFlow ? rtStep : null,
      sample_offers: samples,
      picks,
      active_filters: Object.keys(activeFilters).length ? activeFilters : null,
    },
    help_hint:
      "User is browsing live flight results on the left. Help them compare, filter, pick dates, or choose a flight - do not re-ask origin/destination/date they already searched. " +
      "When they ask cheapest/fastest/nonstop/morning/airline, emit ```itinero-action JSON so the left list updates: " +
      '{"type":"set_sort","sort":"cheapest"} or {"type":"apply_nl_filter","query":"nonstop morning under 8000"}. ' +
      'Track / delay / gate for a flight number → left nav Flight track, or {"type":"track_flight","flight":"AI131","date":"2026-08-10"}. ' +
      'Airport departures/arrivals (STV, BOM) → {"type":"track_airport","airport":"STV"}. ' +
      "Never call search_flights for filter/sort on this same route.",
  };
}

/** Passenger / checkout step - the left page IS the booking in progress. */
export function buildPassengerPageContext(flight = null) {
  const airline =
    flight?.airline?.name ||
    (typeof flight?.airline === "string" ? flight.airline : null) ||
    null;
  const origin = String(flight?.departure?.airport || flight?.origin || "").toUpperCase().slice(0, 3);
  const destination = String(flight?.arrival?.airport || flight?.destination || "").toUpperCase().slice(0, 3);
  const departDate =
    flight?.departure?.date ||
    (flight?.departureAt ? String(flight.departureAt).slice(0, 10) : null) ||
    null;
  const booking = flight
    ? {
        airline,
        flight_number: flight.flightNumber || flight.flight_number || null,
        origin: origin || null,
        destination: destination || null,
        origin_label: airportLabel(origin) || origin || null,
        destination_label: airportLabel(destination) || destination || null,
        depart_date: departDate,
        dep_time: flight?.departure?.time || null,
        arr_time: flight?.arrival?.time || null,
        duration: flight?.duration || null,
        stops: flight?.stops || null,
        cabin: flight?.cabin || flight?.fare_family || null,
        price: money(flight?.price),
        currency: flight?.currencyCode || flight?.currency || null,
        offer_id: flight?.offerId || flight?.offer_id || flight?.id || null,
      }
    : null;

  return {
    screen: "passenger_info",
    path: "/flights/passenger-info",
    search:
      origin && destination
        ? {
            origin,
            destination,
            depart_date: departDate,
            cabin: booking?.cabin || "ECONOMY",
            adults: 1,
          }
        : null,
    booking,
    help_hint:
      "User is filling passenger details for THIS booking on the left. " +
      "This is the current trip - ignore any older Mumbai/Dubai/other search in chat memory. " +
      "Help them complete names, DOB, passport, then Continue to Payment. Do NOT re-search flights.",
  };
}

export function buildExplorePageContext({
  origin = null,
  monthKey = "",
  budget = "",
  continent = "",
  theme = "",
  duration = "",
  destinations = [],
  detail = null,
  intel = null,
  currency = "INR",
  passportCountry = "",
  passportLabel = "",
  visaForYou = "",
} = {}) {
  const samples = (destinations || []).slice(0, 10).map((d, i) => ({
    index: i + 1,
    city: d.city,
    iata: d.iata,
    from_price: money(d.from_price),
  }));
  const priced = samples.map((s) => s.from_price).filter((p) => p != null);
  const minPrice = priced.length ? Math.min(...priced) : null;
  const passport = String(passportCountry || "").toUpperCase();

  return {
    screen: detail ? "explore_detail" : "explore",
    path: detail?.slug ? `/explore/${detail.slug}` : "/explore",
    explore: {
      origin: origin || null,
      month: monthKey || null,
      budget: budget || null,
      continent: continent || null,
      theme: theme || null,
      duration: duration || null,
      passport_country: passport || null,
      passport_label: passportLabel || null,
      visa_for_you: visaForYou || null,
      detail: detail
        ? {
            city: detail.city,
            country: detail.country,
            iata: detail.iata,
            slug: detail.slug,
          }
        : null,
      intel: intel || null,
    },
    traveler: passport
      ? { passport_nationality: passport, nationality: passport }
      : undefined,
    results_summary: {
      count: destinations?.length || 0,
      min_price: minPrice,
      currency,
      sample_destinations: samples,
    },
    help_hint: detail
      ? `User is exploring ${detail.city}, ${detail.country} (${detail.iata}) from ${origin || "their origin"}. ` +
        `Passport nationality: ${passportLabel || passport || "unknown - ask before visa advice"}. ` +
        `The left page has destination intel (vaccines, visa, malaria, seasons, money, safety). ` +
        `Answer health/visa/season from explore.intel / explore.visa_for_you when present - do not invent prescriptions or live prices. ` +
        `Never assume Indian passport unless passport_country is IN. ` +
        `Always note: confirm vaccines with a clinic and visas with the embassy. ` +
        `Also help with flights, hotels, or packages for this city.`
      : "User is on Explore browsing worldwide destinations (travel styles + places). Help them pick a way to travel or a destination. Do not invent fares. Destination detail pages have vaccines/visa intel. Never assume Indian passport.",
  };
}

export function buildTripsPageContext({ trips = [], filter = "all", detail = null } = {}) {
  const samples = (trips || []).slice(0, 8).map((t, i) => ({
    index: i + 1,
    id: t.id,
    title: t.title,
    status: t.status,
    origin: t.origin,
    destination: t.destination,
    depart_date: t.departDate || null,
  }));

  const detailPayload = detail
    ? {
        id: detail.id,
        title: detail.title,
        status: detail.status,
        origin: detail.origin,
        destination: detail.destination,
        origin_label: airportLabel(detail.origin),
        destination_label: airportLabel(detail.destination),
        departDate: detail.departDate,
        travelers: detail.travelers || null,
        contact: detail.contact
          ? {
              name: detail.contact.name || null,
              email: detail.contact.email || null,
              phone: detail.contact.phone || null,
            }
          : null,
        legs: (detail.legs || []).map((l) => {
          if (l.type === "flight") return flightLegContext(l, detail);
          if (l.type === "hotel") {
            return {
              type: "hotel",
              status: l.status || null,
              hotel_name: l.hotelName || null,
              location: l.location || null,
              check_in: l.checkIn || null,
              check_out: l.checkOut || null,
              booking_id: l.bookingId || null,
              confirmation: l.hotelConfirmationCode || null,
            };
          }
          return {
            type: l.type,
            status: l.status,
            pnr: l.pnr || null,
            booking_id: l.bookingId || l.packageBookingId || null,
            title: l.packageTitle || null,
          };
        }),
      }
    : null;

  const flight = (detailPayload?.legs || []).find((l) => l.type === "flight");
  const terminalHint = flight
    ? flight.dep_terminal || flight.arr_terminal
      ? `Departure terminal ${flight.dep_terminal || "unknown"} at ${flight.origin_label || flight.origin}; arrival ${flight.arr_terminal || "unknown"} at ${flight.destination_label || flight.destination}.`
      : `Terminal not stored on this booking - look up ${flight.airline || "the airline"} ${flight.flight_number || ""} ${flight.origin_label || flight.origin} → ${flight.destination_label || flight.destination}; do not ask which flight.`
    : "";

  return {
    screen: "trips",
    path: detail?.id ? `/trips/${detail.id}` : "/trips",
    filter,
    detail: detailPayload,
    results_summary: {
      count: trips.length,
      drafts: trips.filter((t) => t.status === "draft" || t.status === "held").length,
      confirmed: trips.filter((t) => t.status === "confirmed").length,
      sample_trips: samples,
    },
    help_hint: detail
      ? `User is viewing trip ${detail.title} (${detail.status}). Vague follow-ups (terminal, gate, PNR, baggage, check-in, allowance) mean THIS booking. ${terminalHint} If baggage_cabin/checked on the ticket are 0 or missing, say LiteAPI/Nuitee often stores 0/0 and quote published carrier kg as secondary - never claim published kg is "on your ticket". Do not invent PNR/gates. If they want to cancel: you cannot cancel yourself - tell them to tap Cancel with supplier on this trip page, emit \`\`\`itinero-action {"type":"open_trips","tripId":"${detail.id}"}\`\`\`.`
      : "User is on Trips. Bookings auto-save here when they start flight/hotel/package checkout. Help them resume drafts or review confirmations. Cancel flight/hotel: open the trip and tell them to tap Cancel with supplier - never claim you cancelled.",
  };
}

export function buildTrainsPageContext({
  origin = "",
  destination = "",
  when = "",
  window = "",
  fromCode = "",
  toCode = "",
  trains = [],
  isLoading = false,
  mode = "search",
  food = null,
} = {}) {
  if (mode === "food") {
    return {
      screen: "trains",
      path: "/trains?mode=food",
      mode: "food",
      search: food || null,
      results_summary: { count: 0, loading: false },
      help_hint:
        "User is on Food on train (left). PNR tab or TRAIN tab (train number + boarding station + date). " +
        "Never invent a menu or price. IRCTC eCatering is official. Never name the kitchen partner. " +
        'Emit ```itinero-action {"type":"order_train_food","tab":"pnr","pnr":"4242592802"} or ' +
        '{"type":"order_train_food","tab":"train","number":"20901","boarding":"ST","date":"2026-08-09"}.',
    };
  }
  if (!origin || !destination) {
    return {
      screen: "trains",
      path: "/trains",
      search: null,
      results_summary: { count: 0, loading: Boolean(isLoading) },
      help_hint: "User is on Trains but has not searched a corridor yet.",
    };
  }
  const samples = (trains || []).slice(0, 6).map((t, i) => ({
    index: i + 1,
    number: t.number || null,
    name: t.name || null,
    dep: t.dep || null,
    arr: t.arr || null,
    duration: t.duration || null,
    in_window: t.in_window !== false,
  }));
  return {
    screen: "trains",
    path: "/trains",
    search: {
      origin,
      destination,
      when: when || null,
      window: window || null,
      from_code: fromCode || null,
      to_code: toCode || null,
    },
    results_summary: {
      count: trains.length,
      loading: Boolean(isLoading),
      sample_trains: samples,
    },
    help_hint:
      "User is browsing live trains on the left. Speak 1-2 matching trains only. " +
      "Do not dump the timetable in chat. Booking finishes on partner checkout; IRCTC issues the ticket. " +
      "Food on train / eCatering → emit ```itinero-action {\"type\":\"order_train_food\",\"number\":\"20901\",\"boarding\":\"ST\"} - never invent a menu. " +
      "When they ask morning/afternoon/evening, emit ```itinero-action " +
      '{"type":"search_trains","origin":"' +
      origin +
      '","destination":"' +
      destination +
      '","window":"afternoon"} so the left list updates. Never invent a train number.',
  };
}

export function buildBusesPageContext({
  origin = "",
  destination = "",
  when = "",
  window = "",
  buses = [],
  isLoading = false,
} = {}) {
  if (!origin || !destination) {
    return {
      screen: "transits",
      path: "/transits",
      search: null,
      results_summary: { count: 0, loading: Boolean(isLoading) },
      help_hint: "User is on Transits but has not searched a corridor yet.",
    };
  }
  const local = (buses || []).some((b) => b.local);
  const samples = (buses || []).slice(0, 6).map((b, i) => ({
    index: i + 1,
    operator: b.operator || null,
    bus_type: b.bus_type || null,
    vehicle: b.vehicle || null,
    name_short: b.name_short || null,
    trip_short: b.trip_short || null,
    headsign: b.headsign || null,
    headway: b.headway || null,
    dep: b.dep || null,
    arr: b.arr || null,
    duration: b.duration || null,
    distance: b.distance || null,
    fare: typeof b.fare === "number" ? b.fare : null,
    fare_currency: b.fare_currency || b.currency || null,
    rating: typeof b.rating === "number" ? b.rating : null,
    seats: typeof b.seats === "number" ? b.seats : null,
    live_tracking: Boolean(b.live_tracking),
    rtc: Boolean(b.rtc),
    from_stop: b.from_stop || null,
    to_stop: b.to_stop || null,
    modes: Array.isArray(b.modes) ? b.modes.slice(0, 6) : [],
    local: Boolean(b.local),
    kind: b.kind || null,
  }));
  const nearbyStop = samples.find((s) => s.from_stop)?.from_stop;
  return {
    screen: "transits",
    path: "/transits",
    search: {
      origin,
      destination,
      when: when || null,
      window: window || null,
      local,
    },
    results_summary: {
      count: buses.length,
      loading: Boolean(isLoading),
      sample_buses: samples,
      nearby_boarding_stop: nearbyStop || null,
    },
    help_hint: local
      ? "User is browsing public transit (Google Maps: bus/metro/tram/rail) on the left. SPEAK the nearby boarding stop out loud"
        + (nearbyStop ? ` (${nearbyStop})` : " (from_stop on the cards)")
        + ". If they ask near my home / nearby, say that stop name. Do not dump the full list. "
        + "City transit = directions only, not partner Volvo checkout. Never invent a stop or fare."
      : "User is browsing live transits on the left (bus/metro/tram/rail/ferry + coaches). Speak 1-2 matching options only. "
        + "Do not dump the full list in chat. Booking finishes on partner checkout - we do not issue tickets. "
        + "When they ask morning/afternoon/evening, emit ```itinero-action "
        + '{"type":"search_buses","origin":"'
        + origin
        + '","destination":"'
        + destination
        + '","window":"afternoon"} so the left list updates. Never invent an operator or fare.',
  };
}

export function buildHotelsPageContext({
  query,
  filtered = [],
  total = 0,
  isLoading = false,
  filters = null,
  currency = "USD",
  sortBy = "recommended",
} = {}) {
  if (!query?.city) {
    return {
      screen: "hotels",
      path: "/hotels",
      search: null,
      results_summary: { count: 0, loading: Boolean(isLoading) },
      help_hint: "User is on the Hotels page but has not searched a city yet.",
    };
  }

  const toHotelPick = (h) =>
    h
      ? {
          name: h?.name || "Hotel",
          stars: h?.stars ?? null,
          rating: h?.rating ?? null,
          area: h?.area || h?.city || null,
          price_per_night: money(h?.pricePerNight || h?.totalPrice),
          currency: h?.currency || currency,
        }
      : null;

  const samples = (filtered || []).slice(0, 5).map((h, i) => ({
    index: i + 1,
    ...toHotelPick(h),
  }));

  const priced = (filtered || []).filter((h) => money(h?.pricePerNight || h?.totalPrice) != null);
  const byPrice = [...priced].sort(
    (a, b) => money(a.pricePerNight || a.totalPrice) - money(b.pricePerNight || b.totalPrice)
  );
  const byRating = [...priced].sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
  const picks =
    byPrice.length > 0
      ? {
          cheapest: toHotelPick(byPrice[0]),
          expensive: toHotelPick(byPrice[byPrice.length - 1]),
          top_rated: toHotelPick(byRating[0]),
        }
      : null;

  const prices = (picks ? [picks.cheapest?.price_per_night] : samples.map((s) => s.price_per_night)).filter(
    (p) => p != null
  );
  const minPrice = prices.length ? Math.min(...prices) : null;

  const activeFilters = {};
  if (filters) {
    if (filters.stars?.length) activeFilters.stars = filters.stars;
    if (filters.areas?.length) activeFilters.areas = filters.areas.slice(0, 6);
    if (filters.maxPrice != null) activeFilters.max_price = filters.maxPrice;
    if (filters.minRating != null) activeFilters.min_rating = filters.minRating;
  }

  return {
    screen: "hotels",
    path: "/hotels",
    search: {
      city: query.city,
      check_in: query.checkIn || null,
      check_out: query.checkOut || null,
      guests: query.guests ?? 2,
      rooms: query.rooms ?? 1,
    },
    results_summary: {
      count: filtered.length,
      total: total || filtered.length,
      loading: Boolean(isLoading),
      min_price: minPrice,
      currency,
      sort_by: sortBy,
      sample_hotels: samples,
      picks,
      active_filters: Object.keys(activeFilters).length ? activeFilters : null,
    },
    help_hint:
      "User is browsing live hotel results on the left. Help them filter, compare stays, or pick one - do not re-ask city/dates they already searched. " +
      "When they ask cheaper/4-star/breakfast/near airport, emit ```itinero-action JSON: " +
      '{"type":"apply_nl_filter","query":"4 star breakfast"} or {"type":"set_sort","sort":"cheapest"}. ' +
      "Never call search_hotels for filter/sort on this same city.",
  };
}

export function buildPackageDetailPageContext({
  pkg,
  quote = null,
  checkIn = null,
  checkOut = null,
  guests = 2,
  origin = null,
  flightOfferId = null,
  variant = null,
  selectedDay = null,
  path = null,
} = {}) {
  if (!pkg?.id && !pkg?.slug && !pkg?.title) {
    return {
      screen: "package_detail",
      path: path || "/packages",
      package: null,
      help_hint: "User is on a package page but data is still loading.",
    };
  }

  const days = pkg.instance?.days || pkg.itinerary || [];
  const itinerary = days.slice(0, 12).map((d) => ({
    day: d.day,
    date: d.date || null,
    title: d.title,
    origin: d.origin || null,
    destination: d.destination || null,
    stay_city: d.stayCity || d.hotel_city || null,
    meals: d.meals || null,
    pace: d.pace || null,
    transfer_minutes: (d.transfers || []).reduce(
      (s, t) => s + Number(t.estimated_duration_minutes || 0),
      0
    ),
    activities: (d.activities || []).slice(0, 6),
    description: String(d.narrative || d.description || "").slice(0, 220),
  }));

  const stays = (quote?.stays || []).map((s) => ({
    city: s.city,
    nights: s.nights,
    hotel: s.hotel?.name || null,
    stay_total: money(s.stayTotal),
  }));

  const flight = quote?.flight
    ? {
        origin: quote.flight.origin,
        destination: quote.flight.destination,
        airline: quote.flight.airline,
        depart_time: quote.flight.departTime,
        arrive_time: quote.flight.arriveTime,
        duration: quote.flight.duration,
        stops: quote.flight.stops,
        price: money(quote.flightTotal ?? quote.flight.price),
        offer_id: quote.flight.offerId || quote.flight.id || null,
      }
    : null;

  const validation = quote?.validation || pkg.instance?.validation || {};
  const status = quote?.status || {};
  const pricing = quote?.pricing || {};

  return {
    screen: "package_detail",
    path: path || `/packages/${pkg.slug || pkg.id}`,
    ui_context: {
      page: "package_detail",
      package_id: pkg.id || pkg.slug,
      selected_day: selectedDay,
      variant: variant || quote?.variant || pkg.instance?.variant || null,
    },
    package: {
      id: pkg.id,
      slug: pkg.slug,
      title: pkg.title,
      product_type: pkg.productType || pkg.instance?.productType || "curated_template",
      region: pkg.region,
      theme: pkg.theme,
      destinations: pkg.destinations || [],
      required_anchors: pkg.requiredAnchors || pkg.instance?.requiredAnchors || [],
      duration_nights: pkg.durationNights || pkg.instance?.nights,
      recommended_days: pkg.recommendedDurationDays || pkg.instance?.recommendedDurationDays,
      currency: pkg.currency || "INR",
      itinerary,
    },
    quote: {
      check_in: checkIn || quote?.checkIn || null,
      check_out: checkOut || quote?.checkOut || null,
      guests,
      origin: origin || quote?.flightMeta?.origin || null,
      gateway: quote?.flightMeta?.gateway || pkg.flightGateway || null,
      stay_total: money(quote?.stayTotal),
      flight_total: money(quote?.flightTotal),
      bookable_total: money(quote?.bookableTotal ?? pricing.bookableTotal),
      estimated_trip_min: money(quote?.estimatedTripMin ?? pricing.estimatedTripMin),
      estimated_trip_max: money(quote?.estimatedTripMax ?? pricing.estimatedTripMax),
      pay_now: money(quote?.payNow ?? pricing.payNow),
      stays,
      flight,
      flight_offer_id: flightOfferId || flight?.offer_id || null,
      needs_origin: Boolean(quote?.needsOrigin),
      status,
      validation,
    },
    help_hint:
      "Same package instance is on screen. Do NOT restart the package. " +
      "Do not claim you changed a day until the user applies a preview. " +
      "If itinerary validation failed, offer extend dates or a shorter variant - never squeeze missing dhams. " +
      "Pronouns: 'day 5', 'the second hotel', 'both' refer to THIS instance. " +
      "itinero-action types: " +
      '{"type":"preview_lighten_day","day":2} ' +
      '{"type":"apply_itinerary_patch","day":2,"patch":{...}} ' +
      '{"type":"set_duration_days","days":10} {"type":"set_plan_variant","variant":"do_dham"} ' +
      '{"type":"set_origin","origin":"BOM"} {"type":"set_flight_offer","offerId":"..."} ' +
      '{"type":"open_flight_swap"} {"type":"open_hotel_swap","city":"Haridwar"} ' +
      '{"type":"select_day","day":5}. ' +
      "Bookable vs estimate: never call ground/meals/darshan a payable package price. Do not invent live prices.",
  };
}

/** Welcome copy when the drawer opens on a contextual page. */
export function welcomeFromPageContext(pageContext) {
  if (!pageContext?.screen) {
    return {
      title: "Vero",
      subtitle: "Your travel agent",
      desc: "Tell me the trip - I’ll pull hotels, flights, or a plan on the left.",
      botText:
        "Where are we going? I can pull hotels, flights, or a full plan on the left while we talk.",
    };
  }

  if (pageContext.screen === "package_detail" && pageContext.package) {
    const p = pageContext.package;
    return {
      title: p.title,
      subtitle: "Same trip · ask to change it",
      desc: "Lighten a day, swap a stay, or find a cheaper return - I’ll preview, then you apply.",
      botText:
        "Ask me to lighten a day, swap a hotel, or find a cheaper return. I’ll preview the change on this package - nothing applies until you tap Apply.",
    };
  }

  if (pageContext.screen === "package_detail") {
    return {
      title: "Packages",
      subtitle: "Customize beside you",
      desc: "Open a package and I’ll help edit the itinerary, stays, and flights.",
      botText:
        "You're on Packages. Open a package detail and I can customize the itinerary, hotels, and flights on the left.",
    };
  }

  if (pageContext.screen === "flights" && pageContext.search) {
    const s = pageContext.search;
    const n = pageContext.results_summary?.count;
    const date = s.depart_date || "your dates";
    const countBit =
      typeof n === "number" && n > 0 ? ` - ${n} options on the left` : "";
    return {
      title: "Flights on screen",
      subtitle: `${s.origin} → ${s.destination}`,
      desc: `I can see your search for ${date}${countBit}. Ask me to compare, filter, or pick the best deal.`,
      botText: `I can see you're looking at flights **${s.origin} → ${s.destination}** on **${date}**${countBit}. Want help comparing options, finding nonstops, or picking a cheaper time?`,
    };
  }

  if (pageContext.screen === "passenger_info" && pageContext.booking) {
    const b = pageContext.booking;
    const route = [b.origin, b.destination].filter(Boolean).join(" → ") || "this flight";
    const label = [b.airline, b.flight_number].filter(Boolean).join(" ") || route;
    return {
      title: "Booking in progress",
      subtitle: label,
      desc: `Passenger details for ${label}. I can help you finish names and continue to payment.`,
      botText: `You're on passenger details for **${label}** (${route}${b.depart_date ? `, ${b.depart_date}` : ""}). Fill the form on the left, then Continue to Payment - I won't switch routes.`,
    };
  }

  if (pageContext.screen === "passenger_info") {
    return {
      title: "Passenger details",
      subtitle: "Finish this booking",
      desc: "Fill traveller details on the left, then continue to payment.",
      botText:
        "You're on passenger details. Fill the form on the left and tap Continue to Payment when you're ready.",
    };
  }

  if (pageContext.screen === "flights") {
    return {
      title: "Flights",
      subtitle: "Search is ready when you are",
      desc: "Set origin, destination, and dates on the left - then I can help compare results.",
      botText:
        "You're on Flights. Once you search a route on the left, I can help compare, filter, and pick options.",
    };
  }

  if (pageContext.screen === "trains" && pageContext.mode === "food") {
    return {
      title: "Food on train",
      subtitle: "Meal to your seat",
      desc: "PNR or train number + boarding station. IRCTC eCatering is official - we never invent a menu.",
      botText:
        "You're on Food on train. Give me a 10-digit PNR, or a train number + boarding station + date. I won't invent a menu or price.",
    };
  }

  if (pageContext.screen === "trains" && pageContext.search) {
    const s = pageContext.search;
    const n = pageContext.results_summary?.count;
    const win = s.window ? ` · ${s.window}` : "";
    const countBit = typeof n === "number" && n > 0 ? ` - ${n} trains on the left` : "";
    return {
      title: "Trains on screen",
      subtitle: `${s.origin} → ${s.destination}`,
      desc: `Live trains${win}${countBit}. I’ll only say the best 1-2 out loud.`,
      botText: `I can see trains **${s.origin} → ${s.destination}**${win} on the left${countBit}. Want morning, afternoon, or evening?`,
    };
  }

  if (pageContext.screen === "trains") {
    return {
      title: "Trains",
      subtitle: "Live train timetable",
      desc: "Search a corridor on the left - I’ll only mention the best 1-2 trains.",
      botText:
        "You're on Trains. Search a corridor on the left and I can help pick a time window. We don’t issue the e-ticket here.",
    };
  }

  if ((pageContext.screen === "buses" || pageContext.screen === "transits") && pageContext.search) {
    const s = pageContext.search;
    const n = pageContext.results_summary?.count;
    const win = s.window ? ` · ${s.window}` : "";
    const countBit = typeof n === "number" && n > 0 ? ` - ${n} options on the left` : "";
    return {
      title: "Transits on screen",
      subtitle: `${s.origin} → ${s.destination}`,
      desc: `Live transits${win}${countBit}. I’ll only say the best 1-2 out loud.`,
      botText: `I can see transits **${s.origin} → ${s.destination}**${win} on the left${countBit}. Want morning, afternoon, or evening?`,
    };
  }

  if (pageContext.screen === "buses" || pageContext.screen === "transits") {
    return {
      title: "Transits",
      subtitle: "Bus, metro, tram, rail, ferry",
      desc: "Search a corridor on the left - I’ll only mention the best 1-2 options.",
      botText:
        "You're on Transits. Search a corridor on the left and I can help pick a time window. We don’t issue the ticket here.",
    };
  }

  if (pageContext.screen === "hotels" && pageContext.search) {
    const s = pageContext.search;
    const n = pageContext.results_summary?.count;
    const countBit =
      typeof n === "number" && n > 0 ? ` - ${n} stays showing` : "";
    return {
      title: "Hotels on screen",
      subtitle: s.city,
      desc: `Helping with stays in ${s.city}${countBit}. Ask for cheaper, higher rated, or better location.`,
      botText: `I can see hotel results for **${s.city}** (${s.check_in || "check-in"} → ${s.check_out || "check-out"})${countBit}. Want cheaper nights, higher ratings, or a specific area?`,
    };
  }

  if (pageContext.screen === "hotels") {
    return {
      title: "Hotels",
      subtitle: "Search is ready when you are",
      desc: "Pick a city and dates on the left - then I can help narrow stays.",
      botText:
        "You're on Hotels. Search a city on the left and I can help filter and compare stays.",
    };
  }

  if (pageContext.screen === "explore_detail" && pageContext.explore?.detail) {
    const d = pageContext.explore.detail;
    const origin = pageContext.explore.origin || "your city";
    const alerts = pageContext.explore?.intel?.alerts || [];
    const alertBit = alerts.length ? ` Heads-up: ${alerts.slice(0, 3).join("; ")}.` : "";
    return {
      title: "Destination on screen",
      subtitle: d.city,
      desc: `Exploring ${d.city} from ${origin}. Ask about vaccines, visa, seasons, flights, or hotels.`,
      botText: `I can see you're exploring **${d.city}, ${d.country || ""}** (${d.iata}) from **${origin}**.${alertBit} Ask me vaccinations, visa, best month, or flights.`,
    };
  }

  if (pageContext.screen === "explore") {
    const origin = pageContext.explore?.origin || "your origin";
    const n = pageContext.results_summary?.count;
    const countBit =
      typeof n === "number" && n > 0 ? ` - ${n} destinations showing` : "";
    return {
      title: "Explore the world",
      subtitle: `From ${origin}`,
      desc: `Worldwide options${countBit}. Ask for a vibe, budget, or region.`,
      botText: `You're on Explore from **${origin}**${countBit}. Tell me a vibe (beach, honeymoon, Europe under 60k) and I'll help pick where to go.`,
    };
  }

  if (pageContext.screen === "trips" && pageContext.detail) {
    const t = pageContext.detail;
    return {
      title: "Trip on screen",
      subtitle: t.title,
      desc: `Status: ${t.status}. I can help resume booking or explain your confirmation.`,
      botText: `I can see your trip **${t.title}** (${t.status}). Ask me the terminal, PNR, baggage, or anything else about this booking - I won’t re-ask which flight.`,
    };
  }

  if (pageContext.screen === "trips") {
    const n = pageContext.results_summary?.count || 0;
    return {
      title: "Your trips",
      subtitle: n ? `${n} saved` : "Empty for now",
      desc: "Trips are created when you start booking. Ask me to resume a draft or review a confirmation.",
      botText: n
        ? `You have **${n}** trip(s) on the left. Ask me to resume a draft, find a PNR, or plan the next leg.`
        : "No trips yet. Start a flight or package booking and it will show up here automatically.",
    };
  }

  if (pageContext.screen === "help") {
    const topic = pageContext.help?.topic_label || pageContext.help?.topic || "support";
    return {
      title: "Help & support",
      subtitle: topic,
      desc: "I’ll help beside your trip - without inventing gates, PNRs, or airline policy.",
      botText: `You’re on Help. Tell me what went wrong (${topic}) and I’ll guide the next step - open Flights, Hotels, or My Trips on the left when we need them.`,
    };
  }

  if (pageContext.screen === "profile") {
    const name = pageContext.profile?.name
      ? String(pageContext.profile.name).split(/\s+/)[0]
      : null;
    return {
      title: "Your account",
      subtitle: name ? `Hi ${name}` : "Profile",
      desc: "Trips, travellers, preferences - I’ll open the right page when we need to book or change something.",
      botText: name
        ? `You’re on your account, ${name}. Want help with travellers, an upcoming trip, or starting the next booking?`
        : "You’re on Account. I can help with travellers, trips, preferences, or open Flights / Hotels / My Trips on the left.",
    };
  }

  if (pageContext.screen === "saved") {
    const n = pageContext.results_summary?.count || pageContext.saved?.count || 0;
    const titles = (pageContext.saved?.titles || []).slice(0, 3);
    return {
      title: "Saved",
      subtitle: n ? `${n} on your board` : "Inspiration board",
      desc: "Compare destinations you’ve saved - still Explore mode until you build a trip.",
      botText: n
        ? `You saved ${titles.length ? titles.join(", ") : `${n} idea(s)`}. Want me to compare them for vibe and season, or find something new?`
        : "Your Saved board is empty. Tell me a vibe and I’ll suggest destinations worth bookmarking from Explore.",
    };
  }

  if (pageContext.screen === "notifications") {
    const alerts = pageContext.alerts || {};
    const watches = Number(alerts.watches) || 0;
    const feed = Number(alerts.feed) || 0;
    const routes = Array.isArray(alerts.routes) ? alerts.routes.filter(Boolean).slice(0, 3) : [];
    const priceOn = alerts.priceAlerts !== false;
    const routeBit = routes.length ? ` Watching ${routes.join(", ")}.` : "";
    return {
      title: "Alerts",
      subtitle: watches ? `${watches} route watch${watches === 1 ? "" : "es"}` : "Price & trip nudges",
      desc: "I can help you watch a route, check live fares, or remind you about an upcoming trip - without inventing gates.",
      botText: priceOn
        ? watches
          ? `You're on Alerts with **${watches}** price watch${watches === 1 ? "" : "es"} on the left.${routeBit}${
              feed ? ` ${feed} update${feed === 1 ? "" : "s"} in activity.` : ""
            } Want me to suggest a route to watch, or help with a trip reminder?`
          : "You're on **Alerts**. Price tracking is on - add a route on the left (e.g. BOM → DEL), hit Check for a live fare, and I’ll help interpret drops. Trip reminders use your bookings."
        : "You're on **Alerts**, but price tracking is off. Turn it on on the left to watch routes, or ask me to set up a BOM → DEL watch once it’s enabled.",
    };
  }

  return welcomeFromPageContext(null);
}

/** Starter chips that act on the left-side page. */
export function starterChipsFromPageContext(pageContext) {
  if (pageContext?.screen === "package_detail" && pageContext.package) {
    const chips = [
      "Make Day 2 lighter",
      "Suggest a better hotel for the first stay",
      "Find cheaper return flights",
    ];
    if (pageContext.quote?.needs_origin) {
      chips.unshift("I am flying from Mumbai (BOM)");
    }
    return chips;
  }
  if (pageContext?.screen === "package_detail") {
    return ["Help me customize this package", "Add flights from BOM"];
  }
  if (pageContext?.screen === "flights" && pageContext.search) {
    return [
      "Show cheapest nonstop",
      "Morning departures only",
      "Compare top 3 options",
      "Anything under ₹8,000?",
    ];
  }
  if (pageContext?.screen === "flights") {
    return ["Help me search flights", "BOM to DXB next week", "Find nonstop deals"];
  }
  if (pageContext?.screen === "trains" && pageContext.mode === "food") {
    return ["Order with my PNR", "Food on train 20901", "IRCTC eCatering"];
  }
  if (pageContext?.screen === "trains" && pageContext.search) {
    return ["Afternoon only", "Morning departures", "Evening trains", "Food on train"];
  }
  if (pageContext?.screen === "trains") {
    return ["Surat to Baroda train", "Mumbai to Pune afternoon", "Food on train"];
  }
  if (pageContext?.screen === "buses" && pageContext.search) {
    return ["Afternoon only", "Morning departures", "Evening buses", "Any time"];
  }
  if (pageContext?.screen === "buses") {
    return ["Surat to Vadodara bus", "Mumbai to Pune tonight", "Ahmedabad to Surat"];
  }
  if (pageContext?.screen === "hotels" && pageContext.search) {
    return [
      "Cheaper stays",
      "4★ and above",
      "With free breakfast",
      "Best rated near the center",
    ];
  }
  if (pageContext?.screen === "hotels") {
    return ["Help me find hotels", "Hotels in Dubai", "Beach resorts"];
  }
  if (pageContext?.screen === "explore_detail" && pageContext.explore?.detail) {
    const city = pageContext.explore.detail.city;
    const country = pageContext.explore.detail.country || city;
    return [
      `Vaccinations for ${country}`,
      `Visa for ${country} (${pageContext.explore?.passport_label || "your passport"})`,
      `Best time to visit ${city}`,
      `Flights from ${pageContext.explore.origin || "my city"} to ${city}`,
    ];
  }
  if (pageContext?.screen === "explore") {
    const origin = pageContext.explore?.origin || "my city";
    return [
      `Cheapest in Europe under 60k from ${origin}`,
      `Beach anywhere from ${origin}`,
      "2-week honeymoon packages",
      "Weekend escapes in India",
    ];
  }
  if (pageContext?.screen === "trips" && pageContext.detail) {
    return [
      "Which terminal?",
      "What's my PNR?",
      "Add a hotel to this trip",
      "Explain this booking",
    ];
  }
  if (pageContext?.screen === "trips") {
    return [
      "Resume my draft flight",
      "Show confirmed trips",
      "Help me start a new trip",
    ];
  }
  if (pageContext?.screen === "help") {
    const topic = pageContext?.help?.topic;
    if (topic === "refund") return ["Start a refund", "Change my dates", "Open My Trips"];
    if (topic === "flight") return ["Track my flight", "Open Flights", "What about bags?"];
    if (topic === "hotel") return ["Open Hotels", "Wrong stay details", "Open My Trips"];
    if (topic === "train") return ["Check PNR", "Open Trains", "Track a train"];
    return ["I have a booking issue", "Help with a refund", "Open My Trips"];
  }
  if (pageContext?.screen === "profile") {
    return [
      "Show my upcoming trips",
      "Help me add a traveller",
      "Plan my next trip",
      "Open Flights",
    ];
  }
  if (pageContext?.screen === "saved") {
    const n = pageContext?.results_summary?.count || 0;
    if (n) {
      return ["Compare my saved places", "Which is best for September?", "Find something unexpected", "Open Explore"];
    }
    return ["Suggest places to save", "Beach under 6 hours", "Romantic but not crowded", "Open Explore"];
  }
  if (pageContext?.screen === "notifications") {
    const watches = Number(pageContext?.alerts?.watches) || 0;
    if (watches) {
      return [
        "Check my watched routes",
        "What does a price drop mean?",
        "Remind me about my next trip",
        "Watch BOM → DEL",
      ];
    }
    return [
      "Help me set a price watch",
      "Watch BOM → DEL",
      "How do trip reminders work?",
      "Open My Trips",
    ];
  }
  return ["Hotels in Mumbai", "Flights BOM → DEL", "Plan a Goa weekend"];
}

/** Pull ```itinero-action ... ``` JSON from a Vero reply (for package UI updates). */
export function extractItineroActions(text) {
  const raw = String(text || "");
  const actions = [];
  const re = /```itinero-action\s*([\s\S]*?)```/gi;
  let m;
  while ((m = re.exec(raw))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed)) actions.push(...parsed.filter((a) => a && a.type));
      else if (parsed && parsed.type) actions.push(parsed);
    } catch {
      /* ignore bad fence */
    }
  }
  return actions;
}

/** Strip action fences from display text. */
export function stripItineroActions(text) {
  return String(text || "")
    .replace(/```itinero-action\s*[\s\S]*?```/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
