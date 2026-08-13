import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import styles from '../HotelDetailPage.module.css';

function stripHtml(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default function HotelAbout({ description, importantInformation, checkinCheckout }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const text =
    stripHtml(description) ||
    'Property details will appear here when available for this hotel.';
  const important = stripHtml(importantInformation);
  const times = checkinCheckout && typeof checkinCheckout === 'object' ? checkinCheckout : null;

  return (
    <div className={styles.HotelAbout_aboutContainer}>
      <h2 className={styles.HotelAbout_sectionTitle}>About This Hotel</h2>
      <div
        className={`relative transition-all duration-300 overflow-hidden ${
          isExpanded ? 'max-h-[4000px]' : 'max-h-[120px]'
        }`}
      >
        <p className={styles.HotelAbout_description} style={{ whiteSpace: 'pre-wrap' }}>
          {text}
        </p>
        {important && isExpanded && (
          <>
            <h3 style={{ marginTop: 16, fontSize: 15, fontWeight: 700, color: '#001439' }}>
              Important information
            </h3>
            <p className={styles.HotelAbout_description} style={{ whiteSpace: 'pre-wrap' }}>
              {important}
            </p>
          </>
        )}
        {times && isExpanded && (times.checkin || times.checkout) && (
          <p style={{ marginTop: 12, fontSize: 13, color: '#667085' }}>
            {times.checkin ? `Check-in: ${times.checkin}` : null}
            {times.checkin && times.checkout ? ' · ' : null}
            {times.checkout ? `Check-out: ${times.checkout}` : null}
          </p>
        )}
        {!isExpanded && (
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent pointer-events-none" />
        )}
      </div>
      <button
        type="button"
        className={`${styles.HotelAbout_readMoreBtn} mt-2 flex items-center font-bold text-[#F97211] hover:text-[#E86A10] transition-colors`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? 'Read Less' : 'Read More'}
        {isExpanded ? <ChevronUp size={16} className="ml-1" /> : <ChevronDown size={16} className="ml-1" />}
      </button>
    </div>
  );
}
