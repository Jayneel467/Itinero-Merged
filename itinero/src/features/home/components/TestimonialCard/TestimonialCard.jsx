import React from "react";
import "./TestimonialCard.css";

/**
 * Single testimonial/review card.
 */
export default function TestimonialCard({
  name,
  location,
  rating,
  review,
  avatar,
  starIcon,
  quoteIcon,
}) {
  return (
    <div className="testimonial-card">
      <div className="testimonial-card__header">
        <img src={avatar} className="testimonial-card__avatar" alt={name} />
        <div className="testimonial-card__info">
          <span className="testimonial-card__name">{name}</span>
          <span className="testimonial-card__location">{location}</span>
        </div>
        <div className="testimonial-card__spacer" />
        <img src={starIcon} className="testimonial-card__star" alt="Rating" />
        <span className="testimonial-card__rating">{rating}</span>
      </div>
      <div className="testimonial-card__body">
        <span className="testimonial-card__review">{review}</span>
        <img src={quoteIcon} className="testimonial-card__quote" alt="" />
      </div>
    </div>
  );
}
