import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plane, Briefcase, Luggage, ChevronDown, ChevronUp, Heart,
  Wifi, Tv, Wine
} from 'lucide-react';

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
 * Renders a single flight segment (e.g., BOM -> DXB) inside the expanded details.
 */
function FlightSegment({ segment, defaultFlightNumber, styles, amenities = [] }) {
  const flightNumber = segment.flightInfo?.flightNumber || defaultFlightNumber;
  const aircraft = segment.flightInfo?.aircraft || null;
  const airlineName = segment.airline?.name || "";

  return (
    <React.Fragment>
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

      <div className={styles["fc-segment-divider"]} />

      <div className={styles["fc-segment-col"]}>
        <h4 className={styles["fc-details-section-title"]}>Flight & Aircraft</h4>
        <div className={styles["fc-details-aircraft-wrap"]}>
          <div className={styles["fc-details-aircraft-icon"]}>
            <Plane size={32} color="#000" fill="#000" />
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

      <div className={styles["fc-segment-divider"]} />

      <div className={styles["fc-segment-col"]}>
        <h4 className={styles["fc-details-section-title"]}>Amenities</h4>
        <div className={styles["fc-details-amenities"]}>
          {amenities.length === 0 && (
            <span className={styles["fc-amenity-label"]}>Not listed in live fare data</span>
          )}
          {amenities.slice(0, 6).map((name) => (
            <div key={name} className={styles["fc-amenity-card"]}>
              <div className={styles["fc-amenity-icon-box"]}>
                {/wifi|wi-fi/i.test(name) ? (
                  <Wifi size={24} color="#000" strokeWidth={2.5} />
                ) : /tv|entertainment|screen/i.test(name) ? (
                  <Tv size={24} color="#000" strokeWidth={2.5} />
                ) : (
                  <Wine size={24} color="#000" strokeWidth={2.5} />
                )}
              </div>
              <span className={styles["fc-amenity-label"]}>{name}</span>
            </div>
          ))}
        </div>
      </div>
    </React.Fragment>
  );
}

/**
 * Main Flight Card component.
 * Layout structure:
 * - 6 columns: Airline, Departure, Duration Line, Arrival, Baggage, Price & Action.
 * - Expanding details panel with multiple tabs.
 */
export default function FlightCardDesign({ flight, styles, onBookNow }) {
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState('flight');
  
  const airlineName = flight.airline?.name || flight.airline || "Unknown";
  const flightNumber = flight.airline?.code || flight.flightNumber || "N/A";
  const airlineLogo = flight.airline?.logo || flight.logo;
  const isBestValue = flight.badge === "Best Value" || flight.isBestValue;
  
  const formattedPrice = flight.price ? flight.price.toLocaleString('en-IN') : "0";

  function handleBookNow() {
    if (typeof onBookNow === "function") {
      onBookNow(flight);
      return;
    }
    try {
      sessionStorage.setItem(
        "itinero_selected_flight",
        JSON.stringify({
          id: flight.id,
          offerId: flight.offer_id || flight.offerId || flight.id,
          price: flight.price,
          currency: flight.currency,
          airline: flight.airline,
          departure: flight.departure,
          arrival: flight.arrival,
          duration: flight.duration,
          stops: flight.stops,
        })
      );
    } catch {
      /* ignore quota */
    }
    navigate("/flights/passenger-info");
  }

  // Tab definitions configuration for the expanded panel
  const TABS = [
    { id: 'flight', label: 'Flight Details' },
    { id: 'fare', label: 'Fare Details' },
    { id: 'baggage', label: 'Baggage Info' },
    { id: 'cancellation', label: 'Cancellation' },
    { id: 'skywards', label: `${airlineName} Skywards` }
  ];

  return (
    <article className={styles["fc-card"]}>
      {isBestValue && (
        <div className={styles["fc-badge"]}>
          Best Value
        </div>
      )}
      
      <Heart size={20} color="#B5B5B5" className={styles["fc-heart"]} />

      <div className={styles["fc-main-row"]}>
        
        {/* 1. Airline Info */}
        <div className={styles["fc-airline-col"]}>
          <AirlineLogo name={airlineName} url={airlineLogo} styles={styles} />
          <div className={styles["fc-airline-info"]}>
            <h4 
              className={styles["fc-airline-name"]} 
              onClick={() => navigate('/flights/overview')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  navigate('/flights/overview');
                }
              }}
            >
              {airlineName}
            </h4>
            <p className={styles["fc-flight-no"]}>{flightNumber}</p>
          </div>
        </div>

        {/* 2,3,4. Flight Schedule (Departure -> Duration -> Arrival) */}
        <div className={styles["fc-schedule-col"]}>
          <div className={styles["fc-time-col"]}>
            <h2 className={styles["fc-time"]}>{flight.departure?.time || "00:00"}</h2>
            <p className={styles["fc-airport"]}>{flight.departure?.airport || "AAA"}</p>
          </div>

          <div className={styles["fc-duration-col"]}>
            <span className={styles["fc-duration-text"]}>{flight.duration}</span>
            <div className={styles["fc-duration-line"]}>
              <div className={styles["fc-duration-line-center"]}></div>
            </div>
            <span className={styles["fc-stops-text"]}>{flight.stops || "Direct"}</span>
          </div>

          <div className={styles["fc-time-col"]}>
            <h2 className={styles["fc-time"]}>{flight.arrival?.time || "00:00"}</h2>
            <p className={styles["fc-airport"]}>{flight.arrival?.airport || "BBB"}</p>
          </div>
        </div>

        {/* 5. Baggage Information — only show what LiteAPI returned */}
        <div className={styles["fc-baggage-col"]}>
          {flight.baggage?.cabin ? (
            <div className={styles["fc-baggage-item"]}>
              <Briefcase size={28} color="#000" />
              <div>
                <span className={styles["fc-baggage-weight"]}>{flight.baggage.cabin}</span>
                <span className={styles["fc-baggage-type"]}>Cabin</span>
              </div>
            </div>
          ) : null}

          {flight.baggage?.checked ? (
            <div className={styles["fc-baggage-item"]}>
              <Luggage size={28} color="#000" />
              <div>
                <span className={styles["fc-baggage-weight"]}>{flight.baggage.checked}</span>
                <span className={styles["fc-baggage-type"]}>Checked</span>
              </div>
            </div>
          ) : null}

          {!flight.baggage?.cabin && !flight.baggage?.checked && (
            <div className={styles["fc-baggage-item"]}>
              <div>
                <span className={styles["fc-baggage-type"]}>Baggage TBD</span>
              </div>
            </div>
          )}
        </div>

        {/* 6. Price & Action Buttons */}
        <div className={styles["fc-price-col"]}>
          <div className={styles["fc-price-text"]}>
            <span className={styles["fc-price-amount"]}>{flight.currency || "₹"}{formattedPrice}</span>
            <span className={styles["fc-price-person"]}>&nbsp;/ person</span>
          </div>
          <div className={styles["fc-price-actions"]}>
            <button
              type="button"
              className={styles["fc-btn-book"]}
              onClick={handleBookNow}
            >
              Book Now
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
                      <div className={styles["fc-details-content"]}>
                        <FlightSegment
                          segment={segment}
                          defaultFlightNumber={flightNumber}
                          styles={styles}
                          amenities={flight.amenities || []}
                        />
                      </div>
                      {index < flight.segments.length - 1 && (
                        <div className={styles["fc-layover-wrapper"]}>
                          <hr className={styles["fc-layover-line"]} />
                          <div className={styles["fc-layover-container"]}>
                            <h3 className={styles["fc-layover-airport"]}>
                              {flight.segments[index]?.arrival?.airport || "Connection"}
                            </h3>
                            <p className={styles["fc-layover-duration"]}>Layover — times from live segments</p>
                          </div>
                          <hr className={styles["fc-layover-line"]} />
                        </div>
                      )}
                    </React.Fragment>
                  ))
                ) : (
                  <div className={styles["fc-details-content"]}>
                    <FlightSegment
                      segment={flight}
                      defaultFlightNumber={flightNumber}
                      styles={styles}
                      amenities={flight.amenities || []}
                    />
                  </div>
                )}
              </div>
            )}

            {activeTab === 'fare' && (
              <div className={styles["fc-tab-pane"]}>
                <h4 className={styles["fc-details-section-title"]}>Fare Details</h4>
                {flight.price_base != null && (
                  <p className={styles["fc-tab-text"]}>
                    Base Fare: {flight.currency || "₹"}{Number(flight.price_base).toLocaleString("en-IN")}
                  </p>
                )}
                {(flight.price_taxes != null || flight.price_fees != null) && (
                  <p className={styles["fc-tab-text"]}>
                    Taxes & fees: {flight.currency || "₹"}
                    {(Number(flight.price_taxes || 0) + Number(flight.price_fees || 0)).toLocaleString("en-IN")}
                  </p>
                )}
                <p className={styles["fc-tab-total-price"]}>
                  Total Price: {flight.currency || "₹"}{formattedPrice}
                </p>
                {flight.fare_family && (
                  <p className={styles["fc-tab-text"]}>Fare family: {flight.fare_family}</p>
                )}
              </div>
            )}

            {activeTab === 'baggage' && (
              <div className={styles["fc-tab-pane"]}>
                <h4 className={styles["fc-details-section-title"]}>Baggage Allowances</h4>
                {flight.baggage?.cabin && (
                  <p className={styles["fc-tab-text"]}>Cabin: {flight.baggage.cabin}</p>
                )}
                {flight.baggage?.checked && (
                  <p className={styles["fc-tab-text"]}>Checked: {flight.baggage.checked}</p>
                )}
                {!flight.baggage?.cabin && !flight.baggage?.checked && (
                  <p className={styles["fc-tab-text"]}>
                    Baggage allowance wasn’t included in this live fare — confirm at booking.
                  </p>
                )}
              </div>
            )}

            {activeTab === 'cancellation' && (
              <div className={styles["fc-tab-pane"]}>
                <h4 className={styles["fc-details-section-title"]}>Cancellation Policy</h4>
                <p className={styles["fc-tab-text"]}>
                  Cancellation terms aren’t returned in the live fare feed. The airline confirms rules at payment.
                </p>
              </div>
            )}

            {activeTab === 'skywards' && (
              <div className={styles["fc-tab-pane"]}>
                <h4 className={styles["fc-details-section-title"]}>{airlineName} loyalty</h4>
                <p className={styles["fc-tab-text"]}>
                  Loyalty / miles details aren’t included in the live LiteAPI fare response.
                </p>
              </div>
            )}
          </div>
        </section>
      )}
    </article>
  );
}
