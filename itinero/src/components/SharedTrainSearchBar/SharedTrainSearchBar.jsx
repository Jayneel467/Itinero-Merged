import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeftRight } from "lucide-react";
import { railDisplayName } from "@/features/vero/utils/pageFilterIntent";

const WINDOWS = [
  { id: "", label: "Any time" },
  { id: "morning", label: "Morning" },
  { id: "afternoon", label: "Afternoon" },
  { id: "evening", label: "Evening" },
  { id: "night", label: "Night" },
];

function Divider() {
  return <div className="hidden lg:block w-px h-10 bg-white/[0.12] shrink-0 lg:self-center" />;
}

export default function SharedTrainSearchBar({ compact = false }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [from, setFrom] = useState(() => railDisplayName(params.get("from") || "Surat"));
  const [to, setTo] = useState(() => railDisplayName(params.get("to") || "Vadodara"));
  const [when, setWhen] = useState(() => params.get("when") || params.get("date") || "tomorrow");
  const [windowSlot, setWindowSlot] = useState(() => params.get("window") || "");
  const [active, setActive] = useState(null);

  useEffect(() => {
    setFrom(railDisplayName(params.get("from") || "Surat"));
    setTo(railDisplayName(params.get("to") || "Vadodara"));
    setWhen(params.get("when") || params.get("date") || "tomorrow");
    setWindowSlot(params.get("window") || "");
  }, [params]);

  const handleSearch = useCallback(() => {
    const qs = new URLSearchParams();
    if (from.trim()) qs.set("from", from.trim());
    if (to.trim()) qs.set("to", to.trim());
    if (when.trim()) qs.set("when", when.trim());
    if (/^\d{4}-\d{2}-\d{2}$/.test(when.trim())) qs.set("date", when.trim());
    if (windowSlot) qs.set("window", windowSlot);
    navigate(`/trains?${qs.toString()}`);
    setActive(null);
  }, [from, to, when, windowSlot, navigate]);

  const swapEnds = () => {
    setFrom(to);
    setTo(from);
  };

  const windowLabel = WINDOWS.find((w) => w.id === windowSlot)?.label || "Any time";

  return (
    <div className="shared-flight-search-bar w-full relative z-10">
      <div className={`w-full relative ${compact ? "" : "px-4 lg:px-6 2xl:px-0"} ${active ? "z-[120]" : "z-50"}`}>
        <div
          className={`flex flex-col lg:flex-row items-stretch justify-between px-4 lg:px-6 2xl:px-8 max-w-[1600px] w-full lg:h-[80px] 2xl:h-[98px] mx-auto rounded-[20px] lg:rounded-[25px] border border-[#525252] py-4 lg:py-0 gap-4 lg:gap-0 ${
            compact ? "" : "mb-[40px] 2xl:mb-[90px]"
          }`}
          style={{ backgroundColor: "rgba(255, 255, 255, 0.07)" }}
        >
          <div
            className="relative flex items-center gap-3 cursor-pointer group lg:h-full flex-1 min-w-0"
            onClick={() => setActive(active === "from" ? null : "from")}
          >
            <div className="flex-1 min-w-0">
              <span className="block text-white text-[14px] lg:text-[13px] 2xl:text-[17px] font-medium">From</span>
              {active === "from" ? (
                <input
                  autoFocus
                  className="text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium bg-transparent border-none outline-none w-full placeholder:text-white/30"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Surat"
                />
              ) : (
                <span className="block text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium truncate">
                  {from || "City or station"}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            aria-label="Swap stations"
            onClick={swapEnds}
            className="hidden lg:flex self-center shrink-0 w-9 h-9 items-center justify-center rounded-full border border-white/20 text-white/80 hover:bg-white/10"
          >
            <ArrowLeftRight size={16} />
          </button>
          <Divider />
          <div
            className="relative flex items-center gap-3 cursor-pointer group lg:h-full flex-1 min-w-0"
            onClick={() => setActive(active === "to" ? null : "to")}
          >
            <div className="flex-1 min-w-0">
              <span className="block text-white text-[14px] lg:text-[13px] 2xl:text-[17px] font-medium">To</span>
              {active === "to" ? (
                <input
                  autoFocus
                  className="text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium bg-transparent border-none outline-none w-full placeholder:text-white/30"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Vadodara"
                />
              ) : (
                <span className="block text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium truncate">
                  {to || "City or station"}
                </span>
              )}
            </div>
          </div>
          <Divider />
          <div
            className="relative flex items-center gap-3 cursor-pointer group lg:h-full"
            onClick={() => setActive(active === "when" ? null : "when")}
          >
            <div className="min-w-0 lg:w-[110px]">
              <span className="block text-white text-[14px] lg:text-[13px] 2xl:text-[17px] font-medium">When</span>
              <span className="block text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium truncate capitalize">
                {when || "Tomorrow"}
              </span>
            </div>
            {active === "when" && (
              <div className="absolute left-0 top-full mt-3 w-[min(240px,calc(100vw-32px))] max-w-[calc(100vw-32px)] bg-white rounded-[20px] shadow-2xl z-[80] py-2 border border-gray-100" onClick={(e) => e.stopPropagation()}>
                {["today", "tomorrow"].map((w) => (
                  <button
                    key={w}
                    type="button"
                    className={`w-full text-left px-4 py-2.5 text-[14px] font-semibold capitalize ${
                      when === w ? "text-[#F97211] bg-orange-50" : "text-[#001438] hover:bg-gray-50"
                    }`}
                    onClick={() => {
                      setWhen(w);
                      setActive(null);
                    }}
                  >
                    {w}
                  </button>
                ))}
                <div className="px-4 py-2">
                  <input
                    type="date"
                    className="w-full text-[#001438] text-[14px] font-semibold border border-gray-200 rounded-xl px-3 py-2"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      if (e.target.value) {
                        setWhen(e.target.value);
                        setActive(null);
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>
          <Divider />
          <div
            className="relative flex items-center gap-3 cursor-pointer group lg:h-full"
            onClick={() => setActive(active === "window" ? null : "window")}
          >
            <div className="min-w-0 lg:w-[110px]">
              <span className="block text-white text-[14px] lg:text-[13px] 2xl:text-[17px] font-medium">Time</span>
              <span className="block text-white text-[13px] lg:text-[12px] 2xl:text-[16px] font-medium truncate">
                {windowLabel}
              </span>
            </div>
            {active === "window" && (
              <div className="absolute right-0 top-full mt-3 w-[min(220px,calc(100vw-32px))] max-w-[calc(100vw-32px)] bg-white rounded-[20px] shadow-2xl z-[80] py-2 border border-gray-100" onClick={(e) => e.stopPropagation()}>
                {WINDOWS.map((w) => (
                  <button
                    key={w.id || "any"}
                    type="button"
                    className={`w-full text-left px-4 py-2.5 text-[14px] font-semibold ${
                      windowSlot === w.id ? "text-[#F97211] bg-orange-50" : "text-[#001438] hover:bg-gray-50"
                    }`}
                    onClick={() => {
                      setWindowSlot(w.id);
                      setActive(null);
                    }}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleSearch}
            className="flex items-center justify-center w-full lg:w-auto bg-gradient-to-r from-[#F97316] to-[#EA580C] py-2.5 2xl:py-3 px-4 2xl:px-6 gap-2 rounded-[14px] 2xl:rounded-[18px] border-0 cursor-pointer hover:from-[#FB923C] hover:to-[#F97316] transition-all shadow-[0_4px_15px_rgba(249,115,22,0.4)] mt-2 lg:mt-0 lg:self-center"
          >
            <span className="text-white text-[13px] lg:text-[14px] 2xl:text-[19px] font-semibold">Search</span>
          </button>
        </div>
      </div>
    </div>
  );
}
