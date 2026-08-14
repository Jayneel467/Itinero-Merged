import React from "react";
import { useNavigate } from "react-router-dom";
import "./DealCard.css";

/**
 * Legacy deal card. Prefer DealsPage live fares. Navigates to search — never alerts.
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
  const navigate = useNavigate();
  const open = () => {
    if (fromCode && toCode) {
      navigate(`/flights?from=${encodeURIComponent(fromCode)}&to=${encodeURIComponent(toCode)}`);
      return;
    }
    navigate("/flights");
  };
  return (
    <div className="deal-card">
      <button type="button" className="deal-card__badge" onClick={open}>
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
      <button type="button" className="deal-card__cta" onClick={open}>
        <span>Search fares</span>
      </button>
    </div>
  );
}
