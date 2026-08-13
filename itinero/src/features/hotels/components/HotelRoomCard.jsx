import React from 'react';
import { Wifi, Tv, Monitor, Wind, Coffee, Check, Clock } from 'lucide-react';
import { useCurrency } from '@/context/CurrencyContext';
import styles from './HotelRoomCard.module.css';

export default function HotelRoomCard({ room, onSelect, isSelected }) {
  const { formatMoney, symbol } = useCurrency();
  return (
    <div className={styles.card}>
      <div className={styles.imageWrapper}>
        <img src={room.image} alt={room.title} className={styles.image} />
      </div>
      
      <div className={styles.content}>
        <div className={styles.topRow}>
          <div className={styles.infoSection}>
            <h3 className={styles.roomTitle}>{room.title}</h3>
            {room.board && room.board !== room.title && (
              <div className={styles.specsRow} style={{ marginTop: 4, color: '#666', fontSize: 13 }}>
                Meal plan: {room.board}
              </div>
            )}
            
            <div className={styles.specsRow}>
              <span>{room.bedType}</span>
              <span className={styles.specsDot}>•</span>
              <span>{room.capacity} Adults</span>
              {room.size && room.size !== '-' && (
                <>
                  <span className={styles.specsDot}>•</span>
                  <span>{room.size}</span>
                </>
              )}
            </div>
            
            {(room.view && room.view !== 'Standard view') || (room.floor && room.floor !== '-') ? (
              <div className={styles.specsRow}>
                {room.view && <span>{room.view}</span>}
                {room.view && room.floor && room.floor !== '-' && (
                  <span className={styles.specsDot}>•</span>
                )}
                {room.floor && room.floor !== '-' && <span>{room.floor}</span>}
              </div>
            ) : null}
            
            <div className={styles.tagsRow}>
              {room.board && (
                <div className={`${styles.tag} ${styles.tagBlue}`}>
                  {room.board}
                </div>
              )}
              {room.freeCancellation && (
                <div className={`${styles.tag} ${styles.tagGreen}`}>
                  <Check size={14} /> Free cancellation
                </div>
              )}
              {room.freeBreakfast && (
                <div className={`${styles.tag} ${styles.tagGreen}`}>
                  <Coffee size={14} /> Free Breakfast
                </div>
              )}
              {room.payAtHotel && (
                <div className={`${styles.tag} ${styles.tagBlue}`}>
                  <Clock size={14} /> Pay at Hotel
                </div>
              )}
            </div>
          </div>
          
          <div className={styles.priceSection}>
            {room.roomsLeft && (
              <div className={styles.urgencyText}>Only {room.roomsLeft} rooms left!</div>
            )}
            
            <div className={styles.priceBlock}>
              <span className={styles.priceCurrency}>{symbol}</span>
              <span className={styles.priceAmount}>{Number(room.price || 0).toLocaleString()}</span>
              <span className={styles.pricePerNight}>/ night</span>
            </div>
            
            <div className={styles.taxesText}>
              +{formatMoney(room.taxes || 0)} taxes & fees
            </div>
            
            {room.freeCancellation && (
              <div className={styles.cancellationText}>
                <Check size={14} /> Free Cancellation before 10 May 2026
              </div>
            )}
            
            <button 
              className={isSelected ? styles.selectedButton : styles.selectButton} 
              onClick={onSelect}
            >
              {isSelected ? (
                <>
                  <Check size={16} /> Selected
                </>
              ) : (
                'Select Room'
              )}
            </button>
          </div>
        </div>
        
        <div className={styles.bottomRow}>
          <div className={styles.amenityItem}>
            <div className={styles.amenityBox}><Wifi size={16} /></div>
            <span>Free Wi-Fi</span>
          </div>
          <div className={styles.amenityItem}>
            <div className={styles.amenityBox}><Tv size={16} /></div>
            <span>TV</span>
          </div>
          <div className={styles.amenityItem}>
            <div className={styles.amenityBox}><Monitor size={16} /></div>
            <span>Mini Bar</span>
          </div>
          <div className={styles.amenityItem}>
            <div className={styles.amenityBox}><Wind size={16} /></div>
            <span>A/C</span>
          </div>
          <div className={styles.amenityItem}>
            <div className={styles.amenityBox}><Coffee size={16} /></div>
            <span>Room Service</span>
          </div>
          <div className={styles.amenityItem}>
            <div className={`${styles.amenityBox} ${styles.moreAmenities}`}>+8</div>
            <span>+8 more</span>
          </div>
        </div>
      </div>
    </div>
  );
}
