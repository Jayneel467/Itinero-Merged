import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import PageLayout from '@/components/layout/PageLayout';
import styles from './HotelDetailPage.module.css';
import HotelDetailHero from './components/HotelDetailHero';
import HotelAbout from './components/HotelAbout';
import HotelAmenitiesGrid from './components/HotelAmenitiesGrid';
import HotelRoomList from './components/HotelRoomList';
import HotelReviews from './components/HotelReviews';
import HotelAttractions from './components/HotelAttractions';
import HotelBookingCard from './components/HotelBookingCard';
import HotelPriceIncludes from './components/HotelPriceIncludes';
import HotelLocationMap from './components/HotelLocationMap';
import HotelHelpCard from './components/HotelHelpCard';

export default function HotelDetailPage() {
  const { id } = useParams();

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <PageLayout>
      <div className={styles.pageContainer}>
        <div className={styles.mainLayout}>
          {/* Hero Section */}
          <div className={styles.heroSection}>
            <HotelDetailHero />
          </div>

          <div className={styles.contentGrid}>
            {/* Left Column - Main Content */}
            <div className={styles.mainColumn}>
              <section className={styles.section}>
                <HotelAbout />
              </section>

              <section className={styles.section}>
                <HotelAmenitiesGrid />
              </section>

              <section className={styles.section}>
                <HotelRoomList />
              </section>

              <section className={styles.section}>
                <HotelReviews />
              </section>

              <section className={styles.section}>
                <HotelAttractions />
              </section>
            </div>

            {/* Right Column - Sidebar */}
            <div className={styles.sidebarColumn}>
              <div className={styles.stickySidebar}>
                <HotelBookingCard />
                <HotelPriceIncludes />
                <HotelLocationMap />
                <HotelHelpCard />
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
