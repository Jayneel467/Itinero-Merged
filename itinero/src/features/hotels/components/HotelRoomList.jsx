import React, { useRef, useState, useEffect } from 'react';
import SliderImport from 'react-slick';
const Slider = SliderImport.default || SliderImport;
import 'slick-carousel/slick/slick.css';
import 'slick-carousel/slick/slick-theme.css';
import { Users, Bed, Maximize2, Bath, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import styles from '../HotelDetailPage.module.css';
import RoomQuickViewModal from './RoomQuickViewModal';

const ROOMS = [
  {
    id: 1,
    name: 'Deluxe Room',
    guests: '2 Guests',
    beds: '1 King Bed',
    size: '45 m²',
    bath: '1 Bathroom',
    price: '$265',
    images: [
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1582719478250-c89fee4dc85b?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80'
    ]
  },
  {
    id: 2,
    name: 'Premier Room',
    guests: '2 Guests',
    beds: '2 Queen Beds',
    size: '60 m²',
    bath: '1 Bathroom',
    price: '$350',
    images: [
      'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80'
    ]
  },
  {
    id: 3,
    name: 'Executive Suite',
    guests: '3 Guests',
    beds: '1 King Bed',
    size: '75 m²',
    bath: '2 Bathrooms',
    price: '$450',
    images: [
      'https://images.unsplash.com/photo-1582719478250-c89fee4dc85b?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1566665797739-1674de7a421a?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80'
    ]
  },
  {
    id: 4,
    name: 'Presidential Suite',
    guests: '4 Guests',
    beds: '2 King Beds',
    size: '120 m²',
    bath: '2 Bathrooms',
    price: '$850',
    images: [
      'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1582719478250-c89fee4dc85b?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80'
    ]
  },
  {
    id: 5,
    name: 'Ocean View Room',
    guests: '2 Guests',
    beds: '1 King Bed',
    size: '50 m²',
    bath: '1 Bathroom',
    price: '$380',
    images: [
      'https://images.unsplash.com/photo-1566665797739-1674de7a421a?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80',
      'https://images.unsplash.com/photo-1582719478250-c89fee4dc85b?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80'
    ]
  }
];

function RoomCard({ room }) {
  const navigate = useNavigate();
  const [imgIndex, setImgIndex] = React.useState(0);
  const [isQuickViewOpen, setIsQuickViewOpen] = React.useState(false);

  const nextImg = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setImgIndex((prev) => (prev + 1) % room.images.length);
  };
  
  const prevImg = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setImgIndex((prev) => (prev - 1 + room.images.length) % room.images.length);
  };

  const handleBookNow = () => {
    navigate('/hotel/1/booking');
  };

  return (
    <>
      <div className={styles.HotelRoomList_slideWrapper}>
        <div className={styles.HotelRoomList_roomCard}>
          <div className={styles.HotelRoomList_roomImageWrapper}>
            {room.images.map((img, idx) => (
              <img 
                key={idx}
                src={img} 
                alt={room.name} 
                className={`${styles.HotelRoomList_roomImage} ${idx === imgIndex ? styles.HotelRoomList_imgActive : ''}`} 
              />
            ))}
          
          <button className={`${styles.HotelRoomList_imgNavBtn} ${styles.HotelRoomList_prevBtn}`} onClick={prevImg}>
            <ChevronLeft size={16} />
          </button>
          <button className={`${styles.HotelRoomList_imgNavBtn} ${styles.HotelRoomList_nextBtn}`} onClick={nextImg}>
            <ChevronRight size={16} />
          </button>

          <div className={styles.HotelRoomList_imgDots}>
            {room.images.map((_, idx) => (
              <div key={idx} className={`${styles.HotelRoomList_dot} ${idx === imgIndex ? styles.HotelRoomList_activeDot : ''}`} />
            ))}
          </div>

          <div className={styles.HotelRoomList_imageOverlay}>
            <button className={styles.HotelRoomList_overlayBtn} onClick={() => setIsQuickViewOpen(true)}>Quick View</button>
          </div>
        </div>
        <div className={styles.HotelRoomList_roomInfo}>
          <h3 className={styles.HotelRoomList_roomName}>{room.name}</h3>
          <div className={styles.HotelRoomList_roomMeta}>
            <span className={styles.HotelRoomList_metaItem}><Users size={14} /> {room.guests}</span>
            <span className={styles.HotelRoomList_metaItem}><Bed size={14} /> {room.beds}</span>
            <span className={styles.HotelRoomList_metaItem}><Maximize2 size={14} /> {room.size}</span>
            <span className={styles.HotelRoomList_metaItem}><Bath size={14} /> {room.bath}</span>
          </div>
          <div className={styles.HotelRoomList_roomFooter}>
            <div className={styles.HotelRoomList_priceBox}>
              <span className={styles.HotelRoomList_roomPrice}>{room.price}</span>
              <span className={styles.HotelRoomList_perNight}>/night</span>
            </div>
            <button className={styles.HotelRoomList_selectBtn} onClick={handleBookNow}>Book Now</button>
          </div>
          </div>
        </div>
      </div>
      {isQuickViewOpen && <RoomQuickViewModal room={room} onClose={() => setIsQuickViewOpen(false)} />}
    </>
  );
}

export default function HotelRoomList() {
  const sliderRef = useRef(null);

  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  let slidesToShow = 3;
  if (windowWidth < 640) slidesToShow = 1;
  else if (windowWidth < 768) slidesToShow = 1;
  else if (windowWidth < 1024) slidesToShow = 2;

  const settings = {
    dots: false,
    infinite: true,
    speed: 500,
    slidesToShow: slidesToShow,
    slidesToScroll: 1,
    arrows: false,
  };

  return (
    <div className={styles.HotelRoomList_container}>
      <div className={styles.HotelRoomList_titleRow}>
        <h2 className={styles.HotelRoomList_sectionTitle}>Choose Your Room</h2>
        <div className={styles.HotelRoomList_navButtons}>
          <button className={styles.HotelRoomList_navBtn} onClick={() => sliderRef.current?.slickPrev()} aria-label="Previous">
            <ChevronLeft size={18} />
          </button>
          <button className={styles.HotelRoomList_navBtn} onClick={() => sliderRef.current?.slickNext()} aria-label="Next">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className={styles.HotelRoomList_carouselContainer}>
        <Slider ref={sliderRef} {...settings}>
          {ROOMS.map(room => (
            <RoomCard key={room.id} room={room} />
          ))}
        </Slider>
      </div>

      <div className={styles.HotelRoomList_infoNote}>
        <span className={styles.HotelRoomList_infoIcon}>ℹ️</span>
        All rooms include complimentary breakfast, free Wi-Fi and access to pool & gym.
      </div>
    </div>
  );
}
