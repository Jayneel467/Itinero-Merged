import React from "react";
import "./FeatureCard.css";

/**
 * Single "Why Choose Itinero" feature card.
 */
export default function FeatureCard({ title, description, image }) {
  return (
    <div className="feature-card">
      <span className="feature-card__title">{title}</span>
      <span className="feature-card__description">{description}</span>
      <div className="feature-card__image-wrapper">
        <img src={image} className="feature-card__image" alt={title} />
      </div>
    </div>
  );
}
