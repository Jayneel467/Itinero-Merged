import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PlacesCarousel } from "@/components/shared";
import { usePlacesGallery } from "@/hooks/usePlacesPhoto";
import { getStory } from "../data/editorial";
import { TRAVEL_WAYS } from "../data/catalog";
import styles from "./DestinationCard.module.css";

function wayLabel(id) {
  return TRAVEL_WAYS.find((w) => w.id === id)?.label || id;
}

export default function DestinationCard({
  dest,
  price = null,
  priceLoading = false,
  formatMoney,
  originHours = null,
  timely = "",
  alert = "",
  why = "",
}) {
  const navigate = useNavigate();
  const cities = useMemo(() => (dest?.city ? [dest.city] : []), [dest?.city]);
  const fallbacks = useMemo(() => [dest?.image].filter(Boolean), [dest?.image]);
  const slides = usePlacesGallery({
    cities,
    country: dest?.country || "",
    theme: (dest?.themes || [])[0] || "",
    fallbacks,
    maxSlides: 4,
    enabled: Boolean(dest?.city),
  });
  // Places first; catalog cover last as rescue (never lead with possibly-wrong stock).
  const mediaSlides = useMemo(() => {
    const cover = dest?.image || "";
    const rest = (slides || []).filter((u) => u && u !== cover);
    return (cover ? [...rest, cover] : rest).slice(0, 4);
  }, [slides, dest?.image]);

  if (!dest) return null;

  const story = getStory(dest);
  const tags = (dest.themes || []).slice(0, 3);
  const tagline = story?.tagline || dest.blurb;
  const best = story?.best;

  return (
    <article
      className={styles.card}
      role="link"
      tabIndex={0}
      onClick={() => navigate(`/explore/${dest.slug}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(`/explore/${dest.slug}`);
        }
      }}
    >
      <div className={styles.media}>
        <PlacesCarousel
          slides={mediaSlides}
          fallback={
            dest.image ||
            `https://picsum.photos/seed/${dest.iata || dest.id}/900/700`
          }
          alt={dest.city || ""}
          autoMs={3600}
        />
        {timely ? <span className={styles.timely}>{timely}</span> : null}
      </div>
      <div className={styles.body}>
        <p className={styles.kicker}>{dest.country}</p>
        <h3>{dest.city}</h3>
        <p className={styles.tagline}>{tagline}</p>
        <p className={styles.tags}>
          {tags.map((t) => (
            <em key={t}>{wayLabel(t)}</em>
          ))}
        </p>
        {why ? <p className={styles.why}>{why}</p> : null}
        <p className={styles.meta}>
          {originHours != null ? (
            <span>
              ~{originHours < 2 ? originHours.toFixed(1) : Math.round(originHours)}h away
            </span>
          ) : null}
          {best ? <span>Best: {best}</span> : null}
          {alert ? <span className={styles.alert}>{alert}</span> : null}
        </p>
        <p className={styles.fare}>
          {priceLoading
            ? "Checking fares…"
            : typeof price === "number"
              ? `Return flights from ${formatMoney(Math.round(price))} / person · snapshot`
              : "Explore destination →"}
        </p>
      </div>
    </article>
  );
}
