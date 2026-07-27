import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import styles from '../HotelDetailPage.module.css';

export default function HotelAbout() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className={styles.HotelAbout_aboutContainer}>
      <h2 className={styles.HotelAbout_sectionTitle}>About This Hotel</h2>
      <div className={`relative transition-all duration-300 overflow-hidden ${isExpanded ? 'max-h-[1000px]' : 'max-h-[120px]'}`}>
        <p className={styles.HotelAbout_description}>
          Experience luxury like never before at Address Downtown Dubai. Enjoy breathtaking views of Burj Khalifa, world-class dining and unmatched hospitality in the heart of the city. 
          Situated only a few steps away from The Dubai Mall, this award-winning destination is perfect for business, leisure, and everything in between.
          <br /><br />
          Our hotel features an award-winning spa, a state-of-the-art fitness center, and a spectacular infinity pool overlooking the Dubai Fountain. Whether you are visiting for business or leisure, Address Downtown offers the perfect blend of elegance, comfort, and convenience. 
          <br /><br />
          Guests can enjoy a variety of dining experiences across our signature restaurants, from authentic Asian flavors to modern Mediterranean cuisine. With dedicated concierge services and luxurious room amenities, your stay will be nothing short of extraordinary.
        </p>
        
        {/* Gradient fade when collapsed */}
        {!isExpanded && (
          <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white to-transparent pointer-events-none"></div>
        )}
      </div>
      <button 
        className={`${styles.HotelAbout_readMoreBtn} mt-2 flex items-center font-bold text-[#F97211] hover:text-[#E86A10] transition-colors`} 
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? 'Read Less' : 'Read More'} 
        {isExpanded ? <ChevronUp size={16} className="ml-1" /> : <ChevronDown size={16} className="ml-1" />}
      </button>
    </div>
  );
}
