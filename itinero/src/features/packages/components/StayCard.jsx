import React, { useMemo } from "react";
import {
  Ban,
  CalendarDays,
  Check,
  Coffee,
  MapPin,
  Sparkles,
  Star,
} from "lucide-react";
import { PlacesCarousel } from "@/components/shared";
import { placesPhotoProxyUrl } from "@/hooks/usePlacesPhoto";
import styles from "./StayCard.module.css";

function uniqueUrls(list, max = 5) {
  const seen = new Set();
  const out = [];
  for (const u of list || []) {
    const s = String(u || "").trim();
    if (!s || seen.has(s) || out.length >= max) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function cityPlaceSlides(city, theme = "hotel") {
  const c = String(city || "").trim();
  if (!c) return [];
  const queries = [
    `${c} ${theme}`,
    `${c} lodge resort`,
    `${c} scenic view`,
    `${c} landmark`,
  ];
  return queries.map((q, i) =>
    placesPhotoProxyUrl({
      city: c,
      query: q,
      index: i % 3,
      maxPx: 900,
    })
  );
}

/**
 * One package stay segment - live hotel or unavailable city slot.
 */
export default function StayCard({
  seg,
  index = 0,
  total = 1,
  coverFallback = "",
  formatMoney,
  onChange,
}) {
  const h = seg?.hotel || null;
  const r = seg?.room || null;
  const city = seg?.city || h?.city || "Stay";
  const nights = Number(seg?.nights) || 0;
  const available = Boolean(r && h);
  const step = index + 1;

  const slides = useMemo(() => {
    const hotelImgs = uniqueUrls([...(h?.images || []), h?.image], 5);
    if (hotelImgs.length) return hotelImgs;
    const places = cityPlaceSlides(
      city,
      /mara|safari|serengeti|amboseli/i.test(city) ? "safari lodge" : "hotel"
    );
    return uniqueUrls([...places, coverFallback], 4);
  }, [h, city, coverFallback]);

  const stars = Number(h?.stars) || Number(h?.rating) || 0;

  return (
    <article
      className={`${styles.card} ${available ? "" : styles.cardWarn}`}
      data-stay-step={step}
    >
      <div className={styles.media}>
        <PlacesCarousel
          slides={slides}
          fallback={coverFallback}
          alt={h?.name || `${city} stay`}
          autoMs={3600 + index * 280}
          className={styles.carousel}
        />
        {total > 1 ? <span className={styles.step}>Stay {step}</span> : null}
        {!available ? <span className={styles.warnBadge}>Needs hotel</span> : null}
      </div>

      <div className={styles.body}>
        <div className={styles.top}>
          <span className={styles.cityPill}>
            <MapPin size={12} aria-hidden />
            {seg?.label || `${city}${nights ? ` · ${nights} night${nights === 1 ? "" : "s"}` : ""}`}
          </span>
          <button type="button" className={styles.changeBtn} onClick={() => onChange?.(seg)}>
            {available ? "Change" : "Pick hotel"}
          </button>
        </div>

        <h3>{h?.name || `Hotel in ${city}`}</h3>

        <p className={styles.dates}>
          <CalendarDays size={13} aria-hidden />
          <span>
            {seg?.checkInLabel || seg?.checkIn} → {seg?.checkOutLabel || seg?.checkOut}
          </span>
          {stars > 0 ? (
            <span className={styles.stars}>
              <Star size={12} aria-hidden /> {stars}★
            </span>
          ) : null}
        </p>

        {available ? (
          <>
            <p className={styles.room}>
              {r.title || "Room"}
              {r.board ? ` · ${r.board}` : ""}
            </p>
            <div className={styles.tags}>
              {r.freeCancellation ? (
                <span className={styles.tagGood}>
                  <Check size={12} /> Free cancellation
                </span>
              ) : (
                <span className={styles.tagMuted}>
                  <Ban size={12} /> Non-refundable
                </span>
              )}
              {r.freeBreakfast || /breakfast/i.test(String(r.board || "")) ? (
                <span className={styles.tagGood}>
                  <Coffee size={12} /> Breakfast
                </span>
              ) : null}
            </div>
            {seg?.stayTotal != null ? (
              <div className={styles.priceRow}>
                <p className={styles.price}>
                  {formatMoney?.(seg.stayTotal) || seg.stayTotal}
                </p>
                <span>
                  {nights} night{nights === 1 ? "" : "s"}
                  {seg?.currency ? ` · ${seg.currency}` : ""}
                </span>
              </div>
            ) : null}
          </>
        ) : (
          <div className={styles.empty}>
            <p>
              {seg?.message ||
                `No live rates for hotels near ${city} on these dates. Pick another hotel or shift nights.`}
            </p>
            <button type="button" className={styles.pickBtn} onClick={() => onChange?.(seg)}>
              <Sparkles size={14} aria-hidden /> Find a hotel in {city}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
