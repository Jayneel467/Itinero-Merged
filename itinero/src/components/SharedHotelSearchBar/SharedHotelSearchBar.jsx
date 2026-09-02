import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AIRPORTS, findAirportByCode } from '@/constants/airports';
import useAirportSuggest from '@/features/flights/hooks/useAirportSuggest';
import { useAnchoredPanel } from '@/hooks/useAnchoredPanel';
import { trackInterestEvent } from '@/services/interestTracker';

const PANEL_SHEET =
  "fixed inset-0 z-[220] w-full h-full bg-white cursor-default overflow-hidden animate-slide-up-modal flex flex-col md:inset-auto md:h-auto md:rounded-[24px] md:shadow-2xl md:overflow-visible md:animate-dropdown-fade-up md:block md:p-6";

const FLEX_OPTIONS = [
  { value: 0, label: "exact" },
  { value: 1, label: "±1 day" },
  { value: 2, label: "±2 days" },
  { value: 3, label: "±3 days" },
];

function flexLabel(days) {
  const opt = FLEX_OPTIONS.find((o) => o.value === days);
  return opt?.label || "exact";
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Next N Friday→Sunday weekends starting from today. */
function upcomingWeekends(count = 8) {
  const today = startOfDay(new Date());
  const out = [];
  let cursor = new Date(today);
  // move to Friday (5)
  while (cursor.getDay() !== 5) cursor = addDays(cursor, 1);
  if (cursor < today) cursor = addDays(cursor, 7);
  while (out.length < count) {
    const fri = new Date(cursor);
    const sun = addDays(fri, 2);
    out.push({ checkIn: fri, checkOut: sun });
    cursor = addDays(cursor, 7);
  }
  return out;
}

/** Next N calendar months for a short stay starting mid-month. */
function upcomingMonths(count = 6) {
  const today = startOfDay(new Date());
  const out = [];
  let y = today.getFullYear();
  let m = today.getMonth();
  for (let i = 0; i < count + 1 && out.length < count; i++) {
    const checkIn = startOfDay(new Date(y, m, 15));
    if (checkIn >= today) {
      out.push({
        label: checkIn.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        checkIn,
        checkOut: addDays(checkIn, 3),
      });
    }
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

export default function SharedHotelSearchBar({ mode = "hotels" }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isHomes = mode === "homes";

  const initialCityName = searchParams.get("city") || searchParams.get("cityCode") || "";
  const [city, setCity] = useState(() => {
    if (initialCityName) {
      const code = searchParams.get("cityCode") || "";
      const match = code ? findAirportByCode(code) : null;
      if (match) return match;
      return { city: initialCityName, state: "", code };
    }
    return null;
  });
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [checkInDate, setCheckInDate] = useState(null);
  const [checkOutDate, setCheckOutDate] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [dateTab, setDateTab] = useState("dates"); // dates | weekend | month
  const [checkInFlex, setCheckInFlex] = useState(0);
  const [checkOutFlex, setCheckOutFlex] = useState(0);
  const [flexMenu, setFlexMenu] = useState(null); // null | checkIn | checkOut
  
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);
  
  const dropdownRef = useRef(null);
  const cityAnchorRef = useRef(null);
  const datesAnchorRef = useRef(null);
  const guestsAnchorRef = useRef(null);

  const cityPanelStyle = useAnchoredPanel(cityAnchorRef, activeDropdown === "city", {
    width: 420,
    estimatedHeight: 360,
    offsetX: -24,
  });
  const datesPanelStyle = useAnchoredPanel(
    datesAnchorRef,
    activeDropdown === "checkIn" || activeDropdown === "checkOut",
    { width: 780, estimatedHeight: 460, offsetX: -30 }
  );
  const guestsPanelStyle = useAnchoredPanel(guestsAnchorRef, activeDropdown === "guests", {
    width: 380,
    estimatedHeight: 280,
    align: "right",
  });

  const { airports: suggestedPlaces, isLoading: placeSuggestLoading } = useAirportSuggest(
    searchQuery,
    { enabled: activeDropdown === "city" }
  );

  const handleSearch = useCallback(() => {
    setActiveDropdown(null);
    const placeName = (city?.city || searchQuery || "").trim();
    if (!placeName && !city?.code) return;
    const toYmd = (date) => {
      if (!date) return "";
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };
    // Prefer "State College, Pennsylvania, USA" so geocode hits the right town.
    const cityLabel = [city?.city || placeName, city?.state].filter(Boolean).join(", ");
    try {
      trackInterestEvent("search", {
        city: city?.city || placeName,
        destination: city?.city || placeName,
        country: city?.country || "",
        product: isHomes ? "homes" : "hotels",
      });
    } catch {
      /* optional */
    }
    const params = new URLSearchParams({
      city: cityLabel || placeName,
      cityCode: city?.code || "",
      checkIn: toYmd(checkInDate),
      checkOut: toYmd(checkOutDate),
      guests: guests.toString(),
      rooms: rooms.toString(),
    });
    if (checkInFlex) params.set("checkInFlex", String(checkInFlex));
    if (checkOutFlex) params.set("checkOutFlex", String(checkOutFlex));
    if (city?.latitude != null && city?.longitude != null) {
      params.set("lat", String(city.latitude));
      params.set("lng", String(city.longitude));
    }
    navigate(`${isHomes ? "/homes" : "/hotels"}?${params.toString()}`);
  }, [
    city,
    checkInDate,
    checkOutDate,
    guests,
    rooms,
    navigate,
    isHomes,
    searchQuery,
    checkInFlex,
    checkOutFlex,
  ]);

  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const formatDate = (date) => {
    if (!date) return "";
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setActiveDropdown(null);
        setSearchQuery("");
        setFlexMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredAirports = suggestedPlaces;

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
      
      if (checkInDate && dateObj.getTime() === checkInDate.getTime()) isSelected = true;
      if (checkOutDate && dateObj.getTime() === checkOutDate.getTime()) isSelected = true;
      
      if (checkInDate && checkOutDate && dateObj > checkInDate && dateObj < checkOutDate) {
        isBetween = true;
      }
      
      const isDisabled = isPast || (activeDropdown === 'checkOut' && checkInDate && dateObj < checkInDate);

      days.push(
        <div 
          key={d} 
          onClick={(e) => {
             e.stopPropagation();
             if (isDisabled) return;
             if (activeDropdown === 'checkIn') {
               setCheckInDate(dateObj);
               if (checkOutDate && dateObj > checkOutDate) setCheckOutDate(null);
               setActiveDropdown('checkOut');
             } else if (activeDropdown === 'checkOut') {
               setCheckOutDate(dateObj);
               setActiveDropdown('guests');
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
            {[
              { id: "dates", label: "DATES" },
              { id: "weekend", label: "WEEKEND" },
              { id: "month", label: "MONTH" },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`text-[13px] font-bold pb-1 transition-colors ${
                  dateTab === tab.id
                    ? "text-gray-900 border-b-[3px] border-gray-900"
                    : "text-gray-500 hover:text-gray-900 border-b-[3px] border-transparent"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setDateTab(tab.id);
                  setFlexMenu(null);
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4 md:gap-6">
            {[
              { side: "checkIn", title: "Check-in", value: checkInFlex, setValue: setCheckInFlex },
              { side: "checkOut", title: "Check-out", value: checkOutFlex, setValue: setCheckOutFlex },
            ].map(({ side, title, value, setValue }) => (
              <div key={side} className="relative flex items-center gap-1">
                <button
                  type="button"
                  className={`text-[13px] font-bold transition-colors ${
                    activeDropdown === side ? "text-blue-600" : "text-gray-900 hover:text-blue-600"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveDropdown(side);
                    setDateTab("dates");
                    setFlexMenu(null);
                  }}
                >
                  {title}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-0.5 text-[13px] text-blue-500 hover:text-blue-700"
                  aria-expanded={flexMenu === side}
                  aria-haspopup="listbox"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFlexMenu((prev) => (prev === side ? null : side));
                    setActiveDropdown(side);
                  }}
                >
                  {flexLabel(value)}
                  <svg className="w-4 h-4 text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {flexMenu === side ? (
                  <div
                    role="listbox"
                    className="absolute top-full right-0 mt-2 w-[168px] bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-[40]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {FLEX_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        role="option"
                        aria-selected={value === opt.value}
                        className={`w-full text-left px-4 py-2.5 text-[13px] font-semibold hover:bg-gray-50 ${
                          value === opt.value ? "text-blue-600 bg-blue-50/60" : "text-gray-900"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setValue(opt.value);
                          setFlexMenu(null);
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {dateTab === "dates" ? (
          <div className="flex flex-col md:flex-row gap-4 pb-32 md:pb-0">
            {renderCalendar(0)}
            <div className="md:hidden mt-4">{renderCalendar(1)}</div>
            <div className="hidden md:block">{renderCalendar(1)}</div>
          </div>
        ) : null}

        {dateTab === "weekend" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pb-32 md:pb-0 max-h-[360px] overflow-y-auto">
            {upcomingWeekends(8).map((w) => {
              const selected =
                checkInDate?.getTime() === w.checkIn.getTime() &&
                checkOutDate?.getTime() === w.checkOut.getTime();
              return (
                <button
                  key={w.checkIn.toISOString()}
                  type="button"
                  className={`text-left rounded-2xl border px-4 py-3 transition-colors ${
                    selected
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 hover:border-gray-400 bg-white text-gray-900"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCheckInDate(w.checkIn);
                    setCheckOutDate(w.checkOut);
                    setCurrentMonth(new Date(w.checkIn.getFullYear(), w.checkIn.getMonth(), 1));
                    setActiveDropdown("guests");
                    setDateTab("dates");
                  }}
                >
                  <span className="block text-[15px] font-bold">
                    {w.checkIn.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    {" - "}
                    {w.checkOut.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                  <span className={`block text-[12px] mt-0.5 ${selected ? "text-white/70" : "text-gray-500"}`}>
                    Fri - Sun · 2 nights
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {dateTab === "month" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pb-32 md:pb-0">
            {upcomingMonths(6).map((m) => {
              const selected =
                checkInDate?.getTime() === m.checkIn.getTime() &&
                checkOutDate?.getTime() === m.checkOut.getTime();
              return (
                <button
                  key={m.label}
                  type="button"
                  className={`text-left rounded-2xl border px-4 py-4 transition-colors ${
                    selected
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 hover:border-gray-400 bg-white text-gray-900"
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCheckInDate(m.checkIn);
                    setCheckOutDate(m.checkOut);
                    setCurrentMonth(new Date(m.checkIn.getFullYear(), m.checkIn.getMonth(), 1));
                    setActiveDropdown("guests");
                    setDateTab("dates");
                  }}
                >
                  <span className="block text-[15px] font-bold">{m.label}</span>
                  <span className={`block text-[12px] mt-0.5 ${selected ? "text-white/70" : "text-gray-500"}`}>
                    3-night starter
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
      
      {/* Mobile Footer for dates */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] z-20">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-gray-500 text-[12px] mb-0.5">{activeDropdown === 'checkIn' ? 'Check-in date' : 'Check-out date'}</p>
            <p className="font-bold text-gray-900 text-[15px]">{activeDropdown === 'checkIn' ? (checkInDate ? formatDate(checkInDate) : "Select date") : (checkOutDate ? formatDate(checkOutDate) : "Select date")}</p>
            <button
              type="button"
              className="flex items-center text-[#1E88E5] text-[13px] mt-0.5"
              onClick={(e) => {
                e.stopPropagation();
                setFlexMenu((prev) =>
                  prev === (activeDropdown === "checkIn" ? "checkIn" : "checkOut")
                    ? null
                    : activeDropdown === "checkIn"
                      ? "checkIn"
                      : "checkOut"
                );
              }}
            >
              {flexLabel(activeDropdown === "checkIn" ? checkInFlex : checkOutFlex)}
              <svg className="w-3.5 h-3.5 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
            </button>
          </div>
        </div>
        <button 
          onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === 'checkIn' ? 'checkOut' : 'guests'); }} 
          className="w-full bg-[#F04F23] hover:bg-[#E04010] text-white font-bold py-3.5 rounded-[8px] transition-colors"
        >
          Select this date
        </button>
      </div>
    </div>
  );

  const guestsRoomsUI = (
    <div className={`${PANEL_SHEET} md:w-[380px]`} style={guestsPanelStyle} onClick={e => e.stopPropagation()}>
      {/* Mobile Header */}
      <div className="md:hidden flex items-center p-4 border-b border-gray-100 flex-none bg-white">
        <button onClick={() => setActiveDropdown(null)} className="p-2 -ml-2 mr-2">
          <svg className="w-6 h-6 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <h2 className="text-xl font-bold text-black">Guests & Rooms</h2>
      </div>

      <div className="flex-1 md:flex-none p-4 md:p-0 overflow-y-auto md:overflow-visible">
        <div className="mb-2">
          <h3 className="hidden md:block text-[17px] font-bold text-gray-900 mb-4">Guests & Rooms</h3>
          
          {/* Guests */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[15px] font-medium text-gray-900">Guests</div>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => setGuests(Math.max(1, guests - 1))} className={`w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer ${guests <= 1 ? 'border-gray-200 text-gray-300 cursor-not-allowed' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>-</button>
              <span className="w-4 text-center font-bold text-[15px] text-gray-900">{guests}</span>
              <button onClick={() => setGuests(Math.min(9, guests + 1))} className="w-8 h-8 rounded-lg border border-gray-300 text-gray-600 flex items-center justify-center cursor-pointer hover:border-gray-400">+</button>
            </div>
          </div>

          {/* Rooms */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-[15px] font-medium text-gray-900">Rooms</div>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => setRooms(Math.max(1, rooms - 1))} className={`w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer ${rooms <= 1 ? 'border-gray-200 text-gray-300 cursor-not-allowed' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>-</button>
              <span className="w-4 text-center font-bold text-[15px] text-gray-900">{rooms}</span>
              <button onClick={() => setRooms(Math.min(9, rooms + 1))} className="w-8 h-8 rounded-lg border border-gray-300 text-gray-600 flex items-center justify-center cursor-pointer hover:border-gray-400">+</button>
            </div>
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
      {/* Search bar - same container as flight searchbar */}
      <div className={`w-full px-4 lg:px-6 2xl:px-0 relative ${activeDropdown ? 'z-[120]' : 'z-50'}`}>
        <div ref={dropdownRef} className="flex flex-col lg:flex-row items-stretch justify-between px-4 lg:px-6 2xl:px-8 max-w-[1600px] w-full lg:h-[80px] 2xl:h-[98px] mb-[40px] lg:mb-[40px] 2xl:mb-[90px] mx-auto rounded-[20px] lg:rounded-[25px] border border-[#525252] py-4 lg:py-0 gap-4 lg:gap-0" style={{ backgroundColor: 'rgba(255, 255, 255, 0.07)' }}>

        {/* City / Destination */}
        <div ref={cityAnchorRef} className="relative flex items-center gap-3 lg:gap-[10px] 2xl:gap-[20px] cursor-pointer group lg:h-full" onClick={() => { if (activeDropdown !== 'city') { setActiveDropdown('city'); setSearchQuery(""); } }}>
          <svg className="w-6 h-6 lg:w-[22px] lg:h-[22px] 2xl:w-[35px] 2xl:h-[35px] text-white shrink-0 group-hover:text-orange-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
          <div className="flex-1 min-w-0 lg:w-[120px] 2xl:w-[180px]">
            <span className="block text-white text-[14px] lg:text-[13px] 2xl:text-[17px] pb-[2px] lg:pb-[3px] 2xl:pb-[5px] font-medium leading-tight">City</span>
            {activeDropdown === 'city' ? (
              <>
                <input
                  autoFocus
                  type="text"
                  className="hidden md:block text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 bg-transparent border-none outline-none w-full placeholder:text-white/30"
                  placeholder="Search city..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <span className="md:hidden block text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 truncate">{city ? `${city.city}, ${city.state}` : "Select City"}</span>
              </>
            ) : (
              <span className="block text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 truncate">{city ? `${city.city}, ${city.state}` : "Select City"}</span>
            )}
          </div>
          
          {/* City Dropdown */}
          {activeDropdown === 'city' && (
            <div className={`${PANEL_SHEET} md:w-[420px] md:py-2 md:border md:border-gray-100 max-h-screen overflow-y-auto md:max-h-[360px] md:overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]`} style={cityPanelStyle} onClick={e => e.stopPropagation()}>
              
              {/* Mobile Header & Input */}
              <div className="md:hidden flex-none">
                <div className="flex items-center p-4">
                  <button onClick={() => setActiveDropdown(null)} className="p-2 -ml-2 mr-2">
                    <svg className="w-6 h-6 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                  <h2 className="text-xl font-bold text-black">Where to?</h2>
                </div>
                
                <div className="p-4 pt-0">
                  <div className="border border-gray-300 rounded-xl p-3 flex items-center bg-white">
                    <input
                      autoFocus
                      type="text"
                      className="flex-1 bg-transparent border-none outline-none text-black text-[13px] placeholder:text-gray-400"
                      placeholder="Search city..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="flex-1 md:flex-none overflow-y-auto md:max-h-[300px] pb-6 md:pb-0">
                {placeSuggestLoading && filteredAirports.length === 0 ? (
                  <div className="px-5 py-6 text-gray-500 text-sm text-center">Searching places…</div>
                ) : filteredAirports.length > 0 ? (
                  filteredAirports.map(airport => (
                    <div
                      key={airport.id || airport.code}
                      className="flex items-center gap-4 px-5 py-4 md:py-3 hover:bg-gray-50 transition-colors cursor-pointer border-b border-gray-50 last:border-0"
                      onClick={() => {
                        setCity(airport);
                        setActiveDropdown('checkIn');
                        setSearchQuery("");
                      }}
                    >
                      <div className="w-6 h-6 md:w-[44px] md:h-[44px] shrink-0 bg-transparent md:bg-[#F3F4F6] rounded-xl flex items-center justify-center">
                        <svg className="w-5 h-5 text-gray-900 md:text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-900 font-bold text-[15px] truncate">{airport.city}{airport.state ? `, ${airport.state}` : ""}</span>
                        </div>
                        {airport.name ? (
                          <span className="block text-gray-500 text-[12px] truncate mt-0.5">{airport.name}{airport.code ? ` · ${airport.code}` : ""}</span>
                        ) : null}
                      </div>
                      <div className={`hidden md:flex w-5 h-5 rounded border items-center justify-center shrink-0 ${city?.id === airport.id || city?.code === airport.code ? 'border-orange-500 bg-orange-50' : 'border-gray-300'}`}>
                        {(city?.id === airport.id || city?.code === airport.code) && (
                          <div className="w-3 h-3 bg-orange-500 rounded-sm"></div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-5 py-6 text-gray-500 text-sm text-center">
                    {searchQuery.trim().length >= 2
                      ? "No matching towns - try a nearby city name"
                      : "Type a town or city (e.g. State College)"}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="hidden lg:block w-px h-10 bg-white/[0.12] shrink-0 lg:self-center" />

        {/* Check-in / Check-out - Mobile */}
        <div className="flex items-center gap-4 lg:hidden w-full my-3 py-3 border-y border-white/[0.12]">
          <div className="relative flex-1 flex items-center gap-3 cursor-pointer group" onClick={() => setActiveDropdown('checkIn')}>
            <svg className="w-6 h-6 text-white shrink-0" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" /></svg>
            <div className="flex-1 min-w-0"><span className="block text-white text-[14px] font-medium leading-tight">Check-in</span><span className="block text-white text-[13px] font-medium mt-0.5 truncate">{formatDate(checkInDate) || "Add Date"}</span></div>
          </div>
          <div className="w-px h-8 bg-white/[0.12] shrink-0" />
          <div className="relative flex-1 flex items-center gap-3 cursor-pointer group pl-2" onClick={() => setActiveDropdown('checkOut')}>
            <svg className="w-6 h-6 text-white shrink-0" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" /></svg>
            <div className="flex-1 min-w-0"><span className="block text-white text-[14px] font-medium leading-tight">Check-out</span><span className="block text-white text-[13px] font-medium mt-0.5 truncate">{formatDate(checkOutDate) || "Add Date"}</span></div>
          </div>
        </div>

        {/* Desktop Check-in */}
        <div ref={datesAnchorRef} className="hidden lg:relative lg:flex items-center gap-[10px] 2xl:gap-[20px] cursor-pointer group lg:h-full" onClick={() => setActiveDropdown('checkIn')}>
          <svg className="w-[22px] h-[22px] 2xl:w-[35px] 2xl:h-[35px] text-white shrink-0 group-hover:text-orange-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" />
          </svg>
          <div className="w-[90px] 2xl:w-[120px]">
            <span className="block text-white text-[13px] 2xl:text-[17px] pb-[3px] 2xl:pb-[5px] font-medium leading-tight">Check-in</span>
            <span className="block text-white text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 truncate">{formatDate(checkInDate) || "Add Date"}</span>
          </div>
        </div>

        {/* Divider */}
        <div className="hidden lg:block w-px h-10 bg-white/[0.12] shrink-0 lg:self-center" />

        {/* Desktop Check-out */}
        <div className="hidden lg:flex items-center gap-[10px] 2xl:gap-[20px] cursor-pointer group lg:h-full" onClick={() => setActiveDropdown('checkOut')}>
          <svg className="w-[22px] h-[22px] 2xl:w-[35px] 2xl:h-[35px] text-white shrink-0 group-hover:text-orange-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" />
          </svg>
          <div className="w-[90px] 2xl:w-[120px]">
            <span className="block text-white text-[13px] 2xl:text-[17px] pb-[3px] 2xl:pb-[5px] font-medium leading-tight">Check-out</span>
            <span className="block text-white text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 truncate">{formatDate(checkOutDate) || "Add Date"}</span>
          </div>
        </div>

        {/* Divider */}
        <div className="hidden lg:block w-px h-10 bg-white/[0.12] shrink-0 lg:self-center" />

        {/* Guests & Rooms */}
        <div ref={guestsAnchorRef} className="relative flex items-center gap-3 lg:gap-[10px] 2xl:gap-[20px] cursor-pointer group mt-2 lg:mt-0 lg:h-full" onClick={() => setActiveDropdown('guests')}>
          <svg className="w-6 h-6 lg:w-[22px] lg:h-[22px] 2xl:w-[35px] 2xl:h-[35px] text-white shrink-0 group-hover:text-orange-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
            <path d="M4.5 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM14.25 8.625a3.375 3.375 0 116.75 0 3.375 3.375 0 01-6.75 0zM1.5 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.63 13.067 13.067 0 01-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 01-.364-.63l-.001-.122zM17.25 19.128l-.001.144a2.25 2.25 0 01-.233.96 10.088 10.088 0 005.06-1.01.75.75 0 00.42-.643 4.875 4.875 0 00-6.957-4.611 8.586 8.586 0 011.71 5.157v.003z" />
          </svg>
          <div className="flex-1 min-w-0">
            <span className="block text-white text-[14px] lg:text-[13px] 2xl:text-[17px] pb-[2px] lg:pb-[3px] 2xl:pb-[5px] font-medium leading-tight">Guests & Rooms</span>
            <span className="block text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 truncate">{guests} {guests === 1 ? 'Guest' : 'Guests'}, {rooms} {rooms === 1 ? 'Room' : 'Rooms'}</span>
          </div>
          
          {activeDropdown === 'guests' && guestsRoomsUI}
        </div>

        {(activeDropdown === 'checkIn' || activeDropdown === 'checkOut') && datePickerUI}

        {/* Search button - same style as flight searchbar */}
        <button 
          onClick={handleSearch}
          className="flex items-center justify-center w-full lg:w-auto bg-gradient-to-r from-[#F97316] to-[#EA580C] py-2.5 lg:py-2.5 2xl:py-3 px-4 lg:px-4 2xl:px-6 gap-2 rounded-[14px] lg:rounded-[14px] 2xl:rounded-[18px] border-0 cursor-pointer hover:from-[#FB923C] hover:to-[#F97316] transition-all shadow-[0_4px_15px_rgba(249,115,22,0.4)] hover:shadow-[0_4px_20px_rgba(249,115,22,0.6)] mt-2 lg:mt-0 lg:self-center"
        >
          <svg className="w-4 h-4 lg:w-4 lg:h-4 2xl:w-5 2xl:h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 100 13.5 6.75 6.75 0 000-13.5zM2.25 10.5a8.25 8.25 0 1114.59 5.28l4.69 4.69a.75.75 0 11-1.06 1.06l-4.69-4.69A8.25 8.25 0 012.25 10.5z" clipRule="evenodd" />
          </svg>
          <span className="text-white text-[13px] lg:text-[14px] 2xl:text-[19px] font-semibold">
            {isHomes ? "Find a home" : "Search"}
          </span>
        </button>

      </div>
      </div>
    </div>
  );
}
