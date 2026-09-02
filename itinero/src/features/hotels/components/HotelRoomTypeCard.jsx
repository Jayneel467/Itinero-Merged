import React, { useMemo, useState } from "react";
import { Check, Coffee, Clock, Ban, ChevronLeft, ChevronRight } from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext";
import { groupRoomsByType } from "../utils/roomGrouping";
import styles from "./HotelRoomTypeCard.module.css";

export { groupRoomsByType };

function collectImages(roomType, hotelImages = []) {
  const seen = new Set();
  const out = [];
  const push = (u) => {
    const s = String(u || "").trim();
    if (!s || s === "null" || s === "undefined") return;
    const url = s.startsWith("//") ? `https:${s}` : s;
    if (seen.has(url)) return;
    // Skip local placeholder assets - treat as missing
    if (/hotel_room\.png|no[-_]?image/i.test(url)) return;
    seen.add(url);
    out.push(url);
  };

  for (const u of roomType?.images || []) push(u);
  push(roomType?.image);
  for (const rate of roomType?.rates || []) {
    for (const u of rate.images || []) push(u);
    push(rate.image);
  }
  // If the room still has few shots, top up from property gallery
  // (bedroom / view / exterior) without inventing photos.
  if (out.length < 3) {
    for (const u of hotelImages || []) {
      push(u);
      if (out.length >= 6) break;
    }
  }
  return out;
}

function formatCancelDate(str) {
  if (!str) return "";
  try {
    const d = new Date(String(str).includes("T") ? str : str.replace(" ", "T"));
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    }
  } catch {}
  return String(str).slice(0, 10);
}

/**
 * Nuitee-style room type: photo gallery + stacked rate rows.
 */
export default function HotelRoomTypeCard({
  roomType,
  selectedRateId,
  onSelectRate,
  hotelImages = [],
}) {
  const { formatMoney } = useCurrency();
  const rates = Array.isArray(roomType.rates) ? roomType.rates : [];
  const images = useMemo(
    () => collectImages(roomType, hotelImages),
    [roomType, hotelImages]
  );
  const [imgIndex, setImgIndex] = useState(0);
  const safeIndex = images.length ? Math.min(imgIndex, images.length - 1) : 0;

  const fromPrice = rates.reduce(
    (min, r) => (typeof r.price === "number" && r.price < min ? r.price : min),
    Number.POSITIVE_INFINITY
  );

  const moneyOpts = { maximumFractionDigits: 0 };

  const nextImg = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (images.length < 2) return;
    setImgIndex((prev) => (prev + 1) % images.length);
  };

  const prevImg = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (images.length < 2) return;
    setImgIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  return (
    <article className={styles.card}>
      <div className={styles.left}>
        <div className={styles.imageWrap}>
          {images.length ? (
            <img
              src={images[safeIndex]}
              alt={roomType.title || "Room image"}
              className={styles.image}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className={styles.imageMissing}>Photos coming soon</div>
          )}

          {images.length > 1 ? (
            <>
              <button
                type="button"
                className={`${styles.navBtn} ${styles.navPrev}`}
                onClick={prevImg}
                aria-label="Previous photo"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                className={`${styles.navBtn} ${styles.navNext}`}
                onClick={nextImg}
                aria-label="Next photo"
              >
                <ChevronRight size={16} />
              </button>
              <div className={styles.counter}>
                {safeIndex + 1}/{images.length}
              </div>
            </>
          ) : null}
        </div>

        {images.length > 1 ? (
          <div className={styles.thumbs} role="tablist" aria-label="Room photos">
            {images.slice(0, 4).map((src, idx) => (
              <button
                key={src}
                type="button"
                role="tab"
                aria-selected={idx === safeIndex}
                className={`${styles.thumb}${idx === safeIndex ? ` ${styles.thumbActive}` : ""}`}
                onClick={() => setImgIndex(idx)}
              >
                <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />
              </button>
            ))}
          </div>
        ) : null}

        <div className={styles.meta}>
          <h3 className={styles.title}>{roomType.title}</h3>
          <p className={styles.specs}>
            {[
              roomType.bedType,
              roomType.capacity ? `Sleeps ${roomType.capacity}` : null,
              roomType.size && roomType.size !== "-" ? roomType.size : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {roomType.view && roomType.view !== "Standard view" ? (
            <span className={styles.viewBadge}>{roomType.view}</span>
          ) : null}
          {Number.isFinite(fromPrice) ? (
            <div className={styles.fromPriceRow}>
              <span className={styles.fromPriceLabel}>Starts from</span>
              <span className={styles.fromPriceValue}>{formatMoney(fromPrice, moneyOpts)} <span className={styles.fromPriceUnit}>/ night</span></span>
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.rates}>
        {rates.map((rate) => {
          const selected = rate.id === selectedRateId;
          const cancelShort = rate.cancelUntil ? formatCancelDate(rate.cancelUntil) : "";
          return (
            <div
              key={rate.id}
              className={`${styles.rateRow} ${selected ? styles.rateRowSelected : ""}`}
            >
              <div className={styles.rateInfo}>
                <div className={styles.boardName}>{rate.board || "Room only"}</div>
                <div className={styles.rateTags}>
                  {rate.freeCancellation ? (
                    <span className={styles.tagGreen} title={rate.cancelUntil ? `Free cancellation until ${rate.cancelUntil}` : "Free cancellation"}>
                      <Check size={12} className="flex-shrink-0" /> Free cancellation {cancelShort ? `• until ${cancelShort}` : ""}
                    </span>
                  ) : (
                    <span className={styles.tagMuted}>
                      <Ban size={12} className="flex-shrink-0" /> Non-refundable
                    </span>
                  )}
                  {rate.freeBreakfast ? (
                    <span className={styles.tagGreen}>
                      <Coffee size={12} className="flex-shrink-0" /> Breakfast included
                    </span>
                  ) : (
                    <span className={styles.tagMuted}>No meals</span>
                  )}
                  {rate.payAtHotel ? (
                    <span className={styles.tagBlue}>
                      <Clock size={12} className="flex-shrink-0" /> Pay at hotel
                    </span>
                  ) : null}
                </div>
              </div>

              <div className={styles.rateAction}>
                <div className={styles.ratePrice}>
                  <div className={styles.priceMain}>
                    {formatMoney(rate.price || 0, moneyOpts)}
                    <span className={styles.priceSub}> / night</span>
                  </div>
                  {rate.taxes > 0 ? (
                    <div className={styles.priceTax}>
                      +{formatMoney(rate.taxes, moneyOpts)} taxes & fees
                    </div>
                  ) : (
                    <div className={styles.priceTaxIncluded}>Taxes included</div>
                  )}
                </div>

                <button
                  type="button"
                  className={selected ? styles.btnSelected : styles.btnSelect}
                  onClick={() => onSelectRate(rate.id)}
                >
                  {selected ? (
                    <>
                      <Check size={15} /> Selected
                    </>
                  ) : (
                    "Choose room"
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
