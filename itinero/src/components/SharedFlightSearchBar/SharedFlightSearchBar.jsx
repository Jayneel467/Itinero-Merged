import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AIRPORTS, findAirportByCode } from '@/constants/airports';
import useAirportSuggest from '@/features/flights/hooks/useAirportSuggest';
import ScrollReveal from '@/components/ScrollReveal';
import { useAnchoredPanel } from '@/hooks/useAnchoredPanel';
import MultiWayFlightRow from './MultiWayFlightRow';
import { trackInterestEvent } from '@/services/interestTracker';

const PANEL_SHEET =
  "fixed inset-0 z-[220] w-full h-full bg-white cursor-default overflow-hidden animate-slide-up-modal flex flex-col md:inset-auto md:h-auto md:rounded-[24px] md:shadow-2xl md:overflow-visible md:animate-dropdown-fade-up md:block md:p-6";

function parseLocalDate(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  // "21 Aug" / "21 Aug 2026"
  const m = String(value).trim().match(
    /^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?(?:\s+(\d{4}))?$/i
  );
  if (m) {
    const day = Number(m[1]);
    const mon = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    }[m[2].slice(0, 3).toLowerCase()];
    const year = m[3] ? Number(m[3]) : new Date().getFullYear();
    if (Number.isFinite(mon)) {
      const dt = new Date(year, mon, day);
      return Number.isNaN(dt.getTime()) ? null : dt;
    }
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

const MAX_AIRPORTS = 3;

function parseCodesParam(raw) {
  return String(raw || "")
    .split(/[,+|/\s]+/)
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{3}$/.test(c))
    .filter((c, i, arr) => arr.indexOf(c) === i)
    .slice(0, MAX_AIRPORTS);
}

function airportFromCode(code) {
  return (
    findAirportByCode(code) || {
      id: String(code).toLowerCase(),
      city: code,
      state: "",
      name: `${code} Airport`,
      code,
    }
  );
}

function formatAirportSummary(list) {
  if (!list?.length) return "";
  if (list.length === 1) {
    const a = list[0];
    const city = a.city || a.name || a.code;
    return `${city} (${a.code})`;
  }
  return list.map((a) => a.code).join(", ");
}

function toggleAirportInList(list, airport, { max = MAX_AIRPORTS, single = false } = {}) {
  if (!airport?.code) return list;
  const code = airport.code.toUpperCase();
  const exists = list.some((a) => a.code === code);
  if (exists) {
    // In multi-airport mode keep at least one selected once the user has picked.
    if (single || list.length <= 1) return list;
    return list.filter((a) => a.code !== code);
  }
  if (single) return [{ ...airport, code }];
  if (list.length >= max) return list;
  return [...list, { ...airport, code }];
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
  // Always start empty - never preload origin/destination into the bar.
  const [fromAirports, setFromAirports] = useState([]);
  const [toAirports, setToAirports] = useState([]);
  const from = fromAirports[0] || null;
  const to = toAirports[0] || null;
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchError, setSearchError] = useState("");
  
  const [departDate, setDepartDate] = useState(null);
  const [returnDate, setReturnDate] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [cabinClass, setCabinClass] = useState("Economy");
  
  const [tripType, setTripType] = useState("Return");
  const [specialFare, setSpecialFare] = useState("");
  const [multiFlights, setMultiFlights] = useState([
    { id: 1, from: null, to: null, departDate: null },
  ]);

  const allowMultiAirport = tripType !== "Multi-way";

  const updateMultiFlight = (id, field, value) => {
    setMultiFlights((prev) => prev.map((f) => (f.id === id ? { ...f, [field]: value } : f)));
  };

  const addMultiFlight = () => {
    if (multiFlights.length >= 4) return;
    setMultiFlights((prev) => {
      const last = prev[prev.length - 1];
      const nextFrom = last?.to || to || null;
      return [...prev, { id: Date.now(), from: nextFrom, to: null, departDate: null }];
    });
  };

  const removeMultiFlight = (id) => {
    setMultiFlights((prev) => (prev.length <= 1 ? prev : prev.filter((f) => f.id !== id)));
  };
  
  const dropdownRef = useRef(null);
  const fromAnchorRef = useRef(null);
  const toAnchorRef = useRef(null);
  const datesAnchorRef = useRef(null);
  const travelersAnchorRef = useRef(null);

  const datesOpen =
    activeDropdown === "depart" || (activeDropdown === "return" && tripType === "Return");
  const fromPanelStyle = useAnchoredPanel(fromAnchorRef, activeDropdown === "from", {
    width: 420,
    estimatedHeight: 360,
    offsetX: -24,
  });
  const toPanelStyle = useAnchoredPanel(toAnchorRef, activeDropdown === "to", {
    width: 420,
    estimatedHeight: 360,
    offsetX: -24,
  });
  const datesPanelStyle = useAnchoredPanel(datesAnchorRef, datesOpen, {
    width: 780,
    estimatedHeight: 460,
    offsetX: -30,
  });
  const travelersPanelStyle = useAnchoredPanel(
    travelersAnchorRef,
    activeDropdown === "travelers",
    { width: 380, estimatedHeight: 360, align: "right" }
  );

  // Hydrate from URL when landing on /flights?... (re-search / deep links)
  useEffect(() => {
    const fromCodes = parseCodesParam(searchParams.get("from"));
    const toCodes = parseCodesParam(searchParams.get("to"));
    if (fromCodes.length) setFromAirports(fromCodes.map(airportFromCode));
    if (toCodes.length) setToAirports(toCodes.map(airportFromCode));
    const dep = parseLocalDate(searchParams.get("depart") || searchParams.get("date"));
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
    if (trip) {
      const t = trip.toLowerCase();
      if (t.includes("multi")) setTripType("Multi-way");
      else if (t.includes("one")) setTripType("One way");
      else setTripType("Return");
    }
    const legsCount = Number(searchParams.get("legs") || 0);
    if (trip && trip.toLowerCase().includes("multi") && legsCount > 1) {
      const extras = [];
      for (let i = 1; i < legsCount; i++) {
        extras.push({
          id: i + 1,
          from: findAirportByCode(searchParams.get(`leg${i}_from`)),
          to: findAirportByCode(searchParams.get(`leg${i}_to`)),
          departDate: parseLocalDate(searchParams.get(`leg${i}_depart`)),
        });
      }
      if (extras.length) setMultiFlights(extras);
    }
    // Close pickers on URL change so resume/re-search never leaves a stuck overlay.
    setActiveDropdown(null);
    setSearchQuery("");
  }, [searchParams]);

  const handleSearch = useCallback(() => {
    setActiveDropdown(null);
    setSearchError("");
    if (tripType === "Multi-way") {
      const legs = [
        { from, to, departDate },
        ...multiFlights,
      ];
      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];
        if (!leg.from?.code || !leg.to?.code) {
          setSearchError(`Flight ${i + 1}: pick origin and destination.`);
          return;
        }
        if (leg.from.code === leg.to.code) {
          setSearchError(`Flight ${i + 1}: origin and destination must differ.`);
          return;
        }
        if (!leg.departDate) {
          setSearchError(`Flight ${i + 1}: add a departure date.`);
          return;
        }
      }
      if (typeof onSearchTriggered === "function") onSearchTriggered();
      // Fall through to immediate navigate (no animation gate).
    } else {
      if (!fromAirports.length || !toAirports.length) {
        setSearchError("Pick origin and destination airports.");
        return;
      }
      const hasValidPair = fromAirports.some((o) =>
        toAirports.some((d) => o.code !== d.code)
      );
      if (!hasValidPair) {
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
    }

    const fromCodes = fromAirports.map((a) => a.code).filter(Boolean);
    const toCodes = toAirports.map((a) => a.code).filter(Boolean);
    const params = new URLSearchParams({
      from: fromCodes.join(","),
      to: toCodes.join(","),
      fromCity: fromAirports.map((a) => a.city).filter(Boolean).join(","),
      toCity: toAirports.map((a) => a.city).filter(Boolean).join(","),
      depart: toYmd(departDate),
      adults: String(adults),
      children: String(children),
      infants: String(infants),
      cabin: cabinClass,
      trip: tripType === "One way" ? "oneway" : tripType === "Multi-way" ? "multiway" : "return",
    });
    if (tripType === "Return") {
      const activeReturn = returnDate || defaultReturnDate(departDate || new Date());
      params.set("return", toYmd(activeReturn));
    }
    if (tripType === "Multi-way") {
      const legs = [{ from, to, departDate }, ...multiFlights];
      legs.forEach((leg, i) => {
        if (leg.from?.code) params.set(`leg${i}_from`, leg.from.code);
        if (leg.to?.code) params.set(`leg${i}_to`, leg.to.code);
        if (leg.departDate) params.set(`leg${i}_depart`, toYmd(leg.departDate));
      });
      params.set("legs", String(legs.length));
    }
    try {
      const destCity = to?.city || toAirports[0]?.city || "";
      if (destCity) {
        trackInterestEvent("search", {
          city: destCity,
          destination: destCity,
          country: to?.country || toAirports[0]?.country || "",
          product: "flights",
        });
      }
    } catch {
      /* optional */
    }
    navigate(`/flights?${params.toString()}`);
  }, [
    from,
    to,
    fromAirports,
    toAirports,
    departDate,
    returnDate,
    adults,
    children,
    infants,
    cabinClass,
    tripType,
    multiFlights,
    onSearchTriggered,
    navigate,
  ]);

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
        !event.target.closest(".special-fares-dropdown") &&
        !event.target.closest(".trip-type-dropdown") &&
        !event.target.closest(".flight-search-button")
      ) {
        setActiveDropdown(null);
        setSearchQuery("");
      }
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setActiveDropdown(null);
        setSearchQuery("");
      }
    };
    const handleScrollClose = (event) => {
      const t = event.target;
      if (t?.closest?.("[data-airport-dropdown]")) return;
      setActiveDropdown((cur) => (cur ? null : cur));
      setSearchQuery("");
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("scroll", handleScrollClose, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("scroll", handleScrollClose, true);
    };
  }, []);

  const { airports: filteredAirports, isLoading: airportSuggestLoading } = useAirportSuggest(
    searchQuery,
    { enabled: activeDropdown === 'from' || activeDropdown === 'to' }
  );

  const handleSwap = (e) => {
    e.stopPropagation();
    setFromAirports(toAirports);
    setToAirports(fromAirports);
  };

  const pickFromAirport = (airport) => {
    const code = airport?.code?.toUpperCase();
    const alreadyOnly =
      fromAirports.length === 1 && fromAirports[0]?.code === code;
    setFromAirports((prev) =>
      toggleAirportInList(prev, airport, { single: !allowMultiAirport })
    );
    setSearchQuery("");
    if (!allowMultiAirport || alreadyOnly) {
      setActiveDropdown("to");
    }
  };

  const pickToAirport = (airport) => {
    const code = airport?.code?.toUpperCase();
    const alreadyOnly =
      toAirports.length === 1 && toAirports[0]?.code === code;
    setToAirports((prev) =>
      toggleAirportInList(prev, airport, { single: !allowMultiAirport })
    );
    setSearchQuery("");
    if (!allowMultiAirport || alreadyOnly) {
      setActiveDropdown("depart");
    }
  };

  const removeFromChip = (code, e) => {
    e?.stopPropagation?.();
    setFromAirports((prev) => (prev.length <= 1 ? prev : prev.filter((a) => a.code !== code)));
  };

  const removeToChip = (code, e) => {
    e?.stopPropagation?.();
    setToAirports((prev) => (prev.length <= 1 ? prev : prev.filter((a) => a.code !== code)));
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
               // One-way / multi-way: don't force the return date picker open
               if (tripType === 'Return') {
                 setActiveDropdown('return');
               } else {
                 setActiveDropdown(null);
               }
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
    <div className={`${PANEL_SHEET} md:w-[min(780px,calc(100vw-32px))]`} style={datesPanelStyle} onClick={e => e.stopPropagation()}>
      
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
              title="Weekend / flexible-month search isn’t available yet"
            >
              WEEKEND
            </span>
            <span
              className="text-[13px] font-bold text-gray-400 pb-1 cursor-not-allowed"
              title="Weekend / flexible-month search isn’t available yet"
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
    <div className={`${PANEL_SHEET} md:w-[380px]`} style={travelersPanelStyle} onClick={e => e.stopPropagation()}>
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
    <div className={`shared-flight-search-bar w-full relative ${activeDropdown ? 'z-50' : 'z-10'}`}>
      <ScrollReveal delay={0.3} className="w-full">
        <div className={`flex items-center mb-4 max-w-[1600px] w-full mx-auto px-4 lg:px-6 2xl:px-8 gap-3 flex-wrap relative ${['tripType', 'specialFare'].includes(activeDropdown) ? 'z-[130]' : 'z-10'}`}>
          <div className="relative trip-type-dropdown">
            <button 
              type="button"
              onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === 'tripType' ? null : 'tripType'); }}
              className="flex items-center backdrop-blur-md py-[7px] px-4 gap-2 rounded-full border border-white/15 cursor-pointer hover:bg-white/20 transition-all shadow-sm"
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)' }}
            >
              <span className="text-white text-sm font-medium">{tripType}</span>
              <svg className="w-3.5 h-3.5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            
            {activeDropdown === 'tripType' && (
              <div
                className="absolute top-[110%] left-0 w-[200px] bg-white rounded-xl shadow-2xl z-[140] py-2 cursor-default"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                {['Return', 'One way', 'Multi-way'].map(type => (
                  <button
                    type="button"
                    key={type} 
                    className={`w-full text-left px-4 py-2.5 text-sm cursor-pointer hover:bg-gray-50 transition-colors border-0 bg-transparent ${tripType === type ? 'text-orange-500 font-bold bg-orange-50/50' : 'text-gray-700'}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setTripType(type);
                      if (type === "One way") {
                        setReturnDate(null);
                        setMultiFlights([{ id: 1, from: null, to: null, departDate: null }]);
                      }
                      if (type === "Multi-way") {
                        setReturnDate(null);
                        // Multi-city uses one airport per field
                        setFromAirports((prev) => (prev[0] ? [prev[0]] : prev));
                        setToAirports((prev) => (prev[0] ? [prev[0]] : prev));
                        setMultiFlights([
                          {
                            id: Date.now(),
                            from: to || null,
                            to: null,
                            departDate: departDate
                              ? new Date(departDate.getTime() + 3 * 86400000)
                              : null,
                          },
                        ]);
                      }
                      if (type === "Return") {
                        setMultiFlights([{ id: 1, from: null, to: null, departDate: null }]);
                      }
                      setActiveDropdown(null);
                    }}
                  >
                    {type}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <div className="relative special-fares-dropdown">
            <button 
              onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === 'specialFare' ? null : 'specialFare'); }}
              className="flex items-center backdrop-blur-md py-[7px] px-4 gap-2 rounded-full border border-white/15 cursor-pointer hover:bg-white/20 transition-all shadow-sm"
              style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)' }}
              title="Special fares aren’t available on live search yet"
            >
              <span className="text-white text-sm font-medium">{specialFare || "Special Fares"}</span>
              <svg className="w-3.5 h-3.5 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>

          {activeDropdown === 'specialFare' && (
            <div className="absolute top-[110%] left-0 w-[240px] bg-white rounded-xl shadow-2xl z-50 py-3 px-4 cursor-default" onClick={e => e.stopPropagation()}>
              <p className="text-sm font-semibold text-gray-900 mb-1">Not on live search yet</p>
              <p className="text-xs text-gray-500 mb-3">
                Student / Senior / Armed Forces discounts aren’t on live search yet. Ask Vero for help finding a fare.
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
      <div className={`w-full px-4 lg:px-6 2xl:px-8 relative ${activeDropdown ? 'z-[120]' : 'z-50'}`}>
        <div
          ref={dropdownRef}
          className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 lg:gap-0 px-4 lg:px-4 xl:px-5 2xl:px-6 max-w-[1600px] w-full min-w-0 lg:h-[88px] 2xl:h-[98px] mb-[40px] lg:mb-[40px] 2xl:mb-[90px] mx-auto rounded-[20px] lg:rounded-[24px] border border-white/15 py-4 lg:py-0"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)' }}
        >

        {/* From */}
        <div ref={fromAnchorRef} className="relative flex items-center gap-3 lg:gap-2.5 2xl:gap-3 cursor-pointer group lg:h-full lg:flex-1 lg:min-w-[132px] lg:max-w-[260px] xl:max-w-[300px] 2xl:max-w-none lg:pr-3" onClick={() => { if (activeDropdown !== 'from') { setActiveDropdown('from'); setSearchQuery(""); } }}>
          <svg className="w-6 h-6 lg:w-[22px] lg:h-[22px] 2xl:w-[28px] 2xl:h-[28px] text-white shrink-0 group-hover:text-orange-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
            <path d="M2.5 19h19v2h-19v-2zm19.57-9.36c-.21-.8-1.04-1.28-1.84-1.06L14.92 10l-6.9-6.43-1.93.51 4.14 7.17-4.97 1.33-1.97-1.54-1.45.39 2.59 4.49s7.12-1.9 16.57-4.43c.81-.23 1.28-1.05 1.07-1.85z"/>
          </svg>
          <div className="flex-1 min-w-0">
            <span className="block text-white text-[14px] lg:text-[13px] 2xl:text-[15px] pb-[2px] lg:pb-[3px] 2xl:pb-[5px] font-medium leading-tight">
              From{fromAirports.length > 1 ? ` · ${fromAirports.length}` : ""}
            </span>
            {activeDropdown === 'from' ? (
              <>
                <input
                  autoFocus
                  type="text"
                  className="hidden md:block text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 bg-transparent border-none outline-none w-full placeholder:text-white/50"
                  placeholder={
                    formatAirportSummary(fromAirports) ||
                    (allowMultiAirport ? "Add up to 3 airports…" : "Enter origin airport")
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <span className="md:hidden block text-white text-[14px] lg:text-[13px] 2xl:text-[17px] font-semibold leading-tight mt-0.5 truncate">
                  {formatAirportSummary(fromAirports) || "Enter origin airport"}
                </span>
              </>
            ) : (
              <span className="block text-white text-[14px] lg:text-[13px] 2xl:text-[17px] font-semibold leading-tight mt-0.5 truncate">
                {formatAirportSummary(fromAirports) || "Enter origin airport"}
              </span>
            )}
          </div>
          
          {/* Dropdown UI */}
          {activeDropdown === 'from' && (
            <div
              data-airport-dropdown
              className={`${PANEL_SHEET} md:w-[420px] md:py-2 md:border md:border-gray-100 max-h-screen overflow-y-auto md:max-h-[360px] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]`}
              style={fromPanelStyle}
              onClick={e => e.stopPropagation()}
            >
              
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
                  
                  <div className="mt-4 pb-3 border-b border-gray-100">
                    <p className="text-gray-600 text-[13px] font-medium">
                      {allowMultiAirport
                        ? `Select up to ${MAX_AIRPORTS} airports to compare (${fromAirports.length}/${MAX_AIRPORTS})`
                        : "Pick one origin airport"}
                    </p>
                    {fromAirports.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {fromAirports.map((a) => (
                          <button
                            key={a.code}
                            type="button"
                            onClick={(e) => removeFromChip(a.code, e)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 text-xs font-bold"
                          >
                            {a.code}
                            <span aria-hidden>×</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="hidden md:block px-5 pt-3 pb-2 border-b border-gray-50">
                <p className="text-gray-500 text-[12px] font-semibold uppercase tracking-wide">
                  {allowMultiAirport
                    ? `Multi-airport · ${fromAirports.length}/${MAX_AIRPORTS}`
                    : "Origin airport"}
                </p>
                {allowMultiAirport && fromAirports.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {fromAirports.map((a) => (
                      <button
                        key={a.code}
                        type="button"
                        onClick={(e) => removeFromChip(a.code, e)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 text-[11px] font-bold"
                      >
                        {a.code} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex-1 md:flex-none overflow-y-auto md:max-h-[300px] pb-6 md:pb-0">
                {filteredAirports.length > 0 ? (
                  filteredAirports.map(airport => {
                    const selected = fromAirports.some((a) => a.code === airport.code);
                    const atMax = allowMultiAirport && !selected && fromAirports.length >= MAX_AIRPORTS;
                    return (
                    <div
                      key={airport.id}
                      className={`flex items-center gap-4 px-5 py-4 md:py-3 hover:bg-gray-50 transition-colors cursor-pointer border-b border-gray-50 last:border-0 ${atMax ? "opacity-40" : ""}`}
                      onClick={() => {
                        if (atMax) return;
                        pickFromAirport(airport);
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
                      <div className={`hidden md:flex w-5 h-5 rounded border items-center justify-center shrink-0 ${selected ? 'border-orange-500 bg-orange-50' : 'border-gray-300'}`}>
                        {selected && (
                          <div className="w-3 h-3 bg-orange-500 rounded-sm"></div>
                        )}
                      </div>
                    </div>
                  );})
                ) : (
                  <div className="px-5 py-6 text-gray-500 text-sm text-center">
                    {airportSuggestLoading ? "Searching airports…" : "No airports found"}
                  </div>
                )}

                {allowMultiAirport && (
                  <div className="sticky bottom-0 md:static px-5 py-3 bg-white border-t border-gray-100 flex gap-2">
                    <button
                      type="button"
                      disabled={!fromAirports.length}
                      onClick={() => {
                        setActiveDropdown("to");
                        setSearchQuery("");
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-[#F04F23] text-white font-bold text-sm disabled:opacity-40"
                    >
                      Done · Going to
                    </button>
                  </div>
                )}
                
                {/* Mobile Footer */}
                <div className="md:hidden px-6 pt-6 pb-6">
                  <p className="text-center text-[#4A4A4A] text-[15px] mb-4">
                    Tip: select multiple nearby airports to compare fares.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Swap */}
        <div className="relative flex justify-center lg:block lg:w-auto z-10 -my-2 lg:my-0 lg:self-center lg:shrink-0 lg:px-1">
          <button onClick={handleSwap} className="flex items-center justify-center w-8 h-8 rounded-full bg-white/[0.06] border border-white/10 cursor-pointer hover:bg-white/[0.12] transition-colors shrink-0 rotate-90 lg:rotate-0">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M15.97 2.47a.75.75 0 011.06 0l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 11-1.06-1.06l3.22-3.22H7.5a.75.75 0 010-1.5h11.69l-3.22-3.22a.75.75 0 010-1.06zm-7.94 9a.75.75 0 010 1.06l-3.22 3.22H16.5a.75.75 0 010 1.5H4.81l3.22 3.22a.75.75 0 11-1.06 1.06l-4.5-4.5a.75.75 0 010-1.06l4.5-4.5a.75.75 0 011.06 0z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Going To */}
        <div ref={toAnchorRef} className="relative flex items-center gap-3 lg:gap-2.5 2xl:gap-3 cursor-pointer group lg:h-full lg:flex-1 lg:min-w-[132px] lg:max-w-[260px] xl:max-w-[300px] 2xl:max-w-none lg:px-3" onClick={() => { if (activeDropdown !== 'to') { setActiveDropdown('to'); setSearchQuery(""); } }}>
          <svg className="w-6 h-6 lg:w-[22px] lg:h-[22px] 2xl:w-[28px] 2xl:h-[28px] text-white shrink-0 group-hover:text-orange-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
            <path d="M2.5 19h19v2h-19v-2zm7.18-5.73l4.35 1.16 5.31 1.42c.8.21 1.62-.26 1.84-1.06.21-.8-.26-1.62-1.06-1.84l-5.31-1.42-2.76-9.02L10.12 2v8.28L5.15 8.95l-.93-2.32-1.45-.39v5.17l6.91 1.86z"/>
          </svg>
          <div className="flex-1 min-w-0">
            <span className="block text-white text-[14px] lg:text-[13px] 2xl:text-[15px] pb-[2px] lg:pb-[3px] 2xl:pb-[5px] font-medium leading-tight">
              Going To{toAirports.length > 1 ? ` · ${toAirports.length}` : ""}
            </span>
            {activeDropdown === 'to' ? (
              <>
                <input
                  autoFocus
                  type="text"
                  className="hidden md:block text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 bg-transparent border-none outline-none w-full placeholder:text-white/50"
                  placeholder={
                    formatAirportSummary(toAirports) ||
                    (allowMultiAirport ? "Add up to 3 airports…" : "Enter destination airport")
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <span className="md:hidden block text-white text-[14px] lg:text-[13px] 2xl:text-[17px] font-semibold leading-tight mt-0.5 truncate">
                  {formatAirportSummary(toAirports) || "Enter destination airport"}
                </span>
              </>
            ) : (
              <span className="block text-white text-[14px] lg:text-[13px] 2xl:text-[17px] font-semibold leading-tight mt-0.5 truncate">
                {formatAirportSummary(toAirports) || "Enter destination airport"}
              </span>
            )}
          </div>

          {/* Dropdown UI */}
          {activeDropdown === 'to' && (
            <div
              data-airport-dropdown
              className={`${PANEL_SHEET} md:w-[420px] md:py-2 md:border md:border-gray-100 max-h-screen overflow-y-auto md:max-h-[360px] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]`}
              style={toPanelStyle}
              onClick={e => e.stopPropagation()}
            >
              
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
                  
                  <div className="mt-4 pb-3 border-b border-gray-100">
                    <p className="text-gray-600 text-[13px] font-medium">
                      {allowMultiAirport
                        ? `Select up to ${MAX_AIRPORTS} airports to compare (${toAirports.length}/${MAX_AIRPORTS})`
                        : "Pick one destination airport"}
                    </p>
                    {toAirports.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {toAirports.map((a) => (
                          <button
                            key={a.code}
                            type="button"
                            onClick={(e) => removeToChip(a.code, e)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 text-xs font-bold"
                          >
                            {a.code}
                            <span aria-hidden>×</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="hidden md:block px-5 pt-3 pb-2 border-b border-gray-50">
                <p className="text-gray-500 text-[12px] font-semibold uppercase tracking-wide">
                  {allowMultiAirport
                    ? `Multi-airport · ${toAirports.length}/${MAX_AIRPORTS}`
                    : "Destination airport"}
                </p>
                {allowMultiAirport && toAirports.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {toAirports.map((a) => (
                      <button
                        key={a.code}
                        type="button"
                        onClick={(e) => removeToChip(a.code, e)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 text-[11px] font-bold"
                      >
                        {a.code} ×
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex-1 md:flex-none overflow-y-auto md:max-h-[300px] pb-6 md:pb-0">
                {filteredAirports.length > 0 ? (
                  filteredAirports.map(airport => {
                    const selected = toAirports.some((a) => a.code === airport.code);
                    const atMax = allowMultiAirport && !selected && toAirports.length >= MAX_AIRPORTS;
                    return (
                    <div
                      key={airport.id}
                      className={`flex items-center gap-4 px-5 py-4 md:py-3 hover:bg-gray-50 transition-colors cursor-pointer border-b border-gray-50 last:border-0 ${atMax ? "opacity-40" : ""}`}
                      onClick={() => {
                        if (atMax) return;
                        pickToAirport(airport);
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
                      <div className={`hidden md:flex w-5 h-5 rounded border items-center justify-center shrink-0 ${selected ? 'border-orange-500 bg-orange-50' : 'border-gray-300'}`}>
                        {selected && (
                          <div className="w-3 h-3 bg-orange-500 rounded-sm"></div>
                        )}
                      </div>
                    </div>
                  );})
                ) : (
                  <div className="px-5 py-6 text-gray-500 text-sm text-center">
                    {airportSuggestLoading ? "Searching airports…" : "No airports found"}
                  </div>
                )}

                {allowMultiAirport && (
                  <div className="sticky bottom-0 md:static px-5 py-3 bg-white border-t border-gray-100 flex gap-2">
                    <button
                      type="button"
                      disabled={!toAirports.length}
                      onClick={() => {
                        setActiveDropdown("depart");
                        setSearchQuery("");
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-[#F04F23] text-white font-bold text-sm disabled:opacity-40"
                    >
                      Done · Pick dates
                    </button>
                  </div>
                )}
                
                {/* Mobile Footer */}
                <div className="md:hidden px-6 pt-6 pb-6">
                  <p className="text-center text-[#4A4A4A] text-[15px] mb-4">
                    Tip: add alternate arrival airports to spot cheaper routes.
                  </p>
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
        <div ref={datesAnchorRef} className="hidden lg:relative lg:flex items-center gap-2.5 2xl:gap-3 cursor-pointer group lg:h-full lg:shrink-0 lg:px-3 xl:px-4" onClick={() => setActiveDropdown('depart')}>
          <svg className="w-[22px] h-[22px] 2xl:w-[28px] 2xl:h-[28px] text-white shrink-0 group-hover:text-orange-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" />
          </svg>
          <div className="min-w-[104px] xl:min-w-[112px] 2xl:min-w-[128px]">
            <span className="block text-white text-[13px] 2xl:text-[15px] pb-[3px] 2xl:pb-[5px] font-medium leading-tight">Depart</span>
            <span className="block text-white text-[13px] 2xl:text-[15px] font-semibold leading-tight mt-0.5 whitespace-nowrap">{formatDate(departDate) || "Add Date"}</span>
          </div>
          {(activeDropdown === 'depart' || (activeDropdown === 'return' && tripType === 'Return')) && datePickerUI}
        </div>

        {/* Divider */}
        {tripType === "Return" && (
        <div className="hidden lg:block w-px h-10 bg-white/[0.12] shrink-0 lg:self-center" />
        )}

        {/* Return - Desktop only (hidden for one-way / multi-way) */}
        {tripType === "Return" ? (
        <div className="hidden lg:flex items-center gap-2.5 2xl:gap-3 cursor-pointer group lg:h-full lg:shrink-0 lg:px-3 xl:px-4" onClick={() => setActiveDropdown('return')}>
          <svg className="w-[22px] h-[22px] 2xl:w-[28px] 2xl:h-[28px] text-white shrink-0 group-hover:text-orange-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" />
          </svg>
          <div className="min-w-[104px] xl:min-w-[112px] 2xl:min-w-[128px]">
            <span className="block text-white text-[13px] 2xl:text-[15px] pb-[3px] 2xl:pb-[5px] font-medium leading-tight">Return</span>
            <span className="block text-white text-[13px] 2xl:text-[15px] font-semibold leading-tight mt-0.5 whitespace-nowrap">{formatDate(returnDate) || "Add Date"}</span>
          </div>
        </div>
        ) : null}

        {/* Divider - always before travelers so spacing stays even on one-way */}
        <div className="hidden lg:block w-px h-10 bg-white/[0.12] shrink-0 lg:self-center" />

        {/* Travelers & Class */}
        <div ref={travelersAnchorRef} className="relative flex items-center gap-3 lg:gap-2.5 2xl:gap-3 cursor-pointer group mt-2 lg:mt-0 lg:h-full lg:shrink-0 lg:min-w-[148px] xl:min-w-[168px] 2xl:min-w-[190px] lg:px-3 xl:px-4" onClick={() => setActiveDropdown('travelers')}>
          <svg className="w-6 h-6 lg:w-[22px] lg:h-[22px] 2xl:w-[28px] 2xl:h-[28px] text-white shrink-0 group-hover:text-orange-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
            <path d="M4.5 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM14.25 8.625a3.375 3.375 0 116.75 0 3.375 3.375 0 01-6.75 0zM1.5 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.63 13.067 13.067 0 01-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 01-.364-.63l-.001-.122zM17.25 19.128l-.001.144a2.25 2.25 0 01-.233.96 10.088 10.088 0 005.06-1.01.75.75 0 00.42-.643 4.875 4.875 0 00-6.957-4.611 8.586 8.586 0 011.71 5.157v.003z" />
          </svg>
          <div className="flex-1 min-w-0 lg:flex-none">
            <span className="block text-white text-[14px] lg:text-[13px] 2xl:text-[15px] pb-[2px] lg:pb-[3px] 2xl:pb-[5px] font-medium leading-tight whitespace-nowrap">Travelers</span>
            <span className="block text-white text-[13px] lg:text-[13px] 2xl:text-[15px] font-semibold leading-tight mt-0.5 whitespace-nowrap">{adults + children + infants} Pax · {cabinClass}</span>
          </div>
          
          {activeDropdown === 'travelers' && travelersUI}
        </div>

        {/* Search button - reserved width so the label never clips */}
        <button 
          type="button"
          onClick={handleSearch}
          aria-label="Search"
          className="flight-search-button flex items-center justify-center shrink-0 w-full lg:w-auto bg-gradient-to-r from-[#F97316] to-[#EA580C] py-2.5 2xl:py-3 px-4 xl:px-5 2xl:px-6 gap-1.5 xl:gap-2 rounded-[14px] 2xl:rounded-[16px] border-0 cursor-pointer hover:from-[#FB923C] hover:to-[#F97316] transition-all shadow-[0_4px_15px_rgba(249,115,22,0.4)] hover:shadow-[0_4px_20px_rgba(249,115,22,0.6)] mt-2 lg:mt-0 lg:self-center lg:ml-2 disabled:opacity-70 disabled:cursor-wait whitespace-nowrap">
          <svg className="w-4 h-4 2xl:w-5 2xl:h-5 text-white shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 100 13.5 6.75 6.75 0 000-13.5zM2.25 10.5a8.25 8.25 0 1114.59 5.28l4.69 4.69a.75.75 0 11-1.06 1.06l-4.69-4.69A8.25 8.25 0 012.25 10.5z" clipRule="evenodd" />
          </svg>
          <span className="text-white text-[13px] lg:text-[14px] 2xl:text-[16px] font-semibold">Search</span>
        </button>

      </div>
      </div>

      {tripType === "Multi-way" && (
        <>
          {multiFlights.map((flight, index) => (
            <MultiWayFlightRow
              key={flight.id}
              flight={flight}
              index={index}
              onUpdate={updateMultiFlight}
              onRemove={removeMultiFlight}
              canRemove={multiFlights.length > 1}
            />
          ))}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center max-w-[1600px] w-full mx-auto mb-[40px] px-4 lg:px-6 2xl:px-8 gap-3">
            <button
              type="button"
              onClick={addMultiFlight}
              disabled={multiFlights.length >= 4}
              className="flex items-center justify-center gap-2 text-white/90 hover:text-white font-medium bg-white/5 hover:bg-white/10 px-6 py-3 rounded-full transition-colors border border-white/10 disabled:opacity-40"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Add another flight
            </button>
            <p className="text-white/60 text-xs sm:text-sm text-center sm:text-right">
              Multi-city searches each leg live.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
