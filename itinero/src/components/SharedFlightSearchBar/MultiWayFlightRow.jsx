import React, { useState, useRef, useEffect } from "react";
import useAirportSuggest from "@/features/flights/hooks/useAirportSuggest";

/**
 * Extra flight row for Multi-way (multi-city) search.
 */
export default function MultiWayFlightRow({ flight, index, onUpdate, onRemove, canRemove }) {
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const dropdownRef = useRef(null);

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

  const { airports: filteredAirports, isLoading: airportSuggestLoading } = useAirportSuggest(
    searchQuery,
    { enabled: activeDropdown === "from" || activeDropdown === "to" }
  );

  const handleSwap = (e) => {
    e.stopPropagation();
    onUpdate(flight.id, "from", flight.to);
    onUpdate(flight.id, "to", flight.from);
  };

  const formatDate = (date) => {
    if (!date) return "";
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const renderCalendar = (monthOffset) => {
    const targetDate = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth() + monthOffset,
      1
    );
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const monthName = targetDate.toLocaleDateString("en-US", { month: "long" });
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="w-10 h-10" />);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month, d);
      const isPast = dateObj < today;
      const isSelected =
        flight.departDate && dateObj.getTime() === flight.departDate.getTime();
      days.push(
        <div
          key={d}
          onClick={(e) => {
            e.stopPropagation();
            if (isPast) return;
            onUpdate(flight.id, "departDate", dateObj);
            setActiveDropdown(null);
          }}
          className={`w-10 h-10 flex items-center justify-center rounded-full text-[15px] font-bold transition-colors select-none ${
            isPast
              ? "text-gray-300 cursor-not-allowed"
              : "text-gray-900 cursor-pointer hover:bg-gray-100"
          } ${isSelected ? "bg-gray-900 text-white hover:bg-gray-800" : ""}`}
        >
          {d}
        </div>
      );
    }
    return (
      <div className="flex-1 px-4">
        <div className="flex items-center justify-between mb-6">
          {monthOffset === 0 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCurrentMonth(
                  new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
                );
              }}
              className="p-1 hover:bg-gray-100 rounded-full"
            >
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          ) : (
            <div className="w-7" />
          )}
          <span className="font-bold text-[17px] text-gray-900">
            {monthName} {year}
          </span>
          {monthOffset === 1 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCurrentMonth(
                  new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
                );
              }}
              className="p-1 hover:bg-gray-100 rounded-full"
            >
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ) : (
            <div className="w-7" />
          )}
        </div>
        <div className="grid grid-cols-7 gap-y-2 mb-2">
          {["S", "M", "T", "W", "T", "F", "S"].map((day, i) => (
            <div
              key={i}
              className="w-10 h-10 flex items-center justify-center font-bold text-gray-900 text-[15px]"
            >
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-2">{days}</div>
      </div>
    );
  };

  return (
    <div className="flex items-start lg:items-center gap-3 max-w-[1600px] w-full mx-auto relative mb-3 z-40 px-4 lg:px-6 2xl:px-0">
      <div
        ref={dropdownRef}
        className="flex flex-col lg:flex-row items-stretch justify-between px-4 lg:px-6 2xl:px-8 w-full lg:h-[80px] 2xl:h-[98px] rounded-[20px] lg:rounded-[25px] border border-[#525252] py-4 lg:py-0 gap-4 lg:gap-0"
        style={{ backgroundColor: "rgba(255, 255, 255, 0.07)" }}
      >
        <div className="hidden lg:flex items-center px-2 text-white/70 text-sm font-semibold shrink-0">
          Flight {index + 2}
        </div>

        <div
          className="relative flex items-center gap-3 lg:gap-[10px] cursor-pointer group lg:h-full"
          onClick={() => {
            setActiveDropdown("from");
            setSearchQuery("");
          }}
        >
          <div className="flex-1 min-w-0 lg:w-[140px]">
            <span className="block text-white text-[13px] pb-[2px] font-medium">From</span>
            {activeDropdown === "from" ? (
              <input
                autoFocus
                type="text"
                className="text-white text-[13px] font-medium bg-transparent border-none outline-none w-full placeholder:text-white/30"
                placeholder="Search airport..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            ) : (
              <span className="block text-white text-[13px] font-medium truncate">
                {flight.from ? `${flight.from.city} (${flight.from.code})` : "Select origin"}
              </span>
            )}
          </div>
          {activeDropdown === "from" && (
            <div
              className="absolute top-full mt-3 left-0 w-[min(360px,calc(100vw-24px))] max-w-[calc(100vw-24px)] bg-white rounded-[20px] shadow-2xl z-[100] max-h-[min(280px,50vh)] overflow-y-auto py-2 border border-gray-100"
              onClick={(e) => e.stopPropagation()}
            >
              {filteredAirports.slice(0, 40).map((airport) => (
                <div
                  key={airport.code}
                  className="px-4 py-3 hover:bg-gray-50 cursor-pointer"
                  onClick={() => {
                    onUpdate(flight.id, "from", airport);
                    setActiveDropdown("to");
                    setSearchQuery("");
                  }}
                >
                  <div className="font-bold text-gray-900 text-sm">
                    {airport.city} ({airport.code})
                  </div>
                  <div className="text-gray-500 text-xs truncate">{airport.name}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleSwap}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-white/[0.06] border border-white/10 self-center shrink-0"
          aria-label="Swap airports"
        >
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path
              fillRule="evenodd"
              d="M15.97 2.47a.75.75 0 011.06 0l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 11-1.06-1.06l3.22-3.22H7.5a.75.75 0 010-1.5h11.69l-3.22-3.22a.75.75 0 010-1.06zm-7.94 9a.75.75 0 010 1.06l-3.22 3.22H16.5a.75.75 0 010 1.5H4.81l3.22 3.22a.75.75 0 11-1.06 1.06l-4.5-4.5a.75.75 0 010-1.06l4.5-4.5a.75.75 0 011.06 0z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        <div
          className="relative flex items-center gap-3 lg:gap-[10px] cursor-pointer group lg:h-full"
          onClick={() => {
            setActiveDropdown("to");
            setSearchQuery("");
          }}
        >
          <div className="flex-1 min-w-0 lg:w-[140px]">
            <span className="block text-white text-[13px] pb-[2px] font-medium">Going To</span>
            {activeDropdown === "to" ? (
              <input
                autoFocus
                type="text"
                className="text-white text-[13px] font-medium bg-transparent border-none outline-none w-full placeholder:text-white/30"
                placeholder="Search airport..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            ) : (
              <span className="block text-white text-[13px] font-medium truncate">
                {flight.to ? `${flight.to.city} (${flight.to.code})` : "Select destination"}
              </span>
            )}
          </div>
          {activeDropdown === "to" && (
            <div
              className="absolute top-full mt-3 left-0 w-[min(360px,calc(100vw-24px))] max-w-[calc(100vw-24px)] bg-white rounded-[20px] shadow-2xl z-[100] max-h-[min(280px,50vh)] overflow-y-auto py-2 border border-gray-100"
              onClick={(e) => e.stopPropagation()}
            >
              {filteredAirports.slice(0, 40).map((airport) => (
                <div
                  key={airport.code}
                  className="px-4 py-3 hover:bg-gray-50 cursor-pointer"
                  onClick={() => {
                    onUpdate(flight.id, "to", airport);
                    setActiveDropdown("depart");
                    setSearchQuery("");
                  }}
                >
                  <div className="font-bold text-gray-900 text-sm">
                    {airport.city} ({airport.code})
                  </div>
                  <div className="text-gray-500 text-xs truncate">{airport.name}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="hidden lg:block w-px h-10 bg-white/[0.12] shrink-0 lg:self-center" />

        <div
          className="relative flex items-center gap-[10px] cursor-pointer group lg:h-full"
          onClick={() => setActiveDropdown("depart")}
        >
          <div className="w-[110px]">
            <span className="block text-white text-[13px] pb-[3px] font-medium">Depart</span>
            <span className="block text-white text-[12px] font-medium truncate">
              {formatDate(flight.departDate) || "Add Date"}
            </span>
          </div>
          {activeDropdown === "depart" && (
            <div
              className="fixed inset-0 z-[220] w-full h-full bg-white p-4 overflow-y-auto animate-slide-up-modal md:absolute md:inset-auto md:top-full md:mt-3 md:right-0 md:h-auto md:w-[min(780px,calc(100vw-32px))] md:max-w-[calc(100vw-32px)] md:rounded-[24px] md:shadow-2xl md:z-[100] md:p-6 md:animate-none"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex gap-4">
                {renderCalendar(0)}
                <div className="hidden md:block">{renderCalendar(1)}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {canRemove && (
        <button
          type="button"
          onClick={() => onRemove(flight.id)}
          className="flex items-center justify-center w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white transition-colors shrink-0"
          aria-label="Remove flight"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
