import React, { useRef, useState, useEffect, useMemo } from 'react';
import SliderImport from 'react-slick';
const Slider = SliderImport.default || SliderImport;
import 'slick-carousel/slick/slick.css';
import 'slick-carousel/slick/slick-theme.css';
import { Users, Bed, Maximize2, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import styles from '../HotelDetailPage.module.css';
import RoomQuickViewModal from './RoomQuickViewModal';
import { useCurrency } from '@/context/CurrencyContext';
import { LoadingState } from '@/components/shared';
import { uniqueRoomTypesForList } from '../utils/roomGrouping';

function mapLiveRoom(room, formatMoney) {
  const images = (room.images || []).filter(Boolean);
  if (!images.length && room.image) images.push(room.image);
  const capacity = room.capacity || 2;
  return {
    id: room.id,
    offerId: room.offerId,
    name: room.title || room.name || room.category || 'Room',
    guests: room.guests || `${capacity} Guest${capacity === 1 ? '' : 's'}`,
    beds: room.beds || room.bedType || '-',
    size: room.size && room.size !== '-' ? room.size : '-',
    bath: room.view && room.view !== 'Standard view' ? room.view : null,
    view: room.view,
    price: formatMoney(room.pricePerNight || room.price || 0),
    priceRaw: room.pricePerNight || room.price || 0,
    images,
    amenities: room.amenities || [],
    description: room.description || '',
    board: room.board,
    freeCancellation: room.freeCancellation,
    freeBreakfast: room.freeBreakfast,
    currency: room.currency,
    totalPrice: room.totalPrice,
  };
}

function RoomCard({ room, hotelId }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [imgIndex, setImgIndex] = React.useState(0);
  const [isQuickViewOpen, setIsQuickViewOpen] = React.useState(false);
  const imgs = room.images?.length ? room.images : [];

  const nextImg = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!imgs.length) return;
    setImgIndex((prev) => (prev + 1) % imgs.length);
  };

  const prevImg = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!imgs.length) return;
    setImgIndex((prev) => (prev - 1 + imgs.length) % imgs.length);
  };

  const handleBookNow = () => {
    const qs = searchParams.toString();
    navigate(`/hotel/${hotelId}/booking${qs ? `?${qs}` : ''}`);
  };

  return (
    <>
      <div className={styles.HotelRoomList_slideWrapper}>
        <div className={styles.HotelRoomList_roomCard}>
          <div className={styles.HotelRoomList_roomImageWrapper}>
            {imgs.length ? (
              imgs.map((img, idx) => (
                <img
                  key={idx}
                  src={img}
                  alt={room.name}
                  className={`${styles.HotelRoomList_roomImage} ${idx === imgIndex ? styles.HotelRoomList_imgActive : ''}`}
                />
              ))
            ) : (
              <div
                className={styles.HotelRoomList_roomImage}
                style={{ background: '#f2f4f7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#98a2b3' }}
              >
                No photo
              </div>
            )}

            {imgs.length > 1 && (
              <>
                <button type="button" className={`${styles.HotelRoomList_imgNavBtn} ${styles.HotelRoomList_prevBtn}`} onClick={prevImg}>
                  <ChevronLeft size={16} />
                </button>
                <button type="button" className={`${styles.HotelRoomList_imgNavBtn} ${styles.HotelRoomList_nextBtn}`} onClick={nextImg}>
                  <ChevronRight size={16} />
                </button>
                <div className={styles.HotelRoomList_imgDots}>
                  {imgs.map((_, idx) => (
                    <div key={idx} className={`${styles.HotelRoomList_dot} ${idx === imgIndex ? styles.HotelRoomList_activeDot : ''}`} />
                  ))}
                </div>
              </>
            )}

            <div className={styles.HotelRoomList_imageOverlay}>
              <button type="button" className={styles.HotelRoomList_overlayBtn} onClick={() => setIsQuickViewOpen(true)}>
                Quick View
              </button>
            </div>
          </div>
          <div className={styles.HotelRoomList_roomInfo}>
            <h3 className={styles.HotelRoomList_roomName}>{room.name}</h3>
            <div className={styles.HotelRoomList_roomMeta}>
              <span className={styles.HotelRoomList_metaItem}><Users size={14} /> {room.guests}</span>
              <span className={styles.HotelRoomList_metaItem}><Bed size={14} /> {room.beds}</span>
              {room.size !== '-' && (
                <span className={styles.HotelRoomList_metaItem}><Maximize2 size={14} /> {room.size}</span>
              )}
              {room.bath && (
                <span className={styles.HotelRoomList_metaItem}><Eye size={14} /> {room.bath}</span>
              )}
            </div>
            <div className={styles.HotelRoomList_roomFooter}>
              <div className={styles.HotelRoomList_priceBox}>
                <span className={styles.HotelRoomList_roomPrice}>{room.price}</span>
                <span className={styles.HotelRoomList_perNight}>/night</span>
              </div>
              <button type="button" className={styles.HotelRoomList_selectBtn} onClick={handleBookNow}>
                Book Now
              </button>
            </div>
          </div>
        </div>
      </div>
      {isQuickViewOpen && (
        <RoomQuickViewModal room={room} hotelId={hotelId} onClose={() => setIsQuickViewOpen(false)} />
      )}
    </>
  );
}

/**
 * Live LiteAPI room offers for the hotel detail page.
 */
export default function HotelRoomList({ rooms = [], hotelId, loading = false }) {
  const { id: routeId } = useParams();
  const hid = hotelId || routeId;
  const { formatMoney } = useCurrency();
  const sliderRef = useRef(null);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const liveRooms = useMemo(
    () => uniqueRoomTypesForList(rooms).map((r) => mapLiveRoom(r, formatMoney)),
    [rooms, formatMoney]
  );

  let slidesToShow = 3;
  if (windowWidth < 640) slidesToShow = 1;
  else if (windowWidth < 1024) slidesToShow = 2;

  const settings = {
    dots: false,
    infinite: liveRooms.length > slidesToShow,
    speed: 400,
    slidesToShow,
    slidesToScroll: 1,
    arrows: false,
    adaptiveHeight: true,
  };

  if (loading && !liveRooms.length) {
    return (
      <div className={styles.HotelRoomList_container}>
        <h2 className={styles.HotelRoomList_sectionTitle}>Available Rooms</h2>
        <LoadingState
          title="Loading rooms"
          message="Fetching live rates for this property…"
          skeleton="room"
          count={2}
        />
      </div>
    );
  }

  if (!liveRooms.length) {
    return (
      <div className={styles.HotelRoomList_container}>
        <h2 className={styles.HotelRoomList_sectionTitle}>Available Rooms</h2>
        <p style={{ color: '#667085', fontSize: 14 }}>
          No bookable rooms for these dates.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.HotelRoomList_container}>
      <div className={styles.HotelRoomList_titleRow}>
        <h2 className={styles.HotelRoomList_sectionTitle}>Available Rooms</h2>
        <div className={styles.HotelRoomList_navButtons}>
          <button type="button" className={styles.HotelRoomList_navBtn} onClick={() => sliderRef.current?.slickPrev()}>
            <ChevronLeft size={18} />
          </button>
          <button type="button" className={styles.HotelRoomList_navBtn} onClick={() => sliderRef.current?.slickNext()}>
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <Slider ref={sliderRef} {...settings}>
        {liveRooms.map((room) => (
          <RoomCard key={room.id} room={room} hotelId={hid} />
        ))}
      </Slider>
      <p style={{ color: '#98a2b3', fontSize: 12, marginTop: 12 }}>
        Prices and photos from live inventory for your dates.
      </p>
    </div>
  );
}
