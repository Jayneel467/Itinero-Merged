import React, { useRef, useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, MapPin } from 'lucide-react';
import SliderImport from 'react-slick';
const Slider = SliderImport.default || SliderImport;
import 'slick-carousel/slick/slick.css';
import 'slick-carousel/slick/slick-theme.css';
import { Modal } from '@/components/ui/Modal';
import styles from '../HotelDetailPage.module.css';

const ATTRACTIONS = [
  { id: 1, name: 'Burj Khalifa', distance: '0.3 Km', category: 'Attractions', image: 'https://images.unsplash.com/photo-1597659840241-37aca114236f?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80' },
  { id: 2, name: 'Dubai Mall', distance: '0.6 Km', category: 'Shopping', image: 'https://images.unsplash.com/photo-1546412414-e1885259563a?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80' },
  { id: 3, name: 'Dubai Fountain', distance: '0.4 Km', category: 'Attractions', image: 'https://images.unsplash.com/photo-1580674285054-bed31e145f59?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80' },
  { id: 4, name: 'City Walk', distance: '2.3 Km', category: 'Shopping', image: 'https://images.unsplash.com/photo-1534430480872-3498386e7856?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80' },
  { id: 5, name: 'Dubai Opera', distance: '0.8 Km', category: 'Entertainment', image: 'https://images.unsplash.com/photo-1626202450510-4e782e4f0dd1?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80' },
  { id: 6, name: 'Museum of the Future', distance: '3.1 Km', category: 'Attractions', image: 'https://images.unsplash.com/photo-1647417435131-030999557b7f?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80' },
  { id: 7, name: 'Zuma Dubai', distance: '1.2 Km', category: 'Restaurants', image: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80' },
  { id: 8, name: 'Atmosphere Grill', distance: '0.3 Km', category: 'Restaurants', image: 'https://images.unsplash.com/photo-1544148103-0773bf10d330?ixlib=rb-4.0.3&auto=format&fit=crop&w=300&q=80' },
];

export default function HotelAttractions() {
  const sliderRef = useRef(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  let slidesToShow = 6;
  if (windowWidth < 480) slidesToShow = 1;
  else if (windowWidth < 640) slidesToShow = 1;
  else if (windowWidth < 768) slidesToShow = 2;
  else if (windowWidth < 1024) slidesToShow = 4;
  else if (windowWidth < 1440) slidesToShow = 5;

  const settings = {
    dots: false,
    infinite: true,
    speed: 500,
    slidesToShow: slidesToShow,
    slidesToScroll: 1,
    arrows: false,
  };

  // Group by category
  const categorizedAttractions = ATTRACTIONS.reduce((acc, curr) => {
    if (!acc[curr.category]) acc[curr.category] = [];
    acc[curr.category].push(curr);
    return acc;
  }, {});

  return (
    <>
      <div className={styles.HotelAttractions_container}>
        <div className={styles.HotelAttractions_titleRow}>
          <h2 className={styles.HotelAttractions_sectionTitle}>Nearby Attractions</h2>
          <div className={styles.HotelAttractions_actions}>
            <div className={styles.HotelAttractions_navButtons}>
              <button className={styles.HotelAttractions_navBtn} onClick={() => sliderRef.current?.slickPrev()} aria-label="Previous">
                <ChevronLeft size={18} />
              </button>
              <button className={styles.HotelAttractions_navBtn} onClick={() => sliderRef.current?.slickNext()} aria-label="Next">
                <ChevronRight size={18} />
              </button>
            </div>
            <button className={styles.HotelAttractions_viewAllBtn} onClick={() => setIsModalOpen(true)}>
              View All
            </button>
          </div>
        </div>

        <div className={styles.HotelAttractions_carouselContainer}>
          <Slider ref={sliderRef} {...settings}>
            {ATTRACTIONS.map((attraction) => (
              <div key={attraction.id} className={styles.HotelAttractions_slideWrapper}>
                <div className={styles.HotelAttractions_card}>
                  <div className={styles.HotelAttractions_imageWrapper}>
                    <img src={attraction.image} alt={attraction.name} className={styles.HotelAttractions_image} />
                  </div>
                  <div className={styles.HotelAttractions_info}>
                    <h4 className={styles.HotelAttractions_name}>{attraction.name}</h4>
                    <span className={styles.HotelAttractions_distance}>{attraction.distance}</span>
                  </div>
                </div>
              </div>
            ))}
          </Slider>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Explore the Area">
        <div className="flex flex-col gap-8 p-6">
          {Object.entries(categorizedAttractions).map(([category, items]) => (
            <div key={category}>
              <h3 className="text-xl font-bold text-[#001439] mb-4 border-b border-gray-100 pb-2">{category}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {items.map((item) => (
                  <div key={item.id} className="flex gap-4 p-3 rounded-[12px] hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100">
                    <img src={item.image} alt={item.name} className="w-16 h-16 rounded-[8px] object-cover shrink-0 shadow-sm" />
                    <div className="flex flex-col justify-center">
                      <h4 className="font-bold text-[#001439] text-sm mb-1">{item.name}</h4>
                      <div className="flex items-center text-gray-500 text-xs">
                        <MapPin size={12} className="mr-1" />
                        {item.distance} away
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
