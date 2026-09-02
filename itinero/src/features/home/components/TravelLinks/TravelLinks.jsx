import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ScrollReveal from "../../../../components/ScrollReveal";
import { useCurrency } from "@/context/CurrencyContext";
import { useHomeLocation } from "@/context/HomeLocationContext";
import { useVeroUi } from "@/context/VeroUiContext";
import useLiveRoutePrices, {
  routeKey,
  sampleNearTermDates,
} from "@/features/flights/hooks/useLiveRoutePrices";
import {
  flightsSearchPath,
  hotelsSearchPath,
  packagesSearchPath,
  eventsSearchPath,
} from "@/features/vero/utils/pageFilterIntent";

const links = [
  { id: 1, name: "London", iata: "LHR", bg: "#EDF2FD", img: `${import.meta.env.BASE_URL}icon/london.svg` },
  { id: 2, name: "Dubai", iata: "DXB", bg: "#FEF4F0", img: `${import.meta.env.BASE_URL}icon/Dubao.svg` },
  { id: 3, name: "Bengaluru", iata: "BLR", bg: "#EDF2FD", img: `${import.meta.env.BASE_URL}icon/Bengaluru.svg` },
  { id: 4, name: "Toronto", iata: "YYZ", bg: "#FEF4F0", img: `${import.meta.env.BASE_URL}icon/Toronto.svg` },
  { id: 5, name: "New Delhi", iata: "DEL", bg: "#EDF2FD", img: `${import.meta.env.BASE_URL}icon/New Dehi.svg` },
  { id: 6, name: "Mumbai", iata: "BOM", bg: "#FEF4F0", img: `${import.meta.env.BASE_URL}icon/Mumbai.svg` },
  { id: 7, name: "Melbourne", iata: "MEL", bg: "#EDF2FD", img: `${import.meta.env.BASE_URL}icon/Melbourne.svg` },
  { id: 8, name: "Chicago", iata: "ORD", bg: "#FEF4F0", img: `${import.meta.env.BASE_URL}icon/chicago.svg` },
  { id: 9, name: "Singapore", iata: "SIN", bg: "#EDF2FD", img: `${import.meta.env.BASE_URL}icon/Singapore.svg` },
  { id: 10, name: "New York", iata: "JFK", bg: "#FEF4F0", img: `${import.meta.env.BASE_URL}icon/New York.svg` },
  { id: 11, name: "Hyderabad", iata: "HYD", bg: "#EDF2FD", img: `${import.meta.env.BASE_URL}icon/Hyderabad.svg` },
  { id: 12, name: "Phuket city", iata: "HKT", bg: "#FEF4F0", img: `${import.meta.env.BASE_URL}icon/Phuket city.svg` },
  { id: 13, name: "Dallas", iata: "DFW", bg: "#EDF2FD", img: `${import.meta.env.BASE_URL}icon/Dallas.svg` },
  { id: 14, name: "Kochi", iata: "COK", bg: "#FEF4F0", img: `${import.meta.env.BASE_URL}icon/kochi.svg` },
  { id: 15, name: "Chennai", iata: "MAA", bg: "#EDF2FD", img: `${import.meta.env.BASE_URL}icon/Chennai.svg` },
];

function flightOriginFor(destIata, homeCode, homeCity) {
  if (!homeCode) return null;
  if (destIata === homeCode) {
    // Same as home - pick a sensible alternate for the link card.
    const alt = homeCode === "DEL" ? { code: "BOM", city: "Mumbai" } : { code: "DEL", city: "Delhi" };
    return alt;
  }
  return { code: homeCode, city: homeCity || homeCode };
}

export default function TravelLinks() {
  const navigate = useNavigate();
  const { formatMoney } = useCurrency();
  const { openVero } = useVeroUi();
  const { airportCode, city, hasOrigin } = useHomeLocation();
  const [expandedId, setExpandedId] = useState(null);
  const depart = sampleNearTermDates(1)[0] || "";

  const routes = useMemo(
    () =>
      hasOrigin
        ? links
            .map((link) => {
              const from = flightOriginFor(link.iata, airportCode, city);
              return from ? { from: from.code, to: link.iata } : null;
            })
            .filter(Boolean)
        : [],
    [airportCode, city, hasOrigin]
  );
  const { byKey, loading } = useLiveRoutePrices({
    routes,
    enabled: hasOrigin && routes.length > 0,
  });

  const fareFor = (link) => {
    const from = flightOriginFor(link.iata, airportCode, city);
    if (!from) return { label: "Set home city", bestDate: "" };
    const key = routeKey(from.code, link.iata);
    if (loading[key]) return { label: "Checking fares…", bestDate: "" };
    const min = byKey[key]?.minPrice;
    const bestDate = byKey[key]?.bestDate || "";
    if (typeof min === "number" && min > 0) {
      return { label: `From ${formatMoney(Math.round(min))}`, bestDate };
    }
    return { label: "See live fares", bestDate: "" };
  };

  const openFlights = (link) => {
    const from = flightOriginFor(link.iata, airportCode, city);
    if (!from) return;
    const fare = fareFor(link);
    navigate(
      flightsSearchPath({
        origin: from.code,
        destination: link.iata,
        depart_date: fare.bestDate || depart,
        adults: 1,
        trip: "oneway",
      })
    );
  };

  const renderCard = (link) => {
    const isExpanded = expandedId === link.id;
    const from = flightOriginFor(link.iata, airportCode, city);
    const fare = fareFor(link);

    return (
      <div
        key={link.id}
        data-travel-link-card
        className={`flex flex-col bg-white dark:bg-[#111c2e] rounded-[30px] p-4 cursor-pointer transition-all duration-300 shadow-sm hover:shadow-md border border-transparent dark:border-white/10 hover:border-gray-100 dark:hover:border-white/20 ${
          !isExpanded ? "hover:-translate-y-1" : "shadow-md border-gray-100 dark:border-white/20"
        }`}
        onClick={() => setExpandedId(isExpanded ? null : link.id)}
      >
        <div className="flex items-center w-full">
          <div
            data-travel-link-icon
            className="flex items-center justify-center w-[60px] h-[60px] rounded-[19px] mr-5 shrink-0 transition-colors shadow-sm"
            style={{ backgroundColor: link.bg }}
          >
            <img src={link.img} className="w-[30px] h-[30px] object-contain" alt={link.name} />
          </div>

          <div className="flex flex-col items-start gap-1">
            <span className="text-black dark:text-white text-[22px] font-bold">{link.name}</span>
            <div className="flex items-center gap-1.5 text-[#49607E] dark:text-gray-400 text-[15px] font-medium tracking-wide">
              <span className={isExpanded ? "text-[#F97211]" : ""}>FLIGHTS</span>
              <span className="text-gray-400">•</span>
              <span className={isExpanded ? "text-[#F97211]" : ""}>HOTELS</span>
            </div>
          </div>

          <div className="flex-1" />

          <svg
            className={`w-5 h-5 text-gray-400 dark:text-gray-300 mr-2 shrink-0 transition-transform duration-300 ${
              isExpanded ? "rotate-180 text-[#F97211] dark:text-[#F97211]" : ""
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        <div
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
            isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            <div
              className="flex flex-col mt-5 pt-4 border-t border-gray-100 dark:border-white/10 px-2 pb-2 cursor-default"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="flex items-center justify-between group bg-transparent border-0 p-0 text-left cursor-pointer"
                onClick={() => openFlights(link)}
              >
                <span className="text-[#666666] dark:text-gray-300 group-hover:text-black dark:group-hover:text-white transition-colors">
                  Flights {from?.city || "home"} - {link.name}
                </span>
                <span className="text-[#49607E] dark:text-gray-400 text-[15px] font-medium">{fare.label}</span>
              </button>

              <div className="h-px w-full bg-gray-100 dark:bg-white/10 my-4" />

              <button
                type="button"
                className="flex items-center justify-between group bg-transparent border-0 p-0 text-left cursor-pointer"
                onClick={() => navigate(hotelsSearchPath({ city: link.name.replace(/ city$/i, "") }))}
              >
                <span className="text-[#666666] dark:text-gray-300 group-hover:text-black dark:group-hover:text-white transition-colors">
                  Hotels in {link.name}
                </span>
                <span className="text-[#49607E] dark:text-gray-400 text-[15px] font-medium">Search stays</span>
              </button>

              <div className="h-px w-full bg-gray-100 dark:bg-white/10 my-4" />

              <button
                type="button"
                className="flex items-center justify-between group bg-transparent border-0 p-0 text-left cursor-pointer"
                onClick={() => navigate(packagesSearchPath({ q: link.name.replace(/ city$/i, "") }))}
              >
                <span className="text-[#666666] dark:text-gray-300 group-hover:text-black dark:group-hover:text-white transition-colors">
                  Packages for {link.name}
                </span>
                <span className="text-[#49607E] dark:text-gray-400 text-[15px] font-medium">View packages</span>
              </button>

              <div className="h-px w-full bg-gray-100 dark:bg-white/10 my-4" />

              <button
                type="button"
                className="flex items-center justify-between group bg-transparent border-0 p-0 text-left cursor-pointer"
                onClick={() => navigate(eventsSearchPath({ city: link.name.replace(/ city$/i, "") }))}
              >
                <span className="text-[#666666] dark:text-gray-300 group-hover:text-black dark:group-hover:text-white transition-colors">
                  Events in {link.name}
                </span>
                <span className="text-[#49607E] dark:text-gray-400 text-[15px] font-medium">What’s on</span>
              </button>

              <button
                type="button"
                className="mt-4 self-start text-[#F97211] text-[14px] font-semibold bg-transparent border-0 p-0 cursor-pointer hover:underline"
                onClick={() =>
                  openVero(
                    `Help me plan a trip to ${link.name}. Search live flights from ${from.city} to ${link.iata} and hotels in ${link.name}.`
                  )
                }
              >
                Ask Vero about {link.name}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col items-start self-stretch max-w-[1604px] mb-16 md:mb-[120px] mx-auto px-4 md:px-[53px] w-full">
      <ScrollReveal delay={0.1}>
        <div className="flex flex-col items-start mb-6 md:mb-10 gap-1 md:gap-2.5">
          <span className="text-[#001438] dark:text-white text-[28px] md:text-[40px] lg:text-[36px] 2xl:text-[50px] font-bold leading-tight">
            Start your travel planning here
          </span>
          <span className="text-[#F97211] text-[16px] md:text-xl lg:text-[18px] 2xl:text-2xl font-medium">
            Search flights, hotels & more
          </span>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={0.2} className="w-full">
        <div className="hidden xl:flex flex-row gap-[30px] w-full items-start">
          <div className="flex flex-col flex-1 gap-[30px]">
            {links.filter((_, i) => i % 3 === 0).map((link) => renderCard(link))}
          </div>
          <div className="flex flex-col flex-1 gap-[30px]">
            {links.filter((_, i) => i % 3 === 1).map((link) => renderCard(link))}
          </div>
          <div className="flex flex-col flex-1 gap-[30px]">
            {links.filter((_, i) => i % 3 === 2).map((link) => renderCard(link))}
          </div>
        </div>

        <div className="hidden md:flex xl:hidden flex-row gap-6 w-full items-start">
          <div className="flex flex-col flex-1 gap-6">
            {links.filter((_, i) => i % 2 === 0).map((link) => renderCard(link))}
          </div>
          <div className="flex flex-col flex-1 gap-6">
            {links.filter((_, i) => i % 2 === 1).map((link) => renderCard(link))}
          </div>
        </div>

        <div className="flex md:hidden flex-col gap-4 w-full">
          {links.map((link) => renderCard(link))}
        </div>
      </ScrollReveal>
    </div>
  );
}
