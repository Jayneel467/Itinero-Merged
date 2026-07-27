import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Wifi, Waves, Coffee, X, ChevronLeft, ChevronRight } from 'lucide-react';
import styles from '../HotelDetailPage.module.css';

export default function HotelDetailHero() {
  const [selectedIndex, setSelectedIndex] = useState(null);

  const base = import.meta.env.BASE_URL;

  const images = [
    `${base}hotel_bg.png`,
    `${base}hotel_room.png`,
    `${base}hotel_lounge.png`,
    `${base}hotel_pool.png`,
    `${base}hotel_balcony.png`,
    `${base}hotel_pool.png`
  ];

  const closeLightbox = () => setSelectedIndex(null);

  const nextImage = (e) => {
    e.stopPropagation();
    setSelectedIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = (e) => {
    e.stopPropagation();
    setSelectedIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  return (
    <div className={styles.HotelDetailHero_heroContainer}>
      {/* Title & Info Section */}
      <div className={styles.HotelDetailHero_headerInfo}>
        <h1 className={styles.HotelDetailHero_hotelName}>Address Downtown Dubai</h1>
        
        <div className={styles.HotelDetailHero_ratingRow}>
          <div className={styles.HotelDetailHero_stars}>
            {Array(5).fill(0).map((_, i) => (
              <span key={i} className={styles.star}>★</span>
            ))}
          </div>
          <div className={styles.HotelDetailHero_ratingBadge}>4.8</div>
          <span className={styles.HotelDetailHero_ratingText}>Excellent</span>
          <span className={styles.HotelDetailHero_reviewsText}>(2456 reviews)</span>
        </div>

        <div className={styles.HotelDetailHero_locationRow}>
          <MapPin size={16} className={styles.HotelDetailHero_icon} />
          <span>Downtown Dubai, Dubai</span>
          <span className={styles.HotelDetailHero_dot}>•</span>
          <span>0.5 Km to city center</span>
          <span className={styles.HotelDetailHero_dot}>•</span>
          <span className={styles.HotelDetailHero_excellentLocation}>Excellent Location</span>
        </div>

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
          <span className={styles.HotelDetailHero_moreAmenities}>+6 more</span>
        </div>
      </div>

      <div className={styles.HotelDetailHero_gallery}>
        <div className={styles.HotelDetailHero_galleryImageWrapper} onClick={() => setSelectedIndex(0)} style={{ cursor: 'pointer' }}>
          <img src={images[0]} alt="Hotel View" className={styles.HotelDetailHero_galleryImage} />
        </div>
        <div className={styles.HotelDetailHero_galleryImageWrapper} onClick={() => setSelectedIndex(1)} style={{ cursor: 'pointer' }}>
          <img src={images[1]} alt="Hotel Room" className={styles.HotelDetailHero_galleryImage} />
        </div>
        <div className={styles.HotelDetailHero_galleryImageWrapper} onClick={() => setSelectedIndex(2)} style={{ cursor: 'pointer' }}>
          <img src={images[2]} alt="Hotel Lounge" className={styles.HotelDetailHero_galleryImage} />
        </div>
        <div className={styles.HotelDetailHero_galleryImageWrapper} onClick={() => setSelectedIndex(3)} style={{ cursor: 'pointer' }}>
          <img src={images[3]} alt="Hotel Pool" className={styles.HotelDetailHero_galleryImage} />
        </div>
        <div className={styles.HotelDetailHero_galleryImageWrapper} onClick={() => setSelectedIndex(4)} style={{ cursor: 'pointer' }}>
          <img src={images[4]} alt="Hotel Balcony" className={styles.HotelDetailHero_galleryImage} />
        </div>
        <div className={`${styles.HotelDetailHero_galleryImageWrapper} ${styles.HotelDetailHero_viewMoreOverlay}`} onClick={() => setSelectedIndex(5)} style={{ cursor: 'pointer' }}>
          <div className={styles.HotelDetailHero_viewMoreContent}>
            <span className={styles.HotelDetailHero_viewMoreNumber}>+28</span>
            <span className={styles.HotelDetailHero_viewMoreText}>View all photos</span>
          </div>
        </div>
      </div>

      {/* Lightbox Modal — rendered via Portal to avoid z-index stacking issues */}
      {selectedIndex !== null && createPortal(
        <div className={styles.HotelDetailHero_lightboxOverlay} onClick={closeLightbox}>
          <button className={styles.HotelDetailHero_lightboxClose} onClick={closeLightbox}>
            <X size={32} />
          </button>
          
          <button className={styles.HotelDetailHero_lightboxPrev} onClick={prevImage}>
            <ChevronLeft size={40} />
          </button>
          
          <img
            src={images[selectedIndex]}
            alt="Fullscreen View"
            className={styles.HotelDetailHero_lightboxImage}
            onClick={(e) => e.stopPropagation()}
          />
          
          <button className={styles.HotelDetailHero_lightboxNext} onClick={nextImage}>
            <ChevronRight size={40} />
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
