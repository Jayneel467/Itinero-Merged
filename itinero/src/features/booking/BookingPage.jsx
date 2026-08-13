import React from "react";
import { Link, useParams } from "react-router-dom";
import { PageLayout } from "@/components/layout";
import "./BookingPage.css";

/**
 * Booking hub - routes users into the flight or hotel booking flows.
 */
export default function BookingPage() {
  const { type, id } = useParams();

  const title =
    type === "flight"
      ? "Complete your flight booking"
      : type === "hotel"
        ? "Complete your hotel booking"
        : "Complete Your Booking";

  return (
    <PageLayout>
      <section className="booking-page">
        <h1>{title}</h1>
        <p className="booking-page__lead">
          {id
            ? `Continue booking for reference ${id}.`
            : "Choose what you want to book - we’ll guide you through the steps."}
        </p>

        <div className="booking-page__options">
          <Link className="booking-page__option" to="/flights">
            <strong>Book a flight</strong>
            <span>Search routes, pick seats, and pay securely.</span>
          </Link>
          <Link className="booking-page__option" to="/hotels">
            <strong>Book a stay</strong>
            <span>Browse hotels, rooms, guests, and checkout.</span>
          </Link>
          {type === "hotel" && id && (
            <Link className="booking-page__option" to={`/hotel/${id}`}>
              <strong>Resume hotel details</strong>
              <span>Open the hotel page and continue guest details.</span>
            </Link>
          )}
          {type === "flight" && (
            <Link className="booking-page__option" to="/flights/overview">
              <strong>Resume flight overview</strong>
              <span>Review fare details and passenger info.</span>
            </Link>
          )}
        </div>
      </section>
    </PageLayout>
  );
}
