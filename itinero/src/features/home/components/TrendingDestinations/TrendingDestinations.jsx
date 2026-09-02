import React, { useRef, useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import ScrollReveal from "../../../../components/ScrollReveal";
import { PlacesPhotoImg } from "@/components/shared";
import { useCurrency } from "@/context/CurrencyContext";
import { useHomeLocation } from "@/context/HomeLocationContext";
import useLiveRoutePrices, {
  routeKey,
  sampleNearTermDates,
} from "@/features/flights/hooks/useLiveRoutePrices";

const DESTINATIONS = [
  {
    id: 1,
    image:
      "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=800&q=80",
    title: "Bali",
    subtitle: "Indonesia",
    code: "DPS",
  },
  {
    id: 2,
    image:
      "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=800&q=80",
    title: "New York",
    subtitle: "USA",
    code: "JFK",
  },
  {
    id: 3,
    image:
      "https://images.unsplash.com/photo-1544735716-392fe2489ffa?auto=format&fit=crop&w=800&q=80",
    title: "Darjeeling",
    subtitle: "Bagdogra",
    code: "IXB",
  },
  {
    id: 4,
    image:
      "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=800&q=80",
    title: "Japan",
    subtitle: "Tokyo",
    code: "NRT",
  },
  {
    id: 5,
    image:
      "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=800&q=80",
    title: "Paris",
    subtitle: "France",
    code: "CDG",
  },
  {
    id: 6,
    image:
      "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=800&q=80",
    title: "London",
    subtitle: "UK",
    code: "LHR",
  },
  {
    id: 7,
    image:
      "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=800&q=80",
    title: "Dubai",
    subtitle: "UAE",
    code: "DXB",
  },
];

/**
 * Trending Destinations - live LiteAPI from-fares (user home → dest).
 */
export default function TrendingDestinations() {
  const navigate = useNavigate();
  const { formatMoney } = useCurrency();
  const { airportCode, city, originLabel, hasOrigin } = useHomeLocation();
  const originCode = airportCode || "";
  const originCity = city || originLabel;
  const scrollRef = useRef(null);
  const wrapperRef = useRef(null);
  const [cardWidth, setCardWidth] = useState(0);

  const routes = useMemo(
    () =>
      hasOrigin
        ? DESTINATIONS.filter((d) => d.code !== originCode).map((d) => ({
            from: originCode,
            to: d.code,
          }))
        : [],
    [hasOrigin, originCode]
  );
  const { byKey, loading } = useLiveRoutePrices({
    routes,
    enabled: hasOrigin && routes.length > 0,
  });

  useEffect(() => {
    const updateWidth = () => {
      if (wrapperRef.current) {
        const isMobile = window.innerWidth < 768;
        const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;
        const isLaptop = window.innerWidth >= 1024 && window.innerWidth < 1280;
        const isDesktop = window.innerWidth >= 1280 && window.innerWidth < 1536;

        const CARDS = isMobile ? 1.2 : isTablet ? 2.5 : isLaptop ? 3 : isDesktop ? 4 : 5;
        const PADDING = isMobile ? 16 * 2 : 53 * 2;
        const GAP = 20;

        const w = wrapperRef.current.clientWidth;
        const width = (w - PADDING - GAP * (Math.ceil(CARDS) - 1)) / CARDS;
        setCardWidth(Math.floor(width) - 1);
      }
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -(cardWidth + 20), behavior: "smooth" });
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: cardWidth + 20, behavior: "smooth" });
    }
  };

  const openSearch = (dest) => {
    if (!hasOrigin) {
      navigate("/explore");
      return;
    }
    const key = routeKey(originCode, dest.code);
    const fare = byKey[key];
    const depart =
      fare?.bestDate ||
      sampleNearTermDates(1)[0] ||
      (() => {
        const d = new Date();
        d.setDate(d.getDate() + 14);
        return d.toISOString().slice(0, 10);
      })();

    const params = new URLSearchParams({
      from: originCode,
      to: dest.code,
      fromCity: originCity,
      toCity: dest.title,
      depart,
      adults: "1",
      children: "0",
      infants: "0",
      cabin: "Economy",
      trip: "One way",
    });
    navigate(`/flights?${params.toString()}`);
  };

  const priceLabel = (dest) => {
    if (!hasOrigin) return "Set home city";
    const key = routeKey(originCode, dest.code);
    if (loading[key]) return null;
    const min = byKey[key]?.minPrice;
    if (typeof min === "number" && min > 0) return `From ${formatMoney(Math.round(min))}`;
    if (byKey[key] && byKey[key].minPrice == null) return "See fares";
    return null;
  };

  return (
    <div className="flex flex-col self-stretch max-w-[1600px] mb-16 md:mb-[120px] mx-auto gap-6 md:gap-[40px]">
      <ScrollReveal delay={0.1}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center self-stretch px-4 md:px-[53px]">
          <div className="flex flex-col shrink-0 items-start gap-1 mb-4 md:mb-0">
            <span className="text-[#001438] text-[28px] md:text-[40px] lg:text-[36px] 2xl:text-[50px] font-bold leading-tight">
              Trending Destinations
            </span>
            <span className="text-[#F97211] text-[16px] md:text-xl lg:text-[18px] 2xl:text-2xl font-medium">
              {hasOrigin
                ? `Live from-fares from ${originCity} - tap to search`
                : "Set your home city (flag in the header) to see live fares"}
            </span>
          </div>
          <div className="flex w-full md:w-auto shrink-0 items-center justify-between md:justify-end">
            <button
              type="button"
              onClick={() => navigate("/explore")}
              className="text-black text-[16px] md:text-xl font-medium mr-4 md:mr-[29px] cursor-pointer hover:underline bg-transparent border-0 p-0"
            >
              Explore more
            </button>
            <div className="flex items-center">
              <button
                type="button"
                onClick={scrollLeft}
                className="w-10 h-10 md:w-[50px] md:h-[50px] rounded-full border border-gray-200 flex items-center justify-center bg-white hover:bg-gray-50 shadow-sm mr-2 md:mr-4 transition-colors"
              >
                <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                </svg>
              </button>
              <button
                type="button"
                onClick={scrollRight}
                className="w-10 h-10 md:w-[50px] md:h-[50px] rounded-full border border-gray-200 flex items-center justify-center bg-white hover:bg-gray-50 shadow-sm transition-colors"
              >
                <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </ScrollReveal>
      <ScrollReveal delay={0.2}>
        <div className="overflow-hidden" ref={wrapperRef}>
          <div
            ref={scrollRef}
            className="flex items-stretch overflow-x-auto gap-5 pb-8 px-4 md:px-[53px] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] scroll-smooth"
          >
            {DESTINATIONS.filter((d) => d.code !== originCode).map((dest) => {
              const label = priceLabel(dest);
              const key = hasOrigin ? routeKey(originCode, dest.code) : "";
              const isLoading = hasOrigin && (Boolean(loading[key]) || label === null);
              return (
                <button
                  type="button"
                  key={dest.id}
                  onClick={() => openSearch(dest)}
                  className="flex flex-col shrink-0 bg-white rounded-[23px] overflow-hidden group cursor-pointer transition-transform hover:-translate-y-1 text-left border-0 p-0"
                  style={{
                    width: cardWidth || "calc(20% - 16px)",
                    boxShadow: "0px 15px 30px #0000001F",
                  }}
                >
                  <div className="relative w-full h-[182px]">
                    <PlacesPhotoImg
                      city={dest.title === "Japan" ? dest.subtitle : dest.title}
                      country={dest.title === "Japan" ? "Japan" : dest.subtitle}
                      query={`${dest.title} ${dest.subtitle} landmark`}
                      fallback={dest.image}
                      className="w-full h-full object-cover"
                      alt={dest.title}
                      loading="lazy"
                    />
                  </div>

                  <div className="flex flex-col flex-1 w-full px-[20px] py-4 md:py-5">
                    <div className="flex flex-col items-start mb-4 md:mb-6">
                      <span className="text-black text-[18px] md:text-[22px] font-bold">
                        {dest.title}
                      </span>
                      <span className="text-[#777777] text-[12px] md:text-[14px] font-medium mt-0.5">
                        {dest.subtitle}
                      </span>
                    </div>

                    <div className="mt-auto flex items-center justify-between">
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-[#777777] text-[10px] md:text-[12px] font-medium whitespace-nowrap">
                          {hasOrigin
                            ? `From ${originCity}${originCode ? ` (${originCode})` : ""}`
                            : "Home city not set"}
                        </span>
                        {isLoading ? (
                          <span className="inline-block h-5 w-24 rounded-md bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-pulse" />
                        ) : (
                          <span className="text-[#F97211] text-[16px] md:text-[20px] font-bold">
                            {label}
                          </span>
                        )}
                      </div>
                      <div className="w-8 h-8 md:w-[35px] md:h-[35px] rounded-full border border-gray-200 flex items-center justify-center bg-white group-hover:bg-[#F97211] transition-colors shrink-0 mt-3 md:mt-3 ml-2">
                        <svg
                          className="w-4 h-4 text-black group-hover:text-white transition-colors"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M9 5l7 7-7 7"
                          ></path>
                        </svg>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </ScrollReveal>
    </div>
  );
}
