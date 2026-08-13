import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageLayout } from "@/components/layout";
import SharedFlightSearchBar from "@/components/SharedFlightSearchBar";
import FlightCardDesign from "./FlightCardDesign";
import RouteCompareBar from "./RouteCompareBar";
import SidebarQuickFilter from "./SidebarQuickFilter";
import SidebarPriceGraph from "./SidebarPriceGraph";
import SidebarFilters from "./SidebarFilters";
import PopularRoutesRail from "./PopularRoutesRail";
import useFlightSearch from "./hooks/useFlightSearch";
import { BookingPopup } from "@/features/booking/components";
import { useCurrency } from "@/context/CurrencyContext";
import { useVeroUi } from "@/context/VeroUiContext";
import { buildFlightsPageContext } from "@/features/vero/utils/pageContext";
import { tripService } from "@/features/trips/tripService";
import { LoadingState, ActionButton, ActionRow, FilterDrawer } from "@/components/shared";
import { Star, ArrowDownWideNarrow, ArrowUpNarrowWide, Clock, SlidersHorizontal, X } from "lucide-react";
import styles from "./FlightsPage.module.css";
import { persistSelectedFlight } from "./utils/persistSelectedFlight";
import { stolEmptyHint } from "./utils/stolLocal";

const VERO_PICK_KEY = "itinero_vero_flight_pick";

function airlineNorm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const AIRLINE_ALIASES = {
  akasa: ["akasa", "akasaair", "qp"],
  indigo: ["indigo", "6e"],
  spicejet: ["spicejet", "spice", "sg"],
  airindiaexpress: ["airindiaexpress", "ix"],
  airindia: ["airindia", "ai"],
  vistara: ["vistara", "uk"],
  emirates: ["emirates", "ek"],
  qatar: ["qatar", "qatarairways", "qr"],
  etihad: ["etihad", "ey"],
};

function flightMatchesPick(flight, pick) {
  if (!flight || !pick) return false;
  const offerId = String(flight.offer_id || flight.id || "");
  if (
    pick.offer_id &&
    (offerId === String(pick.offer_id) || String(flight.id) === String(pick.offer_id))
  ) {
    return true;
  }
  const fn = String(flight.flightNumber || "").replace(/\s+/g, "").toUpperCase();
  const wantFn = String(pick.flight_number || pick.flightNumber || "")
    .replace(/\s+/g, "")
    .toUpperCase();
  if (wantFn && fn && (fn === wantFn || fn.includes(wantFn) || wantFn.includes(fn))) {
    return true;
  }
  const qRaw = airlineNorm(pick.airline || pick.query);
  if (!qRaw) return false;
  const name = airlineNorm(flight.airline?.name || flight.airline);
  const code = airlineNorm(flight.airline?.code);
  if (qRaw.includes("airindia") || qRaw === "ai" || qRaw === "ix") {
    const wantExpress = qRaw.includes("express") || qRaw === "ix";
    return wantExpress
      ? name.includes("express") || code === "ix"
      : (name.includes("airindia") && !name.includes("express")) || code === "ai";
  }
  const aliases = new Set([qRaw]);
  Object.entries(AIRLINE_ALIASES).forEach(([canon, list]) => {
    if (qRaw.includes(canon) || list.some((a) => qRaw.includes(a) || a.includes(qRaw))) {
      aliases.add(canon);
      list.forEach((a) => aliases.add(a));
    }
  });
  return [...aliases].some((a) => name.includes(a) || code === a);
}

function pickLabel(flight, airlineHint) {
  const name = flight?.airline?.name || flight?.airline || airlineHint || "this flight";
  const num = flight?.flightNumber ? ` ${flight.flightNumber}` : "";
  return `${name}${num}`.trim();
}

const SORT_OPTIONS = [
  { id: "recommended", label: "Recommended", shortLabel: "Recommended", Icon: Star },
  { id: "cheapest", label: "Price: Low to High", shortLabel: "Low-High", Icon: ArrowUpNarrowWide },
  { id: "price_desc", label: "Price: High to Low", shortLabel: "High-Low", Icon: ArrowDownWideNarrow },
  { id: "fastest", label: "Fastest", shortLabel: "Fastest", Icon: Clock },
];

const SortButton = ({ id, label, shortLabel, Icon, currentSort, onClick }) => {
  const isActive = currentSort === id;
  return (
    <button
      type="button"
      className={isActive ? styles["fl-btn-row3"] : styles["fl-btn-row4"]}
      onClick={() => onClick(id)}
      aria-pressed={isActive}
      title={label}
    >
      <Icon size={16} color={isActive ? "#F97211" : "#888888"} />
      <span className={`${isActive ? styles["fl-text46"] : styles["fl-text47"]} ${styles["fl-sort-full"]}`}>
        {label}
      </span>
      <span className={`${isActive ? styles["fl-text46"] : styles["fl-text47"]} ${styles["fl-sort-short"]}`}>
        {shortLabel}
      </span>
    </button>
  );
};

/**
 * Manual flights results - search bar → POST /api/flights/search → LiteAPI.
 * Vero is optional (floating bot → /vero chat only); search does not use the chat agent.
 */
export default function FlightsPage() {
  const navigate = useNavigate();
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
  const [bookingFlight, setBookingFlight] = useState(null);
  const [resumeHint, setResumeHint] = useState("");
  const [veroPick, setVeroPick] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const resumeHandledRef = useRef("");
  const { currency } = useCurrency();
  const { setPageContext, clearPageContext, setUiActionHandler, isOpen: veroOpen } = useVeroUi();
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
    applyQuickFilter,
    clearQuickFilter,
    isReturnFlow,
    rtStep,
    selectedOutbound,
    selectOutbound,
    selectReturn,
    changeOutbound,
    isResolvingRt,
    routeSummaries,
    activeRouteKey,
    setActiveRouteKey,
  } = useFlightSearch();

  // Resume draft/held trip: after live results load, reopen the matching fare.
  useEffect(() => {
    const resumeTripId = searchParams.get("resumeTrip");
    const resumeOffer = searchParams.get("resumeOffer");
    if (!resumeTripId || isLoading) return;

    const handleKey = `${resumeTripId}|${resumeOffer || ""}|${sessionId || ""}|${filtered.length}`;
    if (resumeHandledRef.current === handleKey) return;

    const trip = tripService.get(resumeTripId);
    const leg = (trip?.legs || []).find((l) => l.type === "flight");
    const wantOffer = String(resumeOffer || leg?.offerId || "").trim();

    if (!trip || !leg) {
      setResumeHint("Couldn't find that saved trip on this device.");
      resumeHandledRef.current = handleKey;
      return;
    }

    if (leg.status === "held" && leg.prebookId) {
      setResumeHint(
        "You had a fare hold - pick the same flight below to continue checkout (holds expire; a fresh search is required)."
      );
    } else if (trip.status === "draft" || trip.status === "held") {
      setResumeHint("Resuming your trip - select your flight below to continue booking.");
    }

    if (!wantOffer) {
      resumeHandledRef.current = handleKey;
      return;
    }

    if (!filtered.length) {
      // Search finished empty or still empty - keep hint, don't loop forever on empty.
      if (!isLoading && (error || message || totalOffers === 0)) {
        resumeHandledRef.current = handleKey;
        setResumeHint(
          (prev) =>
            prev ||
            "No matching fares for this route/date right now. Change the date or search again, then continue booking."
        );
      }
      return;
    }

    const match =
      filtered.find(
        (f) =>
          String(f.offer_id || f.id || "") === wantOffer ||
          String(f.id || "") === wantOffer
      ) || null;

    if (match) {
      setBookingFlight(match);
      setResumeHint(
        leg.prebookId
          ? "Matched your saved fare - continue passenger details and payment."
          : "Matched your saved fare - continue booking."
      );
      resumeHandledRef.current = handleKey;
      // Drop resume query flags so refresh doesn't reopen the modal forever.
      const next = new URLSearchParams(searchParams);
      next.delete("resumeTrip");
      next.delete("resumeOffer");
      setSearchParams(next, { replace: true });
    } else if (!isLoading) {
      setResumeHint(
        "Your saved fare isn't in today's results (prices move). Pick a similar flight to continue this trip."
      );
      resumeHandledRef.current = handleKey;
    }
  }, [
    searchParams,
    setSearchParams,
    isLoading,
    filtered,
    sessionId,
    error,
    message,
    totalOffers,
  ]);

  useEffect(() => {
    setPageContext(
      buildFlightsPageContext({
        search,
        filtered,
        totalOffers,
        isLoading,
        filters,
        sortBy,
        isReturnFlow,
        rtStep,
        currency,
      })
    );
  }, [
    search,
    filtered,
    totalOffers,
    isLoading,
    filters,
    sortBy,
    isReturnFlow,
    rtStep,
    currency,
    setPageContext,
  ]);

  useEffect(() => () => clearPageContext(), [clearPageContext]);

  const applyVeroAction = useCallback(
    async (action) => {
      if (!action?.type) return { ok: false };
      const type = String(action.type);

      if (type === "clear_filters") {
        clearQuickFilter();
        return { ok: true, message: "Filters cleared" };
      }

      if (type === "set_sort") {
        const sort = String(action.sort || action.sortBy || "").toLowerCase();
        const map = {
          cheapest: "cheapest",
          price_asc: "cheapest",
          low: "cheapest",
          price_desc: "price_desc",
          expensive: "price_desc",
          fastest: "fastest",
          recommended: "recommended",
        };
        const next = map[sort];
        if (!next) return { ok: false, message: "Unknown sort." };
        setSortBy(next);
        return { ok: true, message: `Sorted: ${next}` };
      }

      if (type === "set_filters") {
        setFilters((prev) => ({
          ...prev,
          ...(action.airlines ? { airlines: action.airlines } : {}),
          ...(action.stops ? { stops: action.stops } : {}),
          ...(action.maxPrice != null || action.max_price != null
            ? { maxPrice: Number(action.maxPrice ?? action.max_price) }
            : {}),
          ...(action.departureTimes || action.departure_times
            ? { departureTimes: action.departureTimes || action.departure_times }
            : {}),
        }));
        return { ok: true, message: "Filters updated" };
      }

      if (type === "apply_nl_filter") {
        const query = String(action.query || action.text || "").trim();
        const summary = await applyQuickFilter(query);
        requestAnimationFrame(() => {
          document
            .getElementById("flights-results")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        return { ok: true, message: summary || "List updated" };
      }

      if (
        type === "open_offer" ||
        type === "highlight_offer" ||
        type === "select_airline" ||
        type === "select_flight"
      ) {
        const pick = {
          offer_id: action.offerId || action.offer_id || action.flight_id,
          flight_number: action.flight_number || action.flightNumber || action.flight_code,
          airline: action.airline || action.query,
          query: action.query || action.airline,
        };
        try {
          sessionStorage.setItem(VERO_PICK_KEY, JSON.stringify(pick));
        } catch {
          /* ignore */
        }
        const match =
          filtered.find((f) => flightMatchesPick(f, pick)) ||
          (pick.offer_id
            ? filtered.find(
                (f) =>
                  String(f.offer_id || f.id || "") === String(pick.offer_id) ||
                  String(f.id || "") === String(pick.offer_id)
              )
            : null);
        if (!match) {
          return { ok: true, message: "Highlighting that flight when fares load" };
        }
        setVeroPick({ flight: match, label: pickLabel(match, pick.airline) });
        requestAnimationFrame(() => {
          document
            .getElementById(`flight-card-${match.id}`)
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        if (type === "open_offer") setBookingFlight(match);
        return {
          ok: true,
          message: `Highlighted ${pickLabel(match, pick.airline)} on the left`,
        };
      }

      if (type === "open_passenger_details" || type === "proceed_booking") {
        const flight = veroPick?.flight || filtered[0] || null;
        if (!flight) return { ok: false, message: "No flight to continue with yet." };
        persistSelectedFlight(flight);
        setVeroPick({ flight, label: pickLabel(flight, veroPick?.label) });
        navigate("/flights/passenger-info");
        return { ok: true, message: "Passenger details on the left" };
      }

      return { ok: false };
    },
    [applyQuickFilter, clearQuickFilter, setSortBy, setFilters, filtered, veroPick, navigate]
  );

  useEffect(() => {
    setUiActionHandler(applyVeroAction);
    return () => setUiActionHandler(null);
  }, [applyVeroAction, setUiActionHandler]);

  useEffect(() => {
    if (isLoading || !filtered.length) return;
    let pending = null;
    try {
      pending = JSON.parse(sessionStorage.getItem(VERO_PICK_KEY) || "null");
    } catch {
      pending = null;
    }
    if (!pending) return;
    const match = filtered.find((f) => flightMatchesPick(f, pending));
    if (!match) return;
    try {
      sessionStorage.removeItem(VERO_PICK_KEY);
    } catch {
      /* ignore */
    }
    setVeroPick({ flight: match, label: pickLabel(match, pending.airline) });
    requestAnimationFrame(() => {
      document
        .getElementById(`flight-card-${match.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [isLoading, filtered]);

  const stepLabel = isReturnFlow
    ? rtStep === "return"
      ? "Select return flight"
      : "Select departing flight"
    : null;

  const isMultiAirport = Boolean(search.isMultiAirport) && rtStep !== "return";

  const foundLabel = isLoading || isResolvingRt
    ? isResolvingRt
      ? "Confirming round-trip fare…"
      : rtStep === "return"
        ? "Searching return flights…"
        : isMultiAirport
          ? `Comparing ${search.routePairs?.length || 0} routes…`
          : "Searching…"
    : stepLabel
      ? `${stepLabel} · ${filtered.length} options`
      : isMultiAirport && activeRouteKey !== "all"
        ? `${filtered.length} flights on ${
            routeSummaries.find((r) => r.key === activeRouteKey)?.label || "route"
          }`
        : totalOffers > filtered.length
          ? `${filtered.length} of ${totalOffers} Flights`
          : `${filtered.length} Flights Found`;

  const departRouteLabel = selectedOutbound?.routeLabel
    || (selectedOutbound
      ? `${selectedOutbound.routeOrigin || search.origin} → ${selectedOutbound.routeDestination || search.destination}`
      : `${search.origin} → ${search.destination}`);

  const highlightedId = veroPick?.flight ? String(veroPick.flight.id) : "";
  const stolHint = useMemo(
    () => stolEmptyHint(search.origin, search.destination),
    [search.origin, search.destination]
  );
  const displayFlights = useMemo(() => {
    if (!highlightedId) return shown;
    const hit = shown.find((f) => String(f.id) === highlightedId);
    if (!hit) return shown;
    return [hit, ...shown.filter((f) => String(f.id) !== highlightedId)];
  }, [shown, highlightedId]);

  const returnRouteLabel = selectedOutbound
    ? `${selectedOutbound.routeDestination || search.destination} → ${selectedOutbound.routeOrigin || search.origin}`
    : `${search.destination} → ${search.origin}`;

  async function handleCardAction(flight) {
    if (isReturnFlow && rtStep === "outbound") {
      await selectOutbound(flight);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (isReturnFlow && rtStep === "return") {
      const packageFlight = await selectReturn(flight);
      setBookingFlight(packageFlight);
      return;
    }
    setBookingFlight(flight);
  }

  const pageBody = (
      <div className={`${styles["fl-container"]}${veroOpen ? ` ${styles.veroCompact}` : ""}`}>
        <div className={styles["fl-main-layout"]}>
          <div className={styles["fl-hero-section"]}>
            <h1 className={styles["fl-hero-title"]}>Beyond The Clouds</h1>
            <SharedFlightSearchBar />
          </div>

          <div className={styles["fl-row12"]}>
            <aside className={styles["fl-sidebar-column"]}>
              <SidebarPriceGraph
                minPrice={priceBounds.min || null}
                origin={search.origin}
                destination={search.destination}
                departDate={search.departDate}
                returnDate={search.returnDate}
                tripType={search.tripType}
                adults={search.adults}
                children={search.children}
                infants={search.infants}
                cabin={search.cabin}
                enabled={!isLoading}
              />
              <SidebarQuickFilter onFilter={applyQuickFilter} onClear={clearQuickFilter} />
              <SidebarFilters
                priceBounds={priceBounds}
                airlineCounts={airlineCounts}
                stopCounts={stopCounts}
                filters={filters}
                onChange={setFilters}
              />
            </aside>

            <main id="flights-results" className={styles["fl-results-list"]}>
              <PopularRoutesRail
                origin={search.origin}
                originCity={search.originCity || search.fromCity || ""}
                enabled={!isLoading && !isResolvingRt}
              />

              {veroPick?.flight ? (
                <div className={styles["fl-vero-banner"]} role="status">
                  <div>
                    <strong>Vero selected</strong>
                    <span>
                      {veroPick.label}
                      {veroPick.flight.price != null
                        ? ` · ₹${Math.round(Number(veroPick.flight.price)).toLocaleString("en-IN")}`
                        : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      persistSelectedFlight(veroPick.flight);
                      navigate("/flights/passenger-info");
                    }}
                  >
                    Proceed
                  </button>
                </div>
              ) : null}

              {resumeHint ? (
                <div
                  role="status"
                  style={{
                    marginBottom: 16,
                    padding: "12px 16px",
                    borderRadius: 12,
                    background: "#FFF7ED",
                    border: "1px solid #FED7AA",
                    color: "#9A3412",
                    fontSize: 14,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "flex-start",
                  }}
                >
                  <span>{resumeHint}</span>
                  <button
                    type="button"
                    onClick={() => setResumeHint("")}
                    aria-label="Dismiss"
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      color: "#9A3412",
                      fontWeight: 700,
                    }}
                  >
                    ✕
                  </button>
                </div>
              ) : null}

              {isMultiAirport && (
                <RouteCompareBar
                  routes={routeSummaries}
                  activeKey={activeRouteKey}
                  requestedKey={
                    search.requestedOrigin && search.requestedDestination
                      ? `${search.requestedOrigin}-${search.requestedDestination}`
                      : ""
                  }
                  onSelect={(key) => {
                    setActiveRouteKey(key);
                  }}
                  isLoading={isLoading}
                />
              )}

              {!isLoading &&
              isMultiAirport &&
              activeRouteKey === "all" &&
              search.requestedOrigin &&
              !(routeSummaries.find((r) => r.key === `${search.requestedOrigin}-${search.requestedDestination}`)?.count) &&
              totalOffers > 0 ? (
                <div className={styles["fl-hub-banner"]} role="status">
                  <strong>No fares from {search.requestedOrigin} → {search.requestedDestination}</strong>
                  <span>
                    That airport pair has no published through-ticket. If the origin flies to a hub,
                    we pair that feeder with the hub’s long-haul - or compare nearby airports above.
                  </span>
                </div>
              ) : null}

              {isReturnFlow && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 16,
                    padding: "14px 18px",
                    background: "#fff",
                    borderRadius: 14,
                    border: "1px solid #FFE4CC",
                  }}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: rtStep === "outbound" ? "#F97211" : "#12B76A",
                        color: "#fff",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        fontSize: 13,
                      }}
                    >
                      1
                    </span>
                    <span style={{ fontWeight: 700, color: "#001439", fontSize: 14 }}>
                      Depart {departRouteLabel}
                    </span>
                  </div>
                  <span style={{ color: "#D0D5DD" }}>→</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: rtStep === "return" ? "#F97211" : "#E4E7EC",
                        color: rtStep === "return" ? "#fff" : "#667085",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        fontSize: 13,
                      }}
                    >
                      2
                    </span>
                    <span style={{ fontWeight: 700, color: "#001439", fontSize: 14 }}>
                      Return {returnRouteLabel}
                    </span>
                  </div>
                  {selectedOutbound && (
                    <div
                      style={{
                        marginLeft: "auto",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ fontSize: 13, color: "#475467" }}>
                        Departing:{" "}
                        <strong>
                          {selectedOutbound.airline?.name}{" "}
                          {selectedOutbound.departure?.time}
                        </strong>
                      </span>
                      <button
                        type="button"
                        onClick={changeOutbound}
                        style={{
                          border: "1px solid #F97211",
                          background: "#FFF7F0",
                          color: "#EA580C",
                          borderRadius: 8,
                          padding: "6px 12px",
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        Change departing
                      </button>
                    </div>
                  )}
                </div>
              )}

              <header className={styles["fl-row24"]}>
                <span className={styles["fl-text45"]}>
                  {isLoading || isResolvingRt ? (isResolvingRt ? "Confirming fare…" : "Searching…") : foundLabel}
                </span>
                <div className={styles["fl-spacer"]} aria-hidden="true" />

                <div className={styles["fl-sort-buttons"]} role="group" aria-label="Sort flights">
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
                  className={styles["fl-mobile-filter-btn"]}
                  onClick={() => setIsFilterDrawerOpen(true)}
                >
                  <SlidersHorizontal size={16} />
                  <span>Filters</span>
                </button>
              </header>

              {isLoading && (
                <LoadingState
                  title={
                    rtStep === "return"
                      ? "Finding return flights"
                      : isMultiAirport
                        ? "Comparing routes"
                        : "Searching live fares"
                  }
                  message={
                    rtStep === "return"
                      ? "Matching returns for your outbound selection…"
                      : `${search.origin || "-"} → ${search.destination || "-"} · ${search.departDate || "pick a date"}`
                  }
                  skeleton="flight"
                  count={4}
                />
              )}

              {isResolvingRt && (
                <LoadingState
                  title="Confirming round-trip fare"
                  message="Packaging your outbound and return into one bookable offer…"
                  skeleton="flight"
                  count={1}
                />
              )}

              {!isLoading &&
                !error &&
                filtered.length === 0 &&
                totalOffers > 0 &&
                isMultiAirport &&
                activeRouteKey !== "all" && (
                  <div className={styles["fl-empty-route"]} role="status">
                    <p className={styles["fl-empty-route-title"]}>
                      No published fares on{" "}
                      {routeSummaries.find((r) => r.key === activeRouteKey)?.label || activeRouteKey}
                    </p>
                    <p className={styles["fl-empty-route-copy"]}>
                      No live through-ticket on this pair. If the origin feeds a hub, we pair that
                      domestic flight with the hub’s long-haul - or pick another airport below.
                    </p>
                    <div className={styles["fl-empty-route-actions"]}>
                      <button type="button" onClick={() => setActiveRouteKey("all")}>
                        View all {totalOffers} flights
                      </button>
                      {routeSummaries
                        .filter((r) => r.count > 0)
                        .slice(0, 3)
                        .map((r) => (
                          <button
                            key={r.key}
                            type="button"
                            className={styles["fl-empty-route-alt"]}
                            onClick={() => setActiveRouteKey(r.key)}
                          >
                            {r.label}
                            {r.minPrice != null
                              ? ` · from ₹${Math.round(r.minPrice).toLocaleString("en-IN")}`
                              : ""}
                          </button>
                        ))}
                    </div>
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
                  <p style={{ margin: 0, fontWeight: 700, color: "#001439" }}>
                    {stolHint?.title || error}
                  </p>
                  <p style={{ margin: "8px 0 0", fontSize: 13, color: "#667085" }}>
                    {stolHint?.copy || (message && message !== error ? message : null)}
                  </p>
                  {stolHint?.altFrom && stolHint?.altTo ? (
                    <button
                      type="button"
                      onClick={() => {
                        const next = new URLSearchParams(searchParams);
                        next.set("from", stolHint.altFrom);
                        next.set("to", stolHint.altTo);
                        setSearchParams(next);
                      }}
                      style={{
                        marginTop: 16,
                        border: "1px solid #F97211",
                        background: "#FFF7F0",
                        color: "#EA580C",
                        borderRadius: 10,
                        padding: "10px 18px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {stolHint.altLabel}
                    </button>
                  ) : null}
                  {!stolHint &&
                    search.cabin &&
                    search.cabin !== "ECONOMY" && (
                      <div
                        className={styles["fl-empty-route-actions"]}
                        style={{ marginTop: 16, justifyContent: "center" }}
                      >
                        {search.cabin === "FIRST" && (
                          <button
                            type="button"
                            onClick={() => {
                              const next = new URLSearchParams(searchParams);
                              next.set("cabin", "Business");
                              setSearchParams(next);
                            }}
                          >
                            Try Business
                          </button>
                        )}
                        <button
                          type="button"
                          className={styles["fl-empty-route-alt"]}
                          onClick={() => {
                            const next = new URLSearchParams(searchParams);
                            next.set("cabin", "Economy");
                            setSearchParams(next);
                          }}
                        >
                          Try Economy
                        </button>
                      </div>
                    )}
                  {isReturnFlow && rtStep === "return" && (
                    <button
                      type="button"
                      onClick={changeOutbound}
                      style={{
                        marginTop: 16,
                        border: "1px solid #F97211",
                        background: "#FFF7F0",
                        color: "#EA580C",
                        borderRadius: 10,
                        padding: "10px 18px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Change departing flight
                    </button>
                  )}
                </div>
              )}

              <div className={styles["fl-flight-cards-container"]}>
                {!isResolvingRt &&
                  displayFlights.map((flight) => (
                    <FlightCardDesign
                      key={flight.id}
                      flight={flight}
                      styles={styles}
                      highlighted={highlightedId === String(flight.id)}
                      highlightLabel={highlightedId === String(flight.id) ? "Vero selected" : ""}
                      onBookNow={handleCardAction}
                      ctaLabel={
                        isReturnFlow
                          ? rtStep === "outbound"
                            ? "Select"
                            : "Select return"
                          : "Book Now"
                      }
                      hideReturn
                    />
                  ))}
              </div>

              {hasMore && (
                <ActionRow className={styles.loadMoreRow}>
                  <ActionButton variant="soft" pill onClick={showMore} aria-label={`View more flights, ${filtered.length - shown.length} remaining`}>
                    View more
                    <span className={styles.loadMoreCount}>
                      ({filtered.length - shown.length} more)
                    </span>
                  </ActionButton>
                  <ActionButton variant="ghost" pill onClick={showAll} aria-label={`Show all ${filtered.length} flights`}>
                    Show all {filtered.length}
                  </ActionButton>
                </ActionRow>
              )}
            </main>
          </div>
        </div>
      </div>
  );

  const drawers = (
    <>
      <FilterDrawer open={isFilterDrawerOpen} onClose={() => setIsFilterDrawerOpen(false)}>
        <SidebarQuickFilter onFilter={applyQuickFilter} onClear={clearQuickFilter} />
        <SidebarPriceGraph
          minPrice={priceBounds.min || null}
          origin={search.origin}
          destination={search.destination}
          departDate={search.departDate}
          returnDate={search.returnDate}
          tripType={search.tripType}
          adults={search.adults}
          children={search.children}
          infants={search.infants}
          cabin={search.cabin}
          enabled={!isLoading}
        />
        <SidebarFilters
          priceBounds={priceBounds}
          airlineCounts={airlineCounts}
          stopCounts={stopCounts}
          filters={filters}
          onChange={setFilters}
        />
      </FilterDrawer>

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
    </>
  );

  return (
    <PageLayout>
      {pageBody}
      {drawers}
    </PageLayout>
  );
}
