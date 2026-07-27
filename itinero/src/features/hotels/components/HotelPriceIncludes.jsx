import React from 'react';
import { Check } from 'lucide-react';
import styles from '../HotelDetailPage.module.css';

export default function HotelPriceIncludes() {
  return (
    <div className={styles.HotelPriceIncludes_card}>
      <h3 className={styles.HotelPriceIncludes_title}>Price Includes</h3>
      <ul className={styles.HotelPriceIncludes_list}>
        <li className={styles.HotelPriceIncludes_item}>
          <Check size={14} className={styles.HotelPriceIncludes_checkIcon} strokeWidth={3} />
          <span>Free Breakfast</span>
        </li>
        <li className={styles.HotelPriceIncludes_item}>
          <Check size={14} className={styles.HotelPriceIncludes_checkIcon} strokeWidth={3} />
          <span>Free Wi-Fi</span>
        </li>
        <li className={styles.HotelPriceIncludes_item}>
          <Check size={14} className={styles.HotelPriceIncludes_checkIcon} strokeWidth={3} />
          <span>Airport Transfer</span>
        </li>
        <li className={styles.HotelPriceIncludes_item}>
          <Check size={14} className={styles.HotelPriceIncludes_checkIcon} strokeWidth={3} />
          <span>All taxes & service charges</span>
        </li>
      </ul>
    </div>
  );
}
