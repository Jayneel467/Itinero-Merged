import React from "react";
import "./DealCard.css";

/**
 * Single flight deal card showing discount, route, pricing, and CTA.
 */
export default function DealCard({
  discount,
  city,
  fromCode,
  toCode,
  destination,
  currentPrice,
  originalPrice,
  dates,
  arrowIcon,
}) {
  return (
    <div className="deal-card">
      <button className="deal-card__badge" onClick={() => alert("Pressed!")}>
        <span>{discount}</span>
      </button>
      <span className="deal-card__city">{city}</span>
      <div className="deal-card__route">
        <span className="deal-card__code">{fromCode}</span>
        <img src={arrowIcon} className="deal-card__arrow" alt="" />
        <span className="deal-card__code">{toCode}</span>
      </div>
      <span className="deal-card__destination">{destination}</span>
      <div className="deal-card__pricing">
        <span className="deal-card__current-price">{currentPrice}</span>
        <span className="deal-card__original-price">{originalPrice}</span>
      </div>
      <span className="deal-card__dates">{dates}</span>
      <button className="deal-card__cta" onClick={() => alert("Pressed!")}>
        <span>View Deal</span>
      </button>
    </div>
  );
}
