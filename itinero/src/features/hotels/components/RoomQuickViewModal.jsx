import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Users, Bed, Maximize2, Bath, Check, ChevronLeft, ChevronRight, Wifi, Coffee, Tv, Wind } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import styles from '../HotelDetailPage.module.css';

export default function RoomQuickViewModal({ room, onClose }) {
  const navigate = useNavigate();
  const [imgIndex, setImgIndex] = useState(0);

  const nextImg = (e) => {
    e.stopPropagation();
    setImgIndex((prev) => (prev + 1) % room.images.length);
  };
  
  const prevImg = (e) => {
    e.stopPropagation();
    setImgIndex((prev) => (prev - 1 + room.images.length) % room.images.length);
  };

  const handleBookNow = () => {
    navigate('/hotel/1/booking');
  };

  const amenities = [
    { icon: <Wifi size={16} />, text: 'Free High-Speed Wi-Fi' },
    { icon: <Coffee size={16} />, text: 'Complimentary Breakfast' },
    { icon: <Tv size={16} />, text: '55" Flat-Screen TV' },
    { icon: <Wind size={16} />, text: 'Air Conditioning' },
    { icon: <Bath size={16} />, text: 'Premium Bath Amenities' },
    { icon: <Bed size={16} />, text: 'Premium Bedding' },
  ];

  return createPortal(
    <div className={styles.HotelQuickView_overlay} onClick={onClose}>
      <div className={styles.HotelQuickView_modal} onClick={e => e.stopPropagation()}>
        <button className={styles.HotelQuickView_closeBtn} onClick={onClose}>
          <X size={20} />
        </button>

        <div className={styles.HotelQuickView_content}>
          <div className={styles.HotelQuickView_imageSection}>
            <div className={styles.HotelQuickView_mainImageWrapper}>
              {room.images.map((img, idx) => (
                <img 
                  key={idx} 
                  src={img} 
                  alt={room.name} 
                  className={`${styles.HotelQuickView_mainImage} ${idx === imgIndex ? styles.activeImg : ''}`}
                />
              ))}
              <button className={`${styles.HotelQuickView_navBtn} ${styles.prev}`} onClick={prevImg}>
                <ChevronLeft size={20} />
              </button>
              <button className={`${styles.HotelQuickView_navBtn} ${styles.next}`} onClick={nextImg}>
                <ChevronRight size={20} />
              </button>
            </div>
            
            <div className={styles.HotelQuickView_thumbnailList}>
              {room.images.map((img, idx) => (
                <div 
                  key={idx} 
                  className={`${styles.HotelQuickView_thumbnailWrapper} ${idx === imgIndex ? styles.activeThumb : ''}`}
                  onClick={() => setImgIndex(idx)}
                >
                  <img src={img} alt="Thumbnail" className={styles.HotelQuickView_thumbnail} />
                </div>
              ))}
            </div>
          </div>

          <div className={styles.HotelQuickView_infoSection}>
            <h2 className={styles.HotelQuickView_title}>{room.name}</h2>
            
            <div className={styles.HotelQuickView_metaBar}>
              <span className={styles.HotelQuickView_metaItem}><Users size={16} /> {room.guests}</span>
              <span className={styles.HotelQuickView_metaItem}><Bed size={16} /> {room.beds}</span>
              <span className={styles.HotelQuickView_metaItem}><Maximize2 size={16} /> {room.size}</span>
            </div>

            <p className={styles.HotelQuickView_description}>
              Experience ultimate comfort in our {room.name}. Designed with modern elegance, this spacious room offers breathtaking views, premium bedding, and state-of-the-art amenities to ensure a memorable stay.
            </p>

            <div className={styles.HotelQuickView_amenitiesList}>
              <h4 className={styles.HotelQuickView_amenitiesTitle}>Room Amenities</h4>
              <div className={styles.HotelQuickView_amenitiesGrid}>
                {amenities.map((amenity, idx) => (
                  <div key={idx} className={styles.HotelQuickView_amenityItem}>
                    {amenity.icon}
                    <span>{amenity.text}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.HotelQuickView_footer}>
              <div className={styles.HotelQuickView_priceBox}>
                <span className={styles.HotelQuickView_price}>{room.price}</span>
                <span className={styles.HotelQuickView_perNight}>/night, taxes included</span>
              </div>
              <button className={styles.HotelQuickView_bookBtn} onClick={handleBookNow}>
                Book This Room
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
