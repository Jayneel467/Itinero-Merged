import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext";
import { isSaved, onSavedChange, toggleSaved } from "@/features/account/savedService";
import styles from "../HotelsPage.module.css";

function amenityFamily(label) {
  const s = String(label || "").toLowerCase();
  if (/wifi|wi-?fi|wireless/.test(s)) return "wifi";
  if (/parking|valet/.test(s)) return "parking";
  if (/pool|swim/.test(s)) return "pool";
  if (/breakfast|board/.test(s)) return "breakfast";
  if (/fitness|gym/.test(s)) return "fitness";
  if (/spa|sauna/.test(s)) return "spa";
  if (/cancel/.test(s)) return "cancel";
  return s;
}

function amenityScore(label) {
  const s = String(label || "").toLowerCase();
  if (/^free\b/.test(s)) return 3;
  if (/included/.test(s)) return 2;
  if (/available/.test(s)) return 0;
  return 1;
}

function pickAmenities(hotel) {
  const raw = [
    ...(Array.isArray(hotel.amenities) ? hotel.amenities : []),
    ...(Array.isArray(hotel.tags) ? hotel.tags : []),
    hotel.board || hotel.boardBasis || "",
  ]
    .map((x) => String(x || "").trim())
    .filter(Boolean);

  const best = new Map();
  for (const item of raw) {
    if (/^\d+(\.\d+)?\s*★/.test(item) || /^\d+\s*star/i.test(item)) continue;
    const family = amenityFamily(item);
    const prev = best.get(family);
    if (!prev || amenityScore(item) > amenityScore(prev)) best.set(family, item);
  }

  return [...best.values()].slice(0, 5);
}

function hasFreeCancel(hotel) {
  if (hotel.freeCancellation === true) return true;
  const blob = [...(hotel.tags || []), ...(hotel.amenities || [])]
    .map((t) => String(t).toLowerCase())
    .join(" ");
  return blob.includes("cancel");
}

function ratingLabel(rating) {
  if (rating >= 9) return "Excellent";
  if (rating >= 8) return "Very Good";
  if (rating >= 7) return "Good";
  return "Okay";
}

export const HotelCard = ({ hotel, searchQuery, rank }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [saved, setSaved] = useState(() => isSaved(`hotel:${hotel.id}`));
  const navigate = useNavigate();
  const { formatMoney } = useCurrency();

  useEffect(() => {
    const sync = () => setSaved(isSaved(`hotel:${hotel.id}`));
    sync();
    return onSavedChange(sync);
  }, [hotel.id]);

  const nightPrice = Number(hotel.pricePerNight);
  const totalPrice = Number(hotel.totalPrice);
  const hasPrice =
    hotel.has_price !== false && Number.isFinite(nightPrice) && nightPrice > 0;
  const amenities = useMemo(() => pickAmenities(hotel), [hotel]);
  const freeCancel = hasFreeCancel(hotel);
  const stars = Number(hotel.stars) || 0;
  const rating = Number(hotel.rating) || 0;
  const reviews = Number(hotel.reviewCount) || 0;
  const placeRaw =
    hotel.area || hotel.location || hotel.city || hotel.address || "";
  const place = String(placeRaw)
    .replace(/\s*[·•]\s*\d+(\.\d+)?\s*★.*/u, "")
    .replace(/\s*\d+(\.\d+)?\s*★.*/u, "")
    .trim();

  const images = useMemo(() => {
    const list = [];
    for (const u of [...(Array.isArray(hotel.images) ? hotel.images : []), hotel.image]) {
      const s = String(u || "").trim();
      if (!s || s === "null" || s === "undefined") continue;
      const url = s.startsWith("//") ? `https:${s}` : s;
      if (!list.includes(url)) list.push(url);
    }
    return list;
  }, [hotel.images, hotel.image]);

  if (!hasPrice) return null;

  const moneyOpts = { maximumFractionDigits: 0 };
  const isTopPick = rank != null && rank < 3;

  const nextImage = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const prevImage = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const openRooms = () => {
    const qs = new URLSearchParams();
    if (searchQuery?.checkIn) qs.set("checkIn", searchQuery.checkIn);
    if (searchQuery?.checkOut) qs.set("checkOut", searchQuery.checkOut);
    if (searchQuery?.adults) qs.set("adults", String(searchQuery.adults));
    if (searchQuery?.children != null) qs.set("children", String(searchQuery.children));
    if (searchQuery?.guests) qs.set("guests", String(searchQuery.guests));
    if (searchQuery?.rooms) qs.set("rooms", String(searchQuery.rooms));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    navigate(`/hotel/${hotel.id}/booking${suffix}`, {
      state: {
        hotel,
        checkIn: searchQuery?.checkIn,
        checkOut: searchQuery?.checkOut,
        adults: searchQuery?.adults,
        children: searchQuery?.children,
        guests: searchQuery?.guests,
        rooms: searchQuery?.rooms,
      },
    });
  };

  return (
    <article className={styles.hotelCard} onClick={openRooms}>
      {/* Image Section */}
      <div className={styles.hotelImageWrapper}>
        {isTopPick && (
          <div className={styles.topPickBadge}>🏆 Top Pick</div>
        )}
        <div className={styles.carouselViewport}>
          <div
            className={styles.carouselTrack}
            style={{ transform: `translateX(-${currentImageIndex * 100}%)` }}
          >
            {images.length ? (
              images.map((img, idx) => (
                <img
                  key={`${img}-${idx}`}
                  src={img}
                  alt=""
                  className={styles.hotelImage}
                  loading={idx === 0 ? "eager" : "lazy"}
                  referrerPolicy="no-referrer"
                />
              ))
            ) : (
              <div className={styles.hotelImageMissing}>No photo yet</div>
            )}
          </div>
        </div>

        {images.length > 1 ? (
          <>
            <button
              type="button"
              className={`${styles.carouselBtn} ${styles.carouselBtnPrev}`}
              onClick={prevImage}
              aria-label="Previous image"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className={`${styles.carouselBtn} ${styles.carouselBtnNext}`}
              onClick={nextImage}
              aria-label="Next image"
            >
              <ChevronRight size={16} />
            </button>
          </>
        ) : null}

        <button
          type="button"
          className={`${styles.favoriteBtn}${saved ? ` ${styles.favoriteBtnOn}` : ""}`}
          aria-label={saved ? "Remove from saved" : "Save hotel"}
          aria-pressed={saved}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const next = toggleSaved({
              id: `hotel:${hotel.id}`,
              type: "hotel",
              title: hotel.name,
              subtitle: place || hotel.city || "Stay",
              url: `/hotel/${hotel.id}/booking`,
              image: images[0] || "",
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

        {images.length ? (
          <div className={styles.imageBadgeBottomLeft}>
            {currentImageIndex + 1}/{images.length}
          </div>
        ) : null}
      </div>

      {/* Details Section */}
      <div className={styles.hotelDetails}>
        <div className={styles.hotelDetailsLeft}>
          <h3 className={styles.hotelName}>{hotel.name}</h3>

          <div className={styles.hotelLocationRow}>
            <MapPin size={13} aria-hidden />
            <span className={styles.hotelLocation}>
              {[
                place,
                stars ? `${stars}★` : null,
                hotel.distance && !/★/.test(String(hotel.distance))
                  ? `· ${hotel.distance} from center`
                  : null,
              ]
                .filter(Boolean)
                .join(" ")}
            </span>
          </div>

          {rating > 0 ? (
            <div className={styles.hotelRatingRow}>
              <div className={styles.ratingBadge}>{rating.toFixed(1)}</div>
              <span className={styles.ratingText}>
                {hotel.ratingText || ratingLabel(rating)}
              </span>
              {reviews > 0 ? (
                <span className={styles.reviewCount}>
                  {reviews.toLocaleString()} reviews
                </span>
              ) : null}
            </div>
          ) : null}

          {/* Freebies Row */}
          <div className={styles.hotelFreebiesRow}>
            {freeCancel && (
              <span className={styles.freebieBadge}>✓ Free cancellation</span>
            )}
            {hotel.payAtHotel && (
              <span className={styles.freebieBadge}>✓ Pay at hotel</span>
            )}
          </div>

          {/* Amenities Row */}
          {amenities.length ? (
            <div className={styles.hotelAmenitiesRow}>
              {amenities.map((a) => (
                <span key={a} className={styles.amenityItem}>
                  {a}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* Price + CTA */}
        <div className={styles.hotelDetailsRight}>
          <div className={styles.priceLabel}>Per night</div>
          <div className={styles.pricePerNight}>{formatMoney(nightPrice, moneyOpts)}</div>
          <div className={styles.totalPrice}>
            {Number.isFinite(totalPrice) && totalPrice > 0
              ? `${formatMoney(totalPrice, moneyOpts)} total`
              : null}
            <span className={styles.taxesText}>incl. taxes & fees</span>
          </div>
          <button className={styles.bookNowBtn} type="button">
            Book Now
          </button>
          <button
            className={styles.seeMoreOptionsBtn}
            type="button"
            onClick={(e) => { e.stopPropagation(); openRooms(); }}
          >
            See more options
          </button>
        </div>
      </div>
    </article>
  );
};
