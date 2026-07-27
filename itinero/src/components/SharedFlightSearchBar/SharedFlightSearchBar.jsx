import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AIRPORTS, findAirportByCode } from '@/constants/airports';
import ScrollReveal from '@/components/ScrollReveal';
import FlightSearchAnimation from '@/features/home/components/FlightSearchAnimation';

function parseLocalDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toYmd(date) {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function defaultDepartDate() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 14);
  return d;
}

function defaultReturnDate(depart) {
  const d = new Date(depart.getTime());
  d.setDate(d.getDate() + 7);
  return d;
}

export default function SharedFlightSearchBar({ onSearchTriggered }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [from, setFrom] = useState(findAirportByCode("BOM") || AIRPORTS[0]);
  const [to, setTo] = useState(findAirportByCode("DEL") || AIRPORTS[1]);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchError, setSearchError] = useState("");
  
  const [departDate, setDepartDate] = useState(defaultDepartDate);
  const [returnDate, setReturnDate] = useState(() => defaultReturnDate(defaultDepartDate()));
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [cabinClass, setCabinClass] = useState("Economy");
  
  const [tripType, setTripType] = useState("Return");
  const [specialFare, setSpecialFare] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  
  const dropdownRef = useRef(null);

  // Hydrate from URL when landing on /flights?... (re-search / deep links)
  useEffect(() => {
    const qFrom = findAirportByCode(searchParams.get("from"));
    const qTo = findAirportByCode(searchParams.get("to"));
    if (qFrom) setFrom(qFrom);
    if (qTo) setTo(qTo);
    const dep = parseLocalDate(searchParams.get("depart"));
    if (dep) setDepartDate(dep);
    const ret = parseLocalDate(searchParams.get("return"));
    if (ret) setReturnDate(ret);
    const a = Number(searchParams.get("adults"));
    if (a >= 1) setAdults(a);
    const c = Number(searchParams.get("children"));
    if (c >= 0) setChildren(c);
    const i = Number(searchParams.get("infants"));
    if (i >= 0) setInfants(i);
    const cabin = searchParams.get("cabin");
    if (cabin) setCabinClass(cabin);
    const trip = searchParams.get("trip");
    if (trip && trip !== "Multi-way") setTripType(trip);
  }, [searchParams]);

  const handleSearch = useCallback(() => {
    setActiveDropdown(null);
    setSearchError("");
    if (!from?.code || !to?.code) {
      setSearchError("Pick origin and destination airports.");
      return;
    }
    if (from.code === to.code) {
      setSearchError("Origin and destination must be different.");
      return;
    }
    if (!departDate) {
      setSearchError("Add a departure date to search live fares.");
      setActiveDropdown("depart");
      return;
    }
    if (tripType === "Return" && !returnDate) {
      setSearchError("Add a return date, or switch trip type to One way.");
      setActiveDropdown("return");
      return;
    }
    if (typeof onSearchTriggered === "function") onSearchTriggered();
    setIsSearching(true);
  }, [from, to, departDate, returnDate, tripType, onSearchTriggered]);

  const handleSearchComplete = useCallback(() => {
    const params = new URLSearchParams({
      from: from?.code || "",
      to: to?.code || "",
      fromCity: from?.city || "",
      toCity: to?.city || "",
      depart: toYmd(departDate),
      adults: String(adults),
      children: String(children),
      infants: String(infants),
      cabin: cabinClass,
      trip: tripType,
    });
    if (tripType === "Return" && returnDate) {
      params.set("return", toYmd(returnDate));
    }
    setIsSearching(false);
    navigate(`/flights?${params.toString()}`);
  }, [from, to, departDate, returnDate, adults, children, infants, cabinClass, tripType, navigate]);

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const formatDate = (date) => {
    if (!date) return "";
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target) &&
        !event.target.closest('.special-fares-dropdown')
      ) {
        setActiveDropdown(null);
        setSearchQuery("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredAirports = AIRPORTS.filter(
    (airport) =>
      airport.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
      airport.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      airport.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (airport.state && airport.state.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleSwap = (e) => {
    e.stopPropagation();
    const temp = from;
    setFrom(to);
    setTo(temp);
  };

  const renderCalendar = (monthOffset) => {
    const targetDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + monthOffset, 1);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    const monthName = targetDate.toLocaleDateString("en-US", { month: "long" });
    const today = new Date();
    today.setHours(0,0,0,0);

    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="w-10 h-10"></div>);
    }
    
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month, d);
      const isPast = dateObj < today;
      let isSelected = false;
      let isBetween = false;
      
      if (departDate && dateObj.getTime() === departDate.getTime()) isSelected = true;
      if (returnDate && dateObj.getTime() === returnDate.getTime()) isSelected = true;
      
      if (departDate && returnDate && dateObj > departDate && dateObj < returnDate) {
        isBetween = true;
      }
      
      const isDisabled = isPast || (activeDropdown === 'return' && departDate && dateObj < departDate);

      days.push(
        <div 
          key={d} 
          onClick={(e) => {
             e.stopPropagation();
             if (isDisabled) return;
             if (activeDropdown === 'depart') {
               setDepartDate(dateObj);
               if (returnDate && dateObj > returnDate) setReturnDate(null);
               setActiveDropdown('return');
             } else if (activeDropdown === 'return') {
               setReturnDate(dateObj);
               setActiveDropdown('travelers');
             }
          }}
          className={`w-10 h-10 flex items-center justify-center rounded-full text-[15px] font-bold transition-colors select-none
            ${isDisabled ? 'text-gray-300 cursor-not-allowed' : 'text-gray-900 cursor-pointer hover:bg-gray-100'}
            ${isSelected ? 'bg-gray-900 text-white hover:bg-gray-800' : ''}
            ${isBetween && !isSelected ? 'bg-gray-100' : ''}
          `}
        >
          {d}
        </div>
      );
    }

    return (
      <div className="flex-1 px-4">
        <div className="flex items-center justify-between mb-6">
          {monthOffset === 0 ? (
            <button onClick={(e) => { e.stopPropagation(); setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)); }} className="p-1 hover:bg-gray-100 rounded-full cursor-pointer">
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
            </button>
          ) : <div className="w-7"></div>}
          
          <span className="font-bold text-[17px] text-gray-900">{monthName} {year}</span>
          
          {monthOffset === 1 ? (
             <button onClick={(e) => { e.stopPropagation(); setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)); }} className="p-1 hover:bg-gray-100 rounded-full cursor-pointer">
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
            </button>
          ) : <div className="w-7"></div>}
        </div>
        
        <div className="grid grid-cols-7 gap-y-2 mb-2">
          {['S','M','T','W','T','F','S'].map((day, i) => (
            <div key={i} className="w-10 h-10 flex items-center justify-center font-bold text-gray-900 text-[15px]">{day}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-2">
          {days}
        </div>
      </div>
    );
  };

  const datePickerUI = (
    <div className="fixed inset-0 md:absolute md:top-full md:mt-3 lg:top-[108px] lg:mt-0 md:bottom-auto md:right-auto md:left-[-30px] w-full h-full md:w-[780px] md:h-auto bg-white md:rounded-[24px] shadow-2xl z-[100] md:z-50 cursor-default overflow-hidden md:overflow-visible animate-slide-up-modal md:animate-dropdown-fade-up flex flex-col md:block md:p-6" onClick={e => e.stopPropagation()}>
      
      {/* Mobile Header */}
      <div className="md:hidden flex items-center p-4 border-b border-gray-100 flex-none bg-white z-10">
        <button onClick={() => setActiveDropdown(null)} className="p-2 -ml-2 mr-2">
          <svg className="w-6 h-6 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="flex-1 md:flex-none overflow-y-auto md:overflow-visible p-4 md:p-0 relative">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 md:mb-8 pb-4 border-b border-gray-100 gap-3 md:gap-0">
          <div className="flex items-center gap-6">
            <span className="text-[13px] font-bold text-gray-900 border-b-[3px] border-gray-900 pb-1">DATES</span>
            <span
              className="text-[13px] font-bold text-gray-400 pb-1 cursor-not-allowed"
              title="Weekend / flexible-month search isn’t available on LiteAPI yet"
            >
              WEEKEND
            </span>
            <span
              className="text-[13px] font-bold text-gray-400 pb-1 cursor-not-allowed"
              title="Weekend / flexible-month search isn’t available on LiteAPI yet"
            >
              MONTH
            </span>
          </div>
          <div className="flex items-center gap-4 md:gap-6">
            <div className="flex items-center gap-1 cursor-pointer group/dep" onClick={() => setActiveDropdown('depart')}>
              <span className="text-[13px] font-bold text-gray-900 group-hover/dep:text-blue-600 transition-colors">Departure</span>
              <span className="text-[13px] text-blue-500">exact</span>
              <svg className="w-4 h-4 text-gray-900 group-hover/dep:text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
            </div>
            <div className="flex items-center gap-1 cursor-pointer group/ret" onClick={() => setActiveDropdown('return')}>
              <span className="text-[13px] font-bold text-gray-900 group-hover/ret:text-blue-600 transition-colors">Return</span>
              <span className="text-[13px] text-blue-500">exact</span>
              <svg className="w-4 h-4 text-gray-900 group-hover/ret:text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
            </div>
          </div>
        </div>
        <div className="flex flex-col md:flex-row gap-4 pb-32 md:pb-0">
          {renderCalendar(0)}
          <div className="md:hidden mt-4">{renderCalendar(1)}</div>
          <div className="hidden md:block">{renderCalendar(1)}</div>
        </div>
      </div>
      
      {/* Mobile Footer for dates */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] z-20">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-gray-500 text-[12px] mb-0.5">{activeDropdown === 'depart' ? 'Start date' : 'End date'}</p>
            <p className="font-bold text-gray-900 text-[15px]">{activeDropdown === 'depart' ? (departDate ? formatDate(departDate) : "Select date") : (returnDate ? formatDate(returnDate) : "Select date")}</p>
            <div className="flex items-center text-[#1E88E5] text-[13px] mt-0.5">
              exact
              <svg className="w-3.5 h-3.5 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
            </div>
          </div>
        </div>
        <button 
          onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === 'depart' ? 'return' : 'travelers'); }} 
          className="w-full bg-[#F04F23] hover:bg-[#E04010] text-white font-bold py-3.5 rounded-[8px] transition-colors"
        >
          Select this date
        </button>
      </div>
    </div>
  );

  const travelersUI = (
    <div className="fixed inset-0 md:absolute md:top-full md:mt-3 lg:top-[108px] lg:mt-0 md:bottom-auto md:right-0 md:left-auto w-full h-full md:w-[380px] md:h-auto bg-white md:rounded-[24px] shadow-2xl z-[100] md:z-50 cursor-default overflow-hidden md:overflow-visible animate-slide-up-modal md:animate-dropdown-fade-up flex flex-col md:block md:p-6" onClick={e => e.stopPropagation()}>
      {/* Mobile Header */}
      <div className="md:hidden flex items-center p-4 border-b border-gray-100 flex-none bg-white">
        <button onClick={() => setActiveDropdown(null)} className="p-2 -ml-2 mr-2">
          <svg className="w-6 h-6 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <h2 className="text-xl font-bold text-black">Travelers & Class</h2>
      </div>

      <div className="flex-1 md:flex-none p-4 md:p-0 overflow-y-auto md:overflow-visible">
        <div className="mb-2">
          <h3 className="hidden md:block text-[17px] font-bold text-gray-900 mb-4">Travellers</h3>
          
          {/* Adults */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[15px] font-medium text-gray-900">Adults <span className="text-gray-400 font-normal">18+</span></div>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => setAdults(Math.max(1, adults - 1))} className={`w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer ${adults <= 1 ? 'border-gray-200 text-gray-300 cursor-not-allowed' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>-</button>
              <span className="w-4 text-center font-bold text-[15px] text-gray-900">{adults}</span>
              <button onClick={() => setAdults(Math.min(9, adults + 1))} className="w-8 h-8 rounded-lg border border-gray-300 text-gray-600 flex items-center justify-center cursor-pointer hover:border-gray-400">+</button>
            </div>
          </div>
          
          {/* Children */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[15px] font-medium text-gray-900">Children <span className="text-gray-400 font-normal">0-17</span></div>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => setChildren(Math.max(0, children - 1))} className={`w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer ${children <= 0 ? 'border-gray-200 text-gray-300 cursor-not-allowed' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>-</button>
              <span className="w-4 text-center font-bold text-[15px] text-gray-900">{children}</span>
              <button onClick={() => setChildren(Math.min(9, children + 1))} className="w-8 h-8 rounded-lg border border-gray-300 text-gray-600 flex items-center justify-center cursor-pointer hover:border-gray-400">+</button>
            </div>
          </div>
          
          {/* Infants */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-[15px] font-medium text-gray-900">Infants on lap <span className="text-gray-400 font-normal">under 2</span></div>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => setInfants(Math.max(0, infants - 1))} className={`w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer ${infants <= 0 ? 'border-gray-200 text-gray-300 cursor-not-allowed' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>-</button>
              <span className="w-4 text-center font-bold text-[15px] text-gray-900">{infants}</span>
              <button onClick={() => setInfants(Math.min(adults, infants + 1))} className={`w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer ${infants >= adults ? 'border-gray-200 text-gray-300 cursor-not-allowed' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>+</button>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-6 mt-4 md:mt-0">
          <h3 className="text-[17px] font-bold text-gray-900 mb-4">Cabin class</h3>
          <div className="flex flex-wrap gap-2">
            {["Economy", "Premium Economy", "Business", "First"].map(c => (
              <button 
                key={c}
                onClick={() => setCabinClass(c)}
                className={`px-4 py-2 rounded-xl border text-[15px] transition-colors cursor-pointer ${cabinClass === c ? 'border-gray-900 text-gray-900 font-medium' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>
      
      {/* Mobile Footer */}
      <div className="md:hidden p-4 border-t border-gray-200 bg-white">
        <button 
          onClick={(e) => { e.stopPropagation(); setActiveDropdown(null); }} 
          className="w-full bg-[#F04F23] hover:bg-[#E04010] text-white font-bold py-3.5 rounded-[8px] transition-colors"
        >
          Confirm
        </button>
      </div>
    </div>
  );

  return (
    <div className="shared-flight-search-bar w-full relative z-10">
      <ScrollReveal delay={0.3} className="w-full">
        <div className={`flex items-center mb-4 max-w-[1600px] w-full mx-auto gap-3 px-4 lg:px-8 flex-wrap relative ${['tripType', 'specialFare'].includes(activeDropdown) ? 'z-[130]' : 'z-10'}`}>
          <div className="relative">
          <button 
            onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === 'tripType' ? null : 'tripType'); }}
            className="flex items-center bg-[#FFFFFF1A] backdrop-blur-sm py-[7px] px-4 gap-2 rounded-full border border-white/10 cursor-pointer hover:bg-[#FFFFFF26] transition-colors"
          >
            <span className="text-white text-sm font-medium">{tripType}</span>
            <svg className="w-3.5 h-3.5 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>
          
          {activeDropdown === 'tripType' && (
            <div className="absolute top-[110%] left-0 w-[200px] bg-white rounded-xl shadow-2xl z-50 py-2 cursor-default" onClick={e => e.stopPropagation()}>
              {['Return', 'One way'].map(type => (
                <div 
                  key={type} 
                  className={`px-4 py-2 text-sm cursor-pointer hover:bg-gray-50 transition-colors ${tripType === type ? 'text-orange-500 font-bold bg-orange-50/50' : 'text-gray-700'}`}
                  onClick={() => {
                    setTripType(type);
                    if (type === "One way") setReturnDate(null);
                    setActiveDropdown(null);
                  }}
                >
                  {type}
                </div>
              ))}
              <div
                className="px-4 py-2 text-sm text-gray-400 cursor-not-allowed"
                title="Multi-city isn’t supported by the live LiteAPI search yet"
              >
                Multi-way
                <span className="block text-[11px] text-gray-400">Coming via Vero soon</span>
              </div>
            </div>
          )}
        </div>
        
        <div className="relative special-fares-dropdown">
          <button 
            onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === 'specialFare' ? null : 'specialFare'); }}
            className="flex items-center bg-[#FFFFFF1A] backdrop-blur-sm py-[7px] px-4 gap-2 rounded-full border border-white/10 cursor-pointer hover:bg-[#FFFFFF26] transition-colors"
            title="Special fares aren’t available on live LiteAPI search yet"
          >
            <span className="text-white text-sm font-medium">{specialFare || "Special Fares"}</span>
            <svg className="w-3.5 h-3.5 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </button>

          {activeDropdown === 'specialFare' && (
            <div className="absolute top-[110%] left-0 w-[240px] bg-white rounded-xl shadow-2xl z-50 py-3 px-4 cursor-default" onClick={e => e.stopPropagation()}>
              <p className="text-sm font-semibold text-gray-900 mb-1">Not on live search yet</p>
              <p className="text-xs text-gray-500 mb-3">
                Student / Senior / Armed Forces discounts aren’t exposed by LiteAPI. Ask Vero for help finding a fare.
              </p>
              <button
                type="button"
                className="w-full text-sm font-semibold text-orange-600 hover:text-orange-700 text-left"
                onClick={() => {
                  setActiveDropdown(null);
                  navigate("/vero");
                }}
              >
                Ask Vero →
              </button>
            </div>
          )}
        </div>
      </div>
      </ScrollReveal>
      {searchError && (
        <div className="max-w-[1600px] mx-auto px-4 lg:px-8 mb-3">
          <p className="text-amber-200 text-sm font-medium bg-black/40 inline-block px-3 py-2 rounded-lg" role="alert">
            {searchError}
          </p>
        </div>
      )}

      {/* Search bar */}
      <div className={`w-full px-4 lg:px-6 2xl:px-0 relative ${activeDropdown ? 'z-[120]' : 'z-50'}`}>
        <div ref={dropdownRef} className="flex flex-col lg:flex-row items-stretch justify-between px-4 lg:px-6 2xl:px-8 max-w-[1600px] w-full lg:h-[80px] 2xl:h-[98px] mb-[40px] lg:mb-[40px] 2xl:mb-[90px] mx-auto rounded-[20px] lg:rounded-[25px] border border-[#525252] py-4 lg:py-0 gap-4 lg:gap-0" style={{ backgroundColor: 'rgba(255, 255, 255, 0.07)' }}>

        {/* From */}
        <div className="relative flex items-center gap-3 lg:gap-[10px] 2xl:gap-[20px] cursor-pointer group lg:h-full" onClick={() => { if (activeDropdown !== 'from') { setActiveDropdown('from'); setSearchQuery(""); } }}>
          <svg className="w-6 h-6 lg:w-[22px] lg:h-[22px] 2xl:w-[35px] 2xl:h-[35px] text-white shrink-0 group-hover:text-orange-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
            <path d="M2.5 19h19v2h-19v-2zm19.57-9.36c-.21-.8-1.04-1.28-1.84-1.06L14.92 10l-6.9-6.43-1.93.51 4.14 7.17-4.97 1.33-1.97-1.54-1.45.39 2.59 4.49s7.12-1.9 16.57-4.43c.81-.23 1.28-1.05 1.07-1.85z"/>
          </svg>
          <div className="flex-1 min-w-0 lg:w-[120px] 2xl:w-[180px]">
            <span className="block text-white text-[14px] lg:text-[13px] 2xl:text-[17px] pb-[2px] lg:pb-[3px] 2xl:pb-[5px] font-medium leading-tight">From</span>
            {activeDropdown === 'from' ? (
              <>
                <input
                  autoFocus
                  type="text"
                  className="hidden md:block text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 bg-transparent border-none outline-none w-full placeholder:text-white/30"
                  placeholder="Search airport..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <span className="md:hidden block text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 truncate">{from ? `${from.city} (${from.code})` : "Select Origin"}</span>
              </>
            ) : (
              <span className="block text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 truncate">{from ? `${from.city} (${from.code})` : "Select Origin"}</span>
            )}
          </div>
          
          {/* Dropdown UI */}
          {activeDropdown === 'from' && (
            <div className="fixed inset-0 md:absolute md:top-full md:mt-3 lg:top-[108px] lg:mt-0 md:bottom-auto md:right-auto md:left-0 md:-left-6 w-full h-full md:w-[420px] md:h-auto bg-white md:rounded-[24px] shadow-2xl z-[100] md:z-50 max-h-screen overflow-y-auto md:overflow-visible py-0 md:py-2 md:border border-gray-100 cursor-default [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] flex flex-col md:block animate-slide-up-modal md:animate-dropdown-fade-up" onClick={e => e.stopPropagation()}>
              
              {/* Mobile Header & Input */}
              <div className="md:hidden flex-none">
                <div className="flex items-center p-4">
                  <button onClick={() => setActiveDropdown(null)} className="p-2 -ml-2 mr-2">
                    <svg className="w-6 h-6 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                  <h2 className="text-xl font-bold text-black">From where?</h2>
                </div>
                
                <div className="p-4 pt-0">
                  <div className="border border-gray-300 rounded-xl p-3 flex items-center bg-white">
                    <input
                      autoFocus
                      type="text"
                      className="flex-1 bg-transparent border-none outline-none text-black text-[13px] placeholder:text-gray-400"
                      placeholder="From?"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between mt-6 pb-4 border-b border-gray-100 opacity-60">
                    <span className="text-gray-600 text-[15px]">Include Nearby Airports</span>
                    <div
                      className="w-11 h-6 bg-gray-300 rounded-full relative cursor-not-allowed"
                      title="Nearby airports aren’t supported by live LiteAPI search yet"
                      aria-disabled="true"
                    >
                      <div className="w-5 h-5 bg-white rounded-full absolute top-[2px] left-[2px] shadow-sm"></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 md:flex-none overflow-y-auto md:max-h-[300px] pb-6 md:pb-0">
                {filteredAirports.length > 0 ? (
                  filteredAirports.map(airport => (
                    <div
                      key={airport.id}
                      className="flex items-center gap-4 px-5 py-4 md:py-3 hover:bg-gray-50 transition-colors cursor-pointer border-b border-gray-50 last:border-0"
                      onClick={() => {
                        setFrom(airport);
                        setActiveDropdown('to');
                        setSearchQuery("");
                      }}
                    >
                      <div className="w-6 h-6 md:w-[44px] md:h-[44px] shrink-0 bg-transparent md:bg-[#F3F4F6] rounded-xl flex items-center justify-center">
                        <svg className="w-5 h-5 text-gray-900 md:text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M2.5 19h19v2h-19v-2zm19.57-9.36c-.21-.8-1.04-1.28-1.84-1.06L14.92 10l-6.9-6.43-1.93.51 4.14 7.17-4.97 1.33-1.97-1.54-1.45.39 2.59 4.49s7.12-1.9 16.57-4.43c.81-.23 1.28-1.05 1.07-1.85z"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-900 font-bold text-[15px] truncate">{airport.city}, {airport.state}</span>
                        </div>
                        <div className="text-gray-500 text-[13px] truncate">{airport.name}</div>
                      </div>
                      <div className="text-gray-500 text-[14px] shrink-0 font-medium md:hidden">{airport.code}</div>
                      <div className={`hidden md:flex w-5 h-5 rounded border items-center justify-center shrink-0 ${from?.id === airport.id ? 'border-orange-500 bg-orange-50' : 'border-gray-300'}`}>
                        {from?.id === airport.id && (
                          <div className="w-3 h-3 bg-orange-500 rounded-sm"></div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-5 py-6 text-gray-500 text-sm text-center">No airports found</div>
                )}
                
                {/* Mobile Footer */}
                <div className="md:hidden px-6 pt-10 pb-6">
                  <p className="text-center text-[#4A4A4A] text-[15px] mb-4">
                    Sign-in isn’t enabled yet — ask Vero to help plan this trip.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate("/vero")}
                    className="w-full py-3.5 border border-gray-900 rounded-[12px] font-bold text-gray-900 hover:bg-gray-50 transition-colors"
                  >
                    Ask Vero
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Swap */}
        <div className="relative flex justify-center lg:block lg:w-auto z-10 -my-2 lg:my-0 lg:self-center">
          <button onClick={handleSwap} className="flex items-center justify-center w-8 h-8 rounded-full bg-white/[0.06] border border-white/10 cursor-pointer hover:bg-white/[0.12] transition-colors shrink-0 rotate-90 lg:rotate-0">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M15.97 2.47a.75.75 0 011.06 0l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 11-1.06-1.06l3.22-3.22H7.5a.75.75 0 010-1.5h11.69l-3.22-3.22a.75.75 0 010-1.06zm-7.94 9a.75.75 0 010 1.06l-3.22 3.22H16.5a.75.75 0 010 1.5H4.81l3.22 3.22a.75.75 0 11-1.06 1.06l-4.5-4.5a.75.75 0 010-1.06l4.5-4.5a.75.75 0 011.06 0z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Going To */}
        <div className="relative flex items-center gap-3 lg:gap-[10px] 2xl:gap-[20px] cursor-pointer group lg:h-full" onClick={() => { if (activeDropdown !== 'to') { setActiveDropdown('to'); setSearchQuery(""); } }}>
          <svg className="w-6 h-6 lg:w-[22px] lg:h-[22px] 2xl:w-[35px] 2xl:h-[35px] text-white shrink-0 group-hover:text-orange-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
            <path d="M2.5 19h19v2h-19v-2zm7.18-5.73l4.35 1.16 5.31 1.42c.8.21 1.62-.26 1.84-1.06.21-.8-.26-1.62-1.06-1.84l-5.31-1.42-2.76-9.02L10.12 2v8.28L5.15 8.95l-.93-2.32-1.45-.39v5.17l6.91 1.86z"/>
          </svg>
          <div className="flex-1 min-w-0 lg:w-[120px] 2xl:w-[180px]">
            <span className="block text-white text-[14px] lg:text-[13px] 2xl:text-[17px] pb-[2px] lg:pb-[3px] 2xl:pb-[5px] font-medium leading-tight">Going To</span>
            {activeDropdown === 'to' ? (
              <>
                <input
                  autoFocus
                  type="text"
                  className="hidden md:block text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 bg-transparent border-none outline-none w-full placeholder:text-white/30"
                  placeholder="Search airport..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <span className="md:hidden block text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 truncate">{to ? `${to.city} (${to.code})` : "Select Destination"}</span>
              </>
            ) : (
              <span className="block text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 truncate">{to ? `${to.city} (${to.code})` : "Select Destination"}</span>
            )}
          </div>

          {/* Dropdown UI */}
          {activeDropdown === 'to' && (
            <div className="fixed inset-0 md:absolute md:top-full md:mt-3 lg:top-[108px] lg:mt-0 md:bottom-auto md:right-auto md:left-0 md:-left-6 w-full h-full md:w-[420px] md:h-auto bg-white md:rounded-[24px] shadow-2xl z-[100] md:z-50 max-h-screen overflow-y-auto md:overflow-visible py-0 md:py-2 md:border border-gray-100 cursor-default [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] flex flex-col md:block animate-slide-up-modal md:animate-dropdown-fade-up" onClick={e => e.stopPropagation()}>
              
              {/* Mobile Header & Input */}
              <div className="md:hidden flex-none">
                <div className="flex items-center p-4">
                  <button onClick={() => setActiveDropdown(null)} className="p-2 -ml-2 mr-2">
                    <svg className="w-6 h-6 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                  <h2 className="text-xl font-bold text-black">To where?</h2>
                </div>
                
                <div className="p-4 pt-0">
                  <div className="border border-gray-300 rounded-xl p-3 flex items-center bg-white">
                    <input
                      autoFocus
                      type="text"
                      className="flex-1 bg-transparent border-none outline-none text-black text-[13px] placeholder:text-gray-400"
                      placeholder="To?"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between mt-6 pb-4 border-b border-gray-100 opacity-60">
                    <span className="text-gray-600 text-[15px]">Include Nearby Airports</span>
                    <div
                      className="w-11 h-6 bg-gray-300 rounded-full relative cursor-not-allowed"
                      title="Nearby airports aren’t supported by live LiteAPI search yet"
                      aria-disabled="true"
                    >
                      <div className="w-5 h-5 bg-white rounded-full absolute top-[2px] left-[2px] shadow-sm"></div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 md:flex-none overflow-y-auto md:max-h-[300px] pb-6 md:pb-0">
                {filteredAirports.length > 0 ? (
                  filteredAirports.map(airport => (
                    <div
                      key={airport.id}
                      className="flex items-center gap-4 px-5 py-4 md:py-3 hover:bg-gray-50 transition-colors cursor-pointer border-b border-gray-50 last:border-0"
                      onClick={() => {
                        setTo(airport);
                        setActiveDropdown('depart');
                        setSearchQuery("");
                      }}
                    >
                      <div className="w-6 h-6 md:w-[44px] md:h-[44px] shrink-0 bg-transparent md:bg-[#F3F4F6] rounded-xl flex items-center justify-center">
                        <svg className="w-5 h-5 text-gray-900 md:text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M2.5 19h19v2h-19v-2zm7.18-5.73l4.35 1.16 5.31 1.42c.8.21 1.62-.26 1.84-1.06.21-.8-.26-1.62-1.06-1.84l-5.31-1.42-2.76-9.02L10.12 2v8.28L5.15 8.95l-.93-2.32-1.45-.39v5.17l6.91 1.86z"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-900 font-bold text-[15px] truncate">{airport.city}, {airport.state}</span>
                        </div>
                        <div className="text-gray-500 text-[13px] truncate">{airport.name}</div>
                      </div>
                      <div className="text-gray-500 text-[14px] shrink-0 font-medium md:hidden">{airport.code}</div>
                      <div className={`hidden md:flex w-5 h-5 rounded border items-center justify-center shrink-0 ${to?.id === airport.id ? 'border-orange-500 bg-orange-50' : 'border-gray-300'}`}>
                        {to?.id === airport.id && (
                          <div className="w-3 h-3 bg-orange-500 rounded-sm"></div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-5 py-6 text-gray-500 text-sm text-center">No airports found</div>
                )}
                
                {/* Mobile Footer */}
                <div className="md:hidden px-6 pt-10 pb-6">
                  <p className="text-center text-[#4A4A4A] text-[15px] mb-4">
                    Sign-in isn’t enabled yet — ask Vero to help plan this trip.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate("/vero")}
                    className="w-full py-3.5 border border-gray-900 rounded-[12px] font-bold text-gray-900 hover:bg-gray-50 transition-colors"
                  >
                    Ask Vero
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="hidden lg:block w-px h-10 bg-white/[0.12] shrink-0 lg:self-center" />

        {/* Depart */}
        <div className="flex items-center gap-4 lg:hidden w-full my-3 py-3 border-y border-white/[0.12]">
          <div className="relative flex-1 flex items-center gap-3 cursor-pointer group" onClick={() => setActiveDropdown('depart')}>
            <svg className="w-6 h-6 text-white shrink-0" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" /></svg>
            <div className="flex-1 min-w-0"><span className="block text-white text-[14px] font-medium leading-tight">Depart</span><span className="block text-white text-[13px] font-medium mt-0.5 truncate">{formatDate(departDate) || "Add Date"}</span></div>
            {(activeDropdown === 'depart' || (activeDropdown === 'return' && tripType === 'Return')) && datePickerUI}
          </div>
          {tripType === "Return" && (
            <>
          <div className="w-px h-8 bg-white/[0.12] shrink-0" />
          <div className="relative flex-1 flex items-center gap-3 cursor-pointer group pl-2" onClick={() => setActiveDropdown('return')}>
            <svg className="w-6 h-6 text-white shrink-0" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" /></svg>
            <div className="flex-1 min-w-0"><span className="block text-white text-[14px] font-medium leading-tight">Return</span><span className="block text-white text-[13px] font-medium mt-0.5 truncate">{formatDate(returnDate) || "Add Date"}</span></div>
          </div>
            </>
          )}
        </div>

        {/* Desktop Depart */}
        <div className="hidden lg:relative lg:flex items-center gap-[10px] 2xl:gap-[20px] cursor-pointer group lg:h-full" onClick={() => setActiveDropdown('depart')}>
          <svg className="w-[22px] h-[22px] 2xl:w-[35px] 2xl:h-[35px] text-white shrink-0 group-hover:text-orange-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" />
          </svg>
          <div className="w-[90px] 2xl:w-[120px]">
            <span className="block text-white text-[13px] 2xl:text-[17px] pb-[3px] 2xl:pb-[5px] font-medium leading-tight">Depart</span>
            <span className="block text-white text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 truncate">{formatDate(departDate) || "Add Date"}</span>
          </div>
          {(activeDropdown === 'depart' || activeDropdown === 'return') && datePickerUI}
        </div>

        {/* Divider */}
        <div className="hidden lg:block w-px h-10 bg-white/[0.12] shrink-0 lg:self-center" />

        {/* Return - Desktop only */}
        {tripType === "Return" ? (
        <div className="hidden lg:flex items-center gap-[10px] 2xl:gap-[20px] cursor-pointer group lg:h-full" onClick={() => setActiveDropdown('return')}>
          <svg className="w-[22px] h-[22px] 2xl:w-[35px] 2xl:h-[35px] text-white shrink-0 group-hover:text-orange-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" />
          </svg>
          <div className="w-[90px] 2xl:w-[120px]">
            <span className="block text-white text-[13px] 2xl:text-[17px] pb-[3px] 2xl:pb-[5px] font-medium leading-tight">Return</span>
            <span className="block text-white text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 truncate">{formatDate(returnDate) || "Add Date"}</span>
          </div>
        </div>
        ) : (
        <div className="hidden lg:flex items-center gap-[10px] 2xl:gap-[20px] lg:h-full opacity-50 cursor-not-allowed" title="Switch to Return trip to pick a return date">
          <div className="w-[90px] 2xl:w-[120px]">
            <span className="block text-white text-[13px] 2xl:text-[17px] pb-[3px] 2xl:pb-[5px] font-medium leading-tight">Return</span>
            <span className="block text-white text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 truncate">One way</span>
          </div>
        </div>
        )}

        {/* Divider */}
        <div className="hidden lg:block w-px h-10 bg-white/[0.12] shrink-0 lg:self-center" />

        {/* Travelers & Class */}
        <div className="relative flex items-center gap-3 lg:gap-[10px] 2xl:gap-[20px] cursor-pointer group mt-2 lg:mt-0 lg:h-full" onClick={() => setActiveDropdown('travelers')}>
          <svg className="w-6 h-6 lg:w-[22px] lg:h-[22px] 2xl:w-[35px] 2xl:h-[35px] text-white shrink-0 group-hover:text-orange-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
            <path d="M4.5 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM14.25 8.625a3.375 3.375 0 116.75 0 3.375 3.375 0 01-6.75 0zM1.5 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.63 13.067 13.067 0 01-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 01-.364-.63l-.001-.122zM17.25 19.128l-.001.144a2.25 2.25 0 01-.233.96 10.088 10.088 0 005.06-1.01.75.75 0 00.42-.643 4.875 4.875 0 00-6.957-4.611 8.586 8.586 0 011.71 5.157v.003z" />
          </svg>
          <div className="flex-1 min-w-0">
            <span className="block text-white text-[14px] lg:text-[13px] 2xl:text-[17px] pb-[2px] lg:pb-[3px] 2xl:pb-[5px] font-medium leading-tight">Travelers &amp; Class</span>
            <span className="block text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 truncate">{adults + children + infants} Pax, {cabinClass}</span>
          </div>
          
          {activeDropdown === 'travelers' && travelersUI}
        </div>

        {/* Search button */}
        <button 
          type="button"
          onClick={handleSearch}
          disabled={isSearching}
          className="flex items-center justify-center w-full lg:w-auto bg-gradient-to-r from-[#F97316] to-[#EA580C] py-2.5 lg:py-2.5 2xl:py-3 px-4 lg:px-4 2xl:px-6 gap-2 rounded-[14px] lg:rounded-[14px] 2xl:rounded-[18px] border-0 cursor-pointer hover:from-[#FB923C] hover:to-[#F97316] transition-all shadow-[0_4px_15px_rgba(249,115,22,0.4)] hover:shadow-[0_4px_20px_rgba(249,115,22,0.6)] mt-2 lg:mt-0 lg:self-center disabled:opacity-70 disabled:cursor-wait">
          <svg className="w-4 h-4 lg:w-4 lg:h-4 2xl:w-5 2xl:h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 100 13.5 6.75 6.75 0 000-13.5zM2.25 10.5a8.25 8.25 0 1114.59 5.28l4.69 4.69a.75.75 0 11-1.06 1.06l-4.69-4.69A8.25 8.25 0 012.25 10.5z" clipRule="evenodd" />
          </svg>
          <span className="text-white text-[13px] lg:text-[14px] 2xl:text-[19px] font-semibold">{isSearching ? "Searching…" : "Search"}</span>
        </button>

      </div>
      </div>
      {isSearching && (
        <FlightSearchAnimation
          from={from}
          to={to}
          onComplete={handleSearchComplete}
        />
      )}
    </div>
  );
}
