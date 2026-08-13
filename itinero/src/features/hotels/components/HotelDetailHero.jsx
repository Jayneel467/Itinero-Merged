import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { MapPin, Wifi, Waves, Coffee, X, ChevronLeft, ChevronRight } from "lucide-react";
import styles from "../HotelDetailPage.module.css";

/**
 * Property gallery - live LiteAPI hotelImages only (same source as Nuitee).
 */
export default function HotelDetailHero({ hotel }) {
  const [selectedIndex, setSelectedIndex] = useState(null);

  const images = useMemo(() => {
    const live = Array.isArray(hotel?.images)
      ? hotel.images.map((u) => String(u || "").trim()).filter(Boolean)
      : [];
    if (hotel?.image) {
      const main = String(hotel.image).trim();
      if (main && !live.includes(main)) live.unshift(main);
    }
    return live.map((u) => (u.startsWith("//") ? `https:${u}` : u));
  }, [hotel]);

  const name = hotel?.name || "Hotel";
  const location = hotel?.location || hotel?.city || "";
  const stars = Math.min(5, Math.max(0, Number(hotel?.stars) || 0));
  const rating = hotel?.rating;
  const ratingText = hotel?.ratingText || "";
  const reviewCount = hotel?.reviewCount || 0;
  const extraCount = Math.max(0, images.length - 5);

  const closeLightbox = () => setSelectedIndex(null);
  const nextImage = (e) => {
    e.stopPropagation();
    setSelectedIndex((prev) => (prev + 1) % images.length);
  };
  const prevImage = (e) => {
    e.stopPropagation();
    setSelectedIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const thumbs = images.length
    ? Array.from({ length: Math.min(5, images.length) }, (_, i) => images[i])
    : [];

  return (
    <div className={styles.HotelDetailHero_heroContainer}>
      <div className={styles.HotelDetailHero_headerInfo}>
        <h1 className={styles.HotelDetailHero_hotelName}>{name}</h1>

        <div className={styles.HotelDetailHero_ratingRow}>
          <div className={styles.HotelDetailHero_stars}>
            {Array(stars || 5)
              .fill(0)
              .map((_, i) => (
                <span key={i} className={styles.star}>
                  ★
                </span>
              ))}
          </div>
          {rating != null && rating > 0 && (
            <div className={styles.HotelDetailHero_ratingBadge}>{rating}</div>
          )}
          {ratingText && (
            <span className={styles.HotelDetailHero_ratingText}>{ratingText}</span>
          )}
          {reviewCount > 0 && (
            <span className={styles.HotelDetailHero_reviewsText}>
              ({reviewCount} reviews)
            </span>
          )}
        </div>

        {location && (
          <div className={styles.HotelDetailHero_locationRow}>
            <MapPin size={16} className={styles.HotelDetailHero_icon} />
            <span>{location}</span>
          </div>
        )}

        <div className={styles.HotelDetailHero_quickAmenities}>
          <div className={styles.HotelDetailHero_amenityItem}>
            <Wifi size={14} />
            <span>Free Wi-Fi</span>
          </div>
          <div className={styles.HotelDetailHero_amenityItem}>
            <Waves size={14} />
            <span>Swimming Pool</span>
          </div>
          <div className={styles.HotelDetailHero_amenityItem}>
            <Coffee size={14} />
            <span>Free Breakfast</span>
          </div>
        </div>
      </div>

      <div className={styles.HotelDetailHero_gallery}>
        {thumbs.length === 0 ? (
          <div className={styles.HotelDetailHero_galleryImageWrapper}>
            <div
              style={{
                width: "100%",
                height: "100%",
                minHeight: 180,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#EEF2F6",
                color: "#667085",
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              No photos for this property yet
            </div>
          </div>
        ) : (
          thumbs.map((src, idx) => {
          const isLast = idx === thumbs.length - 1 && images.length > thumbs.length;
          return (
            <div
              key={`${src}-${idx}`}
              className={`${styles.HotelDetailHero_galleryImageWrapper} ${
                isLast && extraCount > 0 ? styles.HotelDetailHero_viewMoreOverlay : ""
              }`}
              onClick={() => setSelectedIndex(idx)}
              style={{ cursor: "pointer" }}
            >
              <img
                src={src}
                alt={`${name} photo ${idx + 1}`}
                className={styles.HotelDetailHero_galleryImage}
                referrerPolicy="no-referrer"
              />
              {isLast && extraCount > 0 && (
                <div className={styles.HotelDetailHero_viewMoreContent}>
                  <span className={styles.HotelDetailHero_viewMoreNumber}>
                    +{extraCount}
                  </span>
                  <span className={styles.HotelDetailHero_viewMoreText}>
                    View all photos
                  </span>
                </div>
              )}
            </div>
          );
          })
        )}
      </div>

      {selectedIndex !== null &&
        createPortal(
          <div
            className={styles.HotelDetailHero_lightboxOverlay}
            onClick={closeLightbox}
          >
            <button
              type="button"
              className={styles.HotelDetailHero_lightboxClose}
              onClick={closeLightbox}
            >
              <X size={32} />
            </button>
            <button
              type="button"
              className={styles.HotelDetailHero_lightboxPrev}
              onClick={prevImage}
            >
              <ChevronLeft size={40} />
            </button>
            <img
              src={images[selectedIndex]}
              alt={`${name} fullscreen ${selectedIndex + 1}`}
              className={styles.HotelDetailHero_lightboxImage}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              className={styles.HotelDetailHero_lightboxNext}
              onClick={nextImage}
            >
              <ChevronRight size={40} />
            </button>
            <div
              style={{
                position: "absolute",
                bottom: 24,
                left: "50%",
                transform: "translateX(-50%)",
                color: "#fff",
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              {selectedIndex + 1} / {images.length}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
