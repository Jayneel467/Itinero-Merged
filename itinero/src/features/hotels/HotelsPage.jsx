import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/layout";
import SharedHotelSearchBar from "@/components/SharedHotelSearchBar/SharedHotelSearchBar";
import { HotelSidebar, EMPTY_FILTERS } from "./components/HotelSidebar";
import { HotelCard } from "./components/HotelCard";
import { HotelMap, hotelCoords } from "./components/HotelMap";
import useHotelSearch from "./hooks/useHotelSearch";
import { useCurrency } from "@/context/CurrencyContext";
import { useVeroUi } from "@/context/VeroUiContext";
import { buildHotelsPageContext } from "@/features/vero/utils/pageContext";
import {
  Star,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Award,
  Building2,
  SlidersHorizontal,
  Map as MapIcon,
  X,
} from "lucide-react";
import api from "@/services/api";
import { ENDPOINTS } from "@/services/endpoints";
import { LoadingState, ActionButton, ActionRow, FilterDrawer } from "@/components/shared";
import styles from "./HotelsPage.module.css";

const SORT_OPTIONS = [
  { id: "recommended", label: "Recommended", shortLabel: "Best", Icon: Star },
  { id: "price_asc", label: "Lowest price", shortLabel: "Low", Icon: ArrowUpNarrowWide },
  { id: "price_desc", label: "Highest price", shortLabel: "High", Icon: ArrowDownWideNarrow },
  { id: "rating", label: "Top rated", shortLabel: "Rated", Icon: Award },
  { id: "stars", label: "Stars", shortLabel: "Stars", Icon: Building2 },
];

function hotelPrice(h) {
  return Number(h.pricePerNight) || Number(h.totalPrice) || 0;
}

function hotelRating(h) {
  return Number(h.rating) || 0;
}

function hotelReviews(h) {
  return Number(h.reviewCount) || 0;
}

function hotelStars(h) {
  return Number(h.stars) || 0;
}

function sortHotels(hotels, sortBy) {
  const arr = [...hotels];
  switch (sortBy) {
    case "price_asc":
      return arr.sort((a, b) => hotelPrice(a) - hotelPrice(b));
    case "price_desc":
      return arr.sort((a, b) => hotelPrice(b) - hotelPrice(a));
    case "rating":
      return arr.sort(
        (a, b) =>
          hotelRating(b) - hotelRating(a) ||
          hotelReviews(b) - hotelReviews(a) ||
          hotelPrice(a) - hotelPrice(b)
      );
    case "stars":
      return arr.sort(
        (a, b) =>
          hotelStars(b) - hotelStars(a) ||
          hotelRating(b) - hotelRating(a) ||
          hotelPrice(a) - hotelPrice(b)
      );
    case "recommended":
    default: {
      const score = (h) =>
        hotelRating(h) * Math.log10(hotelReviews(h) + 10) -
        hotelPrice(h) / 50_000;
      return arr.sort((a, b) => score(b) - score(a) || hotelPrice(a) - hotelPrice(b));
    }
  }
}

function SortButton({ id, label, shortLabel, Icon, currentSort, onClick }) {
  const isActive = currentSort === id;
  return (
    <button
      type="button"
      className={isActive ? styles.sortBtnActive : styles.sortBtnInactive}
      onClick={() => onClick(id)}
      aria-pressed={isActive}
      title={label}
    >
      <Icon size={16} color={isActive ? "#F97211" : "#888888"} />
      <span className={`${isActive ? styles.sortTextActive : styles.sortTextInactive} ${styles.sortLabelFull}`}>
        {label}
      </span>
      <span className={`${isActive ? styles.sortTextActive : styles.sortTextInactive} ${styles.sortLabelShort}`}>
        {shortLabel}
      </span>
    </button>
  );
}

function hotelBlob(h) {
  return [
    h.name,
    h.area,
    h.city,
    h.location,
    h.address,
    h.distance,
    ...(h.tags || []),
    ...(h.amenities || []),
  ]
    .map((x) => String(x || "").toLowerCase())
    .join(" ");
}

function applyHotelFilters(hotels, filters) {
  const maxP = filters.maxPrice;
  const matchIds = new Set((filters.matchIds || []).map(String));

  return hotels.filter((h) => {
    const price = Number(h.pricePerNight) || Number(h.totalPrice) || 0;
    if (h.has_price === false || price <= 0) return false;
    if (maxP != null && price > maxP) return false;

    if (filters.areas?.length) {
      const area = (h.area || h.city || "City center").trim() || "City center";
      if (!filters.areas.includes(area)) return false;
    }

    if (filters.stars?.length) {
      const s = Number(h.stars) || 0;
      if (!filters.stars.includes(s)) return false;
    }

    if (filters.minRating != null) {
      const r = Number(h.rating) || 0;
      if (r < filters.minRating) return false;
    }

    const tags = (h.tags || []).map((t) => String(t).toLowerCase());
    const board = String(h.board || "").toLowerCase();
    if (filters.freeCancellation) {
      const ok =
        tags.some((t) => t.includes("cancel")) ||
        h.freeCancellation === true;
      if (!ok) return false;
    }
    if (filters.breakfast) {
      const ok =
        board.includes("breakfast") ||
        tags.some((t) => t.includes("breakfast")) ||
        h.freeBreakfast === true;
      if (!ok) return false;
    }

    if (matchIds.size) {
      if (!matchIds.has(String(h.id))) {
        // If nearAirport also set, allow airport-looking hotels even outside matchIds
        if (!filters.nearAirport) return false;
        const blob = hotelBlob(h);
        if (!/airport|terminal|aiport|air\s*port/i.test(blob)) return false;
      }
    } else if (filters.nearAirport) {
      const blob = hotelBlob(h);
      const looksAirport =
        /air\s*port|airport|aiport|ariport|airpot|terminal/i.test(blob);
      if (!looksAirport) return false;
    }

    if (filters.keywords?.length) {
      const blob = hotelBlob(h);
      if (!filters.keywords.every((kw) => blob.includes(String(kw).toLowerCase()))) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Hotels / Homes results - live LiteAPI inventory via supervisor (no mock rates).
 * Pass mode="homes" for villas & homestays (LiteAPI hotelTypes filter).
 */
export default function HotelsPage({ mode = "hotels" }) {
  const isHomes = mode === "homes";
  const navigate = useNavigate();
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const {
    hotels,
    isLoading,
    message,
    error,
    geo,
    query,
    total,
    page,
    totalPages,
    setPage,
    sortBy,
    setSortBy,
    categoryLabel,
    runSearch,
  } = useHotelSearch({ category: isHomes ? "homes" : "hotels" });
  const { currency } = useCurrency();
  const { setPageContext, clearPageContext, openVero, setUiActionHandler, isOpen: veroOpen } = useVeroUi();

  // Reset filters when the search city/dates change
  useEffect(() => {
    setFilters({ ...EMPTY_FILTERS });
  }, [query.city, query.checkIn, query.checkOut]);

  const filtered = useMemo(() => {
    const base = applyHotelFilters(hotels, filters);
    return sortHotels(base, sortBy);
  }, [hotels, filters, sortBy]);

  const mapHotels = useMemo(
    () => filtered.filter((h) => hotelCoords(h)),
    [filtered]
  );

  const mapCenter = useMemo(() => {
    if (geo?.latitude != null && geo?.longitude != null) {
      return [geo.latitude, geo.longitude];
    }
    if (query.lat && query.lng) {
      const lat = Number(query.lat);
      const lng = Number(query.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
    }
    return null;
  }, [geo, query.lat, query.lng]);

  const openHotelDeal = useCallback(
    (hotel) => {
      if (!hotel?.id) return;
      const qs = new URLSearchParams();
      if (query?.checkIn) qs.set("checkIn", query.checkIn);
      if (query?.checkOut) qs.set("checkOut", query.checkOut);
      if (query?.adults) qs.set("adults", String(query.adults));
      if (query?.children != null) qs.set("children", String(query.children));
      if (query?.guests) qs.set("guests", String(query.guests));
      if (query?.rooms) qs.set("rooms", String(query.rooms));
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      navigate(`/hotel/${hotel.id}/booking${suffix}`, {
        state: {
          hotel,
          checkIn: query?.checkIn,
          checkOut: query?.checkOut,
          adults: query?.adults,
          children: query?.children,
          guests: query?.guests,
          rooms: query?.rooms,
        },
      });
    },
    [navigate, query]
  );

  useEffect(() => {
    setPageContext(
      buildHotelsPageContext({
        query,
        filtered,
        total,
        isLoading,
        filters,
        currency,
        sortBy,
      })
    );
  }, [
    query,
    filtered,
    total,
    isLoading,
    filters,
    currency,
    sortBy,
    setPageContext,
  ]);

  useEffect(() => () => clearPageContext(), [clearPageContext]);

  const applyHotelVeroFilter = useCallback(
    async (text, ctx = {}) => {
      const q = (text || "").trim();
      if (!q) {
        setFilters({ ...EMPTY_FILTERS });
        return "Filters cleared.";
      }
      try {
        const res = await api.post(ENDPOINTS.VERO.FILTER, {
          domain: "hotels",
          query: q,
          areas: (ctx?.areaFacets || []).map((a) => a.name),
          price_bounds: ctx?.priceBounds || null,
          hotels: hotels.slice(0, 50).map((h) => ({
            id: h.id,
            name: h.name,
            area: h.area,
            location: h.location || h.address,
            city: h.city,
            stars: h.stars,
            pricePerNight: h.pricePerNight || h.totalPrice,
          })),
        });
        const f = res?.filters || {};
        setFilters({
          ...EMPTY_FILTERS,
          areas: f.areas || [],
          stars: f.stars || [],
          minRating: f.minRating ?? null,
          maxPrice: f.maxPrice ?? null,
          freeCancellation: !!f.freeCancellation,
          breakfast: !!f.breakfast,
          nearAirport: !!f.nearAirport,
          keywords: f.keywords || [],
          matchIds: f.matchIds || [],
        });
        if (f.sortBy) setSortBy(f.sortBy);
        return res?.summary || "Applied Vero filter.";
      } catch (err) {
        return err?.message || "Vero filter failed - try again.";
      }
    },
    [hotels]
  );

  useEffect(() => {
    setUiActionHandler(async (action) => {
      if (!action?.type) return { ok: false };
      if (action.type === "clear_filters") {
        setFilters({ ...EMPTY_FILTERS });
        return { ok: true, message: "Filters cleared" };
      }
      if (action.type === "set_sort" && action.sort) {
        setSortBy(String(action.sort));
        return { ok: true, message: `Sorted: ${action.sort}` };
      }
      if (action.type === "apply_nl_filter") {
        const summary = await applyHotelVeroFilter(action.query || action.text || "");
        return { ok: true, message: summary };
      }
      return { ok: false };
    });
    return () => setUiActionHandler(null);
  }, [applyHotelVeroFilter, setUiActionHandler]);

  const sidebar = (
    <HotelSidebar
      hotels={hotels}
      filters={filters}
      onChange={setFilters}
      onAskVero={openVero}
      onVeroFilter={applyHotelVeroFilter}
    />
  );

  const hotelsBody = (
    <div className={`${styles.hotelsContainer}${veroOpen ? ` ${styles.veroCompact}` : ""}`}>
      <div className={`${styles.mainLayout}${showMap ? ` ${styles.mainLayoutMapView}` : ""}`}>
        <div className={styles.heroSection}>
          <h1 className={styles.heroTitle}>
            {isHomes ? "Villas & Homestays" : "Find Your Perfect Stay"}
          </h1>
          <SharedHotelSearchBar mode={isHomes ? "homes" : "hotels"} />
        </div>

        <div className={`${styles.contentRow}${showMap ? ` ${styles.contentRowMapView}` : ""}`}>
          {!showMap ? <aside className={styles.sidebarColumn}>{sidebar}</aside> : null}

          <main className={`${styles.resultsList}${showMap ? ` ${styles.resultsListMapView}` : ""}`}>
            <header className={`${styles.sortToolbar}${showMap ? ` ${styles.sortToolbarMapView}` : ""}`}>
              <span className={styles.resultsCount}>
                {isLoading
                  ? isHomes
                    ? "Searching villas & homes…"
                    : "Searching live rates…"
                  : filtered.length
                    ? total > filtered.length
                      ? `${filtered.length} of ${total} stays`
                      : `${total || filtered.length} stays found`
                    : categoryLabel || (isHomes ? "Villas & Homestays" : "Hotels")}
              </span>
              <div className={styles.spacer} aria-hidden="true" />
              <div className={styles.sortButtons} role="group" aria-label="Sort stays">
                {SORT_OPTIONS.map(({ id, label, shortLabel, Icon }) => (
                  <SortButton
                    key={id}
                    id={id}
                    label={label}
                    shortLabel={shortLabel}
                    Icon={Icon}
                    currentSort={sortBy}
                    onClick={setSortBy}
                  />
                ))}
              </div>
              <button
                type="button"
                className={`${styles.mapButton}${showMap ? ` ${styles.mapButtonActive}` : ""}`}
                onClick={() => setShowMap((v) => !v)}
                aria-pressed={showMap}
                disabled={isLoading || filtered.length === 0}
                title={
                  mapHotels.length
                    ? `Show map (${mapHotels.length} with pins)`
                    : "Show map"
                }
              >
                {showMap ? <X size={16} /> : <MapIcon size={16} />}
                <span className={styles.mapButtonText}>
                  {showMap ? "Hide map" : "Map"}
                </span>
              </button>
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
              <LoadingState
                title={isHomes ? "Searching villas & homes" : "Searching live stays"}
                message={
                  isHomes
                    ? "Filtering apartments, villas, and homestays…"
                    : "Checking live availability for your dates…"
                }
                skeleton="hotel"
                count={4}
              />
            )}

            {!isLoading && filtered.length > 0 && (
              <div
                className={`${styles.contentSplitter}${
                  showMap ? ` ${styles.contentSplitterMap}` : ""
                }`}
              >
                <div
                  className={`${styles.hotelCardsContainer}${
                    showMap ? ` ${styles.hotelCardsContainerMap}` : ""
                  }`}
                >
                  {filtered.map((hotel, idx) => (
                    <HotelCard key={hotel.id} hotel={hotel} searchQuery={query} rank={idx} />
                  ))}
                </div>
                <div
                  className={`${styles.mapViewMap}${
                    showMap ? ` ${styles.mapViewMapVisible}` : ""
                  }`}
                  aria-hidden={!showMap}
                >
                  <HotelMap
                    hotels={filtered}
                    visible={showMap}
                    center={mapCenter}
                    onViewDeal={openHotelDeal}
                  />
                </div>
              </div>
            )}

            {!isLoading && totalPages > 1 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 12,
                  marginTop: 24,
                  marginBottom: 8,
                }}
              >
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 10,
                    border: "1px solid #E4E7EC",
                    background: page <= 1 ? "#F2F4F7" : "#fff",
                    fontWeight: 700,
                    cursor: page <= 1 ? "not-allowed" : "pointer",
                  }}
                >
                  Previous
                </button>
                <span style={{ fontWeight: 700, color: "#001439" }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 10,
                    border: "1px solid #F97316",
                    background: page >= totalPages ? "#F2F4F7" : "#FFF7F0",
                    color: "#EA580C",
                    fontWeight: 700,
                    cursor: page >= totalPages ? "not-allowed" : "pointer",
                  }}
                >
                  Next
                </button>
              </div>
            )}

            {!isLoading && hotels.length > 0 && filtered.length === 0 && (
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
                  No stays match these filters
                </p>
                <button
                  type="button"
                  onClick={() => setFilters({ ...EMPTY_FILTERS })}
                  style={{
                    marginTop: 16,
                    padding: "10px 20px",
                    borderRadius: 10,
                    border: "1px solid #F97316",
                    background: "#FFF7F0",
                    color: "#EA580C",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Clear filters
                </button>
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
                  {message ||
                    (error && !/^http_|^hotel_search_/.test(String(error))
                      ? error
                      : null) ||
                    (isHomes
                      ? "Search a city to see villas and homes."
                      : "Search a city to see live hotel rates.")}
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
                  {error === "hotel_search_unreachable" || /^http_50[234]$/.test(String(error || ""))
                    ? "The booking API on :8000 wasn’t reachable. Hit Retry once it’s up."
                    : query.city
                      ? isHomes
                        ? `No villas or homestays returned for ${query.city}. Try different dates - we never invent stays.`
                        : `No live rates returned for ${query.city}. Try different dates - we never invent stays.`
                      : isHomes
                        ? "Or ask Vero to find apartments and villas for your trip."
                        : "Or ask Vero to plan hotels as part of your trip."}
                </p>
                <ActionRow className={styles.emptyActions}>
                  <ActionButton variant="navy" onClick={() => runSearch()}>
                    Retry search
                  </ActionButton>
                  <ActionButton variant="gradient" onClick={openVero}>
                    Ask Vero
                  </ActionButton>
                </ActionRow>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );

  const filterDrawer = (
    <FilterDrawer open={isFilterDrawerOpen} onClose={() => setIsFilterDrawerOpen(false)} footer={null}>
      {sidebar}
    </FilterDrawer>
  );

  return (
    <PageLayout>
      {hotelsBody}
      {filterDrawer}
    </PageLayout>
  );
}
