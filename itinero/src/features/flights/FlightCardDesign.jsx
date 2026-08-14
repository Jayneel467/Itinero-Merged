import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plane, Briefcase, Luggage, ChevronDown, ChevronUp, Heart,
  Wifi, Tv, Wine
} from 'lucide-react';
import { useCurrency } from '@/context/CurrencyContext';
import { layoverBetween } from './utils/mapOffer';
import { formatFlightLabel } from './utils/airlineIdentity';
import { persistSelectedFlight } from './utils/persistSelectedFlight';

const AIRLINE_BRAND_COLORS = {
  emirates: { bg: '#D71921', text: 'E', font: 'serif' },
  etihad: { bg: '#7A6855', text: 'EY', font: 'sans-serif' },
  qatar: { bg: '#5A0B27', text: 'Q', font: 'sans-serif' },
  american: { bg: '#0078D2', text: 'AA', font: 'sans-serif' },
  indigo: { bg: '#002F6C', text: '6E', font: 'sans-serif' },
  default: { bg: '#F97211', text: 'FL', font: 'sans-serif' }
};

/**
 * Renders the airline logo or a colored fallback text logo.
 */
function AirlineLogo({ name, url, styles }) {
  const [hasError, setHasError] = useState(false);
  
  if (hasError || !url) {
    const normalizedName = name.toLowerCase();
    
    // Find matching brand colors or use default
    const brandKey = Object.keys(AIRLINE_BRAND_COLORS).find(key => normalizedName.includes(key));
    const brandConfig = AIRLINE_BRAND_COLORS[brandKey] || AIRLINE_BRAND_COLORS.default;
    
    return (
      <div 
        className={styles["fc-airline-logo-placeholder"]}
        style={{
          backgroundColor: brandConfig.bg,
          fontFamily: brandConfig.font
        }}
      >
        {brandConfig.text}
      </div>
    );
  }
  
  return (
    <img 
      src={url} 
      className={styles["fc-airline-logo"]} 
      alt={`${name} Logo`}
      onError={() => setHasError(true)}
    />
  );
}

/**
 * Connection wait between two live segments.
 */
function LayoverDivider({ fromSeg, toSeg, styles, selfConnect = false }) {
  const lay = layoverBetween(fromSeg, toSeg);
  if (!lay) return null;
  const timeLine = [lay.arriveTime, lay.departTime].filter(Boolean).join(" → ");
  const isLong = lay.minutes != null && lay.minutes >= 8 * 60;
  return (
    <div className={`${styles["fc-layover-wrapper"]}${isLong ? ` ${styles["fc-layover-wrapper--long"]}` : ""}`}>
      <div className={styles["fc-layover-container"]}>
        <span className={isLong ? styles["fc-layover-label-warn"] : styles["fc-layover-label"]}>
          {isLong ? "Long layover" : selfConnect ? "Change of ticket" : "Layover"}
        </span>
        <h3 className={styles["fc-layover-airport"]}>{lay.airport}</h3>
        {lay.durationLabel ? (
          <p className={styles["fc-layover-time"]}>{lay.durationLabel}</p>
        ) : (
          <p className={styles["fc-layover-time-muted"]}>Duration unavailable</p>
        )}
        {timeLine && (
          <p className={styles["fc-layover-duration"]}>
            Arrive {lay.arriveTime || "-"} · Depart {lay.departTime || "-"}
          </p>
        )}
      </div>
    </div>
  );
}

function ConnectionLine({ duration, stopsCount, layoverCodes = [], styles }) {
  const vias = Array.isArray(layoverCodes) ? layoverCodes.filter(Boolean) : [];
  const n = Math.max(0, Number(stopsCount) || vias.length);
  const stopLabel =
    n === 0
      ? "Direct"
      : n === 1
        ? `1 stop${vias[0] ? ` · ${vias[0]}` : ""}`
        : `${n} stops${vias.length ? ` · ${vias.join(" · ")}` : ""}`;

  return (
    <div className={styles["fc-duration-col"]}>
      <span className={styles["fc-duration-text"]}>{duration}</span>
      <div
        className={`${styles["fc-duration-line"]}${n > 0 ? ` ${styles["fc-duration-line--connect"]}` : ""}`}
        aria-hidden="true"
      >
        <span className={styles["fc-duration-endpoint"]} />
        <span className={styles["fc-duration-rail"]}>
          {n > 0 ? <span className={styles["fc-stop-marker"]} /> : null}
        </span>
        <span className={styles["fc-duration-chevron"]} />
      </div>
      <span
        className={`${styles["fc-stops-text"]}${
          n >= 2 ? ` ${styles["fc-stops-text--multi"]}` : n === 1 ? ` ${styles["fc-stops-text--one"]}` : ""
        }`}
      >
        {stopLabel}
      </span>
    </div>
  );
}

function TimeBlock({ time, airport, dayOffset = 0, styles }) {
  return (
    <div className={styles["fc-time-col"]}>
      <h2 className={styles["fc-time"]}>
        {time || "00:00"}
        {dayOffset > 0 ? <sup className={styles["fc-day-plus"]}>+{dayOffset}</sup> : null}
      </h2>
      <p className={styles["fc-airport"]}>{airport || "-"}</p>
    </div>
  );
}

/**
 * Renders a single flight segment (e.g., BOM -> DXB) inside the expanded details.
 */
function FlightSegment({ segment, defaultFlightNumber, styles, amenities = [] }) {
  const flightNumber = segment.flightInfo?.flightNumber || defaultFlightNumber;
  const aircraft = segment.flightInfo?.aircraft || null;
  const airlineName = segment.airline?.name || "";

  return (
    <div className={styles["fc-segment-block"]}>
      <div className={styles["fc-segment-top"]}>
        <div className={styles["fc-segment-col"]}>
          <h4 className={styles["fc-details-section-title"]}>Flight Information</h4>
          <div className={styles["fc-details-route"]}>
            <div className={styles["fc-details-time-block"]}>
              <span className={styles["fc-details-time"]}>{segment.departure?.time}</span>
              <span className={styles["fc-details-airport"]}>{segment.departure?.airport}</span>
              {segment.departure?.date && (
                <span className={styles["fc-details-date"]}>{segment.departure.date}</span>
              )}
            </div>

            <div className={styles["fc-details-duration-wrap"]}>
              <span className={styles["fc-details-duration-text"]}>{segment.duration}</span>
              <div className={styles["fc-details-line"]}>
                <div className={styles["fc-details-line-bar"]}></div>
              </div>
              <span className={styles["fc-details-stops-text"]}>{segment.stops || "Direct"}</span>
            </div>

            <div className={styles["fc-details-time-block"]}>
              <span className={styles["fc-details-time"]}>{segment.arrival?.time}</span>
              <span className={styles["fc-details-airport"]}>{segment.arrival?.airport}</span>
              {segment.arrival?.date && (
                <span className={styles["fc-details-date"]}>{segment.arrival.date}</span>
              )}
            </div>
          </div>
        </div>

        <div className={styles["fc-segment-col"]}>
          <h4 className={styles["fc-details-section-title"]}>Flight & Aircraft</h4>
          <div className={styles["fc-details-aircraft-wrap"]}>
            <div className={styles["fc-details-aircraft-icon"]}>
              <Plane size={28} color="#000" fill="#000" />
            </div>
            <div className={styles["fc-details-aircraft-info"]}>
              <span className={styles["fc-details-aircraft-name"]}>
                {[airlineName, flightNumber].filter(Boolean).join(" ") || "Flight"}
              </span>
              {aircraft && (
                <span className={styles["fc-details-aircraft-type"]}>{aircraft}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={styles["fc-segment-amenities"]}>
        <h4 className={styles["fc-details-section-title"]}>Amenities</h4>
        <div className={styles["fc-details-amenities"]}>
          {amenities.length === 0 && (
            <span className={styles["fc-amenity-label"]}>Not listed in live fare data</span>
          )}
          {amenities.slice(0, 8).map((name) => (
            <div key={name} className={styles["fc-amenity-card"]}>
              <div className={styles["fc-amenity-icon-box"]}>
                {/wifi|wi-fi/i.test(name) ? (
                  <Wifi size={18} color="#000" strokeWidth={2.5} />
                ) : /tv|entertainment|screen|stream/i.test(name) ? (
                  <Tv size={18} color="#000" strokeWidth={2.5} />
                ) : (
                  <Wine size={18} color="#000" strokeWidth={2.5} />
                )}
              </div>
              <span className={styles["fc-amenity-label"]}>{name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Main Flight Card component.
 * Layout structure:
 * - 6 columns: Airline, Departure, Duration Line, Arrival, Baggage, Price & Action.
 * - Expanding details panel with multiple tabs.
 */
export default function FlightCardDesign({
  flight,
  styles,
  onBookNow,
  ctaLabel,
  hideReturn = false,
  highlighted = false,
  highlightLabel = "",
}) {
  const navigate = useNavigate();
  const { formatMoney } = useCurrency();
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('flight');

  const fares = Array.isArray(flight.fares) && flight.fares.length
    ? flight.fares
    : [
        {
          id: String(flight.offer_id || flight.id || "fare-0"),
          offer_id: flight.offer_id || flight.id,
          fare_family: flight.fare_family || null,
          cabin: flight.cabin || null,
          price: flight.price || 0,
          price_base: flight.price_base,
          price_taxes: flight.price_taxes,
          price_fees: flight.price_fees,
          baggage: flight.baggage,
          seats_remaining: flight.seats_remaining,
          refundable: flight.refundable,
          changeable: flight.changeable,
          has_refund_fee: flight.has_refund_fee === true,
          has_change_fee: flight.has_change_fee === true,
          terms_summary: flight.terms_summary,
        },
      ];
  const hasMultiFare = fares.length > 1;
  const [selectedFareId, setSelectedFareId] = useState(fares[0]?.id);

  useEffect(() => {
    setSelectedFareId(fares[0]?.id);
  }, [flight.id, flight.offer_id, fares.length]);

  const selectedFare =
    fares.find((f) => f.id === selectedFareId) || fares[0] || null;

  function realSeatsLeft(value) {
    if (value == null || value === false || value === "") return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0 || n > 500) return null;
    return Math.trunc(n);
  }

  /** Affirmative policy chip only when live terms clearly allow it (no fee / uncertainty). */
  function canShowPolicyTag(fare, kind) {
    if (!fare) return false;
    const allowed = kind === "refund" ? fare.refundable === true : fare.changeable === true;
    if (!allowed) return false;
    if (kind === "refund" && fare.has_refund_fee === true) return false;
    if (kind === "change" && fare.has_change_fee === true) return false;
    const summary = Array.isArray(fare.terms_summary) ? fare.terms_summary : [];
    const uncertain = summary.some((line) =>
      /fees?\s+may\s+vary|fee\s+varies|penalty|with\s+fee/i.test(String(line || ""))
    );
    return !uncertain;
  }

  function fareLabel(fare) {
    return fare?.fare_family || fare?.cabin || "Fare";
  }

  const selectedSeats = realSeatsLeft(selectedFare?.seats_remaining);
  const activeBaggage = selectedFare?.baggage || flight.baggage;

  const airlineName = flight.airline?.name || flight.airline || "Unknown";
  // Prefer full flight label ("6E 2324") - never show only the IATA code when we have a number
  const flightNumber =
    flight.flightNumber ||
    formatFlightLabel(flight.airline?.code, flight.flightNumber) ||
    flight.airline?.code ||
    "N/A";
  const airlineLogo = flight.airline?.logo || flight.logo;
  const isBestValue = flight.badge === "Best Value" || flight.isBestValue;

  const activePrice = selectedFare?.price ?? flight.price ?? 0;
  const formattedPrice = formatMoney(activePrice);
  const currencyCode = flight.currencyCode || flight.currency || "INR";
  const buttonLabel = ctaLabel || "Book Now";

  function flightWithSelectedFare() {
    if (!selectedFare) return flight;
    return {
      ...flight,
      id: selectedFare.offer_id || selectedFare.id || flight.id,
      offer_id: selectedFare.offer_id || selectedFare.id || flight.offer_id,
      price: selectedFare.price,
      price_base: selectedFare.price_base ?? flight.price_base,
      price_taxes: selectedFare.price_taxes ?? flight.price_taxes,
      price_fees: selectedFare.price_fees ?? flight.price_fees,
      fare_family: selectedFare.fare_family || flight.fare_family,
      cabin: selectedFare.cabin || flight.cabin,
      baggage: selectedFare.baggage || flight.baggage,
      seats_remaining: selectedFare.seats_remaining ?? flight.seats_remaining,
      refundable: selectedFare.refundable ?? flight.refundable,
      changeable: selectedFare.changeable ?? flight.changeable,
      terms_summary: selectedFare.terms_summary ?? flight.terms_summary,
    };
  }

  function handleBookNow() {
    const booked = flightWithSelectedFare();
    if (typeof onBookNow === "function") {
      onBookNow(booked);
      return;
    }
    persistSelectedFlight({ ...booked, currencyCode });
    navigate("/flights/passenger-info");
  }

  function openFares() {
    setIsExpanded(true);
    setActiveTab("fare");
  }

  // Tab definitions configuration for the expanded panel
  const TABS = [
    { id: 'flight', label: 'Flight Details' },
    { id: 'fare', label: hasMultiFare ? `Fares (${fares.length})` : 'Fare Details' },
    { id: 'baggage', label: 'Baggage Info' },
    { id: 'cancellation', label: 'Cancellation' },
    { id: 'skywards', label: `${airlineName} Skywards` }
  ];

  const showRouteBadge = Boolean(flight.routeLabel && !flight.legLabel);
  const showLegBadge = Boolean(flight.legLabel);
  const layoverCodes = Array.isArray(flight.layoverCodes) ? flight.layoverCodes : [];
  const carriers = Array.isArray(flight.carriers) && flight.carriers.length
    ? flight.carriers
    : [airlineName].filter(Boolean);
  const isConnecting = (flight.stopsCount || layoverCodes.length) >= 1;
  const isSelfConnect = !!flight.isSelfConnect;
  const showBadgeRow = isBestValue || showRouteBadge || showLegBadge || isConnecting || isSelfConnect;
  const dayOffset = Number(flight.dayOffset) || 0;
  const segmentNos = Array.isArray(flight.segmentFlightNos)
    ? flight.segmentFlightNos.filter(Boolean)
    : [];

  return (
    <article
      id={`flight-card-${flight.id}`}
      className={`${styles["fc-card"]}${highlighted ? ` ${styles["fc-card--vero"]}` : ""}${
        isConnecting ? ` ${styles["fc-card--connect"]}` : ""
      }`}
    >
      {highlighted ? (
        <div className={styles["fc-vero-ribbon"]}>{highlightLabel || "Vero selected"}</div>
      ) : null}
      {showBadgeRow && (
        <div className={styles["fc-badge-row"]}>
          {isBestValue && (
            <span className={styles["fc-badge"]}>Best Value</span>
          )}
          {showRouteBadge && (
            <span className={styles["fc-route-badge"]}>{flight.routeLabel}</span>
          )}
          {isConnecting && layoverCodes.length ? (
            <span className={styles["fc-via-badge"]}>Via {layoverCodes.join(" · ")}</span>
          ) : null}
          {isSelfConnect ? (
            <span className={styles["fc-self-connect-badge"]} title="Separate tickets - you change at the hub">
              2 tickets
            </span>
          ) : null}
          {showLegBadge && (
            <span className={styles["fc-leg-badge"]}>{flight.legLabel}</span>
          )}
        </div>
      )}

      <Heart size={20} color="#B5B5B5" className={styles["fc-heart"]} />

      <div className={styles["fc-main-row"]}>
        
        {/* 1. Airline Info */}
        <div className={styles["fc-airline-col"]}>
          <AirlineLogo name={airlineName} url={airlineLogo} styles={styles} />
          <div className={styles["fc-airline-info"]}>
            <h4 className={styles["fc-airline-name"]}>
              {carriers.length > 1 ? carriers.join(" + ") : airlineName}
            </h4>
            <p className={styles["fc-flight-no"]}>
              {segmentNos.length > 1 ? segmentNos.slice(0, 3).join(" · ") : flightNumber}
            </p>
          </div>
        </div>

        {/* 2,3,4. Flight Schedule (Departure -> Duration -> Arrival) */}
        <div className={styles["fc-legs"]}>
          <div className={styles["fc-schedule-col"]}>
            {flight.returnSummary && !hideReturn ? (
              <span className={styles["fc-leg-label"]}>Depart</span>
            ) : null}
            <TimeBlock
              time={flight.departure?.time}
              airport={flight.departure?.airport}
              styles={styles}
            />
            <ConnectionLine
              duration={flight.duration}
              stopsCount={flight.stopsCount}
              layoverCodes={layoverCodes}
              styles={styles}
            />
            <TimeBlock
              time={flight.arrival?.time}
              airport={flight.arrival?.airport}
              dayOffset={dayOffset}
              styles={styles}
            />
          </div>

          {flight.returnSummary && !hideReturn && (
            <div className={styles["fc-schedule-col"]}>
              <span className={styles["fc-leg-label"]}>Return</span>
              <TimeBlock
                time={flight.returnSummary.departure?.time}
                airport={flight.returnSummary.departure?.airport}
                styles={styles}
              />
              <ConnectionLine
                duration={flight.returnSummary.duration}
                stopsCount={
                  typeof flight.returnSummary.stops === "string" && /direct/i.test(flight.returnSummary.stops)
                    ? 0
                    : Number(String(flight.returnSummary.stops || "").replace(/\D/g, "")) || 0
                }
                layoverCodes={flight.returnLayoverCodes || []}
                styles={styles}
              />
              <TimeBlock
                time={flight.returnSummary.arrival?.time}
                airport={flight.returnSummary.arrival?.airport}
                styles={styles}
              />
            </div>
          )}
        </div>

        {/* 5. Baggage Information - only show what LiteAPI returned for selected fare */}
        <div className={styles["fc-baggage-col"]}>
          {activeBaggage?.cabin ? (
            <div className={styles["fc-baggage-item"]}>
              <Briefcase size={22} color="#000" />
              <div className={styles["fc-baggage-text"]}>
                <span className={styles["fc-baggage-weight"]}>{activeBaggage.cabin}</span>
                <span className={styles["fc-baggage-type"]}>Cabin</span>
              </div>
            </div>
          ) : null}

          {activeBaggage?.checked ? (
            <div className={styles["fc-baggage-item"]}>
              <Luggage size={22} color="#000" />
              <div className={styles["fc-baggage-text"]}>
                <span className={styles["fc-baggage-weight"]}>{activeBaggage.checked}</span>
                <span className={styles["fc-baggage-type"]}>Checked</span>
              </div>
            </div>
          ) : null}

          {!activeBaggage?.cabin && !activeBaggage?.checked && (
            <div className={styles["fc-baggage-item"]}>
              <div className={styles["fc-baggage-text"]}>
                <span className={styles["fc-baggage-type"]}>Baggage TBD</span>
              </div>
            </div>
          )}
        </div>

        {/* 6. Price & Action Buttons */}
        <div className={styles["fc-price-col"]}>
          <div className={styles["fc-price-text"]}>
            {hasMultiFare && (
              <span className={styles["fc-price-from"]}>From&nbsp;</span>
            )}
            <span className={styles["fc-price-amount"]}>{formattedPrice}</span>
            <span className={styles["fc-price-person"]}>&nbsp;/ person</span>
          </div>
          {hasMultiFare && (
            <button
              type="button"
              className={styles["fc-fare-count"]}
              onClick={openFares}
            >
              {fares.length} fare options · {fareLabel(selectedFare)}
            </button>
          )}
          {!hasMultiFare && (selectedFare?.fare_family || selectedFare?.cabin) && (
            <div className={styles["fc-fare-single"]}>{fareLabel(selectedFare)}</div>
          )}
          {selectedSeats != null && (
            <div className={styles["fc-fare-single"]}>
              {selectedSeats} seat{selectedSeats === 1 ? "" : "s"} left
            </div>
          )}
          <div className={styles["fc-price-actions"]}>
            <button
              type="button"
              className={styles["fc-btn-book"]}
              onClick={hasMultiFare && !isExpanded ? openFares : handleBookNow}
            >
              {hasMultiFare && !isExpanded ? "Select fare" : buttonLabel}
            </button>
            <button 
              className={styles["fc-view-details"]}
              onClick={() => setIsExpanded(!isExpanded)}
              aria-expanded={isExpanded}
            >
              View Details 
              {isExpanded ? <ChevronUp size={13} className={styles["fc-chevron"]} /> : <ChevronDown size={13} className={styles["fc-chevron"]} />}
            </button>
          </div>
        </div>
        
      </div>

      {/* Expanded details dropdown panel */}
      {isExpanded && (
        <section className={styles["fc-details-panel"]}>
          <nav className={styles["fc-details-tabs"]}>
            {TABS.map(tab => (
              <button 
                key={tab.id}
                className={`${styles["fc-details-tab"]} ${activeTab === tab.id ? styles["fc-details-tab-active"] : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className={styles["fc-details-panel-body"]}>
            {activeTab === 'flight' && (
              <div className={styles["fc-details-segments-wrapper"]}>
                {flight.hasLayover && flight.segments ? (
                  flight.segments.map((segment, index) => (
                    <React.Fragment key={`seg-${index}`}>
                      <FlightSegment
                        segment={segment}
                        defaultFlightNumber={flightNumber}
                        styles={styles}
                        amenities={flight.amenities || []}
                      />
                      {index < flight.segments.length - 1 && (
                        <LayoverDivider
                          fromSeg={flight.segments[index]}
                          toSeg={flight.segments[index + 1]}
                          styles={styles}
                          selfConnect={isSelfConnect}
                        />
                      )}
                    </React.Fragment>
                  ))
                ) : (
                  <FlightSegment
                    segment={flight}
                    defaultFlightNumber={flightNumber}
                    styles={styles}
                    amenities={flight.amenities || []}
                  />
                )}
              </div>
            )}

            {activeTab === 'fare' && (
              <div className={styles["fc-tab-pane"]}>
                <h4 className={styles["fc-details-section-title"]}>
                  {hasMultiFare ? "Choose a fare" : "Fare Details"}
                </h4>
                <div className={styles["fc-fare-list"]}>
                  {fares.map((fare) => {
                    const selected = fare.id === selectedFareId;
                    const seats = realSeatsLeft(fare.seats_remaining);
                    const bagBits = [
                      fare.baggage?.cabin ? `Cabin ${fare.baggage.cabin}` : null,
                      fare.baggage?.checked ? `Checked ${fare.baggage.checked}` : null,
                    ].filter(Boolean);
                    return (
                      <div
                        key={fare.id}
                        className={`${styles["fc-fare-row"]} ${selected ? styles["fc-fare-row-selected"] : ""}`}
                      >
                        <div className={styles["fc-fare-info"]}>
                          <div className={styles["fc-fare-name"]}>
                            {fareLabel(fare)}
                          </div>
                          <div className={styles["fc-fare-tags"]}>
                            {fare.cabin && (
                              <span className={styles["fc-fare-tag"]}>{fare.cabin}</span>
                            )}
                            {bagBits.length > 0 ? (
                              bagBits.map((t) => (
                                <span key={t} className={styles["fc-fare-tag-green"]}>{t}</span>
                              ))
                            ) : (
                              <span className={styles["fc-fare-tag-muted"]}>Baggage TBD</span>
                            )}
                            {/* Only advertise when live terms clearly allow - omit fees/unknowns/false */}
                            {canShowPolicyTag(fare, "refund") && (
                              <span className={styles["fc-fare-tag"]}>Refundable</span>
                            )}
                            {canShowPolicyTag(fare, "change") && (
                              <span className={styles["fc-fare-tag"]}>Changeable</span>
                            )}
                            {seats != null && (
                              <span className={styles["fc-fare-tag"]}>
                                {seats} seat{seats === 1 ? "" : "s"} left
                              </span>
                            )}
                          </div>
                          {(fare.price_base != null || fare.price_taxes != null) && (
                            <div className={styles["fc-fare-breakdown"]}>
                              {fare.price_base != null && (
                                <span>Base {formatMoney(fare.price_base)}</span>
                              )}
                              {(fare.price_taxes != null || fare.price_fees != null) && (
                                <span>
                                  + taxes {formatMoney(Number(fare.price_taxes || 0) + Number(fare.price_fees || 0))}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className={styles["fc-fare-price"]}>
                          <div className={styles["fc-fare-price-main"]}>{formatMoney(fare.price || 0)}</div>
                          <div className={styles["fc-fare-price-sub"]}>/ person</div>
                        </div>
                        <button
                          type="button"
                          className={selected ? styles["fc-fare-btn-selected"] : styles["fc-fare-btn"]}
                          onClick={() => setSelectedFareId(fare.id)}
                        >
                          {selected ? "Selected" : "Choose"}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className={styles["fc-fare-book-wrap"]}>
                  <button
                    type="button"
                    className={styles["fc-btn-book"]}
                    onClick={handleBookNow}
                  >
                    {buttonLabel} · {formatMoney(activePrice)}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'baggage' && (
              <div className={styles["fc-tab-pane"]}>
                <h4 className={styles["fc-details-section-title"]}>Baggage Allowances</h4>
                {activeBaggage?.cabin && (
                  <p className={styles["fc-tab-text"]}>Cabin: {activeBaggage.cabin}</p>
                )}
                {activeBaggage?.checked && (
                  <p className={styles["fc-tab-text"]}>Checked: {activeBaggage.checked}</p>
                )}
                {!activeBaggage?.cabin && !activeBaggage?.checked && (
                  <p className={styles["fc-tab-text"]}>
                    Baggage allowance wasn’t included in this live fare - confirm at booking.
                  </p>
                )}
                <p className={styles["fc-tab-text"]}>
                  Extra bags and seats (if the airline offers them) appear after you hold the fare -
                  pick them in checkout.
                </p>
              </div>
            )}

            {activeTab === 'cancellation' && (
              <div className={styles["fc-tab-pane"]}>
                <h4 className={styles["fc-details-section-title"]}>Cancellation Policy</h4>
                {(typeof selectedFare?.refundable === "boolean" ||
                  typeof selectedFare?.changeable === "boolean" ||
                  (Array.isArray(selectedFare?.terms_summary) &&
                    selectedFare.terms_summary.length > 0)) ? (
                  <>
                    {typeof selectedFare?.refundable === "boolean" && (
                      <p className={styles["fc-tab-text"]}>
                        {selectedFare.refundable
                          ? "Refundable (per live fare terms)."
                          : "Non-refundable (per live fare terms)."}
                      </p>
                    )}
                    {typeof selectedFare?.changeable === "boolean" && (
                      <p className={styles["fc-tab-text"]}>
                        {selectedFare.changeable
                          ? "Changes allowed (per live fare terms)."
                          : "Changes not allowed (per live fare terms)."}
                      </p>
                    )}
                    {Array.isArray(selectedFare?.terms_summary) &&
                      selectedFare.terms_summary.map((line) => (
                        <p key={line} className={styles["fc-tab-text"]}>
                          {line}
                        </p>
                      ))}
                    <p className={styles["fc-tab-text"]}>
                      Final rules are confirmed by the airline at payment.
                    </p>
                  </>
                ) : (
                  <p className={styles["fc-tab-text"]}>
                    Cancellation terms aren’t returned in the live fare feed. The airline confirms rules at payment.
                  </p>
                )}
              </div>
            )}

            {activeTab === 'skywards' && (
              <div className={styles["fc-tab-pane"]}>
                <h4 className={styles["fc-details-section-title"]}>{airlineName} loyalty</h4>
                <p className={styles["fc-tab-text"]}>
                  Loyalty / miles details aren’t included in this live fare.
                </p>
              </div>
            )}
          </div>
        </section>
      )}
    </article>
  );
}
