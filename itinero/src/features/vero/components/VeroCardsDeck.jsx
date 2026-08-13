import React from "react";
import { Plane, Building2 } from "lucide-react";
import "./VeroCardsDeck.css";

function money(currency, price) {
  const n = typeof price === "number" ? price : Number(price) || 0;
  const sym = currency === "INR" || !currency ? "₹" : `${currency} `;
  return `${sym}${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function shortAddr(addr) {
  const s = String(addr || "").trim();
  if (s.length <= 72) return s;
  return `${s.slice(0, 69).trim()}…`;
}

/**
 * Selectable LiteAPI cards in Vero chat.
 * Select sends option index + id so both quick-search and itinerary flows can match.
 */
export default function VeroCardsDeck({ cards, onSelect }) {
  if (!cards || !Array.isArray(cards.items) || !cards.items.length) return null;

  if (cards.type === "hotels") {
    return (
      <div className="vero-cards">
        <div className="vero-cards__header">
          <Building2 size={15} color="#f97211" />
          <div>
            <div className="vero-cards__title">{cards.title || "Hotels"}</div>
            {cards.subtitle && (
              <div className="vero-cards__subtitle">{cards.subtitle}</div>
            )}
          </div>
        </div>
        <div className="vero-cards__deck vero-cards__deck--stack">
          {cards.items.map((item, idx) => {
            const opt = item.index || idx + 1;
            const img = item.image || (item.images && item.images[0]);
            return (
              <article key={item.hotel_id || idx} className="vero-hotel-card vero-hotel-card--rich">
                <div className="vero-hotel-card__media">
                  {img ? (
                    <img src={img} alt="" className="vero-hotel-card__img" loading="lazy" />
                  ) : (
                    <div className="vero-hotel-card__img-fallback" aria-hidden>
                      {(item.name || "H").slice(0, 1)}
                    </div>
                  )}
                  <span className="vero-hotel-card__opt">Option {opt}</span>
                </div>
                <div className="vero-hotel-card__body">
                  <div className="vero-hotel-card__top">
                    {item.rating ? (
                      <span className="vero-hotel-card__rating">★ {item.rating}</span>
                    ) : (
                      <span className="vero-chip">Hotel</span>
                    )}
                    {item.refundable && (
                      <span className="vero-chip vero-chip--green">Free cancel</span>
                    )}
                  </div>
                  <h4 className="vero-hotel-card__name">{item.name}</h4>
                  {item.address && (
                    <p className="vero-hotel-card__addr">{shortAddr(item.address)}</p>
                  )}
                  {(item.room_name || item.board) && (
                    <p className="vero-hotel-card__room">
                      {[item.room_name, item.board].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <div className="vero-hotel-card__bottom">
                    <div className="vero-hotel-card__price">
                      {money(item.currency, item.price)}
                      <span>/night</span>
                    </div>
                    <button
                      type="button"
                      className="vero-hotel-card__btn"
                      onClick={() =>
                        onSelect?.(
                          `I'll take option ${opt} - ${item.name} (hotel_id=${item.hotel_id})`
                        )
                      }
                    >
                      Select
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    );
  }

  if (cards.type === "flights") {
    return (
      <div className="vero-cards">
        <div className="vero-cards__header">
          <Plane size={15} color="#f97211" />
          <div>
            <div className="vero-cards__title">{cards.title || "Flights"}</div>
            {cards.subtitle && (
              <div className="vero-cards__subtitle">{cards.subtitle}</div>
            )}
          </div>
        </div>
        <div className="vero-cards__deck vero-cards__deck--stack">
          {cards.items.map((item, idx) => {
            const opt = item.index || idx + 1;
            return (
              <article key={item.flight_id || idx} className="vero-flight-card">
                <div className="vero-flight-card__top">
                  <div>
                    <span className="vero-hotel-card__opt" style={{ position: "static", marginRight: 8 }}>
                      Option {opt}
                    </span>
                    <div className="vero-flight-card__airline">
                      {item.airline || "Airline"}
                    </div>
                    <div className="vero-flight-card__code">{item.flight_code}</div>
                  </div>
                  {item.refundable && (
                    <span className="vero-chip vero-chip--green">Refundable</span>
                  )}
                </div>
                <div className="vero-flight-card__route">
                  <div>
                    <div className="vero-flight-card__time">{item.dep_time}</div>
                    <div className="vero-flight-card__iata">{item.origin}</div>
                  </div>
                  <div className="vero-flight-card__mid">
                    <span>{item.duration}</span>
                    <div className="vero-flight-card__line" />
                    <span>{item.stops === 0 ? "Nonstop" : `${item.stops} stop`}</span>
                  </div>
                  <div>
                    <div className="vero-flight-card__time">{item.arr_time}</div>
                    <div className="vero-flight-card__iata">{item.dest}</div>
                  </div>
                </div>
                <div className="vero-hotel-card__bottom">
                  <div className="vero-hotel-card__price">
                    {money(item.currency, item.price)}
                    <span>/person</span>
                  </div>
                  <button
                    type="button"
                    className="vero-hotel-card__btn"
                    onClick={() =>
                      onSelect?.(
                        `I'll take option ${opt} - ${item.airline} ${item.flight_code} (flight_id=${item.flight_id})`
                      )
                    }
                  >
                    Select
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}
