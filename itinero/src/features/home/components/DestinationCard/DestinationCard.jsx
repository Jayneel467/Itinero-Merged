import React from "react";
import "./DestinationCard.css";

/**
 * Single trending destination card with image, city, prices, and action.
 */
export default function DestinationCard({
  city,
  country,
  image,
  arrowIcon,
  flightFrom,
  hotelFrom,
}) {
  return (
    <div className="destination-card">
      <img src={image} className="destination-card__image" alt={city} />
      <div className="destination-card__info">
        <span className="destination-card__city">{city}</span>
        <span className="destination-card__country">{country}</span>
      </div>
      <div className="destination-card__pricing">
        <div className="destination-card__price-group">
          <span className="destination-card__price-label">Flight From</span>
          <span className="destination-card__price-value">{flightFrom}</span>
        </div>
        <div className="destination-card__divider"></div>
        <div className="destination-card__price-group">
          <span className="destination-card__price-label">Hotel From</span>
          <span className="destination-card__price-value">{hotelFrom}</span>
        </div>
        <div className="destination-card__action-btn">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </div>
      </div>
    </div>
  );
}
