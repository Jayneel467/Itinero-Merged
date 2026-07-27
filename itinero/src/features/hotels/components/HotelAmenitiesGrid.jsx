import React, { useState } from 'react';
import { Wifi, Waves, Sparkles, Dumbbell, Utensils, Car, Pill, ConciergeBell, Briefcase, Tv, Coffee, Wind, Shield } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import styles from '../HotelDetailPage.module.css';

const AMENITIES = [
  { icon: Wifi, label: 'Free Wi-Fi' },
  { icon: Waves, label: 'Swimming Pool' },
  { icon: Sparkles, label: 'Spa & Wellness' },
  { icon: Dumbbell, label: 'Fitness Center' },
  { icon: Utensils, label: 'Restaurant' },
  { icon: Utensils, label: 'Free Breakfast' },
  { icon: Car, label: 'Airport Transfer' },
  { icon: Pill, label: 'Pharmacy' },
  { icon: ConciergeBell, label: 'Room Service' },
  { icon: Briefcase, label: 'Business Center' },
];

const ALL_AMENITIES_CATEGORIZED = [
  {
    category: 'Popular Amenities',
    items: [
      { icon: Wifi, label: 'Free High-Speed Wi-Fi' },
      { icon: Waves, label: 'Outdoor Swimming Pool' },
      { icon: Utensils, label: '3 Restaurants on site' },
      { icon: Dumbbell, label: '24-hour Fitness Center' },
    ]
  },
  {
    category: 'Room Features',
    items: [
      { icon: Wind, label: 'Air Conditioning' },
      { icon: Tv, label: 'Flat-screen TV' },
      { icon: Coffee, label: 'Coffee/Tea Maker' },
      { icon: ConciergeBell, label: 'Daily Housekeeping' },
    ]
  },
  {
    category: 'Services',
    items: [
      { icon: Car, label: 'Airport Shuttle (surcharge)' },
      { icon: Briefcase, label: 'Business Center' },
      { icon: Shield, label: '24-hour Front Desk' },
      { icon: Sparkles, label: 'Full-service Spa' },
    ]
  }
];

export default function HotelAmenitiesGrid() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const visibleAmenities = AMENITIES.slice(0, 10);

  return (
    <>
      <div className={styles.HotelAmenitiesGrid_container}>
        <div className={styles.HotelAmenitiesGrid_titleRow}>
          <h2 className={styles.HotelAmenitiesGrid_sectionTitle}>Amenities</h2>
          <button 
            className={styles.HotelAmenitiesGrid_viewAllBtn}
            onClick={() => setIsModalOpen(true)}
          >
            View All
          </button>
        </div>
        <div className={styles.HotelAmenitiesGrid_grid}>
          {visibleAmenities.map((amenity, index) => {
            const Icon = amenity.icon;
            return (
              <div key={index} className={styles.HotelAmenitiesGrid_amenityCard}>
                <div className={styles.HotelAmenitiesGrid_iconCircle}>
                  <Icon size={22} strokeWidth={1.5} />
                </div>
                <span className={styles.HotelAmenitiesGrid_label}>{amenity.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        title="All Hotel Amenities"
      >
        <div className="flex flex-col gap-8 p-6">
          {ALL_AMENITIES_CATEGORIZED.map((category, idx) => (
            <div key={idx}>
              <h3 className="text-lg font-bold text-[#001439] mb-4">{category.category}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {category.items.map((item, itemIdx) => {
                  const Icon = item.icon;
                  return (
                    <div key={itemIdx} className="flex items-center gap-3 text-gray-700">
                      <div className="w-10 h-10 rounded-full bg-[#F97211]/10 text-[#F97211] flex items-center justify-center shrink-0">
                        <Icon size={20} strokeWidth={1.5} />
                      </div>
                      <span className="font-medium text-sm">{item.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
