import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useCurrency } from "@/context/CurrencyContext";
import { isSaved, toggleSaved } from "@/features/account/savedService";
import styles from "./EventCard.module.css";

const FALLBACK =
  "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1400&q=80";

export default function EventCard({ event }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { formatFrom } = useCurrency();
  const savedId = event?.id ? `event:${event.id}` : "";
  const [saved, setSaved] = useState(() => isSaved(savedId));
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
    <div
      className={styles.card}
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
    >
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
        <button
          type="button"
          className={`${styles.saveBtn}${saved ? ` ${styles.saveBtnOn}` : ""}`}
          aria-label={saved ? "Remove from saved" : "Save event"}
          aria-pressed={saved}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const next = toggleSaved({
              id: savedId,
              type: "event",
              title: event.name || "Event",
              subtitle: event.city || event.venue || "Event",
              url: `/events/${encodeURIComponent(event.id)}`,
              image: event.image || "",
            });
            setSaved(Boolean(next));
          }}
        >
          <svg width="18" height="16" viewBox="0 0 20 18" aria-hidden>
            <path
              d="M10 18L8.55 16.68C3.4 12.02 0 8.94 0 5.12C0 2.24 2.24 0 5.12 0C6.75 0 8.32 0.77 9.28 2.02C9.48 2.28 9.73 2.28 9.93 2.02C10.89 0.77 12.46 0 14.09 0C16.97 0 19.21 2.24 19.21 5.12C19.21 8.94 15.81 12.02 10.66 16.69L10 18Z"
              fill={saved ? "#F97211" : "#242A31"}
              fillOpacity={saved ? 1 : 0.35}
            />
          </svg>
        </button>
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
    </div>
  );
}
