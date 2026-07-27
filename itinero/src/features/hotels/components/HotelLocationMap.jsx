import React from 'react';
import { MapPin } from 'lucide-react';
import styles from '../HotelDetailPage.module.css';

export default function HotelLocationMap() {
  return (
    <div className={styles.HotelLocationMap_mapContainer}>
      <img src="https://images.unsplash.com/photo-1524661135-423995f22d0b?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&q=80" alt="Map View" className={styles.HotelLocationMap_mapImage} />
      <div className={styles.HotelLocationMap_overlay}>
        <div className={styles.HotelLocationMap_pinIconWrapper}>
          <MapPin size={24} className={styles.pinIcon} fill="#F97211" color="#FFF" />
        </div>
        <button className={styles.HotelLocationMap_viewMapBtn}>
          <MapPin size={14} className={styles.HotelLocationMap_btnIcon} />
          View on Map
        </button>
      </div>
    </div>
  );
}
