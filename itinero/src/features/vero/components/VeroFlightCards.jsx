import React, { useMemo, useState } from "react";
import { mapOfferToCard } from "@/features/flights/utils/mapOffer";
import { BookingPopup } from "@/features/booking/components";

const PREVIEW_COUNT = 3;
const TABS = [
  { id: "recommended", label: "Recommended" },
  { id: "cheapest", label: "Cheapest" },
  { id: "fastest", label: "Fastest" },
];

/**
 * In-chat flight results panel - compact OTA-style list matching Vero booking UX.
 * Select → confirm strip → BookingPopup (passenger → review → pay via LiteAPI/Stripe).
 */
export default function VeroFlightCards({
  flights,
  sessionId,
  adults,
  childrenCount,
  infants,
}) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState("recommended");
  const [stopFilter, setStopFilter] = useState("any"); // any | direct | 1
  const [airlineFilter, setAirlineFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [bookingFlight, setBookingFlight] = useState(null);

  const cards = useMemo(() => {
    if (!Array.isArray(flights) || !flights.length) return [];
    return flights
      .map((f, i) =>
        mapOfferToCard(f, { isBestValue: i === 0 && !!f.is_cheapest })
      )
      .filter((c) => {
        const name = String(c.airline?.name || "");
        if (/nuit[eéè]e|nuitee|sandbox/i.test(name)) return false;
        const o = String(c.departure?.airport || "").toUpperCase();
        const d = String(c.arrival?.airport || "").toUpperCase();
        if (!/^[A-Z]{3}$/.test(o) || !/^[A-Z]{3}$/.test(d) || o === d) return false;
        if (["NEW", "THE", "FOR", "AND", "FLY", "AIR"].includes(d)) return false;
        if (!c.price || c.price <= 0) return false;
        if (Number.isFinite(c.durationMins) && c.durationMins > 36 * 60) return false;
        return true;
      });
  }, [flights]);

  const airlines = useMemo(() => {
    const seen = new Map();
    cards.forEach((c) => {
      const name = c.airline?.name || "Airline";
      seen.set(name, (seen.get(name) || 0) + 1);
    });
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  }, [cards]);

  const filtered = useMemo(() => {
    let list = [...cards];
    if (stopFilter === "direct") list = list.filter((c) => c.stopsCount === 0);
    if (stopFilter === "1") list = list.filter((c) => c.stopsCount === 1);
    if (airlineFilter !== "all") {
      list = list.filter((c) => (c.airline?.name || "") === airlineFilter);
    }
    if (tab === "cheapest") {
      list.sort((a, b) => (a.price || 0) - (b.price || 0));
    } else if (tab === "fastest") {
      list.sort((a, b) => (a.durationMins || 99999) - (b.durationMins || 99999));
    } else {
      list.sort((a, b) => {
        const score = (c) =>
          (c.price || 0) / 1000 + (c.durationMins || 0) / 60 + (c.stopsCount || 0) * 2;
        return score(a) - score(b);
      });
    }
    return list;
  }, [cards, stopFilter, airlineFilter, tab]);

  if (!cards.length) return null;

  const visible = expanded ? filtered : filtered.slice(0, PREVIEW_COUNT);
  const hidden = Math.max(0, filtered.length - PREVIEW_COUNT);
  const sample = cards[0];
  const origin = sample?.departure?.airport || "";
  const destination = sample?.arrival?.airport || "";

  function selectFlight(flight) {
    setSelected(flight);
  }

  function openPassengerDetails() {
    if (!selected) return;
    setBookingFlight(selected);
  }

  return (
    <div className="vero-flights">
      <div className="vero-flights__panel">
        <div className="vero-flights__meta">
          <span>{filtered.length} Flights Found</span>
        </div>

        <div className="vero-flights__tabs" role="tablist" aria-label="Sort flights">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`vero-flights__tab${tab === t.id ? " is-active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="vero-flights__body">
          <aside className="vero-flights__filters" aria-label="Filters">
            <div className="vero-flights__filter-group">
              <strong>Stops</strong>
              <label>
                <input
                  type="radio"
                  name="vero-stops"
                  checked={stopFilter === "any"}
                  onChange={() => setStopFilter("any")}
                />
                Any
              </label>
              <label>
                <input
                  type="radio"
                  name="vero-stops"
                  checked={stopFilter === "direct"}
                  onChange={() => setStopFilter("direct")}
                />
                Direct
              </label>
              <label>
                <input
                  type="radio"
                  name="vero-stops"
                  checked={stopFilter === "1"}
                  onChange={() => setStopFilter("1")}
                />
                1 Stop
              </label>
            </div>
            {airlines.length > 0 && (
              <div className="vero-flights__filter-group">
                <strong>Airlines</strong>
                <label>
                  <input
                    type="radio"
                    name="vero-airline"
                    checked={airlineFilter === "all"}
                    onChange={() => setAirlineFilter("all")}
                  />
                  All
                </label>
                {airlines.slice(0, 6).map(([name, count]) => (
                  <label key={name} title={name}>
                    <input
                      type="radio"
                      name="vero-airline"
                      checked={airlineFilter === name}
                      onChange={() => setAirlineFilter(name)}
                    />
                    <span>{name}</span>
                    <em>{count}</em>
                  </label>
                ))}
              </div>
            )}
          </aside>

          <ul className="vero-flights__list">
            {visible.map((flight) => {
              const isSel =
                selected &&
                (selected.id === flight.id || selected.offer_id === flight.offer_id);
              return (
                <li
                  key={flight.id || flight.offer_id}
                  className={`vero-flight-card${isSel ? " is-selected" : ""}`}
                >
                  <div className="vero-flight-card__top">
                    <div className="vero-flight-card__airline">
                      {flight.airline?.logo ? (
                        <img
                          src={flight.airline.logo}
                          alt=""
                          className="vero-flight-card__logo"
                        />
                      ) : (
                        <span className="vero-flight-card__logo-fallback" aria-hidden>
                          {(flight.airline?.name || "FL").slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <div>
                        <strong>{flight.airline?.name || "Airline"}</strong>
                        <span>{flight.flightNumber || flight.airline?.code || ""}</span>
                      </div>
                    </div>
                    {flight.isBestValue && (
                      <span className="vero-flight-card__badge">Best value</span>
                    )}
                  </div>

                  <div className="vero-flight-card__row">
                    <div className="vero-flight-card__schedule">
                      <div>
                        <em>{flight.departure?.time || "--:--"}</em>
                        <span>{flight.departure?.airport || "-"}</span>
                      </div>
                      <div className="vero-flight-card__mid">
                        <span>{flight.duration || "-"}</span>
                        <div className="vero-flight-card__line" />
                        <span>{flight.stops || "Direct"}</span>
                      </div>
                      <div>
                        <em>{flight.arrival?.time || "--:--"}</em>
                        <span>{flight.arrival?.airport || "-"}</span>
                      </div>
                    </div>

                    <div className="vero-flight-card__aside">
                      <strong>
                        {flight.currency || "₹"}
                        {(flight.price || 0).toLocaleString("en-IN")}
                      </strong>
                      <button
                        type="button"
                        className="vero-flight-card__book"
                        onClick={() => selectFlight(flight)}
                      >
                        {isSel ? "Selected" : "Book Now"}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {hidden > 0 && (
          <button
            type="button"
            className="vero-flights__more"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Show less" : "View More"}
          </button>
        )}
      </div>

      {selected && !bookingFlight && (
        <div className="vero-flight-confirm">
          <div className="vero-flight-confirm__info">
            {selected.airline?.logo ? (
              <img src={selected.airline.logo} alt="" />
            ) : null}
            <div>
              <strong>
                {selected.airline?.name || "Flight"}
                {selected.flightNumber ? ` · ${selected.flightNumber}` : ""}
              </strong>
              <span>
                {selected.departure?.time} {selected.departure?.airport} →{" "}
                {selected.arrival?.time} {selected.arrival?.airport}
                {" · "}
                {selected.stops || "Direct"}
              </span>
            </div>
            <em>
              {selected.currency || "₹"}
              {(selected.price || 0).toLocaleString("en-IN")}
            </em>
          </div>
          <button
            type="button"
            className="vero-flight-confirm__cta"
            onClick={openPassengerDetails}
          >
            Continue to Passenger Details
          </button>
        </div>
      )}

      <BookingPopup
        isOpen={!!bookingFlight}
        onClose={() => {
          setBookingFlight(null);
          setSelected(null);
        }}
        flight={bookingFlight}
        sessionId={sessionId}
        adults={
          Number(
            bookingFlight?.adults ||
              bookingFlight?.raw?.adults ||
              sample?.adults ||
              sample?.raw?.adults ||
              adults
          ) || 1
        }
        childrenCount={
          Number(
            bookingFlight?.children ||
              bookingFlight?.raw?.children ||
              sample?.children ||
              sample?.raw?.children ||
              childrenCount
          ) || 0
        }
        infants={
          Number(
            bookingFlight?.infants ||
              bookingFlight?.raw?.infants ||
              sample?.infants ||
              sample?.raw?.infants ||
              infants
          ) || 0
        }
        origin={origin}
        destination={destination}
      />
    </div>
  );
}
