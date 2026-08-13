import React, { useMemo, useState } from "react";
import { PlacesCarousel } from "@/components/shared";
import { placesPhotoProxyUrl } from "@/hooks/usePlacesPhoto";
import styles from "./ItineraryPlaceRow.module.css";

const SKIP_RE =
  /\b(arrival|check[- ]?in|check[- ]?out|transfer|unpack|on your own|at your pace|near the stay|airport|station|if included|late checkout)\b/i;

const PLACE_HINT_RE =
  /\b(restaurant|cafe|café|shack|temple|church|palace|fort|beach|market|bazaar|museum|park|lake|ghats?|spa|dinner|lunch|brunch|breakfast|visit|walk|drive|trek|viewpoint|waterfall|mosque|garden|old town|city palace|gardens|sentosa|chinatown|hawker|marina|orchard|food|crab|noodle)\b/i;

/**
 * Whether an itinerary activity / meal string is worth a Places photo.
 */
export function isPhotoWorthyPlace(label) {
  const t = String(label || "").trim();
  if (t.length < 3 || t.length > 140) return false;
  if (SKIP_RE.test(t) && !PLACE_HINT_RE.test(t)) return false;
  return PLACE_HINT_RE.test(t) || t.split(/\s+/).length <= 8;
}

function mealKindLabel(place) {
  const m = /\b(breakfast|brunch|lunch|dinner|snack|meal)\b/i.exec(place)?.[1];
  return m ? m.toLowerCase() : "food";
}

function buildQuery(label, city, kind) {
  const place = String(label || "").trim();
  const loc = String(city || "").trim();
  const mealWord = mealKindLabel(place);
  if (kind === "meal") {
    if (/on your own|if included|hotel breakfast/i.test(place) && loc) {
      return `${loc} ${mealWord} cafe restaurant`;
    }
    if (/hawker|food centre|lau pa sat|maxwell/i.test(place) && loc) {
      return `${place} ${loc}`;
    }
    return loc ? `${place} ${loc}` : `${place} restaurant`;
  }
  return loc ? `${place} ${loc}` : place;
}

function mealSlides(label, city, country, index) {
  const place = String(label || "").trim();
  const loc = String(city || "").trim();
  const mealWord = mealKindLabel(place);
  const seeds = [
    buildQuery(place, city, "meal"),
    loc ? `${loc} ${mealWord} food` : `${mealWord} restaurant plating`,
    loc ? `${loc} street food hawker` : `${mealWord} cafe interior`,
  ];
  const seen = new Set();
  const out = [];
  seeds.forEach((q, i) => {
    const url = placesPhotoProxyUrl({
      query: q,
      city,
      country,
      maxPx: 560,
      index: (index + i) % 4,
    });
    if (url && !seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  });
  return out;
}

function prettyMealTitle(label) {
  const t = String(label || "").trim();
  if (!t) return "";
  const kind = mealKindLabel(t);
  if (/^(breakfast|brunch|lunch|dinner|snack|meal)s?$/i.test(t)) {
    return kind.charAt(0).toUpperCase() + kind.slice(1);
  }
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * One itinerary stop / activity / meal with a live Places thumb.
 */
export default function ItineraryPlaceRow({
  label,
  city = "",
  country = "",
  kind = "activity",
  as = "li",
  index = 0,
}) {
  const text = String(label || "").trim();
  const [failed, setFailed] = useState(false);
  if (!text) return null;

  const mealish = kind === "meal";
  const showPhoto = (mealish || isPhotoWorthyPlace(text)) && !failed;
  const query = buildQuery(text, city, kind);
  const src = showPhoto
    ? placesPhotoProxyUrl({
        query,
        city,
        country,
        maxPx: mealish ? 480 : 400,
        index: index % 3,
      })
    : "";

  const slides = useMemo(
    () => (mealish ? mealSlides(text, city, country, index) : []),
    [mealish, text, city, country, index]
  );

  const Tag = as === "div" ? "div" : "li";
  const title = mealish ? prettyMealTitle(text) : text;
  const kicker = mealish ? mealKindLabel(text) : "";

  return (
    <Tag className={mealish ? styles.mealCard : styles.row}>
      {mealish && slides.length > 0 ? (
        <div className={styles.mealMedia}>
          <PlacesCarousel
            slides={slides}
            fallback={src}
            alt={title}
            autoMs={4200 + (index % 3) * 350}
            className={styles.mealCarousel}
          />
        </div>
      ) : showPhoto ? (
        <img
          className={mealish ? styles.mealThumb : styles.thumb}
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={styles.dot} aria-hidden />
      )}
      <span className={styles.label}>
        {mealish ? <em className={styles.mealKicker}>{kicker}</em> : null}
        {title}
        {mealish && city ? (
          <span className={styles.mealHint}>{city} · local picks</span>
        ) : null}
      </span>
    </Tag>
  );
}
