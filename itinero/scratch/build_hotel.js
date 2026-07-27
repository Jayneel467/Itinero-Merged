const fs = require('fs');
const path = require('path');

const destDir = 'd:/project/itinero/src/components/SharedHotelSearchBar';
const destPath = path.join(destDir, 'SharedHotelSearchBar.jsx');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

const componentCode = `
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AIRPORTS } from '@/constants/airports'; // We use this as mock cities for now
import ScrollReveal from '@/components/ScrollReveal';

export default function SharedHotelSearchBar() {
  const navigate = useNavigate();
  const [city, setCity] = useState(AIRPORTS[0]);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [checkInDate, setCheckInDate] = useState(null);
  const [checkOutDate, setCheckOutDate] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date()); 
  
  const [guests, setGuests] = useState(2);
  const [rooms, setRooms] = useState(1);
  const [isSearching, setIsSearching] = useState(false);
  
  const dropdownRef = useRef(null);

  const handleSearch = useCallback(() => {
    setActiveDropdown(null);
    setIsSearching(true);
    // Mock navigating to hotel results
    setTimeout(() => {
      setIsSearching(false);
      navigate(\`/hotels?city=\${city?.code || ''}&checkIn=\${checkInDate ? checkInDate.toISOString() : ''}&checkOut=\${checkOutDate ? checkOutDate.toISOString() : ''}&guests=\${guests}&rooms=\${rooms}\`);
    }, 1500);
  }, [city, checkInDate, checkOutDate, guests, rooms, navigate]);

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
      days.push(<div key={\`empty-\${i}\`} className="w-10 h-10"></div>);
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
          className={\`w-10 h-10 flex items-center justify-center rounded-full text-[15px] font-bold transition-colors select-none
            \${isDisabled ? 'text-gray-300 cursor-not-allowed' : 'text-gray-900 cursor-pointer hover:bg-gray-100'}
            \${isSelected ? 'bg-gray-900 text-white hover:bg-gray-800' : ''}
            \${isBetween && !isSelected ? 'bg-gray-100' : ''}
          \`}
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
            <span className="text-[13px] font-bold text-gray-900 border-b-[3px] border-gray-900 pb-1 cursor-pointer">DATES</span>
          </div>
          <div className="flex items-center gap-4 md:gap-6">
            <div className="flex items-center gap-1 cursor-pointer group/dep" onClick={() => setActiveDropdown('checkIn')}>
              <span className="text-[13px] font-bold text-gray-900 group-hover/dep:text-blue-600 transition-colors">Check-in</span>
              <span className="text-[13px] text-blue-500">exact</span>
              <svg className="w-4 h-4 text-gray-900 group-hover/dep:text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
            </div>
            <div className="flex items-center gap-1 cursor-pointer group/ret" onClick={() => setActiveDropdown('checkOut')}>
              <span className="text-[13px] font-bold text-gray-900 group-hover/ret:text-blue-600 transition-colors">Check-out</span>
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
            <p className="text-gray-500 text-[12px] mb-0.5">{activeDropdown === 'checkIn' ? 'Check-in date' : 'Check-out date'}</p>
            <p className="font-bold text-gray-900 text-[15px]">{activeDropdown === 'checkIn' ? (checkInDate ? formatDate(checkInDate) : "Select date") : (checkOutDate ? formatDate(checkOutDate) : "Select date")}</p>
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

  const guestsUI = (
    <div className="fixed inset-0 md:absolute md:top-full md:mt-3 lg:top-[108px] lg:mt-0 md:bottom-auto md:right-0 md:left-auto w-full h-full md:w-[380px] md:h-auto bg-white md:rounded-[24px] shadow-2xl z-[100] md:z-50 cursor-default overflow-hidden md:overflow-visible animate-slide-up-modal md:animate-dropdown-fade-up flex flex-col md:block md:p-6" onClick={e => e.stopPropagation()}>
      <div className="md:hidden flex items-center p-4 border-b border-gray-100 flex-none bg-white">
        <button onClick={() => setActiveDropdown(null)} className="p-2 -ml-2 mr-2">
          <svg className="w-6 h-6 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <h2 className="text-xl font-bold text-black">Guests & Rooms</h2>
      </div>

      <div className="flex-1 md:flex-none p-4 md:p-0 overflow-y-auto md:overflow-visible">
        <div className="mb-2">
          
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[15px] font-medium text-gray-900">Guests</div>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => setGuests(Math.max(1, guests - 1))} className={\`w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer \${guests <= 1 ? 'border-gray-200 text-gray-300 cursor-not-allowed' : 'border-gray-300 text-gray-600 hover:border-gray-400'}\`}>-</button>
              <span className="w-4 text-center font-bold text-[15px] text-gray-900">{guests}</span>
              <button onClick={() => setGuests(Math.min(9, guests + 1))} className="w-8 h-8 rounded-lg border border-gray-300 text-gray-600 flex items-center justify-center cursor-pointer hover:border-gray-400">+</button>
            </div>
          </div>

          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-[15px] font-medium text-gray-900">Rooms</div>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => setRooms(Math.max(1, rooms - 1))} className={\`w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer \${rooms <= 1 ? 'border-gray-200 text-gray-300 cursor-not-allowed' : 'border-gray-300 text-gray-600 hover:border-gray-400'}\`}>-</button>
              <span className="w-4 text-center font-bold text-[15px] text-gray-900">{rooms}</span>
              <button onClick={() => setRooms(Math.min(9, rooms + 1))} className="w-8 h-8 rounded-lg border border-gray-300 text-gray-600 flex items-center justify-center cursor-pointer hover:border-gray-400">+</button>
            </div>
          </div>
        </div>
      </div>
      
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] z-20">
        <button 
          onClick={(e) => { e.stopPropagation(); setActiveDropdown(null); }} 
          className="w-full bg-[#F04F23] hover:bg-[#E04010] text-white font-bold py-3.5 rounded-[8px] transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );

  return (
    <ScrollReveal delay={0.4} className="w-full relative z-50">
      <div className="flex justify-center w-full relative">
        <div ref={dropdownRef} className="w-full lg:w-auto relative" style={{ maxWidth: '1000px' }}>
          
          <div className="bg-white/[0.12] backdrop-blur-[24px] border border-white/[0.12] rounded-[16px] lg:rounded-[80px] p-[3px] lg:p-[4px] 2xl:p-[8px] shadow-[0_8px_32px_rgba(0,0,0,0.1)] flex flex-col lg:flex-row w-full relative z-20">
            
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center w-full px-4 lg:px-6 2xl:px-8 py-3 lg:py-0 gap-0">
              
              <div className="relative flex items-center gap-3 lg:gap-[10px] 2xl:gap-[20px] cursor-pointer group lg:h-full lg:w-[220px]" onClick={() => { if (activeDropdown !== 'city') { setActiveDropdown('city'); setSearchQuery(""); } }}>
                <svg className="w-6 h-6 lg:w-[22px] lg:h-[22px] 2xl:w-[35px] 2xl:h-[35px] text-white shrink-0 group-hover:text-orange-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
                <div className="flex-1 min-w-0">
                  <span className="block text-white text-[14px] lg:text-[13px] 2xl:text-[17px] pb-[2px] lg:pb-[3px] 2xl:pb-[5px] font-medium leading-tight">City or Destination</span>
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
                      <span className="md:hidden block text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 truncate">{city ? \`\${city.city}, \${city.state}\` : "Select City"}</span>
                    </>
                  ) : (
                    <span className="block text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 truncate">{city ? \`\${city.city}, \${city.state}\` : "Select City"}</span>
                  )}
                </div>
                
                {/* Dropdown UI */}
                {activeDropdown === 'city' && (
                  <div className="fixed inset-0 md:absolute md:top-full md:mt-3 lg:top-[108px] lg:mt-0 md:bottom-auto md:right-auto md:left-0 md:-left-6 w-full h-full md:w-[420px] md:h-auto bg-white md:rounded-[24px] shadow-2xl z-[100] md:z-50 max-h-screen overflow-y-auto md:overflow-visible py-0 md:py-2 md:border border-gray-100 cursor-default [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] flex flex-col md:block animate-slide-up-modal md:animate-dropdown-fade-up" onClick={e => e.stopPropagation()}>
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
                            placeholder="Destination?"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                          />
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
                                <span className="text-gray-900 font-bold text-[15px] truncate">{airport.city}, {airport.state}</span>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="px-5 py-6 text-gray-500 text-sm text-center">No cities found</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="hidden lg:block w-px h-10 bg-white/[0.12] shrink-0 lg:self-center ml-2 mr-2" />

              {/* Check-in / Check-out Mobile */}
              <div className="flex items-center gap-4 lg:hidden w-full my-3 py-3 border-y border-white/[0.12]">
                <div className="relative flex-1 flex items-center gap-3 cursor-pointer group" onClick={() => setActiveDropdown('checkIn')}>
                  <svg className="w-6 h-6 text-white shrink-0" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" /></svg>
                  <div className="flex-1 min-w-0"><span className="block text-white text-[14px] font-medium leading-tight">Check-in</span><span className="block text-white text-[13px] font-medium mt-0.5 truncate">{formatDate(checkInDate) || "Add Date"}</span></div>
                  {(activeDropdown === 'checkIn' || activeDropdown === 'checkOut') && datePickerUI}
                </div>
                <div className="w-px h-8 bg-white/[0.12] shrink-0" />
                <div className="relative flex-1 flex items-center gap-3 cursor-pointer group pl-2" onClick={() => setActiveDropdown('checkOut')}>
                  <svg className="w-6 h-6 text-white shrink-0" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" /></svg>
                  <div className="flex-1 min-w-0"><span className="block text-white text-[14px] font-medium leading-tight">Check-out</span><span className="block text-white text-[13px] font-medium mt-0.5 truncate">{formatDate(checkOutDate) || "Add Date"}</span></div>
                </div>
              </div>

              {/* Desktop Check-in */}
              <div className="hidden lg:relative lg:flex items-center gap-[10px] 2xl:gap-[20px] cursor-pointer group lg:h-full lg:w-[130px]" onClick={() => setActiveDropdown('checkIn')}>
                <svg className="w-[22px] h-[22px] 2xl:w-[35px] 2xl:h-[35px] text-white shrink-0 group-hover:text-orange-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" />
                </svg>
                <div className="w-[90px] 2xl:w-[120px]">
                  <span className="block text-white text-[13px] 2xl:text-[17px] pb-[3px] 2xl:pb-[5px] font-medium leading-tight">Check-in</span>
                  <span className="block text-white text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 truncate">{formatDate(checkInDate) || "Add Date"}</span>
                </div>
                {(activeDropdown === 'checkIn' || activeDropdown === 'checkOut') && datePickerUI}
              </div>

              {/* Divider */}
              <div className="hidden lg:block w-px h-10 bg-white/[0.12] shrink-0 lg:self-center mr-2 ml-2" />

              {/* Desktop Check-out */}
              <div className="hidden lg:flex items-center gap-[10px] 2xl:gap-[20px] cursor-pointer group lg:h-full lg:w-[130px]" onClick={() => setActiveDropdown('checkOut')}>
                <svg className="w-[22px] h-[22px] 2xl:w-[35px] 2xl:h-[35px] text-white shrink-0 group-hover:text-orange-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" />
                </svg>
                <div className="w-[90px] 2xl:w-[120px]">
                  <span className="block text-white text-[13px] 2xl:text-[17px] pb-[3px] 2xl:pb-[5px] font-medium leading-tight">Check-out</span>
                  <span className="block text-white text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 truncate">{formatDate(checkOutDate) || "Add Date"}</span>
                </div>
              </div>

              {/* Divider */}
              <div className="hidden lg:block w-px h-10 bg-white/[0.12] shrink-0 lg:self-center mr-2 ml-2" />

              {/* Guests and Rooms */}
              <div className="relative flex items-center gap-3 lg:gap-[10px] 2xl:gap-[20px] cursor-pointer group lg:h-full lg:w-[180px]" onClick={() => setActiveDropdown('guests')}>
                <svg className="w-6 h-6 lg:w-[22px] lg:h-[22px] 2xl:w-[35px] 2xl:h-[35px] text-white shrink-0 group-hover:text-orange-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
                <div className="flex-1 min-w-0">
                  <span className="block text-white text-[14px] lg:text-[13px] 2xl:text-[17px] pb-[2px] lg:pb-[3px] 2xl:pb-[5px] font-medium leading-tight">Guests & Rooms</span>
                  <span className="block text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 truncate">{guests} {guests === 1 ? 'Guest' : 'Guests'}, {rooms} {rooms === 1 ? 'Room' : 'Rooms'}</span>
                </div>
                {activeDropdown === 'guests' && guestsUI}
              </div>

            </div>

            {/* Search Button */}
            <div className="mt-4 lg:mt-0 lg:ml-2">
              <button 
                onClick={handleSearch}
                disabled={isSearching}
                className="w-full lg:w-[160px] 2xl:w-[220px] h-12 lg:h-full min-h-[48px] lg:min-h-[56px] 2xl:min-h-[85px] bg-[#F04F23] hover:bg-[#E04010] disabled:bg-[#F04F23]/80 disabled:cursor-not-allowed rounded-full lg:rounded-[14px] lg:rounded-r-[76px] flex items-center justify-center gap-2 transition-colors lg:-mr-[1px] lg:-my-[1px] relative overflow-hidden"
              >
                {isSearching ? (
                  <div className="flex items-center gap-2 animate-pulse">
                    <span className="font-bold text-white text-[15px] lg:text-[15px] 2xl:text-[25px]">Searching</span>
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="font-bold text-white text-[15px] lg:text-[15px] 2xl:text-[25px]">Search</span>
                    <svg className="w-5 h-5 2xl:w-8 2xl:h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ScrollReveal>
  );
}
\`;

fs.writeFileSync(destPath, componentCode, 'utf8');
console.log('Successfully created SharedHotelSearchBar.jsx');
