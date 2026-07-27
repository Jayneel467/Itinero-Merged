import React, { useState } from "react";
import { PageLayout } from "@/components/layout";
import { FloatingVeroBot } from "@/components/shared";
import SharedFlightSearchBar from "@/components/SharedFlightSearchBar";
import FlightCardDesign from "./FlightCardDesign";
import DateSlider from "./DateSlider";
import SidebarQuickFilter from "./SidebarQuickFilter";
import SidebarPriceGraph from "./SidebarPriceGraph";
import SidebarFilters from "./SidebarFilters";
import useFlightSearch from "./hooks/useFlightSearch";
import usePriceCalendar from "./hooks/usePriceCalendar";
import { BookingPopup } from "@/features/booking/components";
import { Star, IndianRupee, Clock, ChevronDown, SlidersHorizontal, X } from "lucide-react";
import styles from "./FlightsPage.module.css";

const SortButton = ({ id, label, Icon, currentSort, onClick }) => {
  const isActive = currentSort === id;
  return (
    <button
      type="button"
      className={isActive ? styles["fl-btn-row3"] : styles["fl-btn-row4"]}
      onClick={() => onClick(id)}
      aria-pressed={isActive}
    >
      <Icon size={16} color={isActive ? "#F97211" : "#888888"} />
      <span className={isActive ? styles["fl-text46"] : styles["fl-text47"]}>{label}</span>
    </button>
  );
};

/**
 * Manual flights results — search bar → POST /api/flights/search → LiteAPI.
 * Vero is optional (floating bot → /vero chat only); search does not use the chat agent.
 */
export default function FlightsPage() {
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [bookingFlight, setBookingFlight] = useState(null);
  const {
    search,
    filtered,
    shown,
    totalOffers,
    isLoading,
    message,
    error,
    sessionId,
    sortBy,
    setSortBy,
    hasMore,
    showMore,
    showAll,
    filters,
    setFilters,
    priceBounds,
    airlineCounts,
    stopCounts,
    changeDepartDate,
    applyQuickFilter,
  } = useFlightSearch();

  const { pricesByDate, isDateLoading, ensureMonthPrices } = usePriceCalendar({
    origin: search.origin,
    destination: search.destination,
    departDate: search.departDate,
    returnDate: search.returnDate,
    tripType: search.tripType,
    adults: search.adults,
    children: search.children,
    infants: search.infants,
    cabin: search.cabin,
    seedPrice: !isLoading && priceBounds.min > 0 ? priceBounds.min : null,
  });

  const foundLabel =
    totalOffers > filtered.length
      ? `${filtered.length} of ${totalOffers} Flights`
      : `${filtered.length} Flights Found`;

  return (
    <PageLayout>
      <div className={styles["fl-container"]}>
        <div className={styles["fl-main-layout"]}>
          <div className={styles["fl-hero-section"]}>
            <h1 className={styles["fl-hero-title"]}>Beyond The Clouds</h1>
            <SharedFlightSearchBar />
          </div>

          <DateSlider
            departDate={search.departDate}
            onSelectDate={changeDepartDate}
            pricesByDate={pricesByDate}
            isDateLoading={isDateLoading}
            ensureMonthPrices={ensureMonthPrices}
            origin={search.origin}
            destination={search.destination}
          />

          <div className={styles["fl-row12"]}>
            <aside className={styles["fl-sidebar-column"]}>
              <SidebarQuickFilter onFilter={applyQuickFilter} />
              <SidebarPriceGraph minPrice={priceBounds.min || null} />
              <SidebarFilters
                priceBounds={priceBounds}
                airlineCounts={airlineCounts}
                stopCounts={stopCounts}
                filters={filters}
                onChange={setFilters}
              />
            </aside>

            <main className={styles["fl-results-list"]}>
              <header className={styles["fl-row24"]}>
                <span className={styles["fl-text45"]}>{isLoading ? "Searching…" : foundLabel}</span>
                <div className={styles["fl-spacer"]} aria-hidden="true" />

                <SortButton
                  id="recommended"
                  label="Recommended"
                  Icon={Star}
                  currentSort={sortBy}
                  onClick={setSortBy}
                />
                <SortButton
                  id="cheapest"
                  label="Cheapest"
                  Icon={IndianRupee}
                  currentSort={sortBy}
                  onClick={setSortBy}
                />
                <SortButton
                  id="fastest"
                  label="Fastest"
                  Icon={Clock}
                  currentSort={sortBy}
                  onClick={setSortBy}
                />

                <button type="button" className={styles["fl-btn-row6"]} disabled>
                  <span className={styles["fl-text47"]}>Sort by</span>
                  <ChevronDown size={16} color="#888888" />
                </button>

                <button
                  type="button"
                  className={styles["fl-mobile-filter-btn"]}
                  onClick={() => setIsFilterDrawerOpen(true)}
                >
                  <SlidersHorizontal size={16} />
                  <span>Filters</span>
                </button>
              </header>

              {isLoading && (
                <div
                  role="status"
                  aria-live="polite"
                  style={{ padding: 24, color: "#475467", fontWeight: 600 }}
                >
                  Searching live fares… hang tight.
                </div>
              )}

              {!isLoading && error && filtered.length === 0 && (
                <div
                  role="alert"
                  style={{
                    padding: 32,
                    textAlign: "center",
                    background: "#fff",
                    borderRadius: 16,
                    border: "1px dashed #E4E7EC",
                  }}
                >
                  <p style={{ margin: 0, fontWeight: 700, color: "#001439" }}>{error}</p>
                  {message && message !== error && (
                    <p style={{ margin: "8px 0 0", fontSize: 13, color: "#667085" }}>{message}</p>
                  )}
                  <p style={{ margin: "16px 0 0", fontSize: 13, color: "#667085" }}>
                    Tip: try another date, or confirm the flight search API is running at{" "}
                    <code style={{ fontSize: 12 }}>http://127.0.0.1:8000</code>.
                  </p>
                </div>
              )}

              <div className={styles["fl-flight-cards-container"]}>
                {shown.map((flight) => (
                  <FlightCardDesign
                    key={flight.id}
                    flight={flight}
                    styles={styles}
                    onBookNow={setBookingFlight}
                  />
                ))}
              </div>

              {hasMore && (
                <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 20 }}>
                  <button
                    type="button"
                    onClick={showMore}
                    aria-label={`View more flights, ${filtered.length - shown.length} remaining`}
                    style={{
                      borderRadius: 50,
                      border: "1px solid #FFD9BF",
                      background: "#FFF7F0",
                      padding: "12px 28px",
                      fontWeight: 700,
                      color: "#E65C00",
                      cursor: "pointer",
                      minHeight: 44,
                    }}
                  >
                    View more
                    <span style={{ fontWeight: 500, color: "#F79A5B", marginLeft: 6 }}>
                      ({filtered.length - shown.length} more)
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={showAll}
                    aria-label={`Show all ${filtered.length} flights`}
                    style={{
                      borderRadius: 50,
                      border: "1px solid #E4E7EC",
                      background: "#fff",
                      padding: "12px 28px",
                      fontWeight: 700,
                      color: "#001439",
                      cursor: "pointer",
                      minHeight: 44,
                    }}
                  >
                    Show all {filtered.length}
                  </button>
                </div>
              )}
            </main>
          </div>
        </div>
      </div>

      {isFilterDrawerOpen && (
        <div
          className={styles["filter-drawer-overlay"]}
          onClick={() => setIsFilterDrawerOpen(false)}
        >
          <div className={styles["filter-drawer"]} onClick={(e) => e.stopPropagation()}>
            <div className={styles["filter-drawer-header"]}>
              <h3 className={styles["filter-drawer-title"]}>Filters</h3>
              <button
                type="button"
                className={styles["filter-drawer-close"]}
                onClick={() => setIsFilterDrawerOpen(false)}
              >
                <X size={22} />
              </button>
            </div>
            <div className={styles["filter-drawer-body"]}>
              <SidebarQuickFilter onFilter={applyQuickFilter} />
              <SidebarPriceGraph minPrice={priceBounds.min || null} />
              <SidebarFilters
                priceBounds={priceBounds}
                airlineCounts={airlineCounts}
                stopCounts={stopCounts}
                filters={filters}
                onChange={setFilters}
              />
            </div>
            <div className={styles["filter-drawer-footer"]}>
              <button
                type="button"
                className={styles["filter-drawer-apply"]}
                onClick={() => setIsFilterDrawerOpen(false)}
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Optional entry to Vero chat — does not affect manual search */}
      <FloatingVeroBot />

      <BookingPopup
        isOpen={!!bookingFlight}
        onClose={() => setBookingFlight(null)}
        flight={bookingFlight}
        sessionId={sessionId}
        adults={search.adults}
        childrenCount={search.children}
        infants={search.infants}
        origin={search.origin}
        destination={search.destination}
      />
    </PageLayout>
  );
}
