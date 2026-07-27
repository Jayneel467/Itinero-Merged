import React from 'react';
import { MoveRight, Star } from 'lucide-react';
import styles from './HotelBookingSummary.module.css';

export default function HotelBookingSummary({ bookingInfo, buttonText, onButtonClick }) {
  if (!bookingInfo) return null;

  return (
    <div className={styles.summaryCard}>
      <h2 className={styles.summaryTitle}>Booking Summary</h2>
      
      <div className={styles.hotelInfo}>
        <img src={bookingInfo.hotelImage} alt={bookingInfo.hotelName} className={styles.hotelImage} />
        <div className={styles.hotelDetails}>
          <h3 className={styles.hotelName}>{bookingInfo.hotelName}</h3>
          <div className={styles.stars}>
            {Array(5).fill(0).map((_, i) => (
              <Star key={i} size={14} fill="currentColor" />
            ))}
          </div>
          <span className={styles.hotelLocation}>{bookingInfo.location}</span>
        </div>
      </div>
      
      <div className={styles.datesSection}>
        <div className={styles.dateBlock}>
          <span className={styles.dateLabel}>Check-in</span>
          <span className={styles.dateValue}>
            {bookingInfo.checkIn.date} <span className={styles.dateDay}>({bookingInfo.checkIn.day})</span>
          </span>
        </div>
        
        <div className={styles.dateBlock}>
          <span className={styles.dateLabel}>Check-out</span>
          <span className={styles.dateValue}>
            {bookingInfo.checkOut.date} <span className={styles.dateDay}>({bookingInfo.checkOut.day})</span>
          </span>
        </div>
        
        <div className={styles.dateBlock}>
          <span className={styles.dateLabel}>Guests</span>
          <span className={styles.dateValue}>{bookingInfo.guests} Adults</span>
        </div>
        
        <div className={styles.dateBlock}>
          <span className={styles.dateLabel}>Rooms</span>
          <span className={styles.dateValue}>{bookingInfo.rooms} Room</span>
        </div>
      </div>
      
      <div className={styles.priceBreakdown}>
        <div className={styles.priceRow}>
          <span>Rooms ({bookingInfo.nights} Nights)</span>
          <span className={styles.priceValue}>₹{bookingInfo.roomsTotal.toLocaleString()}</span>
        </div>
        <div className={styles.priceRow}>
          <span>Taxes & Fees</span>
          <span className={styles.priceValue}>₹{bookingInfo.taxesTotal.toLocaleString()}</span>
        </div>
      </div>
      
      <div className={styles.totalRow}>
        <span className={styles.totalLabel}>Total Price</span>
        <span className={styles.totalPrice}>₹{bookingInfo.totalPrice.toLocaleString()}</span>
      </div>
      <div className={styles.inclusiveText}>Inclusive of all taxes & fees</div>
      
      <button className={styles.continueBtn} onClick={onButtonClick}>
        {buttonText || 'Continue to Guest Details'} <MoveRight size={18} />
      </button>
      
      <div className={styles.badgeInfo}>
        <Star size={16} fill="currentColor" /> You won't be charged yet
      </div>
    </div>
  );
}
