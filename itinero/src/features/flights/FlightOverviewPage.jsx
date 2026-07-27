import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageLayout } from "@/components/layout";
import SharedFlightSearchBar from "@/components/SharedFlightSearchBar";
import SeatSelectionModal from "@/components/shared/SeatSelectionModal";
import { 
  Plane, Clock, Wifi, Coffee, Shield, ShieldCheck, Check, FileText, ChevronDown, MoveRight, HelpCircle, Armchair, Utensils
} from 'lucide-react';
import styles from './FlightOverviewPage.module.css';

export default function FlightOverviewPage() {
  const navigate = useNavigate();
  const [isSeatModalOpen, setIsSeatModalOpen] = useState(false);
  const [selectedSeat, setSelectedSeat] = useState({ id: '14A', type: 'Window', price: 0 });
  const [activeTab, setActiveTab] = useState('baggage');
  const [selectedMeal, setSelectedMeal] = useState('Standard Non-Vegetarian');
  const [isMealDropdownOpen, setIsMealDropdownOpen] = useState(false);

  const mealOptions = [
    'Standard Non-Vegetarian',
    'Standard Vegetarian',
    'Asian Vegetarian Meal',
    'Diabetic Meal',
    'Gluten-Free Meal',
    'Child'
  ];

  return (
    <PageLayout>
      <div className={styles.container}>
        {/* Hero Section */}
        <div className={styles.heroSection}>
          <h1 className={styles.heroTitle}>
            Beyond The Clouds
          </h1>
          <SharedFlightSearchBar />
        </div>

        <div className={styles.mainContent}>
        
        {/* LEFT COLUMN */}
        <div className={styles.leftColumn}>
          <div className={styles.pageHeader}>
            <h2 className={styles.pageTitle}>Flight Overview</h2>
            <div className={styles.headerBadges}>
              <span className={styles.badgeRefundable}>REFUNDABLE</span>
              <span className={styles.badgeBaggage}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"></path><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg> 7 kg Cabin</span>
              <span className={styles.badgeBaggage}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"></path><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg> 30 kg Checked</span>
            </div>
          </div>

          <div className={styles.flightCard}>
            <div className={styles.flightCardTopRow}>
              <div className={styles.airlineInfo}>
                <div className={styles.airlineLogoBox}>
                  {/* Emirates Logo */}
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M2 12C2 12 5 13.5 12 13.5C19 13.5 22 12 22 12C22 12 18 20 12 20C6 20 2 12 2 12Z"/></svg>
                </div>
                <div>
                  <div className={styles.airlineName}>Emirates</div>
                  <div className={styles.flightCode}>EK 203 • Boeing 777-300ER</div>
                </div>
              </div>

              <div className={styles.flightTimeBlock}>
                <div className={styles.timeLabel}>08:45</div>
                <div className={styles.airportCode}>JFK</div>
                <div className={styles.airportName}>John F. Kennedy Intl.<br/>New York, USA</div>
              </div>

              <div className={styles.flightGraphic}>
                <div className={styles.flightGraphicDuration}>7h 20m</div>
                <div className={styles.flightGraphicLineWrap}>
                  <div className={styles.flightGraphicDot}></div>
                  <div className={styles.flightGraphicLine}></div>
                  <div className={styles.flightGraphicPlaneIcon}><Plane size={16} color="#6C5CE7" fill="#6C5CE7" /></div>
                  <div className={styles.flightGraphicLine}></div>
                  <div className={styles.flightGraphicDot}></div>
                </div>
                <div className={styles.flightGraphicDirect}>Direct</div>
              </div>

              <div className={styles.flightTimeBlock}>
                <div className={styles.timeLabel}>20:05</div>
                <div className={styles.airportCode}>LHR</div>
                <div className={styles.airportName}>Heathrow Airport<br/>London, UK</div>
              </div>
            </div>
          </div>

          {/* Widgets Grid */}
          <div className={styles.widgetsGrid}>
            <div className={styles.widgetCard}>
              <div className={styles.widgetTitle}>Route Timeline</div>
              <div className={styles.timelineContainer}>
                <div className={styles.timelineItem}>
                  <div className={styles.timelineTime}>08:45</div>
                  <div className={styles.timelineDotWrapper}><div className={styles.timelineDotTop}></div></div>
                  <div className={styles.timelineContent}>
                    <div className={styles.timelineAirportCode}>JFK <span className={styles.timelineCity}>New York</span></div>
                    <div className={styles.timelineDescription}>John F. Kennedy International Airport<br/>Terminal 4</div>
                  </div>
                </div>
                <div className={styles.timelineMiddleSection}>
                  <div className={styles.timelineEmpty}></div>
                  <div className={styles.timelineLineWrap}>
                     <div className={styles.timelineLine}></div>
                     <Plane size={14} className={styles.timelinePlane} />
                  </div>
                  <div className={styles.timelineDuration}>
                    <div className={styles.timelineDurationText}>7h 20m</div>
                    <div className={styles.timelineDurationSubtitle}>Direct Flight</div>
                  </div>
                </div>
                <div className={styles.timelineItem}>
                  <div className={styles.timelineTime}>20:05</div>
                  <div className={styles.timelineDotWrapper}><div className={styles.timelineDotBottom}></div></div>
                  <div className={styles.timelineContent}>
                    <div className={styles.timelineAirportCode}>LHR <span className={styles.timelineCity}>London</span></div>
                    <div className={styles.timelineDescription}>Heathrow Airport<br/>Terminal 3</div>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.widgetCard}>
              <div className={styles.widgetTitle}>Layover Details</div>
              <div className={styles.layoverContent}>
                <div className={styles.layoverImagePlaceholder}>
                  <div className={styles.layoverCircle}>
                    <Clock size={20} color="#F97211" />
                  </div>
                </div>
                <div>
                  <div className={styles.layoverTitle}>No Layover</div>
                  <div className={styles.layoverSub}>This is a direct flight. Sit back and enjoy the journey without any interruptions.</div>
                </div>
              </div>
            </div>

            <div className={styles.widgetStack}>
              <div className={styles.widgetCardMini}>
                <div className={styles.airportWidgetHeader}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 409.601 409.601" style={{marginTop: '2px'}}>
                    <g><path d="M409.283 108.107c-3.267-18.565-31.017-29.199-61.932-23.731l-221.302 39.019-82.048-72.187-42.014 7.399 28.831 81.567L0 145.611l2.964 16.814c39.552 27.72 86.62 36.721 130.698 28.948l29.45-5.202-15.032 71.972 50.417-8.899 99.067-86.769 61.635-10.865c30.914-5.467 53.365-24.938 50.084-43.503M0 324.258h409.6v34.135H0z" fill="#F97211"></path></g>
                  </svg>
                  <div>
                    <div className={styles.airportWidgetTitle}>Departure Airport</div>
                    <div className={styles.airportWidgetSubtitle}>John F. Kennedy Intl. (JFK)</div>
                  </div>
                </div>
                <div className={styles.airportWidgetDataRow}>
                  <div>
                    <div className={styles.airportWidgetLabel}>TERMINAL</div>
                    <div className={styles.airportWidgetValue}>T4</div>
                  </div>
                  <div>
                    <div className={styles.airportWidgetLabel}>GATE</div>
                    <div className={styles.airportWidgetValue}>A12</div>
                  </div>
                  <div>
                    <div className={styles.airportWidgetLabel}>CHECK-IN</div>
                    <div className={styles.airportWidgetValue}>Counter 45-50</div>
                  </div>
                </div>
              </div>

              <div className={styles.widgetCardMini}>
                <div className={styles.airportWidgetHeader}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="35" height="35" viewBox="0 0 100 100" style={{marginTop: '2px'}}>
                    <g><path d="m79.29 44.466-43.226-7.623L25.83 18.115l-8.206-1.448-.156 16.897-6.022-1.062-.579 3.285c5.41 7.725 13.447 12.522 22.057 14.043l5.752 1.012-7.568 12.204 9.848 1.738 23.984-9.31 12.037 2.122c6.039 1.062 11.459-1.016 12.097-4.636.64-3.624-3.745-7.43-9.784-8.494M10 76.667h80v6.666H10z" fill="#F97211"></path></g>
                  </svg>
                  <div>
                    <div className={styles.airportWidgetTitle}>Arrival Airport</div>
                    <div className={styles.airportWidgetSubtitle}>Heathrow Airport (LHR)</div>
                  </div>
                </div>
                <div className={styles.airportWidgetDataRow}>
                  <div>
                    <div className={styles.airportWidgetLabel}>TERMINAL</div>
                    <div className={styles.airportWidgetValue}>T3</div>
                  </div>
                  <div>
                    <div className={styles.airportWidgetLabel}>GATE</div>
                    <div className={styles.airportWidgetValue}>--</div>
                  </div>
                  <div>
                    <div className={styles.airportWidgetLabel}>BAGGAGE CLAIM</div>
                    <div className={styles.airportWidgetValue}>Belt 8</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.featuresBar}>
            <div className={styles.featureItem}>
              <div className={styles.featureIconWrapper}><Clock size={16} color="#F97211" /></div>
              <div>
                <div className={styles.featureLabel}>FLIGHT DURATION</div>
                <div className={styles.featureValue}>7h 20m</div>
              </div>
            </div>
            <div className={styles.featureItem}>
              <div className={styles.featureIconWrapper}><Armchair size={16} color="#F97211" /></div>
              <div>
                <div className={styles.featureLabel}>TRAVEL CLASS</div>
                <div className={styles.featureValue}>Economy</div>
              </div>
            </div>
            <div className={styles.featureItem}>
              <div className={styles.featureIconWrapper}><Plane size={16} color="#F97211" /></div>
              <div>
                <div className={styles.featureLabel}>AIRCRAFT</div>
                <div className={styles.featureValue}>Boeing 777 - 300ER</div>
              </div>
            </div>
            <div className={styles.featureItem}>
              <div className={styles.featureIconWrapper}><ShieldCheck size={16} color="#F97211" /></div>
              <div>
                <div className={styles.featureLabel}>ON-TIME PERFORMANCE</div>
                <div className={styles.featureValue}>92%</div>
              </div>
            </div>
            <div className={styles.featureItem}>
              <div className={styles.featureIconWrapper}><Wifi size={16} color="#F97211" /></div>
              <div>
                <div className={styles.featureLabel}>IN-FLIGHT WI-FI</div>
                <div className={styles.featureValue}>Available</div>
              </div>
            </div>
          </div>

          {/* Tabs Section */}
          <div className={styles.tabsContainer}>
            <div className={styles.tabsHeader}>
              <div 
                className={`${styles.tabItem} ${activeTab === 'baggage' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('baggage')}
              >
                Baggage
              </div>
              <div 
                className={`${styles.tabItem} ${activeTab === 'refund' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('refund')}
              >
                Refund Policy
              </div>
              <div 
                className={`${styles.tabItem} ${activeTab === 'cancellation' ? styles.tabActive : ''}`}
                onClick={() => setActiveTab('cancellation')}
              >
                Cancellation Policy
              </div>
            </div>
            <div className={styles.tabsContent}>
              {activeTab === 'baggage' && (
                <div className={styles.baggageGrid}>
                  <div className={styles.bagItem}>
                    <div className={styles.bagIcon}>
                       <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F97211" strokeWidth="2"><rect x="6" y="6" width="12" height="14" rx="2"></rect><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path><path d="M8 10h8"></path><path d="M8 14h8"></path></svg>
                    </div>
                    <div>
                      <div className={styles.bagTitle}>Cabin Baggage</div>
                      <div className={styles.bagPiece}>1 Piece</div>
                      <div className={styles.bagWeight}>Up to 7kg</div>
                    </div>
                  </div>
                  <div className={styles.bagItem}>
                    <div className={styles.bagIcon}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F97211" strokeWidth="2"><rect x="4" y="6" width="16" height="16" rx="2"></rect><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path><path d="M12 10v6"></path></svg>
                    </div>
                    <div>
                      <div className={styles.bagTitle}>Checked Baggage</div>
                      <div className={styles.bagPiece}>1 Piece</div>
                      <div className={styles.bagWeight}>Up to 30kg</div>
                    </div>
                  </div>
                  <div className={styles.bagItem}>
                    <div className={styles.bagIcon}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F97211" strokeWidth="2"><rect x="4" y="6" width="16" height="16" rx="2"></rect><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"></path><circle cx="12" cy="14" r="3"></circle><path d="M12 11v6"></path><path d="M9 14h6"></path></svg>
                    </div>
                    <div>
                      <div className={styles.bagTitle}>Excess Baggage</div>
                      <div className={styles.bagPiece}>Available</div>
                      <div className={styles.bagWeight}>Add at checkout</div>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'refund' && (
                <div className={styles.policyContent}>
                  <div className={styles.policyRow}>
                    <div className={styles.policyTime}>24h - 72h before departure</div>
                    <div className={styles.policyRefund}>80% Refund <span className={styles.policyFee}>(₹150 fee)</span></div>
                  </div>
                  <div className={styles.policyRow}>
                    <div className={styles.policyTime}>0h - 24h before departure</div>
                    <div className={styles.policyRefund}>50% Refund <span className={styles.policyFee}>(₹350 fee)</span></div>
                  </div>
                  <div className={styles.policyRow}>
                    <div className={styles.policyTime}>After departure (No Show)</div>
                    <div className={styles.policyRefund}>No Refund</div>
                  </div>
                </div>
              )}
              {activeTab === 'cancellation' && (
                <div className={styles.policyContent}>
                  <div className={styles.policyRule}>
                    <strong>24-Hour Free Cancellation:</strong> Bookings cancelled within 24 hours of booking creation are eligible for a 100% refund, provided departure is at least 7 days away.
                  </div>
                  <div className={styles.policyRule}>
                    <strong>Airline Cancellations:</strong> If the airline cancels the flight, passengers are entitled to a full refund or an alternative flight option.
                  </div>
                  <div className={styles.policyRule}>
                    <strong>Online Cancellations:</strong> Cancellations can be easily performed online via the "My Bookings" page.
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className={styles.addonsGrid}>
            <div className={styles.addonCard}>
              <div className={styles.addonHeader}>
                <Utensils size={18} color="#F97211" /> Meal Selection
              </div>
              <div className={styles.addonContent}>
                <div className={styles.addonImage}>
                  <img src="https://images.unsplash.com/photo-1548943487-a2e4f43b4850?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80" alt="Meal" style={{width: '100%', height: '100%', objectFit: 'cover'}} />
                </div>
                <div className={styles.addonDetails} style={{ position: 'relative' }}>
                  <div className={styles.addonLabel}>INCLUDED</div>
                  <div 
                    className={styles.addonSelect}
                    onClick={() => setIsMealDropdownOpen(!isMealDropdownOpen)}
                  >
                    {selectedMeal} <ChevronDown size={14} />
                  </div>
                  <div className={styles.addonSub}>You can customize your meal preference.</div>

                  {isMealDropdownOpen && (
                    <div className={styles.mealDropdown}>
                      {mealOptions.map(meal => (
                        <div 
                          key={meal} 
                          className={`${styles.mealDropdownItem} ${selectedMeal === meal ? styles.mealDropdownActive : ''}`}
                          onClick={() => {
                            setSelectedMeal(meal);
                            setIsMealDropdownOpen(false);
                          }}
                        >
                          {meal}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className={styles.addonCard}>
              <div className={styles.addonHeader}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F97211" strokeWidth="2"><path d="M4 18v3"></path><path d="M20 18v3"></path><path d="M5 11h14v7H5z"></path><path d="M19 11V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v4"></path></svg>
                Seat Selection
              </div>
              <div className={styles.addonContentSeat}>
                <div className={styles.seatIconWrap}>
                   <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F97211" strokeWidth="2"><path d="M4 18v3"></path><path d="M20 18v3"></path><path d="M5 11h14v7H5z"></path><path d="M19 11V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v4"></path></svg>
                </div>
                <div className={styles.addonDetails}>
                  <div className={styles.addonSeatVal}>{selectedSeat.id} ({selectedSeat.type})</div>
                  <div className={styles.addonSub}>
                    {selectedSeat.price > 0 ? `+ ₹${selectedSeat.price}` : 'Selected automatically.'}
                  </div>
                </div>
                <button 
                  className={styles.btnOutline} 
                  onClick={() => setIsSeatModalOpen(true)}
                >
                  Change
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN */}
        <div className={styles.rightColumn}>
          <div className={styles.stickySidebar}>
            
            <div className={styles.fareSummaryCard}>
              <div className={styles.fareSummaryHeader}>
                <div className={styles.fareSummaryTitle}>Fare Summary</div>
                <div className={styles.fareSummarySelect}>
                  1 Adult <ChevronDown size={14} />
                </div>
              </div>
              <div className={styles.fareSummaryBody}>
                <h3 className={styles.fareSummarySectionTitle}>Base Fare</h3>
                <div className={styles.fareSummaryRow}>
                  <span>Adult (1 x ₹520)</span>
                  <span>₹520.00</span>
                </div>

                <div className={styles.fareSummaryDivider}></div>

                <h3 className={styles.fareSummarySectionTitle}>Taxes & Surcharges</h3>
                <div className={styles.fareSummaryRow}>
                  <span>Airline Taxes</span>
                  <span>₹120.00</span>
                </div>
                <div className={styles.fareSummaryRow}>
                  <span>Service Fee</span>
                  <span>₹80.00</span>
                </div>

                <div className={styles.fareSummaryDivider}></div>

                <div className={styles.fareSummaryTotalRow}>
                  <span>Total Fare</span>
                  <span className={styles.fareSummaryPriceBold}>₹720.00</span>
                </div>

                <div className={styles.insuranceBox}>
                  <div className={styles.insuranceHeader}>
                    <Shield size={14} color="#001439" className={styles.insuranceShieldIcon} />
                    <div>
                      <div className={styles.insuranceTitle}>Add Travel Insurance</div>
                      <div className={styles.insuranceSubtitle}>Cover for trip cancellation, medical emergencies & more.</div>
                    </div>
                  </div>
                  <button className={styles.insuranceAddButton}>+ ₹45</button>
                </div>

                <div className={styles.fareSummaryDivider}></div>

                <div className={styles.fareSummaryGrandTotalRow}>
                  <span>Grand Total</span>
                  <span className={styles.fareSummaryPriceBold}>₹720.00</span>
                </div>

                <button className={styles.bookNowBtn} onClick={() => navigate('/flights/passenger-info')}>
                  Book Now <MoveRight size={18} />
                </button>
                
                <div className={styles.secureBooking}>
                   <ShieldCheck size={14} /> 100% Secure Booking
                </div>
              </div>
            </div>

            <div className={styles.trustBadges}>
               <div className={styles.trustItem}>
                 <div className={styles.trustIcon}><Check size={16} color="#22C55E"/></div>
                 <div className={styles.trustTitle}>Free Cancel</div>
                 <div className={styles.trustSub}>Within 24h</div>
               </div>
               <div className={styles.trustItem}>
                 <div className={styles.trustIcon}><FileText size={16} color="#F97211"/></div>
                 <div className={styles.trustTitle}>E-Ticket</div>
                 <div className={styles.trustSub}>Instant</div>
               </div>
               <div className={styles.trustItem}>
                 <div className={styles.trustIcon}><Shield size={16} color="#3B82F6"/></div>
                 <div className={styles.trustTitle}>Secure</div>
                 <div className={styles.trustSub}>Payment</div>
               </div>
               <div className={styles.trustItem}>
                 <div className={styles.trustIcon}><HelpCircle size={16} color="#8B5CF6"/></div>
                 <div className={styles.trustTitle}>Support</div>
                 <div className={styles.trustSub}>24/7</div>
               </div>
            </div>

          </div>
        </div>

      </div>

      <SeatSelectionModal 
        isOpen={isSeatModalOpen}
        onClose={() => setIsSeatModalOpen(false)}
        initialSeat={selectedSeat.id}
        onConfirm={(id, price, type) => {
          setSelectedSeat({ id, price, type });
          setIsSeatModalOpen(false);
        }}
      />
    </div>
  </PageLayout>
  );
}
