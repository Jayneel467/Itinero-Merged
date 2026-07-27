import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from '../HotelsPage.module.css';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const HotelCard = ({ hotel }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const navigate = useNavigate();
  const images = hotel.images || [hotel.image];

  const nextImage = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  const prevImage = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const handleCardClick = () => {
    navigate(`/hotel/${hotel.id}`);
  };

  return (
    <div className={styles.hotelCard} onClick={handleCardClick} style={{ cursor: 'pointer' }}>
      {/* Image Section */}
      <div className={styles.hotelImageWrapper}>
        <div className={styles.imageBadgeTopLeft}>Free cancellation</div>
        <div className={styles.carouselViewport}>
          <div 
            className={styles.carouselTrack} 
            style={{ transform: `translateX(-${currentImageIndex * 100}%)` }}
          >
            {images.map((img, idx) => (
              <img key={idx} src={img} alt={`${hotel.name} - ${idx}`} className={styles.hotelImage} />
            ))}
          </div>
        </div>
        
        {/* Carousel Controls */}
        {images.length > 1 && (
          <>
            <button className={`${styles.carouselBtn} ${styles.carouselBtnPrev}`} onClick={prevImage} aria-label="Previous image">
              <ChevronLeft size={16} />
            </button>
            <button className={`${styles.carouselBtn} ${styles.carouselBtnNext}`} onClick={nextImage} aria-label="Next image">
              <ChevronRight size={16} />
            </button>
          </>
        )}
        {/* Favorite Icon */}
        <button 
          className={styles.favoriteBtn} 
          aria-label="Save hotel"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <svg width="20" height="18" viewBox="0 0 20 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 18L8.55 16.68C3.4 12.02 0 8.94 0 5.12C0 2.24 2.24 0 5.12 0C6.75 0 8.32 0.77 9.28 2.02C9.48 2.28 9.73 2.28 9.93 2.02C10.89 0.77 12.46 0 14.09 0C16.97 0 19.21 2.24 19.21 5.12C19.21 8.94 15.81 12.02 10.66 16.69L10 18Z" fill="#242A31" fillOpacity="0.4"/>
          </svg>
        </button>
        <div className={styles.imageBadgeBottomLeft}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="12" rx="2" ry="2"></rect><circle cx="12" cy="14" r="3"></circle><path d="M7 8v-2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2"></path></svg>
          {currentImageIndex + 1}/{images.length}
        </div>
      </div>

      {/* Details Section */}
      <div className={styles.hotelDetails}>
        <div className={styles.hotelDetailsLeft}>
          <h3 className={styles.hotelName}>{hotel.name}</h3>
          
          <div className={styles.hotelLocationRow}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            <span className={styles.hotelLocation}>{hotel.location}</span>
            <span className={styles.locationDot}>•</span>
            <span className={styles.hotelDistance}>{hotel.distance}</span>
          </div>
          
          <div className={styles.hotelRatingRow}>
            <div className={styles.ratingBadge}>{hotel.rating}</div>
            <span className={styles.ratingText}>{hotel.ratingText}</span>
            <span className={styles.reviewCount}>({hotel.reviewCount} reviews)</span>
          </div>

          <div className={styles.hotelAmenitiesRow}>
            <span className={styles.amenityItem}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
              Breakfast included
            </span>
            <span className={styles.amenityItem}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>
              Free Wi-Fi
            </span>
            <span className={styles.amenityItem}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 6c.6 0 1.2-.2 1.7-.6.9-.7 2.1-.7 3 0 .5.4 1.1.6 1.7.6s1.2-.2 1.7-.6c.9-.7 2.1-.7 3 0 .5.4 1.1.6 1.7.6s1.2-.2 1.7-.6c.9-.7 2.1-.7 3 0 .5.4 1.1.6 1.7.6s1.2-.2 1.7-.6c.9-.7 2.1-.7 3 0"></path><path d="M2 12c.6 0 1.2-.2 1.7-.6.9-.7 2.1-.7 3 0 .5.4 1.1.6 1.7.6s1.2-.2 1.7-.6c.9-.7 2.1-.7 3 0 .5.4 1.1.6 1.7.6s1.2-.2 1.7-.6c.9-.7 2.1-.7 3 0 .5.4 1.1.6 1.7.6s1.2-.2 1.7-.6c.9-.7 2.1-.7 3 0"></path><path d="M2 18c.6 0 1.2-.2 1.7-.6.9-.7 2.1-.7 3 0 .5.4 1.1.6 1.7.6s1.2-.2 1.7-.6c.9-.7 2.1-.7 3 0 .5.4 1.1.6 1.7.6s1.2-.2 1.7-.6c.9-.7 2.1-.7 3 0 .5.4 1.1.6 1.7.6s1.2-.2 1.7-.6c.9-.7 2.1-.7 3 0"></path></svg>
              Swimming Pool
            </span>
            <span className={styles.amenityItem}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" ry="2"></rect><line x1="9" y1="8" x2="9" y2="16"></line><path d="M9 8h3a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H9"></path></svg>
              Parking
            </span>
            <span className={styles.amenityMore}>| +6 more</span>
          </div>

          <div className={styles.hotelTagsRow}>
            {hotel.tags.map((tag, index) => (
              <span key={index} className={tag === 'Free cancellation' ? styles.tagGreen : styles.tagGray}>
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className={styles.hotelDetailsRight}>
          <div className={styles.priceLabel}>Per Night</div>
          <div className={styles.pricePerNight}>₹{hotel.pricePerNight.toLocaleString()}</div>
          <div className={styles.totalPrice}>
            ₹{hotel.totalPrice.toLocaleString()} total<br />
            <span className={styles.taxesText}>incl. taxes & fees</span>
          </div>
          
          <button className={styles.bookNowBtn}>Book Now</button>
          <button className={styles.seeOptionsBtn}>See room options &gt;</button>
        </div>
      </div>
    </div>
  );
};
