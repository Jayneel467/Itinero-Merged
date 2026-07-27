import React from 'react';
import { ShieldAlert, MessageCircle, Phone, Mail } from 'lucide-react';
import styles from '../HotelDetailPage.module.css';

export default function HotelHelpCard() {
  return (
    <div className={styles.HotelHelpCard_card}>
      <div className={styles.HotelHelpCard_header}>
        <div className={styles.HotelHelpCard_iconWrapper}>
          <ShieldAlert size={20} className={styles.HotelHelpCard_shieldIcon} />
        </div>
        <div className={styles.HotelHelpCard_headerText}>
          <h3 className={styles.HotelHelpCard_title}>Need Help?</h3>
          <p className={styles.HotelHelpCard_subtitle}>We are here for you 24/7</p>
        </div>
      </div>

      <div className={styles.HotelHelpCard_contactLinks}>
        <button className={styles.HotelHelpCard_linkBtn}>
          <MessageCircle size={14} />
          Live Chat
        </button>
        <div className={styles.HotelHelpCard_divider}></div>
        <button className={styles.HotelHelpCard_linkBtn}>
          <Phone size={14} />
          Call Us
        </button>
        <div className={styles.HotelHelpCard_divider}></div>
        <button className={styles.HotelHelpCard_linkBtn}>
          <Mail size={14} />
          Email Us
        </button>
      </div>
    </div>
  );
}
