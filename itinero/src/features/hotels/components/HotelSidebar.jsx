import React from 'react';
import styles from '../HotelsPage.module.css';

export const HotelSidebar = () => {
  return (
    <div className={styles.sidebar}>
      {/* Let Vero Filter */}
      <div className={styles.veroFilterCard}>
        <div className={styles.veroHeader}>
          <div className={styles.veroAvatar}>
            <img src="/vero-avatar.png" alt="Vero" onError={(e) => { e.target.src = 'https://ui-avatars.com/api/?name=V&background=dfb17f&color=fff' }} />
          </div>
          <div>
            <h3 className={styles.veroTitle}>Let Vero Filter</h3>
            <p className={styles.veroSubtitle}>Vero can make mistakes.</p>
          </div>
        </div>
        
        <div className={styles.veroInputArea}>
          <p className={styles.veroHint}>
            What are you looking for? Try something like:
            <br /><br />
            I want to see beachfront hotels with pool and a restaurant with a high rating.
          </p>
        </div>
        
        <button className={styles.veroFilterBtn}>
          Filter stays
        </button>
      </div>

      {/* Standard Filters */}
      <div className={styles.filtersCard}>
        <div className={styles.filtersHeader}>
          <h3>Filters</h3>
          <button className={styles.clearAllBtn}>Clear All</button>
        </div>
        
        <div className={styles.filterDivider} />

        <div className={styles.filterSection}>
          <h4>Where to stay</h4>
          <label className={styles.filterCheckbox}>
            <input type="checkbox" />
            <span className={styles.checkboxLabel}>Basavanagudi</span>
            <span className={styles.checkboxPrice}>₹ 1,027</span>
          </label>
          <label className={styles.filterCheckbox}>
            <input type="checkbox" />
            <span className={styles.checkboxLabel}>Downtown</span>
            <span className={styles.checkboxPrice}>₹ 379</span>
          </label>
          <label className={styles.filterCheckbox}>
            <input type="checkbox" />
            <span className={styles.checkboxLabel}>Electronic City</span>
            <span className={styles.checkboxPrice}>₹ 511</span>
          </label>
          <label className={styles.filterCheckbox}>
            <input type="checkbox" />
            <span className={styles.checkboxLabel}>Indiranagar</span>
            <span className={styles.checkboxPrice}>₹ 545</span>
          </label>
          <label className={styles.filterCheckbox}>
            <input type="checkbox" />
            <span className={styles.checkboxLabel}>Jayanagar</span>
            <span className={styles.checkboxPrice}>₹ 360</span>
          </label>
          <button className={styles.showMoreBtn}>Show more</button>
        </div>

        <div className={styles.filterDivider} />

        {['Price', 'Freebies', 'Amenities', 'Hotel Class', 'Review score', 'Property type', 'Location'].map((filterTitle) => (
          <React.Fragment key={filterTitle}>
            <div className={styles.filterSectionCollapsed}>
              <h4>{filterTitle}</h4>
              <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 1L5 5L9 1" stroke="#888888" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className={styles.filterDivider} />
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
