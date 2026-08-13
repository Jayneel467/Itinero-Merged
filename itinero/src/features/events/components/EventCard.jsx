import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useCurrency } from "@/context/CurrencyContext";
import styles from "./EventCard.module.css";

const FALLBACK =
  "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1400&q=80";

export default function EventCard({ event }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { formatFrom } = useCurrency();
  if (!event?.id) return null;

  const priceLabel =
    event.priceMin != null && event.currency
      ? event.priceMax != null && event.priceMax !== event.priceMin
        ? `${formatFrom(event.priceMin, event.currency)}-${formatFrom(event.priceMax, event.currency)}`
        : formatFrom(event.priceMin, event.currency)
      : event.price || "See tickets";

  const open = () => {
    const qs = searchParams.toString();
    navigate(`/events/${encodeURIComponent(event.id)}${qs ? `?${qs}` : ""}`);
  };

  return (
    <button type="button" className={styles.card} onClick={open}>
      <div className={styles.media}>
        <img
          src={event.image || FALLBACK}
          alt=""
          className={styles.image}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = FALLBACK;
          }}
        />
        <div className={styles.mediaShade} aria-hidden />
        {event.classification ? (
          <span className={styles.badge}>{event.classification}</span>
        ) : null}
        {event.city ? <span className={styles.region}>{event.city}</span> : null}
        <div className={styles.mediaMeta}>
          <p className={styles.when}>{event.when || event.localDate || "Date TBA"}</p>
          <p className={styles.venue}>{event.venue || ""}</p>
        </div>
      </div>
      <div className={styles.body}>
        <h3 className={styles.title}>{event.name}</h3>
        <p className={styles.overview}>{event.address || event.city}</p>
      </div>
      <div className={styles.priceBar}>
        <div className={styles.priceCopy}>
          <span className={styles.priceKicker}>Tickets from</span>
          <span className={styles.price}>{priceLabel}</span>
        </div>
        <span className={styles.cta}>Get tickets</span>
      </div>
    </button>
  );
}
