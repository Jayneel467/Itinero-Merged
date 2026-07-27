import React, { useState } from 'react';
import { SlidersHorizontal, ChevronDown } from 'lucide-react';
import styles from './HorizontalFilters.module.css';
import { AllFiltersDropdown } from './AllFiltersDropdown';

export const HorizontalFilters = () => {
  const [isAllFiltersOpen, setIsAllFiltersOpen] = useState(false);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div className={styles.filtersContainer}>
        <button 
          className={`${styles.filterBtn} ${isAllFiltersOpen ? styles.filterBtnActive : ''}`}
          onClick={() => setIsAllFiltersOpen(!isAllFiltersOpen)}
        >
          <SlidersHorizontal size={14} />
          Filters
        </button>
        
        <button className={styles.filterBtn}>
          <span className={styles.sparkleIcon}>✨</span>
          Smart Filter
        </button>

        <button className={styles.filterDropdown}>
          Price
          <ChevronDown size={14} />
        </button>

        <button className={styles.filterDropdown}>
          Freebies
          <ChevronDown size={14} />
        </button>

        <button className={styles.filterDropdown}>
          Amenities
          <ChevronDown size={14} />
        </button>

        <button className={styles.filterDropdown}>
          Hotel class
          <ChevronDown size={14} />
        </button>

        <button className={styles.filterDropdown}>
          Review score
          <ChevronDown size={14} />
        </button>
      </div>

      <AllFiltersDropdown 
        isOpen={isAllFiltersOpen} 
        onClose={() => setIsAllFiltersOpen(false)} 
      />
    </div>
  );
};
