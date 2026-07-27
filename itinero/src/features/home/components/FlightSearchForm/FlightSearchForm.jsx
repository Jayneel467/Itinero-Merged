import React, { useState, useRef, useEffect } from "react";
import { SEARCH_FORM_IMAGES } from "@/constants/images";
import { AIRPORTS } from "@/constants/airports";
import "./FlightSearchForm.css";

// SVG for the airplane icon in dropdown
const AirplaneIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="dropdown__airplane-icon">
    <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.2-1.1.6L2.5 8l6.4 3.3L6 14l-2.9-.8L2 14.5l4.5 2 2 4.5 1.3-1.1-.8-2.9 2.7-2.9 3.3 6.4 1.2-1.2c.4-.2.7-.6.6-1.1Z" />
  </svg>
);

const UserIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="dropdown__user-icon">
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
  </svg>
);

// New icons for Date Dropdown
const ChevronLeftIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{cursor: 'pointer'}}>
    <path d="m15 18-6-6 6-6"/>
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{cursor: 'pointer'}}>
    <path d="m9 18 6-6-6-6"/>
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginLeft: '4px'}}>
    <path d="m6 9 6 6 6-6"/>
  </svg>
);

const LocationSearch = ({ label, icon, value, onChange, placeholder, onSelect, inputRef }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const wrapperRef = useRef(null);

  // Sync internal query with prop value
  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredAirports = AIRPORTS.filter(
    (airport) =>
      airport.city.toLowerCase().includes(query.toLowerCase()) ||
      airport.code.toLowerCase().includes(query.toLowerCase()) ||
      airport.name.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = (airport) => {
    const newValue = `${airport.city} (${airport.code})`;
    setQuery(newValue);
    onChange(newValue);
    setIsOpen(false);
    if (onSelect) onSelect();
  };

  return (
    <div className="search-form__field search-form__field--location" ref={wrapperRef}>
      <div className="search-form__field-header">
        <img src={icon} className="search-form__field-icon" alt="" />
        <span className="search-form__field-label">{label}</span>
      </div>
      <input
        type="text"
        className="search-form__input"
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
      />

      {isOpen && (
        <div className="search-dropdown animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="search-dropdown__list">
            {filteredAirports.length > 0 ? (
              filteredAirports.map((airport) => (
                <div
                  key={airport.id}
                  className="search-dropdown__item"
                  onClick={() => handleSelect(airport)}
                >
                  <div className="search-dropdown__icon-bg">
                    <AirplaneIcon />
                  </div>
                  <div className="search-dropdown__text">
                    <div className="search-dropdown__title">
                      <span className="search-dropdown__city">{airport.city}, {airport.state}</span>
                      <span className="search-dropdown__code">{airport.code}</span>
                    </div>
                    <div className="search-dropdown__subtitle">{airport.name}</div>
                  </div>
                  <div className="search-dropdown__checkbox"></div>
                </div>
              ))
            ) : (
              <div className="search-dropdown__empty">No airports found</div>
            )}
          </div>
          <div className="search-dropdown__footer">
            <UserIcon />
            <div className="search-dropdown__footer-text">
              <div className="search-dropdown__links">
                <span className="search-dropdown__link">Sign in</span> / <span className="search-dropdown__link">Sign Up</span>
              </div>
              <div className="search-dropdown__sub-link">Access your searches on any device</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const DateDropdown = ({ departDate, returnDate, onChangeDepart, onChangeReturn, onComplete }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);
  const [clickCount, setClickCount] = useState(0);
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date(2026, 6, 1)); // Start at July 2026

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleDayClick = (day, month, year) => {
    const formattedDate = `${day} ${month}, ${year}`;
    if (clickCount % 2 === 0) {
      onChangeDepart(formattedDate);
    } else {
      onChangeReturn(formattedDate);
      setIsOpen(false);
      if (onComplete) onComplete();
    }
    setClickCount(clickCount + 1);
  };

  const parseDate = (dateStr) => {
    if (!dateStr || dateStr.includes("Add Date")) return null;
    const parts = dateStr.split(' ');
    if (parts.length < 3) return null;
    return {
      day: parseInt(parts[0], 10),
      month: parts[1].replace(',', ''),
      year: parseInt(parts[2], 10)
    };
  };

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const getTimestamp = (d, m, y) => {
    const monthIdx = monthNames.indexOf(m);
    return new Date(y, monthIdx, d).getTime();
  };

  const renderDays = (month, year, startDayIndex, daysInMonth) => {
    const days = [];
    const parsedDepart = parseDate(departDate);
    const parsedReturn = parseDate(returnDate);

    // empty slots
    for (let i = 0; i < startDayIndex; i++) {
      days.push(<div key={`empty-${i}`} className="date-dropdown__day date-dropdown__day--empty"></div>);
    }
    // actual days
    for (let i = 1; i <= daysInMonth; i++) {
      let extraClass = "";
      
      const isStart = parsedDepart && parsedDepart.day === i && parsedDepart.month === month && parsedDepart.year == year;
      const isEnd = parsedReturn && parsedReturn.day === i && parsedReturn.month === month && parsedReturn.year == year;
      
      const tCurrent = getTimestamp(i, month, year);
      const tDepart = parsedDepart ? getTimestamp(parsedDepart.day, parsedDepart.month, parsedDepart.year) : null;
      const tReturn = parsedReturn ? getTimestamp(parsedReturn.day, parsedReturn.month, parsedReturn.year) : null;
      
      const inRange = tDepart && tReturn && tCurrent > tDepart && tCurrent < tReturn;
      const isSameDay = tDepart && tReturn && tDepart === tReturn && isStart;

      if (isSameDay) {
        extraClass = "date-dropdown__day--selected-start date-dropdown__day--selected-end";
      } else if (isStart) {
        extraClass = "date-dropdown__day--selected-start";
      } else if (isEnd) {
        extraClass = "date-dropdown__day--selected-end";
      } else if (inRange) {
        extraClass = "date-dropdown__day--in-range";
      }
      
      days.push(
        <div 
          key={i} 
          className={`date-dropdown__day ${extraClass}`}
          onClick={() => handleDayClick(i, month, year)}
        >
          {i}
        </div>
      );
    }
    return days;
  };

  const prevMonth = () => setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 1));

  const month1Date = currentMonthDate;
  const month2Date = new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 1);

  const month1Name = monthNames[month1Date.getMonth()];
  const month1Year = month1Date.getFullYear();
  const month1Days = new Date(month1Year, month1Date.getMonth() + 1, 0).getDate();
  const month1Start = new Date(month1Year, month1Date.getMonth(), 1).getDay();

  const month2Name = monthNames[month2Date.getMonth()];
  const month2Year = month2Date.getFullYear();
  const month2Days = new Date(month2Year, month2Date.getMonth() + 1, 0).getDate();
  const month2Start = new Date(month2Year, month2Date.getMonth(), 1).getDay();

  return (
    <div className="search-form__date-wrapper" ref={wrapperRef}>
      <div className="search-form__date-fields">
        {/* Depart */}
        <div className="search-form__date-field" id="date-dropdown-trigger" onClick={() => setIsOpen(!isOpen)}>
          <div className="search-form__date-content">
            <span className="search-form__field-label">Depart</span>
            <span className="search-form__field-value">{departDate || 'Add Date'}</span>
          </div>
          <img src={SEARCH_FORM_IMAGES.departCalendar} className="search-form__calendar-icon" alt="" />
        </div>

        <div className="search-form__divider" />

        {/* Return */}
        <div className="search-form__date-field" onClick={() => setIsOpen(!isOpen)}>
          <div className="search-form__date-content">
            <span className="search-form__field-label">Return</span>
            <span className="search-form__field-value">{returnDate || 'Add Date'}</span>
          </div>
          <img src={SEARCH_FORM_IMAGES.returnCalendar} className="search-form__calendar-icon" alt="" />
        </div>
      </div>

      {isOpen && (
        <div className="date-dropdown animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="date-dropdown__header">
            <div className="date-dropdown__tabs">
              <span className="date-dropdown__tab date-dropdown__tab--active">DATES</span>
              <span className="date-dropdown__tab">WEEKEND</span>
              <span className="date-dropdown__tab">MONTH</span>
            </div>
            <div className="date-dropdown__options">
              <div className="date-dropdown__option">
                Departure <span className="date-dropdown__option-highlight">exact</span> <ChevronDownIcon />
              </div>
              <div className="date-dropdown__option">
                Return <span className="date-dropdown__option-highlight">exact</span> <ChevronDownIcon />
              </div>
            </div>
          </div>
          
          <div className="date-dropdown__calendars-container">
            <div onClick={prevMonth} style={{cursor: 'pointer'}}><ChevronLeftIcon /></div>
            
            <div className="date-dropdown__calendars">
              {/* Month 1 */}
              <div className="date-dropdown__month">
                <div className="date-dropdown__month-title">{month1Name} {month1Year}</div>
                <div className="date-dropdown__grid">
                  <div className="date-dropdown__day-header">S</div>
                  <div className="date-dropdown__day-header">M</div>
                  <div className="date-dropdown__day-header">T</div>
                  <div className="date-dropdown__day-header">W</div>
                  <div className="date-dropdown__day-header">T</div>
                  <div className="date-dropdown__day-header">F</div>
                  <div className="date-dropdown__day-header">S</div>
                  {renderDays(month1Name, month1Year, month1Start, month1Days)}
                </div>
              </div>

              {/* Month 2 */}
              <div className="date-dropdown__month">
                <div className="date-dropdown__month-title">{month2Name} {month2Year}</div>
                <div className="date-dropdown__grid">
                  <div className="date-dropdown__day-header">S</div>
                  <div className="date-dropdown__day-header">M</div>
                  <div className="date-dropdown__day-header">T</div>
                  <div className="date-dropdown__day-header">W</div>
                  <div className="date-dropdown__day-header">T</div>
                  <div className="date-dropdown__day-header">F</div>
                  <div className="date-dropdown__day-header">S</div>
                  {renderDays(month2Name, month2Year, month2Start, month2Days)}
                </div>
              </div>
            </div>

            <div onClick={nextMonth} style={{cursor: 'pointer'}}><ChevronRightIcon /></div>
          </div>
        </div>
      )}
    </div>
  );
};

const TravelersDropdown = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [cabinClass, setCabinClass] = useState("Economy");
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const totalPax = adults + children + infants;
  const displayValue = `${totalPax} Pax, ${cabinClass}`;

  return (
    <div className="search-form__travelers-wrapper" ref={wrapperRef}>
      <div className="search-form__date-field search-form__date-field--travelers" id="travelers-dropdown-trigger" onClick={() => setIsOpen(!isOpen)}>
        <div className="search-form__date-content">
          <span className="search-form__field-label">Travelers & Class</span>
          <span className="search-form__field-value">{displayValue}</span>
        </div>
        <img src={SEARCH_FORM_IMAGES.travelersIcon} className="search-form__travelers-icon" alt="" />
      </div>

      {isOpen && (
        <div className="travelers-dropdown animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="travelers-dropdown__section">
            <h3 className="travelers-dropdown__title">Travellers</h3>
            
            <div className="travelers-dropdown__row">
              <div className="travelers-dropdown__label">
                Adults <span className="travelers-dropdown__sublabel">18+</span>
              </div>
              <div className="travelers-dropdown__controls">
                <button className="travelers-dropdown__btn" onClick={() => setAdults(Math.max(1, adults - 1))}>−</button>
                <span className="travelers-dropdown__count">{adults}</span>
                <button className="travelers-dropdown__btn" onClick={() => setAdults(adults + 1)}>+</button>
              </div>
            </div>

            <div className="travelers-dropdown__row">
              <div className="travelers-dropdown__label">
                Children <span className="travelers-dropdown__sublabel">0-17</span>
              </div>
              <div className="travelers-dropdown__controls">
                <button className="travelers-dropdown__btn" onClick={() => setChildren(Math.max(0, children - 1))}>−</button>
                <span className="travelers-dropdown__count">{children}</span>
                <button className="travelers-dropdown__btn" onClick={() => setChildren(children + 1)}>+</button>
              </div>
            </div>

            <div className="travelers-dropdown__row">
              <div className="travelers-dropdown__label">
                Infants on lap <span className="travelers-dropdown__sublabel">under 2</span>
              </div>
              <div className="travelers-dropdown__controls">
                <button className="travelers-dropdown__btn" onClick={() => setInfants(Math.max(0, infants - 1))}>−</button>
                <span className="travelers-dropdown__count">{infants}</span>
                <button className="travelers-dropdown__btn" onClick={() => setInfants(infants + 1)}>+</button>
              </div>
            </div>
          </div>

          <div className="travelers-dropdown__divider"></div>

          <div className="travelers-dropdown__section">
            <h3 className="travelers-dropdown__title">Cabin class</h3>
            <div className="travelers-dropdown__pills">
              {["Economy", "Premium Economy", "Business", "First"].map((cls) => (
                <button
                  key={cls}
                  className={`travelers-dropdown__pill ${cabinClass === cls ? "travelers-dropdown__pill--active" : ""}`}
                  onClick={() => setCabinClass(cls)}
                >
                  {cls}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Flight search form with From, To, Dates, Travelers, and Search button.
 */
export default function FlightSearchForm() {
  const [fromLocation, setFromLocation] = useState("");
  const [toLocation, setToLocation] = useState("");
  const [departDate, setDepartDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const toInputRef = useRef(null);

  const handleSwap = () => {
    const temp = fromLocation;
    setFromLocation(toLocation);
    setToLocation(temp);
  };

  return (
    <div className="search-form" id="flight-search-form">
      {/* From */}
      <LocationSearch
        label="From"
        icon={SEARCH_FORM_IMAGES.fromIcon}
        value={fromLocation}
        onChange={setFromLocation}
        placeholder="Enter city or airport"
        onSelect={() => {
          setTimeout(() => {
            toInputRef.current?.focus();
          }, 10);
        }}
      />

      {/* Swap */}
      <img
        src={SEARCH_FORM_IMAGES.swapIcon}
        className="search-form__swap-icon"
        alt="Swap"
        onClick={handleSwap}
      />

      {/* To */}
      <LocationSearch
        label="Going To"
        icon={SEARCH_FORM_IMAGES.toIcon}
        value={toLocation}
        onChange={setToLocation}
        placeholder="Enter city or airport"
        inputRef={toInputRef}
        onSelect={() => {
          setTimeout(() => {
            document.getElementById('date-dropdown-trigger')?.click();
          }, 10);
        }}
      />

      <div className="search-form__divider" />

      {/* Dates & Travelers */}
      <div className="search-form__group">
        <DateDropdown 
          departDate={departDate} 
          returnDate={returnDate} 
          onChangeDepart={setDepartDate} 
          onChangeReturn={setReturnDate} 
          onComplete={() => {
            setTimeout(() => {
              document.getElementById('travelers-dropdown-trigger')?.click();
            }, 10);
          }}
        />
        
        <div className="search-form__divider" />

        <TravelersDropdown />
      </div>

      {/* Search Button */}
      <button className="search-form__submit" onClick={() => alert("Pressed!")}>
        <img src={SEARCH_FORM_IMAGES.searchIcon} className="search-form__submit-icon" alt="" />
        <span>Search</span>
      </button>
    </div>
  );
}
