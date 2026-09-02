import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const BUDGETS = [
  { id: "", label: "Any stay" },
  { id: "15000", label: "Stay under ₹15k" },
  { id: "30000", label: "Stay under ₹30k" },
  { id: "60000", label: "Stay under ₹60k" },
  { id: "100000", label: "Stay under ₹1L" },
];

const REGIONS = [
  { id: "any", label: "Domestic + International" },
  { id: "domestic", label: "Domestic" },
  { id: "international", label: "International" },
];

function toYmd(date) {
  if (!date) return "";
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

function formatDate(date) {
  if (!date) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const IconPin = () => (
  <svg className="w-5 h-5 lg:w-[20px] lg:h-[20px] 2xl:w-[24px] 2xl:h-[24px] text-white shrink-0 group-hover:text-orange-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
  </svg>
);

const IconGlobe = () => (
  <svg className="w-5 h-5 lg:w-[20px] lg:h-[20px] 2xl:w-[24px] 2xl:h-[24px] text-white shrink-0 group-hover:text-orange-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
  </svg>
);

const IconBed = () => (
  <svg className="w-5 h-5 lg:w-[20px] lg:h-[20px] 2xl:w-[24px] 2xl:h-[24px] text-white shrink-0 group-hover:text-orange-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
    <path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z" />
  </svg>
);

const IconCal = () => (
  <svg className="w-5 h-5 lg:w-[20px] lg:h-[20px] 2xl:w-[24px] 2xl:h-[24px] text-white shrink-0 group-hover:text-orange-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
    <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" />
  </svg>
);

const IconPeople = () => (
  <svg className="w-5 h-5 lg:w-[20px] lg:h-[20px] 2xl:w-[24px] 2xl:h-[24px] text-white shrink-0 group-hover:text-orange-400 transition-colors" fill="currentColor" viewBox="0 0 24 24">
    <path d="M4.5 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM14.25 8.625a3.375 3.375 0 116.75 0 3.375 3.375 0 01-6.75 0zM1.5 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.63 13.067 13.067 0 01-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 01-.364-.63l-.001-.122zM17.25 19.128l-.001.144a2.25 2.25 0 01-.233.96 10.088 10.088 0 005.06-1.01.75.75 0 00.42-.643 4.875 4.875 0 00-6.957-4.611 8.586 8.586 0 011.71 5.157v.003z" />
  </svg>
);

function Divider() {
  return <div className="hidden lg:block w-px h-10 bg-white/[0.12] shrink-0 lg:self-center" />;
}

function useAutoFlipPlacement(ref, estimatedHeight = 240) {
  const [openUp, setOpenUp] = useState(false);

  useEffect(() => {
    const el = ref?.current;
    if (!el) return;
    const check = () => {
      const r = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom - 12;
      const spaceAbove = r.top - 12;
      setOpenUp(spaceBelow < estimatedHeight && spaceAbove > spaceBelow);
    };
    check();
    window.addEventListener("resize", check);
    window.addEventListener("scroll", check, true);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("scroll", check, true);
    };
  }, [ref, estimatedHeight]);

  return openUp;
}

function OptionMenu({ options, value, onSelect }) {
  const menuRef = useRef(null);
  const openUp = useAutoFlipPlacement(menuRef, 240);

  return (
    <div
      ref={menuRef}
      className={`absolute left-0 ${openUp ? "bottom-full mb-3" : "top-full mt-3"} w-[min(100vw-32px,280px)] bg-white rounded-[20px] shadow-2xl z-[80] py-2 border border-gray-100 cursor-default`}
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

function PackageCheckInMenu({ checkIn, setCheckIn, checkOut, setCheckOut }) {
  const menuRef = useRef(null);
  const openUp = useAutoFlipPlacement(menuRef, 280);

  return (
    <div
      ref={menuRef}
      className={`absolute left-0 ${openUp ? "bottom-full mb-3" : "top-full mt-3"} w-[min(100vw-32px,280px)] bg-white rounded-[20px] shadow-2xl z-[80] p-4 border border-gray-100 cursor-default`}
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-[13px] font-bold text-[#001438] mb-2">Check-in</p>
      <input
        type="date"
        autoFocus
        value={toYmd(checkIn)}
        onChange={(e) => {
          const d = parseYmd(e.target.value);
          if (!d) return;
          setCheckIn(d);
          if (d >= checkOut) setCheckOut(addDays(d, 3));
        }}
        className="w-full rounded-[12px] border border-gray-200 px-3 py-2.5 text-[14px] font-semibold text-[#001438] outline-none focus:border-[#F97211]"
      />
      <p className="text-[12px] text-gray-500 mt-3 mb-1 font-semibold">Check-out</p>
      <input
        type="date"
        value={toYmd(checkOut)}
        min={toYmd(addDays(checkIn, 1))}
        onChange={(e) => {
          const d = parseYmd(e.target.value);
          if (d) setCheckOut(d);
        }}
        className="w-full rounded-[12px] border border-gray-200 px-3 py-2.5 text-[14px] font-semibold text-[#001438] outline-none focus:border-[#F97211]"
      />
    </div>
  );
}

function PackageGuestsMenu({ guests, setGuests }) {
  const menuRef = useRef(null);
  const openUp = useAutoFlipPlacement(menuRef, 200);

  return (
    <div
      ref={menuRef}
      className={`absolute right-0 ${openUp ? "bottom-full mb-3" : "top-full mt-3"} w-[min(280px,calc(100vw-32px))] max-w-[calc(100vw-32px)] bg-white rounded-[20px] shadow-2xl z-[80] p-5 border border-gray-100 cursor-default`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[15px] font-medium text-gray-900">Guests</div>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setGuests(Math.max(1, guests - 1))}
            className={`w-8 h-8 rounded-lg border flex items-center justify-center ${
              guests <= 1
                ? "border-gray-200 text-gray-300 cursor-not-allowed"
                : "border-gray-300 text-gray-600 hover:border-gray-400 cursor-pointer"
            }`}
          >
            -
          </button>
          <span className="w-4 text-center font-bold text-[15px] text-gray-900">{guests}</span>
          <button
            type="button"
            onClick={() => setGuests(Math.min(8, guests + 1))}
            className="w-8 h-8 rounded-lg border border-gray-300 text-gray-600 flex items-center justify-center cursor-pointer hover:border-gray-400"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SharedPackageSearchBar({ compact = false }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(() => params.get("q") || "");
  const [region, setRegion] = useState(() => params.get("region") || "any");
  const [budget, setBudget] = useState(() => params.get("max_price") || "");
  const [guests, setGuests] = useState(() => Math.max(1, Number(params.get("guests")) || 2));
  const [checkIn, setCheckIn] = useState(() => parseYmd(params.get("checkIn")) || addDays(new Date(), 14));
  const [checkOut, setCheckOut] = useState(() => parseYmd(params.get("checkOut")) || addDays(new Date(), 17));
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
    if (q.trim()) qs.set("q", q.trim());
    if (region && region !== "any") qs.set("region", region);
    if (budget) qs.set("max_price", budget);
    qs.set("guests", String(guests));
    qs.set("checkIn", toYmd(checkIn));
    qs.set("checkOut", toYmd(checkOut));
    navigate(`/packages?${qs.toString()}`);
  }, [q, region, budget, guests, checkIn, checkOut, navigate]);

  const regionLabel = REGIONS.find((r) => r.id === region)?.label || "Domestic + International";
  const budgetLabel = BUDGETS.find((b) => b.id === budget)?.label || "Any stay";

  const fieldClass =
    "relative flex items-center gap-2.5 lg:gap-2 2xl:gap-3 cursor-pointer group min-h-[48px] lg:min-h-0 lg:flex-1 lg:min-w-0 lg:px-2.5 xl:px-3 lg:self-center";
  const labelClass =
    "block text-white text-[14px] lg:text-[13px] 2xl:text-[15px] pb-[2px] lg:pb-[3px] 2xl:pb-[5px] font-medium leading-tight";
  const valueClass =
    "block text-white text-[13px] lg:text-[12px] 2xl:text-[15px] font-medium leading-tight mt-0.5 truncate";

  return (
    <div className={`shared-flight-search-bar w-full relative z-10 ${compact ? "" : ""}`}>
      <div className={`w-full relative ${compact ? "" : "px-4 lg:px-6 2xl:px-0"} ${activeDropdown ? "z-[120]" : "z-50"}`}>
        <div
          ref={dropdownRef}
          className={`flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-0 px-4 lg:px-3 xl:px-4 2xl:px-5 max-w-[1600px] w-full min-w-0 lg:h-[88px] 2xl:h-[98px] mx-auto rounded-[20px] lg:rounded-[24px] border border-white/15 py-4 lg:py-0 ${
            compact ? "" : "mb-[40px] 2xl:mb-[90px]"
          }`}
          style={{ backgroundColor: "rgba(255, 255, 255, 0.08)" }}
        >
          <div
            className={`${fieldClass} lg:flex-[1.35]`}
            onClick={() => setActiveDropdown(activeDropdown === "q" ? null : "q")}
          >
            <IconPin />
            <div className="flex-1 min-w-0">
              <span className={labelClass}>Where / package</span>
              {activeDropdown === "q" ? (
                <input
                  autoFocus
                  type="text"
                  className="text-white text-[13px] lg:text-[12px] 2xl:text-[15px] font-medium leading-tight mt-0.5 bg-transparent border-none outline-none w-full placeholder:text-white/40"
                  placeholder="Chardham, Goa, Dubai…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
              ) : (
                <span className={valueClass}>{q.trim() || "Chardham, Goa, Dubai…"}</span>
              )}
            </div>
          </div>

          <Divider />

          <div
            className={fieldClass}
            onClick={() => setActiveDropdown(activeDropdown === "region" ? null : "region")}
          >
            <IconGlobe />
            <div className="flex-1 min-w-0">
              <span className={labelClass}>Region</span>
              <span className={valueClass}>{regionLabel}</span>
            </div>
            {activeDropdown === "region" && (
              <OptionMenu
                options={REGIONS}
                value={region}
                onSelect={(id) => {
                  setRegion(id);
                  setActiveDropdown(null);
                }}
              />
            )}
          </div>

          <Divider />

          <div
            className={fieldClass}
            onClick={() => setActiveDropdown(activeDropdown === "budget" ? null : "budget")}
          >
            <IconBed />
            <div className="flex-1 min-w-0">
              <span className={labelClass}>Live stay</span>
              <span className={valueClass}>{budgetLabel}</span>
            </div>
            {activeDropdown === "budget" && (
              <OptionMenu
                options={BUDGETS}
                value={budget}
                onSelect={(id) => {
                  setBudget(id);
                  setActiveDropdown(null);
                }}
              />
            )}
          </div>

          <Divider />

          <div
            className={fieldClass}
            onClick={() => setActiveDropdown(activeDropdown === "checkIn" ? null : "checkIn")}
          >
            <IconCal />
            <div className="flex-1 min-w-0">
              <span className={labelClass}>Check-in</span>
              <span className={valueClass}>{formatDate(checkIn) || "Add Date"}</span>
            </div>
            {activeDropdown === "checkIn" && (
              <PackageCheckInMenu
                checkIn={checkIn}
                setCheckIn={setCheckIn}
                checkOut={checkOut}
                setCheckOut={setCheckOut}
              />
            )}
          </div>

          <Divider />

          <div
            className={fieldClass}
            onClick={() => setActiveDropdown(activeDropdown === "guests" ? null : "guests")}
          >
            <IconPeople />
            <div className="flex-1 min-w-0">
              <span className={labelClass}>Guests</span>
              <span className={valueClass}>
                {guests} {guests === 1 ? "Guest" : "Guests"}
              </span>
            </div>
            {activeDropdown === "guests" && (
              <PackageGuestsMenu guests={guests} setGuests={setGuests} />
            )}
          </div>

          <button
            type="button"
            onClick={handleSearch}
            className="flex items-center justify-center shrink-0 w-full lg:w-auto bg-gradient-to-r from-[#F97316] to-[#EA580C] py-2.5 2xl:py-3 px-4 2xl:px-6 gap-2 rounded-[14px] 2xl:rounded-[18px] border-0 cursor-pointer hover:from-[#FB923C] hover:to-[#F97316] transition-all shadow-[0_4px_15px_rgba(249,115,22,0.4)] hover:shadow-[0_4px_20px_rgba(249,115,22,0.6)] mt-1 lg:mt-0 lg:ml-2"
          >
            <svg className="w-4 h-4 2xl:w-5 2xl:h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 100 13.5 6.75 6.75 0 000-13.5zM2.25 10.5a8.25 8.25 0 1114.59 5.28l4.69 4.69a.75.75 0 11-1.06 1.06l-4.69-4.69A8.25 8.25 0 012.25 10.5z" clipRule="evenodd" />
            </svg>
            <span className="text-white text-[13px] lg:text-[14px] 2xl:text-[16px] font-semibold">Search</span>
          </button>
        </div>
      </div>
    </div>
  );
}
