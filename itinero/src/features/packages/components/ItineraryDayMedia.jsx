import React, { useMemo } from "react";
import { PlacesCarousel } from "@/components/shared";
import { placesPhotoProxyUrl } from "@/hooks/usePlacesPhoto";
import { isPhotoWorthyPlace } from "./ItineraryPlaceRow";
import styles from "./ItineraryDayMedia.module.css";

/** Pull a few place-ish phrases from a day title / activities. */
function dayQueries(day) {
  const city = String(day?.stayCity || day?.destination || day?.origin || "").trim();
  const title = String(day?.title || "").trim();
  const out = [];

  // Prefer concrete landmarks teased by the title / narrative
  const blob = `${title} ${day?.description || day?.narrative || ""}`;
  const landmarkHints = [
    [/marina|merlion|helix/i, "Merlion Park Marina Bay"],
    [/garden|bayfront|supertree|cloud forest/i, "Gardens by the Bay"],
    [/sentosa|siloso/i, "Sentosa Island Siloso Beach"],
    [/chinatown|neighbour|little india|orchard/i, "Chinatown Singapore"],
    [/depart|changi|checkout/i, "Changi Airport Jewel"],
  ];
  landmarkHints.forEach(([re, q]) => {
    if (re.test(blob)) out.push(city ? `${q} ${city}` : q);
  });

  if (title && city && !out.length) {
    out.push(`${title} ${city}`);
  } else if (city && !out.length) {
    out.push(`${city} landmark tourist attraction`);
  }

  const acts = Array.isArray(day?.activities) ? day.activities : [];
  acts.forEach((a) => {
    if (isPhotoWorthyPlace(a) && !/\b(check[- ]?in|hotel settle|checkout)\b/i.test(a)) {
      out.push(city ? `${a} ${city}` : a);
    }
  });

  // Theme fallbacks so every day looks different even with thin copy
  const n = Number(day?.day) || 1;
  if (city) {
    const extras = [
      `${city} famous attraction`,
      `${city} scenic view`,
      `${city} street food`,
      `${city} night skyline`,
      `${city} park garden`,
    ];
    out.push(extras[(n - 1) % extras.length]);
    out.push(extras[n % extras.length]);
  }
  return out.filter(Boolean).slice(0, 6);
}

/**
 * Day hero media - unique multi-slide carousel per itinerary day.
 */
export default function ItineraryDayMedia({
  day,
  country = "",
  fallback = "",
}) {
  const city = String(day?.stayCity || day?.destination || day?.origin || "").trim();
  const queries = useMemo(() => dayQueries(day), [day]);
  const dayIndex = Math.max(0, (Number(day?.day) || 1) - 1);

  const slides = useMemo(() => {
    const seen = new Set();
    const list = [];
    const push = (url) => {
      if (!url || seen.has(url) || list.length >= 5) return;
      seen.add(url);
      list.push(url);
    };
    queries.forEach((q, i) => {
      push(
        placesPhotoProxyUrl({
          query: q,
          city,
          country,
          index: (dayIndex + i) % 4,
          maxPx: 900,
        })
      );
    });
    if (fallback) push(fallback);
    return list.slice(0, 3);
  }, [queries, city, country, dayIndex, fallback]);

  if (!slides.length && !fallback) return null;

  return (
    <div className={styles.wrap}>
      <PlacesCarousel
        slides={slides}
        fallback={fallback}
        alt={day?.title || city || "Day"}
        autoMs={3800 + dayIndex * 200}
        className={styles.carousel}
      />
      {(day?.destination || day?.stayCity) && (
        <span className={styles.placeTag}>
          {day.destination && day.stayCity && day.destination !== day.stayCity
            ? `${day.destination}`
            : day.stayCity || day.destination}
        </span>
      )}
    </div>
  );
}
