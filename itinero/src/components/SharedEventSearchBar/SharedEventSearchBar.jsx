import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const TYPES = [
  { id: "", label: "Any type" },
  { id: "music", label: "Music" },
  { id: "sports", label: "Sports" },
  { id: "theatre", label: "Theatre" },
  { id: "family", label: "Family" },
  { id: "film", label: "Film" },
];

const CITY_HINTS = [
  "New York",
  "London",
  "Orlando",
  "Los Angeles",
  "Chicago",
  "Paris",
  "Toronto",
  "Sydney",
];

function toYmd(date) {
  if (!date) return "";
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}/.test(date)) return date.slice(0, 10);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseYmd(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(base, n) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

function formatDate(value) {
  const date = typeof value === "string" ? parseYmd(value) : value;
  if (!date) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const IconPin = () => (
  <svg className="w-6 h-6 lg:w-[22px] lg:h-[22px] 2xl:w-[35px] 2xl:h-[35px] text-white shrink-0 group-hover:text-orange-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
  </svg>
);

const IconMic = () => (
  <svg className="w-6 h-6 lg:w-[22px] lg:h-[22px] 2xl:w-[35px] 2xl:h-[35px] text-white shrink-0 group-hover:text-orange-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z" />
  </svg>
);

const IconTag = () => (
  <svg className="w-6 h-6 lg:w-[22px] lg:h-[22px] 2xl:w-[35px] 2xl:h-[35px] text-white shrink-0 group-hover:text-orange-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
    <path d="M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16z" />
  </svg>
);

const IconCal = () => (
  <svg className="w-6 h-6 lg:w-[22px] lg:h-[22px] 2xl:w-[35px] 2xl:h-[35px] text-white shrink-0 group-hover:text-orange-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
    <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" />
  </svg>
);

function Divider() {
  return <div className="hidden lg:block w-px h-10 bg-white/[0.12] shrink-0 lg:self-center" />;
}

function OptionMenu({ options, value, onSelect }) {
  return (
    <div
      className="absolute left-0 top-full mt-3 w-[min(100vw-32px,260px)] bg-white rounded-[20px] shadow-2xl z-[80] py-2 border border-gray-100 cursor-default"
      onClick={(e) => e.stopPropagation()}
    >
      {options.map((opt) => (
        <button
          key={opt.id || "any"}
          type="button"
          onClick={() => onSelect(opt.id)}
          className={`w-full text-left px-4 py-2.5 text-[14px] font-semibold transition-colors ${
            value === opt.id ? "text-[#F97211] bg-orange-50" : "text-[#001438] hover:bg-gray-50"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function SharedEventSearchBar({ compact = false }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [city, setCity] = useState(() => params.get("city") || "New York");
  const [keyword, setKeyword] = useState(() => params.get("keyword") || "");
  const [classification, setClassification] = useState(() => params.get("classification") || "");
  const [start, setStart] = useState(() => params.get("start") || toYmd(new Date()));
  const [end, setEnd] = useState(() => params.get("end") || toYmd(addDays(new Date(), 14)));
  const [activeDropdown, setActiveDropdown] = useState(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handleSearch = useCallback(() => {
    setActiveDropdown(null);
    const qs = new URLSearchParams();
    if (city.trim()) qs.set("city", city.trim());
    if (keyword.trim()) qs.set("keyword", keyword.trim());
    if (classification) qs.set("classification", classification);
    if (start) qs.set("start", start);
    if (end) qs.set("end", end);
    navigate(`/events?${qs.toString()}`);
  }, [city, keyword, classification, start, end, navigate]);

  const typeLabel = TYPES.find((t) => t.id === classification)?.label || "Any type";
  const cityHints = CITY_HINTS.filter(
    (c) => !city.trim() || c.toLowerCase().includes(city.trim().toLowerCase())
  );

  return (
    <div className="shared-flight-search-bar w-full relative z-10">
      <div className={`w-full relative ${compact ? "" : "px-4 lg:px-6 2xl:px-0"} ${activeDropdown ? "z-[120]" : "z-50"}`}>
        <div
          ref={dropdownRef}
          className={`flex flex-col lg:flex-row items-stretch justify-between px-4 lg:px-6 2xl:px-8 max-w-[1600px] w-full lg:h-[80px] 2xl:h-[98px] mx-auto rounded-[20px] lg:rounded-[25px] border border-[#525252] py-4 lg:py-0 gap-4 lg:gap-0 ${
            compact ? "" : "mb-[40px] 2xl:mb-[90px]"
          }`}
          style={{ backgroundColor: "rgba(255, 255, 255, 0.07)" }}
        >
          <div
            className="relative flex items-center gap-3 lg:gap-[10px] 2xl:gap-[20px] cursor-pointer group lg:h-full flex-1 min-w-0"
            onClick={() => setActiveDropdown(activeDropdown === "city" ? null : "city")}
          >
            <IconPin />
            <div className="flex-1 min-w-0 lg:w-[120px] 2xl:w-[160px]">
              <span className="block text-white text-[14px] lg:text-[13px] 2xl:text-[17px] pb-[2px] lg:pb-[3px] 2xl:pb-[5px] font-medium leading-tight">
                City
              </span>
              {activeDropdown === "city" ? (
                <input
                  autoFocus
                  type="text"
                  className="text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 bg-transparent border-none outline-none w-full placeholder:text-white/30"
                  placeholder="New York, London…"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
              ) : (
                <span className="block text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 truncate">
                  {city.trim() || "Add city"}
                </span>
              )}
            </div>
            {activeDropdown === "city" && cityHints.length > 0 && (
              <div
                className="absolute left-0 top-full mt-3 w-[min(100vw-32px,280px)] bg-white rounded-[20px] shadow-2xl z-[80] py-2 border border-gray-100 cursor-default max-h-[280px] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                {cityHints.map((hint) => (
                  <button
                    key={hint}
                    type="button"
                    onClick={() => {
                      setCity(hint);
                      setActiveDropdown("keyword");
                    }}
                    className={`w-full text-left px-4 py-2.5 text-[14px] font-semibold transition-colors ${
                      city === hint ? "text-[#F97211] bg-orange-50" : "text-[#001438] hover:bg-gray-50"
                    }`}
                  >
                    {hint}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Divider />

          <div
            className="relative flex items-center gap-3 lg:gap-[10px] 2xl:gap-[20px] cursor-pointer group lg:h-full flex-1 min-w-0"
            onClick={() => setActiveDropdown(activeDropdown === "keyword" ? null : "keyword")}
          >
            <IconMic />
            <div className="flex-1 min-w-0 lg:w-[110px] 2xl:w-[150px]">
              <span className="block text-white text-[14px] lg:text-[13px] 2xl:text-[17px] pb-[2px] lg:pb-[3px] 2xl:pb-[5px] font-medium leading-tight">
                Artist / team
              </span>
              {activeDropdown === "keyword" ? (
                <input
                  autoFocus
                  type="text"
                  className="text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 bg-transparent border-none outline-none w-full placeholder:text-white/30"
                  placeholder="Optional"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
              ) : (
                <span className="block text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 truncate">
                  {keyword.trim() || "Optional"}
                </span>
              )}
            </div>
          </div>

          <Divider />

          <div
            className="relative flex items-center gap-3 lg:gap-[10px] 2xl:gap-[20px] cursor-pointer group lg:h-full"
            onClick={() => setActiveDropdown(activeDropdown === "type" ? null : "type")}
          >
            <IconTag />
            <div className="flex-1 min-w-0 lg:w-[90px] 2xl:w-[120px]">
              <span className="block text-white text-[14px] lg:text-[13px] 2xl:text-[17px] pb-[2px] lg:pb-[3px] 2xl:pb-[5px] font-medium leading-tight">
                Type
              </span>
              <span className="block text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 truncate">
                {typeLabel}
              </span>
            </div>
            {activeDropdown === "type" && (
              <OptionMenu
                options={TYPES}
                value={classification}
                onSelect={(id) => {
                  setClassification(id);
                  setActiveDropdown(null);
                }}
              />
            )}
          </div>

          <Divider />

          <div
            className="relative flex items-center gap-3 lg:gap-[10px] 2xl:gap-[20px] cursor-pointer group lg:h-full"
            onClick={() => setActiveDropdown(activeDropdown === "from" ? null : "from")}
          >
            <IconCal />
            <div className="flex-1 min-w-0 lg:w-[90px] 2xl:w-[120px]">
              <span className="block text-white text-[14px] lg:text-[13px] 2xl:text-[17px] pb-[2px] lg:pb-[3px] 2xl:pb-[5px] font-medium leading-tight">
                From
              </span>
              <span className="block text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 truncate">
                {formatDate(start) || "Add Date"}
              </span>
            </div>
            {activeDropdown === "from" && (
              <div
                className="absolute left-0 top-full mt-3 w-[min(100vw-32px,260px)] bg-white rounded-[20px] shadow-2xl z-[80] p-4 border border-gray-100 cursor-default"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-[13px] font-bold text-[#001438] mb-2">From</p>
                <input
                  type="date"
                  autoFocus
                  value={start}
                  onChange={(e) => {
                    setStart(e.target.value);
                    if (e.target.value && end && e.target.value > end) {
                      setEnd(toYmd(addDays(new Date(`${e.target.value}T12:00:00`), 7)));
                    }
                  }}
                  className="w-full rounded-[12px] border border-gray-200 px-3 py-2.5 text-[14px] font-semibold text-[#001438] outline-none focus:border-[#F97211]"
                />
              </div>
            )}
          </div>

          <Divider />

          <div
            className="relative flex items-center gap-3 lg:gap-[10px] 2xl:gap-[20px] cursor-pointer group lg:h-full"
            onClick={() => setActiveDropdown(activeDropdown === "to" ? null : "to")}
          >
            <IconCal />
            <div className="flex-1 min-w-0 lg:w-[90px] 2xl:w-[120px]">
              <span className="block text-white text-[14px] lg:text-[13px] 2xl:text-[17px] pb-[2px] lg:pb-[3px] 2xl:pb-[5px] font-medium leading-tight">
                To
              </span>
              <span className="block text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium leading-tight mt-0.5 truncate">
                {formatDate(end) || "Add Date"}
              </span>
            </div>
            {activeDropdown === "to" && (
              <div
                className="absolute right-0 top-full mt-3 w-[min(100vw-32px,260px)] bg-white rounded-[20px] shadow-2xl z-[80] p-4 border border-gray-100 cursor-default"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-[13px] font-bold text-[#001438] mb-2">To</p>
                <input
                  type="date"
                  autoFocus
                  min={start || undefined}
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="w-full rounded-[12px] border border-gray-200 px-3 py-2.5 text-[14px] font-semibold text-[#001438] outline-none focus:border-[#F97211]"
                />
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleSearch}
            className="flex items-center justify-center w-full lg:w-auto bg-gradient-to-r from-[#F97316] to-[#EA580C] py-2.5 2xl:py-3 px-4 2xl:px-6 gap-2 rounded-[14px] 2xl:rounded-[18px] border-0 cursor-pointer hover:from-[#FB923C] hover:to-[#F97316] transition-all shadow-[0_4px_15px_rgba(249,115,22,0.4)] hover:shadow-[0_4px_20px_rgba(249,115,22,0.6)] mt-2 lg:mt-0 lg:self-center"
          >
            <svg className="w-4 h-4 2xl:w-5 2xl:h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 100 13.5 6.75 6.75 0 000-13.5zM2.25 10.5a8.25 8.25 0 1114.59 5.28l4.69 4.69a.75.75 0 11-1.06 1.06l-4.69-4.69A8.25 8.25 0 012.25 10.5z" clipRule="evenodd" />
            </svg>
            <span className="text-white text-[13px] lg:text-[14px] 2xl:text-[19px] font-semibold">Search</span>
          </button>
        </div>
      </div>
    </div>
  );
}
