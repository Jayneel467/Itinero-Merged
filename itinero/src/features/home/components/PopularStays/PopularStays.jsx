import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ScrollReveal from "../../../../components/ScrollReveal";
import { PlacesPhotoImg } from "@/components/shared";
import { hotelsSearchPath } from "@/features/vero/utils/pageFilterIntent";

const u = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=80`;

const STAYS = [
  { id: "goa", city: "Goa", country: "India", image: u("photo-1512343879784-a960cd13ef20") },
  { id: "dubai", city: "Dubai", country: "UAE", image: u("photo-1512453979798-5ea266f8880c") },
  { id: "singapore", city: "Singapore", country: "Singapore", image: u("photo-1525625293386-3f8f99389edd") },
  { id: "jaipur", city: "Jaipur", country: "India", image: u("photo-1477587458883-47145ed94245") },
  { id: "bangkok", city: "Bangkok", country: "Thailand", image: u("photo-1508009603885-50cf7c579365") },
  { id: "bali", city: "Bali", country: "Indonesia", image: u("photo-1537996194471-e667a5d8f3e0") },
  { id: "london", city: "London", country: "UK", image: u("photo-1513635269975-59663e0ac1ad") },
  { id: "paris", city: "Paris", country: "France", image: u("photo-1502602898657-3e91760cbb34") },
];

/**
 * Agoda / Expedia stays rail - city photos into hotel search, no invented prices.
 */
export default function PopularStays() {
  const navigate = useNavigate();
  const scrollRef = useRef(null);
  const wrapperRef = useRef(null);
  const [cardWidth, setCardWidth] = useState(0);

  useEffect(() => {
    const updateWidth = () => {
      if (!wrapperRef.current) return;
      const isMobile = window.innerWidth < 768;
      const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;
      const isLaptop = window.innerWidth >= 1024 && window.innerWidth < 1280;
      const isDesktop = window.innerWidth >= 1280 && window.innerWidth < 1536;
      const CARDS = isMobile ? 1.2 : isTablet ? 2.5 : isLaptop ? 3 : isDesktop ? 4 : 5;
      const PADDING = isMobile ? 16 * 2 : 53 * 2;
      const GAP = 20;
      const w = wrapperRef.current.clientWidth;
      setCardWidth(Math.floor((w - PADDING - GAP * (Math.ceil(CARDS) - 1)) / CARDS) - 1);
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  const scrollByCards = (dir) => {
    scrollRef.current?.scrollBy({ left: dir * (cardWidth + 20), behavior: "smooth" });
  };

  return (
    <div className="flex flex-col self-stretch max-w-[1600px] mb-12 md:mb-20 mx-auto gap-6 md:gap-8">
      <ScrollReveal delay={0.1}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center self-stretch px-4 md:px-[53px]">
          <div className="flex flex-col shrink-0 items-start gap-1 mb-4 md:mb-0">
            <span className="text-[#001438] text-[28px] md:text-[40px] lg:text-[36px] 2xl:text-[50px] font-bold leading-tight">
              Popular stays
            </span>
            <span className="text-[#F97211] text-[16px] md:text-xl lg:text-[18px] 2xl:text-2xl font-medium">
              Find hotels in cities travellers book most
            </span>
          </div>
          <div className="flex w-full md:w-auto shrink-0 items-center justify-between md:justify-end">
            <button
              type="button"
              onClick={() => navigate("/hotels")}
              className="text-black text-[16px] md:text-xl font-medium mr-4 md:mr-[29px] cursor-pointer hover:underline bg-transparent border-0 p-0"
            >
              Browse stays
            </button>
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => scrollByCards(-1)}
                aria-label="Previous stays"
                className="w-10 h-10 md:w-[50px] md:h-[50px] rounded-full border border-gray-200 flex items-center justify-center bg-white hover:bg-gray-50 shadow-sm mr-2 md:mr-4 transition-colors"
              >
                <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => scrollByCards(1)}
                aria-label="Next stays"
                className="w-10 h-10 md:w-[50px] md:h-[50px] rounded-full border border-gray-200 flex items-center justify-center bg-white hover:bg-gray-50 shadow-sm transition-colors"
              >
                <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
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
            {STAYS.map((stay) => (
              <button
                type="button"
                key={stay.id}
                onClick={() => navigate(hotelsSearchPath({ city: stay.city }))}
                className="flex flex-col shrink-0 bg-white rounded-[23px] overflow-hidden group cursor-pointer transition-transform hover:-translate-y-1 text-left border-0 p-0"
                style={{
                  width: cardWidth || "calc(20% - 16px)",
                  boxShadow: "0px 15px 30px #0000001F",
                }}
              >
                <div className="relative w-full h-[182px]">
                  <PlacesPhotoImg
                    city={stay.city}
                    country={stay.country}
                    fallback={stay.image}
                    className="w-full h-full object-cover"
                    alt={stay.city}
                    loading="lazy"
                  />
                </div>
                <div className="flex flex-col flex-1 p-4 md:p-5">
                  <span className="text-black text-[18px] md:text-[22px] font-bold">{stay.city}</span>
                  <span className="text-[#777777] text-[12px] md:text-[14px] font-medium mt-0.5">
                    {stay.country}
                  </span>
                  <div className="mt-auto pt-4 flex items-center justify-between">
                    <span className="text-[#F97211] text-[14px] md:text-[16px] font-bold">Find stays</span>
                    <div className="w-8 h-8 md:w-[35px] md:h-[35px] rounded-full border border-gray-200 flex items-center justify-center bg-white group-hover:bg-[#F97211] transition-colors shrink-0">
                      <svg
                        className="w-4 h-4 text-black group-hover:text-white transition-colors"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </ScrollReveal>
    </div>
  );
}
