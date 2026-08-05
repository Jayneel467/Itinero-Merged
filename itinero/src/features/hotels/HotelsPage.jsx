import React, { useState } from "react";
import { Link } from "react-router-dom";
import { PageLayout } from "@/components/layout";
import SharedHotelSearchBar from "@/components/SharedHotelSearchBar/SharedHotelSearchBar";
import { HotelSidebar } from "./components/HotelSidebar";
import { HotelCard } from "./components/HotelCard";
import useHotelSearch from "./hooks/useHotelSearch";
import { SlidersHorizontal, X } from "lucide-react";
import styles from "./HotelsPage.module.css";

/**
 * Hotels results — live LiteAPI inventory via supervisor (no mock rates).
 */
export default function HotelsPage() {
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const { hotels, isLoading, message, error, query } = useHotelSearch();

  return (
    <PageLayout>
      <div className={styles.hotelsContainer}>
        <div className={styles.mainLayout}>
          <div className={styles.heroSection}>
            <h1 className={styles.heroTitle}>Find Your Perfect Stay</h1>
            <SharedHotelSearchBar />
          </div>

          <div className={styles.contentRow}>
            <aside className={styles.sidebarColumn}>
              <HotelSidebar />
            </aside>

            <main className={styles.resultsList}>
              <header className={styles.sortToolbar}>
                <span className={styles.resultsCount}>
                  {isLoading
                    ? "Searching live rates…"
                    : hotels.length
                      ? `${hotels.length} Stays Found`
                      : "Hotels"}
                </span>
                <div className={styles.spacer} aria-hidden="true" />
                <button
                  type="button"
                  className={styles.mobileFilterBtn}
                  onClick={() => setIsFilterDrawerOpen(true)}
                >
                  <SlidersHorizontal size={16} />
                  <span>Filters</span>
                </button>
              </header>

              {isLoading && (
                <div role="status" style={{ padding: 24, color: "#475467", fontWeight: 600 }}>
                  Checking live LiteAPI availability…
                </div>
              )}

              {!isLoading && hotels.length > 0 && (
                <div className={styles.hotelCardsContainer}>
                  {hotels.map((hotel) => (
                    <HotelCard key={hotel.id} hotel={hotel} searchQuery={query} />
                  ))}
                </div>
              )}

              {!isLoading && hotels.length === 0 && (
                <div
                  role="status"
                  style={{
                    padding: 40,
                    textAlign: "center",
                    background: "#fff",
                    borderRadius: 16,
                    border: "1px dashed #E4E7EC",
                  }}
                >
                  <p style={{ margin: 0, fontWeight: 700, color: "#001439", fontSize: 18 }}>
                    {error || message || "Search a city to see live hotel rates."}
                  </p>
                  <p
                    style={{
                      margin: "12px 0 0",
                      fontSize: 14,
                      color: "#667085",
                      maxWidth: 480,
                      marginLeft: "auto",
                      marginRight: "auto",
                    }}
                  >
                    {query.city
                      ? `No live rates returned for ${query.city}. Try different dates — we never invent stays.`
                      : "Or ask Vero to plan hotels as part of your trip."}
                  </p>
                  <Link
                    to="/vero"
                    style={{
                      display: "inline-block",
                      marginTop: 20,
                      padding: "12px 24px",
                      borderRadius: 12,
                      background: "linear-gradient(90deg,#F97316,#EA580C)",
                      color: "#fff",
                      fontWeight: 700,
                      textDecoration: "none",
                    }}
                  >
                    Ask Vero
                  </Link>
                </div>
              )}
            </main>
          </div>
        </div>
      </div>

      {isFilterDrawerOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            padding: 20,
            overflowY: "auto",
          }}
          onClick={() => setIsFilterDrawerOpen(false)}
        >
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: 15,
              padding: 20,
              marginTop: "auto",
              marginBottom: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 24 }}>Filters</h3>
              <button
                type="button"
                onClick={() => setIsFilterDrawerOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer" }}
              >
                <X size={24} />
              </button>
            </div>
            <HotelSidebar />
          </div>
        </div>
      )}
    </PageLayout>
  );
}
