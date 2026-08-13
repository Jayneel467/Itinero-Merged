import React from "react";
import { MoveRight, Star, ShieldCheck } from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext";
import styles from "./HotelBookingSummary.module.css";

export default function HotelBookingSummary({
  bookingInfo,
  data,
  buttonText,
  onButtonClick,
  showContinue = true,
  chargeHint = "You won't be charged yet",
  buttonDisabled = false,
}) {
  const { formatMoney } = useCurrency();
  const info = bookingInfo || data;
  if (!info) return null;
  const checkIn = info.checkIn || { date: "-", day: "" };
  const checkOut = info.checkOut || { date: "-", day: "" };
  const stars = Math.min(5, Math.max(0, Math.round(Number(info.starRating) || 0)));
  const showTaxRow = Number(info.taxesTotal) > 0;

  return (
    <div className={styles.summaryCard}>
      <h2 className={styles.summaryTitle}>Booking summary</h2>

      <div className={styles.hotelInfo}>
        <img src={info.hotelImage} alt="" className={styles.hotelImage} />
        <div className={styles.hotelDetails}>
          <h3 className={styles.hotelName}>{info.hotelName}</h3>
          {stars > 0 ? (
            <div className={styles.stars} aria-label={`${stars} star`}>
              {Array.from({ length: stars }).map((_, i) => (
                <Star key={i} size={13} fill="currentColor" />
              ))}
            </div>
          ) : null}
          {info.roomName ? <span className={styles.roomName}>{info.roomName}</span> : null}
          <span className={styles.hotelLocation}>{info.location}</span>
        </div>
      </div>

      <div className={styles.datesSection}>
        <div className={styles.dateBlock}>
          <span className={styles.dateLabel}>Check-in</span>
          <span className={styles.dateValue}>
            {checkIn.date}{" "}
            {checkIn.day ? <span className={styles.dateDay}>({checkIn.day})</span> : null}
          </span>
        </div>

        <div className={styles.dateBlock}>
          <span className={styles.dateLabel}>Check-out</span>
          <span className={styles.dateValue}>
            {checkOut.date}{" "}
            {checkOut.day ? <span className={styles.dateDay}>({checkOut.day})</span> : null}
          </span>
        </div>

        <div className={styles.dateBlock}>
          <span className={styles.dateLabel}>Guests</span>
          <span className={styles.dateValue}>
            {info.guests} {Number(info.guests) === 1 ? "guest" : "guests"}
          </span>
        </div>

        <div className={styles.dateBlock}>
          <span className={styles.dateLabel}>Rooms</span>
          <span className={styles.dateValue}>
            {info.rooms} {Number(info.rooms) === 1 ? "room" : "rooms"}
          </span>
        </div>
      </div>

      <div className={styles.priceBreakdown}>
        <div className={styles.priceRow}>
          <span>
            Stay ({info.nights} {Number(info.nights) === 1 ? "night" : "nights"})
          </span>
          <span className={styles.priceValue}>{formatMoney(info.roomsTotal)}</span>
        </div>
        {showTaxRow ? (
          <div className={styles.priceRow}>
            <span>Taxes & fees</span>
            <span className={styles.priceValue}>{formatMoney(info.taxesTotal)}</span>
          </div>
        ) : null}
      </div>

      <div className={styles.totalRow}>
        <span className={styles.totalLabel}>Total</span>
        <span className={styles.totalPrice}>{formatMoney(info.totalPrice)}</span>
      </div>
      <div className={styles.inclusiveText}>
        {showTaxRow ? "Total includes taxes & fees shown above" : "Inclusive of taxes & fees"}
      </div>

      {showContinue && typeof onButtonClick === "function" ? (
        <button
          type="button"
          className={styles.continueBtn}
          onClick={onButtonClick}
          disabled={buttonDisabled}
        >
          {buttonText || "Continue"} <MoveRight size={18} />
        </button>
      ) : null}

      {chargeHint ? (
        <div className={styles.badgeInfo}>
          <ShieldCheck size={14} aria-hidden /> {chargeHint}
        </div>
      ) : null}
    </div>
  );
}
