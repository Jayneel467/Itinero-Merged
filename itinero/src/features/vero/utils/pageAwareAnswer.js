/**
 * Grounded answers from the left-page list (flights/hotels).
 * Pure list questions must not go to the LLM and ask for origin/dates again.
 */

import { extractDepartDateFromText } from "./pageFilterIntent";
import {
  baggageFacts,
  formatBaggageReply,
  formatTerminalReply,
} from "./airlineFacts";

function niceDate(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd || "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Short reply after opening/updating the left-page search. */
export function replyFromNavAction(action, pageContext) {
  if (!action?.type) return null;
  if (action.type === "search_flights" && action.origin && action.destination) {
    const date = action.depart_date || pageContext?.search?.depart_date;
    if (action.depart_date) {
      return `Searching **${action.origin} → ${action.destination}** on **${niceDate(action.depart_date)}** on the left - live fares will load there.`;
    }
    return `Opened **${action.origin} → ${action.destination}** on the left${
      date ? ` (${niceDate(date)})` : ""
    }. Ask cheapest, nonstop, or a different date.`;
  }
  if (action.type === "search_hotels" && action.city) {
    return `Opened hotels in **${action.city}** on the left. Ask cheaper stays, or change dates.`;
  }
  if (action.type === "search_trains" && (action.origin || action.from_code)) {
    const win = action.window ? ` · **${action.window}**` : "";
    return `Opened trains **${action.origin || action.from_code} → ${action.destination || action.to_code}**${win} on the left. I’ll only say the best 1-2 out loud.`;
  }
  if (action.type === "search_buses" && (action.origin || action.from)) {
    const win = action.window ? ` · **${action.window}**` : "";
    return `Opened transits **${action.origin || action.from} → ${action.destination || action.to}**${win} on the left. I’ll only say the best 1-2 out loud.`;
  }
  if (action.type === "track_train" && action.number) {
    return `Opened live status for **${action.number}** on the left. This is running-status, not GPS.`;
  }
  if (action.type === "track_flight" && action.flight) {
    return `Opened flight track for **${action.flight}** on the left. Airport screens win - we don’t invent gates.`;
  }
  if (action.type === "track_airport" && action.airport) {
    return `Opened the **${String(action.airport).toUpperCase()}** airport board on the left - live departures and arrivals only.`;
  }
  if (action.type === "check_pnr" && action.pnr) {
    return `Opened PNR **${action.pnr}** on the left.`;
  }
  if (action.type === "order_train_food") {
    if (action.pnr) return `Opened food on train for PNR **${action.pnr}** on the left.`;
    if (action.number) return `Opened food on train for **${action.number}** on the left.`;
    return "Opened food on train on the left - PNR or train + boarding station + date.";
  }
  if (action.type === "open_passenger_details" || action.type === "proceed_booking") {
    return "Opening passenger details on the left - fill names, then Continue to Payment.";
  }
  if (action.type === "open_flights") {
    return "Opened **Flights** on the left - tell me from → to and a date.";
  }
  if (action.type === "open_hotels") {
    return "Opened **Hotels** on the left - tell me the city and dates.";
  }
  if (action.type === "open_packages") {
    return "Opened **Packages** on the left - pick a trip or tell me the vibe.";
  }
  if (action.type === "open_trains") {
    return "Opened **Trains** on the left - tell me from → to.";
  }
  if (action.type === "open_buses") {
    return "Opened **Transits** on the left - tell me from → to.";
  }
  if (action.type === "open_trips" || action.type === "open_cancel") {
    return "Opened **My Trips** on the left.";
  }
  if (action.type === "open_profile") {
    return "Opened **Account** on the left - travellers, preferences, and trips live there.";
  }
  return null;
}

export function ackCurrentFlightSearch(text, pageContext) {
  if (pageContext?.screen !== "flights" || !pageContext.search?.origin) return null;
  const t = String(text || "").trim();
  if (!t) return null;
  const o = String(pageContext.search.origin).toUpperCase();
  const d = String(pageContext.search.destination).toUpperCase();
  const same =
    new RegExp(`\\b${o}\\b`, "i").test(t) &&
    new RegExp(`\\b${d}\\b`, "i").test(t) &&
    /\b(flight|flights|fly)\b/i.test(t);
  if (!same) return null;
  if (extractDepartDateFromText(t)) return null;
  const n = pageContext.results_summary?.count;
  const date = pageContext.search.depart_date;
  return (
    `That search is already on the left - **${o} → ${d}**${date ? ` on ${niceDate(date)}` : ""}${
      typeof n === "number" && n > 0 ? `, ${n} options` : ""
    }. Want cheapest, nonstop, or a different date?`
  );
}

const LIST_INTENT_RE =
  /\b(cheap(est)?|lowest|budget|expensive|priciest|highest|fastest|shortest|quickest|non[- ]?stop|direct|compare|top\s*3|best (value|deal|price)|under|below|less than|morning|evening|indigo|akasa|spicejet|air india)\b/i;

const OUT_OF_PAGE_RE =
  /\b(weather|visa|passport|restaurant|food|eat|cuisine|itinerary|plan a trip|honeymoon|eliminate|constraint|package|capital|timezone|time zone|language|currency of|who is)\b/i;

const BOOKING_OPS_RE =
  /\b(baggage|bags?|luggage|check[- ]?in bag|cabin bag|hand ?bag|allowance|terminal|gate|pnr|booking (id|ref|reference)|boarding|cancel(?:l?able|ation)?|refund(?:able)?|changeable|non[- ]?refundable|non[- ]?changeable)\b|સામાન|बैगेज|सामान|टर्मिनल|पीएनआर/i;

const BLINDFOLD_RE =
  /without using|don'?t use (the )?(internet|api|maps|booking)|no (internet|api|tools|booking data)/i;
const LIVE_ASK_RE =
  /\b(current (?:flight )?gate|boarding (?:has )?started|has boarding started|(?:exact )?security (?:wait|queue|line)|bag(?:gage)? (?:been )?loaded|check[- ]?in cutoff|live (?:traffic|status|delay)|airport security wait)\b/i;
const CRISIS_RE =
  /\b(rebook|automatically|notify the hotel|change fee|cancelled|canceled|can(?:not|'t)? make it|leaves? in|running late|miss (?:my )?connection)\b/i;

export const BLINDFOLD_REFUSAL =
  "I don’t have live airport feeds, and you asked me not to use the internet, airline/maps APIs, or your booking. So I **cannot** tell you: current gate, whether boarding has started, exact security queue time, or whether a checked bag is loaded. I won’t invent those. Check the airline app / airport screens for gate and boarding; bag-loaded status only exists with the airline.";

export function instantLiveGuard(text) {
  const t = String(text || "").trim();
  if (!t) return null;
  if (BLINDFOLD_RE.test(t) && LIVE_ASK_RE.test(t)) return BLINDFOLD_REFUSAL;
  return null;
}

export function skipBookingInstant(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (instantLiveGuard(t)) return true;
  if (t.length > 220) return true;
  if (BLINDFOLD_RE.test(t)) return true;
  if (/\b(boarding (?:has )?started|security (?:wait|queue)|bag(?:gage)? (?:been )?loaded|exact security|current gate)\b/i.test(t)) {
    return true;
  }
  if (CRISIS_RE.test(t) && (LIVE_ASK_RE.test(t) || /\bbag/i.test(t))) return true;
  return false;
}

const AGENTIC_PLAN_RE =
  /\b(compare|eliminate|honeymoon|constraint|schengen|should i take|stress[- ]?test|pick exactly one|plan (?:a |my |our )?(?:full day|one[- ]?day|trip)|full day in|day plan|itinerary|chest pain|vomit|lost (?:my )?wallet|girlfriend.?s? sick|\bsick\b|prepaid|eiffel|need you right now|passport|don'?t feel safe)\b/i;

/** Planning / compare asks must hit Vero LLM, not left-page regex. */
export function skipAllInstant(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (skipBookingInstant(t)) return true;
  if (t.length > 280) return true;
  return AGENTIC_PLAN_RE.test(t);
}

function inr(n, currency) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  const code = String(currency || "INR").toUpperCase();
  if (code === "INR" || !code) return `₹${Math.round(v).toLocaleString("en-IN")}`;
  return `${code} ${Math.round(v).toLocaleString("en-IN")}`;
}

function flightLine(p) {
  if (!p) return null;
  const stops =
    p.stops === 0 || p.stops === "0" ? "direct" : p.stops != null ? `${p.stops} stop` : "";
  const num = p.flight_number ? ` ${p.flight_number}` : "";
  const time = [p.dep_time, p.arr_time].filter(Boolean).join("→");
  const dur = p.duration ? `, ${p.duration}` : stops ? `, ${stops}` : "";
  return `**${p.airline || "Flight"}${num}**${time ? ` ${time}` : ""}${dur} · ${inr(p.price, p.currency)}`;
}

function hotelLine(p) {
  if (!p) return null;
  const stars = p.stars ? ` ${p.stars}★` : "";
  const area = p.area ? ` · ${p.area}` : "";
  return `**${p.name}**${stars}${area} · ${inr(p.price_per_night, p.currency)}/night`;
}

export function isOutOfPageQuestion(text) {
  const t = String(text || "");
  if (BOOKING_OPS_RE.test(t)) return false;
  return OUT_OF_PAGE_RE.test(t);
}

function firstFlightLeg(pageContext) {
  const legs = pageContext?.detail?.legs || [];
  const tripLeg = legs.find((l) => l?.type === "flight");
  if (tripLeg) return tripLeg;
  const b = pageContext?.booking;
  if (b?.airline || b?.flight_number) {
    return {
      type: "flight",
      airline: b.airline,
      airline_code: b.airline_code,
      flight_number: b.flight_number,
      origin: b.origin,
      destination: b.destination,
      origin_label: b.origin_label,
      destination_label: b.destination_label,
      pnr: b.pnr || b.booking_id,
      dep_terminal: b.dep_terminal,
      arr_terminal: b.arr_terminal,
      baggage_cabin: b.baggage_cabin,
      baggage_checked: b.baggage_checked,
      refundable: b.refundable,
      changeable: b.changeable,
    };
  }
  return null;
}

function answerBookingOps(text, pageContext) {
  const t = String(text || "").trim();
  if (skipBookingInstant(t)) return null;
  if (!BOOKING_OPS_RE.test(t)) return null;
  const screen = pageContext?.screen;
  if (screen !== "trips" && screen !== "passenger_info" && screen !== "booking_success") return null;
  const flight = firstFlightLeg(pageContext);
  if (!flight) return null;

  if (/\b(pnr|booking (id|ref|reference)|ticket (number|no))\b/i.test(t)) {
    const ref = flight.pnr || flight.booking_id;
    if (!ref) {
      return {
        reply: `I don’t have a PNR stored on this ${flight.airline || "flight"} booking yet - only invent nothing. Open the e-ticket on the left if payment already captured.`,
      };
    }
    return {
      reply: `Your **${[flight.airline, flight.flight_number].filter(Boolean).join(" ") || "flight"}** booking ref / PNR is **${ref}**. That’s the Itinero reference to show at check-in.`,
    };
  }

  if (/\b(terminal|gate)\b/i.test(t) && !/\bbaggage|bags?|luggage|allowance\b/i.test(t)) {
    return {
      reply: formatTerminalReply({
        airlineCode: flight.airline_code,
        airlineName: flight.airline,
        flightNo: flight.flight_number,
        origin: flight.origin,
        dest: flight.destination,
        originCity: String(flight.origin_label || "").replace(/\s*\([A-Z]{3}\)\s*$/, "") || "",
        destCity: String(flight.destination_label || "").replace(/\s*\([A-Z]{3}\)\s*$/, "") || "",
        depTerminal: flight.dep_terminal,
        arrTerminal: flight.arr_terminal,
      }),
    };
  }

  if (/\b(baggage|bags?|luggage|check[- ]?in bag|cabin bag|hand ?bag|allowance)\b/i.test(t)) {
    const facts = baggageFacts({
      airlineCode: flight.airline_code,
      airlineName: flight.airline,
      origin: flight.origin,
      dest: flight.destination,
      ticketCabin: flight.baggage_cabin,
      ticketChecked: flight.baggage_checked,
    });
    return {
      reply: formatBaggageReply(facts, {
        flightNo: flight.flight_number,
        origin: flight.origin,
        dest: flight.destination,
        originCity: String(flight.origin_label || "").replace(/\s*\([A-Z]{3}\)\s*$/, "") || "",
        destCity: String(flight.destination_label || "").replace(/\s*\([A-Z]{3}\)\s*$/, "") || "",
      }),
    };
  }

  if (
    /\b(cancel(?:l?able|ation)?|refund(?:able)?|changeable|non[- ]?refundable|non[- ]?changeable|can i cancel|can i change)\b/i.test(
      t
    )
  ) {
    const label =
      [flight.airline, flight.flight_number].filter(Boolean).join(" ") || "this flight";
    const route = [flight.origin, flight.destination].filter(Boolean).join(" → ");
    const refundable = flight.refundable;
    const changeable = flight.changeable;
    const tripId = pageContext?.detail?.id;
    const lines = [`**${label}**${route ? ` (${route})` : ""}:`];

    if (typeof refundable === "boolean") {
      lines.push(
        refundable
          ? "**Refund** - this fare is marked **refundable** on your snapshot (fees may still apply)."
          : "**Refund** - this fare is marked **non-refundable** on your snapshot (LiteAPI / Nuitee)."
      );
    } else {
      lines.push(
        "**Refund** - not stored on this trip snapshot. Many IndiGo LiteAPI fares show **non-refundable** in the Nuitee portal - confirm there or in the airline app."
      );
    }

    if (typeof changeable === "boolean") {
      lines.push(
        changeable
          ? "**Changes** - this fare is marked **changeable** (change fees may apply)."
          : "**Changes** - this fare is marked **non-changeable** on your snapshot."
      );
    } else {
      lines.push(
        "**Changes** - not stored here; Nuitee often shows **non-changeable** for this product."
      );
    }

    lines.push(
      "",
      "I **cannot cancel for you**. On this trip page tap **Cancel with supplier** if you want to try - then check Stripe / airline confirmation."
    );

    return {
      reply: lines.join("\n"),
      action: tripId ? { type: "open_trips", tripId } : undefined,
    };
  }

  return null;
}

export function isLeftPageListQuestion(text, pageContext) {
  const t = String(text || "").trim();
  if (!t || !pageContext) return false;
  if (pageContext.screen === "passenger_info") {
    return /\b(continue|proceed|finish|complete|booking|passenger|payment|pay)\b/i.test(t);
  }
  if (
    (pageContext.screen === "trips" || pageContext.screen === "booking_success") &&
    BOOKING_OPS_RE.test(t)
  ) {
    return true;
  }
  if (!pageContext.search) return false;
  if (pageContext.screen !== "flights" && pageContext.screen !== "hotels") return false;
  if (isOutOfPageQuestion(t) && !LIST_INTENT_RE.test(t)) return false;
  return LIST_INTENT_RE.test(t);
}

/**
 * @returns {{ reply: string, action?: object|null }|null}
 */
function answerExploreIntel(text, pageContext) {
  if (pageContext?.screen !== "explore_detail") return null;
  const intel = pageContext.explore?.intel;
  const detail = pageContext.explore?.detail || {};
  if (!intel) return null;
  const t = String(text || "");
  const city = detail.city || "this destination";
  const country = detail.country || "";
  const where = country ? `**${city}, ${country}**` : `**${city}**`;
  const disclaimer =
    intel.disclaimer ||
    "Planning snapshot only - confirm vaccines with a travel clinic and visas with the embassy.";

  if (
    /\b(vaccin|yellow\s*fever|malaria|hepatitis|typhoid|injection|immuni|shot|health|mosquito|dengue|tap\s*water|drink(?:ing)?\s*water|altitude|ams|rabies|cholera)\b/i.test(
      t
    )
  ) {
    const bits = [`${where} - health snapshot\n`];
    if (intel.yellow_fever) bits.push(`**Yellow fever:** ${intel.yellow_fever}`);
    if (intel.malaria) bits.push(`**Malaria:** ${intel.malaria}`);
    if (intel.recommended_vaccines?.length) {
      bits.push(`**Often recommended:** ${intel.recommended_vaccines.join(", ")}`);
    }
    if (intel.water) bits.push(`**Water:** ${intel.water}`);
    if (intel.altitude) bits.push(`**Altitude:** ${intel.altitude}`);
    if (intel.health_other?.length) bits.push(intel.health_other.slice(0, 3).join(" "));
    bits.push(`\n_${disclaimer}_`);
    return { reply: bits.filter(Boolean).join("\n\n") };
  }

  if (/\b(visa|e-?visa|e-?ta|\beta\b|passport|entry|immigration|voa)\b/i.test(t)) {
    return {
      reply: `${where} - **visa (${pageContext.explore?.passport_label || "your passport"}):** ${
        pageContext.explore?.visa_for_you ||
        intel.visa_indian ||
        intel.visa_general ||
        "Check the official immigration site."
      }\n\n${
        intel.visa_general ? `Other passports: ${intel.visa_general}\n\n` : ""
      }_${disclaimer}_`,
    };
  }

  if (/\b(best time|when to go|season|weather|month|rain|monsoon|migration)\b/i.test(t)) {
    return {
      reply: `${where} - **best time:** ${intel.best_time || "See seasons on the left."}${
        intel.avoid ? `\n\nMind: ${intel.avoid}` : ""
      }`,
    };
  }

  if (/\b(currency|money|atm|tip|plug|socket|adaptor|adapter|language|timezone|time zone|emergency)\b/i.test(t)) {
    const em = intel.emergency || {};
    const emLine = [em.all && `all ${em.all}`, em.police && `police ${em.police}`, em.ambulance && `ambulance ${em.ambulance}`]
      .filter(Boolean)
      .join(" · ");
    return {
      reply: [
        `${where} - practical`,
        intel.currency && `**Currency:** ${intel.currency}${intel.money_tip ? ` - ${intel.money_tip}` : ""}`,
        intel.language && `**Language:** ${intel.language}`,
        intel.timezone && `**Time:** ${intel.timezone}`,
        intel.plugs && `**Plugs:** ${intel.plugs}`,
        emLine && `**Emergency:** ${emLine}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  }

  if (/\b(safe|safety|crime|danger|scam)\b/i.test(t)) {
    const tips = (intel.safety_tips || []).slice(0, 4).map((x) => `• ${x}`).join("\n");
    return {
      reply: `${where} - **safety:** ${intel.safety || "normal tourist caution"}\n\n${tips}`,
    };
  }

  return null;
}

export function answerFromLeftPage(text, pageContext) {
  const t = String(text || "").trim();
  if (!t) return null;
  const live = instantLiveGuard(t);
  if (live) return { reply: live };
  if (skipAllInstant(t)) return null;
  if (!pageContext) return null;
  const bookingOps = answerBookingOps(t, pageContext);
  if (bookingOps) return bookingOps;
  const exploreIntel = answerExploreIntel(t, pageContext);
  if (exploreIntel) return exploreIntel;
  if (isOutOfPageQuestion(t) && !LIST_INTENT_RE.test(t)) return null;

  if (
    pageContext.screen === "passenger_info" &&
    /\b(continue|proceed|finish|complete|booking|passenger|payment|pay)\b/i.test(t)
  ) {
    const b = pageContext.booking || {};
    const label = [b.airline, b.flight_number].filter(Boolean).join(" ") || "this flight";
    const route = [b.origin, b.destination].filter(Boolean).join(" → ");
    return {
      reply: `You're on passenger details for **${label}**${
        route ? ` (${route})` : ""
      }. Fill the form on the left, then tap **Continue to Payment** - I won't switch routes.`,
    };
  }

  if (pageContext.screen === "flights" && pageContext.search?.origin) {
    const search = pageContext.search;
    const picks = pageContext.results_summary?.picks || {};
    const route = `${search.origin} → ${search.destination}`;
    const date = search.depart_date || "this date";
    const cheap = picks.cheapest;
    const fast = picks.fastest;
    const pricey = picks.expensive;

    if (/\b(cheap(est)?|lowest|least expensive|budget)\b/i.test(t)) {
      if (!cheap) return null;
      return {
        action: { type: "set_sort", sort: "cheapest" },
        reply: `Cheapest on **${route}** (${date}) is ${flightLine(cheap)}. I'd take that unless you want a morning slot or a specific airline.`,
      };
    }
    if (/\b(expensive|priciest|highest|most expensive)\b/i.test(t)) {
      if (!pricey) return null;
      return {
        action: { type: "set_sort", sort: "price_desc" },
        reply: `Most expensive on **${route}** (${date}) is ${flightLine(pricey)}. Sorted high→low on the left.`,
      };
    }
    if (/\b(fastest|shortest|quickest)\b/i.test(t)) {
      if (!fast) return null;
      return {
        action: { type: "set_sort", sort: "fastest" },
        reply: `Fastest on **${route}** (${date}) is ${flightLine(fast)}. Duration sort is on the left.`,
      };
    }
    if (/\b(non[- ]?stop|direct)\b/i.test(t)) {
      return {
        action: { type: "apply_nl_filter", query: t },
        reply: cheap
          ? `Filtering **${route}** for nonstop. Best value right now: ${flightLine(cheap)}.`
          : `Filtering **${route}** for nonstop on the left.`,
      };
    }
    const under = t.match(/\b(?:under|below|less than)\s*[₹$]?\s*([\d,]+)\b/i);
    if (under) {
      const cap = Number(String(under[1]).replace(/,/g, ""));
      const min = Number(pageContext.results_summary?.min_price);
      const ok = Number.isFinite(min) && Number.isFinite(cap) && min <= cap;
      return {
        action: { type: "apply_nl_filter", query: t },
        reply: ok
          ? `Yes - several on **${route}** under ${inr(cap, pageContext.results_summary?.currency)}. Cheapest is ${flightLine(cheap)}.`
          : `Nothing under ${inr(cap, pageContext.results_summary?.currency)} on **${route}**. Cheapest is ${flightLine(cheap)}.`,
      };
    }
    if (/\b(compare|top\s*3|best (value|deal|price))\b/i.test(t)) {
      const samples = pageContext.results_summary?.sample_offers || [];
      const lines = samples.slice(0, 3).map((s, i) => `${i + 1}. ${flightLine(s)}`);
      return {
        action: cheap ? { type: "set_sort", sort: "cheapest" } : null,
        reply:
          `On **${route}** (${date}):\n${lines.join("\n") || "list is on the left"}\n\n` +
          (cheap ? `I'd take ${flightLine(cheap)} for value.` : "Want me to filter nonstop or morning?"),
      };
    }
  }

  if (pageContext.screen === "hotels" && pageContext.search?.city) {
    const city = pageContext.search.city;
    const picks = pageContext.results_summary?.picks || {};
    const cheap = picks.cheapest;
    const rated = picks.top_rated;
    const pricey = picks.expensive;

    if (/\b(cheap(est)?|lowest|budget|least expensive)\b/i.test(t)) {
      if (!cheap) return null;
      return {
        action: { type: "set_sort", sort: "cheapest" },
        reply: `Cheapest stay in **${city}** is ${hotelLine(cheap)}. Sorted low→high on the left.`,
      };
    }
    if (/\b(expensive|priciest|highest|most expensive)\b/i.test(t)) {
      if (!pricey) return null;
      return {
        action: { type: "set_sort", sort: "price_desc" },
        reply: `Most expensive in **${city}** is ${hotelLine(pricey)}.`,
      };
    }
    if (/\b(best rated|top rated|highest rated|rating)\b/i.test(t)) {
      if (!rated) return null;
      return {
        action: { type: "set_sort", sort: "rating" },
        reply: `Best rated in **${city}** is ${hotelLine(rated)}.`,
      };
    }
  }

  return null;
}

/** Short prefix so the LLM cannot “forget” the left page. */
export function formatLeftPageBrief(pageContext) {
  if (!pageContext?.screen) return "";
  if (pageContext.screen === "flights" && pageContext.search?.origin) {
    const s = pageContext.search;
    const r = pageContext.results_summary || {};
    const p = r.picks || {};
    const bits = [
      `[LEFT PAGE] Flights ${s.origin}→${s.destination} on ${s.depart_date || "?"}`,
      `${r.count || 0} options`,
    ];
    if (p.cheapest) bits.push(`cheapest ${p.cheapest.airline} ${p.cheapest.dep_time || ""} ${p.cheapest.price}`);
    if (p.fastest) bits.push(`fastest ${p.fastest.airline} ${p.fastest.duration || ""}`);
    return `${bits.join(" | ")}. Do not re-ask origin/destination/date.`;
  }
  if (pageContext.screen === "hotels" && pageContext.search?.city) {
    const s = pageContext.search;
    const r = pageContext.results_summary || {};
    const p = r.picks || {};
    const bits = [
      `[LEFT PAGE] Hotels in ${s.city} ${s.check_in || "?"}→${s.check_out || "?"}`,
      `${r.count || 0} stays`,
    ];
    if (p.cheapest) bits.push(`cheapest ${p.cheapest.name} ${p.cheapest.price_per_night}`);
    return `${bits.join(" | ")}. Do not re-ask city/dates.`;
  }
  if (pageContext.screen === "trips" && pageContext.detail) {
    const d = pageContext.detail;
    const f = (d.legs || []).find((l) => l?.type === "flight");
    const bag = f
      ? ` Airline ${f.airline || ""} ${f.flight_number || ""} baggage_cabin=${f.baggage_cabin || "?"} baggage_checked=${f.baggage_checked || "?"}.`
      : "";
    return `[LEFT PAGE] Trip ${d.title} (${d.status}) ${d.origin || ""}→${d.destination || ""}.${bag} Vague follow-ups (baggage/PNR/terminal) mean THIS booking. Quote kg - do not send them to the airline website.`;
  }
  if (pageContext.screen === "package_detail" && pageContext.package) {
    return `[LEFT PAGE] Package instance ${pageContext.package.title}. Same trip - preview then apply. Do not restart.`;
  }
  if (pageContext.screen === "explore_detail" && pageContext.explore?.detail) {
    const d = pageContext.explore.detail;
    const i = pageContext.explore.intel || {};
    return (
      `[LEFT PAGE] Explore ${d.city} (${d.country || ""}) ${d.iata || ""}. ` +
      `Visa (Indian): ${i.visa_indian || "see page"}. ` +
      `Yellow fever: ${i.yellow_fever || "n/a"}. ` +
      `Malaria: ${i.malaria || "n/a"}. ` +
      `Best time: ${i.best_time || "n/a"}. ` +
      `Alerts: ${(i.alerts || []).join("; ") || "none"}. ` +
      "Answer health/visa/season from this intel. Do not invent prescriptions. Confirm clinic/embassy."
    );
  }
  return pageContext.screen ? `[LEFT PAGE] Screen: ${pageContext.screen}` : "";
}
