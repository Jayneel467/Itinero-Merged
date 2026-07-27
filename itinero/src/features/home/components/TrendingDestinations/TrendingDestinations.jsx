import React, { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ScrollReveal from "../../../../components/ScrollReveal";

function defaultDepartYmd() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

/**
 * Trending Destinations — cards open a live flight search (BOM → destination).
 */
export default function TrendingDestinations() {
  const navigate = useNavigate();
  const scrollRef = useRef(null);
  const wrapperRef = useRef(null);
  const [cardWidth, setCardWidth] = useState(0);

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

  const openSearch = (toCode, toCity) => {
    const params = new URLSearchParams({
      from: "BOM",
      to: toCode,
      fromCity: "Mumbai",
      toCity,
      depart: defaultDepartYmd(),
      adults: "1",
      children: "0",
      infants: "0",
      cabin: "Economy",
      trip: "One way",
    });
    navigate(`/flights?${params.toString()}`);
  };

  const destinations = [
    {
      id: 1,
      image: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/2950kkhg_expires_30_days.png",
      title: "Bali",
      subtitle: "Indonesia",
      code: "DPS",
      hint: "Search live fares",
    },
    {
      id: 2,
      image: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/fmqxgcdt_expires_30_days.png",
      title: "New York",
      subtitle: "USA",
      code: "JFK",
      hint: "Search live fares",
    },
    {
      id: 3,
      image: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/jq3ahus7_expires_30_days.png",
      title: "Darjeeling",
      subtitle: "Bagdogra",
      code: "IXB",
      hint: "Search live fares",
    },
    {
      id: 4,
      image: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/r1oo6x2k_expires_30_days.png",
      title: "Japan",
      subtitle: "Tokyo",
      code: "NRT",
      hint: "Search live fares",
    },
    {
      id: 5,
      image: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/2b6x2epp_expires_30_days.png",
      title: "Paris",
      subtitle: "France",
      code: "CDG",
      hint: "Search live fares",
    },
    {
      id: 6,
      image: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/fmqxgcdt_expires_30_days.png",
      title: "London",
      subtitle: "UK",
      code: "LHR",
      hint: "Search live fares",
    },
    {
      id: 7,
      image: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/jq3ahus7_expires_30_days.png",
      title: "Dubai",
      subtitle: "UAE",
      code: "DXB",
      hint: "Search live fares",
    },
  ];

  return (
    <div className="flex flex-col self-stretch max-w-[1600px] mb-16 md:mb-[120px] mx-auto gap-6 md:gap-[40px]">
      <ScrollReveal delay={0.1}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center self-stretch px-4 md:px-[53px]">
          <div className="flex flex-col shrink-0 items-start gap-1 mb-4 md:mb-0">
            <span className="text-[#001438] text-[28px] md:text-[40px] lg:text-[36px] 2xl:text-[50px] font-bold leading-tight">
              Trending Destinations
            </span>
            <span className="text-[#F97211] text-[16px] md:text-xl lg:text-[18px] 2xl:text-2xl font-medium">
              Most loved places by travelers around the world
            </span>
          </div>
          <div className="flex w-full md:w-auto shrink-0 items-center justify-between md:justify-end">
            <button
              type="button"
              onClick={() => navigate("/vero")}
              className="text-black text-[16px] md:text-xl font-medium mr-4 md:mr-[29px] cursor-pointer hover:underline bg-transparent border-0 p-0"
            >
              Ask Vero for ideas
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
            {destinations.map((dest) => (
              <button
                type="button"
                key={dest.id}
                onClick={() => openSearch(dest.code, dest.title)}
                className="flex flex-col shrink-0 bg-white rounded-[23px] overflow-hidden group cursor-pointer transition-transform hover:-translate-y-1 text-left border-0 p-0"
                style={{ width: cardWidth || "calc(20% - 16px)", boxShadow: "0px 15px 30px #0000001F" }}
              >
                <div className="relative w-full h-[182px]">
                  <img src={dest.image} className="w-full h-full object-cover" alt={dest.title} />
                </div>

                <div className="flex flex-col flex-1 p-4 md:p-5">
                  <div className="flex flex-col items-start mb-4 md:mb-6">
                    <span className="text-black text-[18px] md:text-[22px] font-bold">{dest.title}</span>
                    <span className="text-[#777777] text-[12px] md:text-[14px] font-medium mt-0.5">{dest.subtitle}</span>
                  </div>

                  <div className="mt-auto flex items-center justify-between">
                    <div className="flex flex-col items-start gap-1">
                      <span className="text-[#777777] text-[10px] md:text-[12px] font-medium whitespace-nowrap">
                        From Mumbai (BOM)
                      </span>
                      <span className="text-[#F97211] text-[16px] md:text-[20px] font-bold">{dest.hint}</span>
                    </div>
                    <div className="w-8 h-8 md:w-[35px] md:h-[35px] rounded-full border border-gray-200 flex items-center justify-center bg-white group-hover:bg-[#F97211] transition-colors shrink-0 mt-3 md:mt-3 ml-2">
                      <svg
                        className="w-4 h-4 text-black group-hover:text-white transition-colors"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
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
