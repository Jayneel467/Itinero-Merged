import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Users, Bed, Maximize2, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import styles from '../HotelDetailPage.module.css';

/**
 * Quick view for a live LiteAPI room - images, beds, size, amenities from feed only.
 */
export default function RoomQuickViewModal({ room, hotelId, onClose }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [imgIndex, setImgIndex] = useState(0);
  const images = room?.images?.length ? room.images : [];

  const nextImg = (e) => {
    e.stopPropagation();
    if (!images.length) return;
    setImgIndex((prev) => (prev + 1) % images.length);
  };

  const prevImg = (e) => {
    e.stopPropagation();
    if (!images.length) return;
    setImgIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const handleBookNow = () => {
    const qs = searchParams.toString();
    navigate(`/hotel/${hotelId}/booking${qs ? `?${qs}` : ''}`);
  };

  const amenities = (room?.amenities || [])
    .map((a) => (typeof a === 'string' ? a : a?.name))
    .filter(Boolean);

  const description =
    (room?.description && String(room.description).trim()) ||
    [
      room?.board ? `Board: ${room.board}` : null,
      room?.freeBreakfast ? 'Breakfast included' : null,
      room?.freeCancellation ? 'Free cancellation' : null,
      room?.view && room.view !== 'Standard view' ? `View: ${room.view}` : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'Room details from live inventory.';

  return createPortal(
    <div className={styles.HotelQuickView_overlay} onClick={onClose}>
      <div className={styles.HotelQuickView_modal} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.HotelQuickView_closeBtn} onClick={onClose}>
          <X size={20} />
        </button>

        <div className={styles.HotelQuickView_content}>
          <div className={styles.HotelQuickView_imageSection}>
            <div className={styles.HotelQuickView_mainImageWrapper}>
              {images.length ? (
                images.map((img, idx) => (
                  <img
                    key={idx}
                    src={img}
                    alt={room.name}
                    className={`${styles.HotelQuickView_mainImage} ${idx === imgIndex ? styles.activeImg : ''}`}
                  />
                ))
              ) : (
                <div
                  className={styles.HotelQuickView_mainImage}
                  style={{ background: '#f2f4f7', display: 'grid', placeItems: 'center', color: '#98a2b3' }}
                >
                  No photo
                </div>
              )}
              {images.length > 1 && (
                <>
                  <button type="button" className={`${styles.HotelQuickView_navBtn} ${styles.prev}`} onClick={prevImg}>
                    <ChevronLeft size={20} />
                  </button>
                  <button type="button" className={`${styles.HotelQuickView_navBtn} ${styles.next}`} onClick={nextImg}>
                    <ChevronRight size={20} />
                  </button>
                </>
              )}
            </div>

            {images.length > 1 && (
              <div className={styles.HotelQuickView_thumbnailList}>
                {images.map((img, idx) => (
                  <div
                    key={idx}
                    className={`${styles.HotelQuickView_thumbnailWrapper} ${idx === imgIndex ? styles.activeThumb : ''}`}
                    onClick={() => setImgIndex(idx)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setImgIndex(idx);
                    }}
                  >
                    <img src={img} alt="" className={styles.HotelQuickView_thumbnail} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.HotelQuickView_infoSection}>
            <h2 className={styles.HotelQuickView_title}>{room.name}</h2>

            <div className={styles.HotelQuickView_metaBar}>
              <span className={styles.HotelQuickView_metaItem}><Users size={16} /> {room.guests}</span>
              <span className={styles.HotelQuickView_metaItem}><Bed size={16} /> {room.beds}</span>
              {room.size && room.size !== '-' && (
                <span className={styles.HotelQuickView_metaItem}><Maximize2 size={16} /> {room.size}</span>
              )}
            </div>

            <p className={styles.HotelQuickView_description}>{description}</p>

            {amenities.length > 0 && (
              <div className={styles.HotelQuickView_amenitiesList}>
                <h4 className={styles.HotelQuickView_amenitiesTitle}>Room Amenities</h4>
                <div className={styles.HotelQuickView_amenitiesGrid}>
                  {amenities.map((text, idx) => (
                    <div key={`${text}-${idx}`} className={styles.HotelQuickView_amenityItem}>
                      <Check size={16} />
                      <span>{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.HotelQuickView_footer}>
              <div className={styles.HotelQuickView_priceBox}>
                <span className={styles.HotelQuickView_price}>{room.price}</span>
                <span className={styles.HotelQuickView_perNight}>/night</span>
              </div>
              <button type="button" className={styles.HotelQuickView_bookBtn} onClick={handleBookNow}>
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
