import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageLayout } from "@/components/layout";
import { LoadingState } from "@/components/shared";
import { tripService } from "@/features/trips/tripService";
import { useCurrency } from "@/context/CurrencyContext";
import { eventService } from "./services/eventService";
import styles from "./EventDetailPage.module.css";

const FALLBACK =
  "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=2000&q=80";

export default function EventDetailPage() {
  const { id } = useParams();
  const { formatFrom } = useCurrency();
  const [event, setEvent] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    eventService.get(id).then((res) => {
      if (cancelled) return;
      setEvent(res?.event || null);
      setMessage(res?.message || "");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const getTickets = () => {
    if (!event?.url) return;
    tripService.recordEventIntent(event);
    window.open(event.url, "_blank", "noopener,noreferrer");
  };

  return (
    <PageLayout>
      <div className={styles.page}>
        <Link to="/events" className={styles.back}>
          ← All events
        </Link>
        {loading ? (
          <LoadingState title="Loading event" message="Pulling live event details." />
        ) : !event ? (
          <p className={styles.empty}>{message || "Event not found."}</p>
        ) : (
          <article className={styles.layout}>
            <div className={styles.media}>
              <img
                src={event.image || FALLBACK}
                alt=""
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = FALLBACK;
                }}
              />
            </div>
            <div className={styles.body}>
              <p className={styles.kicker}>{event.classification || "Event"}</p>
              <h1 className={styles.title}>{event.name}</h1>
              <p className={styles.meta}>
                {event.when || "Date TBA"}
                {event.venue ? ` · ${event.venue}` : ""}
                {event.city ? ` · ${event.city}` : ""}
              </p>
              {event.address ? <p className={styles.address}>{event.address}</p> : null}
              <p className={styles.price}>
                {event.priceMin != null && event.currency
                  ? event.priceMax != null && event.priceMax !== event.priceMin
                    ? `${formatFrom(event.priceMin, event.currency)}-${formatFrom(event.priceMax, event.currency)}`
                    : formatFrom(event.priceMin, event.currency)
                  : event.price || "Price on ticketing site"}
              </p>
              {event.currency && event.currency !== "INR" ? (
                <p className={styles.note}>Listed in {event.currency}; shown in your display currency at mid-market.</p>
              ) : null}
              {event.info ? <p className={styles.info}>{event.info}</p> : null}
              <p className={styles.note}>
                Tickets are sold on the official ticketing site. Itinero opens their checkout - we don’t invent
                seats or charge your card here.
              </p>
              <div className={styles.actions}>
                <button type="button" className={styles.cta} onClick={getTickets} disabled={!event.url}>
                  Get tickets
                </button>
                <Link to="/events" className={styles.secondary}>
                  Back to search
                </Link>
              </div>
            </div>
          </article>
        )}
      </div>
    </PageLayout>
  );
}
