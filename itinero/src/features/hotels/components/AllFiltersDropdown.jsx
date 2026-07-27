import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import styles from './AllFiltersDropdown.module.css';

const CATEGORIES = [
  'Where to stay',
  'Price',
  'Freebies',
  'Amenities',
  'Hotel class',
  'Review scope',
  'Property type',
  'Location',
  'Hotel chain',
  'style',
  'Exclusive deals',
  'Property name',
  'Booking sites'
];

const LOCATIONS = [
  { id: 'basavanagudi', title: 'Basavanagudi', subtitle: 'Heritage lanes, leafy parks, street snacks, temple bells.', price: '₹1,292' },
  { id: 'downtown', title: 'Downtown', subtitle: 'Tech buzz fades into sizzling dosa carts', price: '₹628' },
  { id: 'electronic', title: 'Electronic City', subtitle: 'Tech campus glow, humming servers, modern eateries, bright lights.', price: '₹662' },
  { id: 'indiranagar', title: 'Indiranagar', subtitle: 'Energetic lanes, craft brews, neon nights, scent of masala.', price: '₹1,252' },
  { id: 'jayanagar', title: 'Jayanagar', subtitle: 'Old-school markets, shaded streets, coffee, bicycle buzz.', price: '₹566' },
  { id: 'kammanahalli', title: 'Kammanahalli', subtitle: 'Bohemian cafes, vibrant eateries, music, fragrant street food.', price: '₹1,586' }
];

export const AllFiltersDropdown = ({ isOpen, onClose }) => {
  const [activeCategory, setActiveCategory] = useState('Where to stay');
  const [selectedLocations, setSelectedLocations] = useState([]);

  if (!isOpen) return null;

  const toggleLocation = (id) => {
    setSelectedLocations(prev => 
      prev.includes(id) ? prev.filter(loc => loc !== id) : [...prev, id]
    );
  };

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.dropdownContainer}>
        
        {/* Left Sidebar */}
        <div className={styles.sidebar}>
          {CATEGORIES.map(category => (
            <button
              key={category}
              className={`${styles.categoryBtn} ${activeCategory === category ? styles.categoryBtnActive : ''}`}
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Right Content */}
        <div className={styles.contentArea}>
          <div className={styles.header}>
            <h2>All filters</h2>
          </div>
          
          <div className={styles.scrollContent}>
            
            {/* Where to stay section */}
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Where to stay</h3>
              <div className={styles.actionLinks}>
                <button className={styles.textLink}>Select All</button>
                <span className={styles.divider}>|</span>
                <button className={styles.textLink}>Clear All</button>
              </div>

              <div className={styles.locationsList}>
                {LOCATIONS.map(loc => (
                  <label key={loc.id} className={styles.checkboxItem}>
                    <div className={styles.checkboxWrapper}>
                      <input 
                        type="checkbox" 
                        checked={selectedLocations.includes(loc.id)}
                        onChange={() => toggleLocation(loc.id)}
                      />
                      <span className={styles.checkmark}></span>
                    </div>
                    <div className={styles.itemText}>
                      <span className={styles.itemTitle}>{loc.title}</span>
                      <span className={styles.itemSubtitle}>{loc.subtitle}</span>
                    </div>
                    <span className={styles.itemPrice}>{loc.price}</span>
                  </label>
                ))}
              </div>
              <button className={styles.showMoreBtn}>Show more</button>
            </div>

            <hr className={styles.sectionDivider} />

            {/* Price section */}
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Price</h3>
              <button className={styles.dropdownSelectBtn}>
                Nightly total - Include all taxes + fees
                <ChevronDown size={16} />
              </button>
            </div>

          </div>

          {/* Footer Actions */}
          <div className={styles.footer}>
            <button className={styles.resetBtn} onClick={() => setSelectedLocations([])}>Reset</button>
            <button className={styles.applyBtn} onClick={onClose}>Apply</button>
          </div>
        </div>

      </div>
    </>
  );
};
