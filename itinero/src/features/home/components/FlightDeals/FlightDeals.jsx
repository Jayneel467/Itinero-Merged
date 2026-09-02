import React, { useRef, useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import ScrollReveal from "../../../../components/ScrollReveal";
import { useCurrency } from "@/context/CurrencyContext";
import { useHomeLocationOptional } from "@/context/HomeLocationContext";
import useLiveRoutePrices, {
  routeKey,
  sampleNearTermDates,
} from "@/features/flights/hooks/useLiveRoutePrices";

/** Popular routes - live LiteAPI min fares (never invented). */
const DEALS = [
  {
    id: 1,
    badge: "Popular",
    discountBg: "#7925C8",
    cardBg: "#FAF8FE",
    cardBorder: "#EFE7FF",
    lineBg: "#DDCCFF",
    btnBg: "#E9DFFD",
    btnText: "#7925C8",
    planeColor: "#7925C8",
    city: "Ahmedabad",
    from: "AMD",
    to: "DXB",
    destination: "Dubai",
  },
  {
    id: 2,
    badge: "Popular",
    discountBg: "#08A082",
    cardBg: "#F9FCFD",
    cardBorder: "#B7DAC4",
    lineBg: "#DFF3F2",
    btnBg: "#DFF3F2",
    btnText: "#08A082",
    planeColor: "#08A082",
    city: "Mumbai",
    from: "BOM",
    to: "DEL",
    destination: "New Delhi",
  },
  {
    id: 3,
    badge: "Popular",
    discountBg: "#135DF3",
    cardBg: "#F8FAFD",
    cardBorder: "#B5CDFF",
    lineBg: "#E0E9FC",
    btnBg: "#E0E9FC",
    btnText: "#135DF3",
    planeColor: "#135DF3",
    city: "Delhi",
    from: "DEL",
    to: "BLR",
    destination: "Bengaluru",
  },
  {
    id: 4,
    badge: "Popular",
    discountBg: "#FB6D13",
    cardBg: "#FDFAF5",
    cardBorder: "#FDE5D3",
    lineBg: "#FDE5D3",
    btnBg: "#FB6D1326",
    btnText: "#FB6D13",
    planeColor: "#FB6D13",
    city: "Mumbai",
    from: "BOM",
    to: "DXB",
    destination: "Dubai",
  },
  {
    id: 5,
    badge: "Popular",
    discountBg: "#135DF3",
    cardBg: "#F8FAFD",
    cardBorder: "#B5CDFF",
    lineBg: "#E0E9FC",
    btnBg: "#E0E9FC",
    btnText: "#135DF3",
    planeColor: "#135DF3",
    city: "Bengaluru",
    from: "BLR",
    to: "DEL",
    destination: "New Delhi",
  },
  {
    id: 6,
    badge: "Popular",
    discountBg: "#7925C8",
    cardBg: "#FAF8FE",
    cardBorder: "#EFE7FF",
    lineBg: "#DDCCFF",
    btnBg: "#E9DFFD",
    btnText: "#7925C8",
    planeColor: "#7925C8",
    city: "Mumbai",
    from: "BOM",
    to: "LHR",
    destination: "London",
  },
  {
    id: 7,
    badge: "Popular",
    discountBg: "#08A082",
    cardBg: "#F9FCFD",
    cardBorder: "#B7DAC4",
    lineBg: "#DFF3F2",
    btnBg: "#DFF3F2",
    btnText: "#08A082",
    planeColor: "#08A082",
    city: "Delhi",
    from: "DEL",
    to: "JFK",
    destination: "New York",
  },
];

export default function FlightDeals() {
  const navigate = useNavigate();
  const { formatMoney } = useCurrency();
  const home = useHomeLocationOptional();
  const scrollRef = useRef(null);
  const wrapperRef = useRef(null);
  const [cardWidth, setCardWidth] = useState(0);

  const homeFrom = (home?.airportCode || "").toUpperCase();

  const deals = useMemo(() => {
    if (!homeFrom) return DEALS;
    const dests = [
      { to: "DXB", destination: "Dubai" },
      { to: "DEL", destination: "New Delhi" },
      { to: "BOM", destination: "Mumbai" },
      { to: "BLR", destination: "Bengaluru" },
      { to: "LHR", destination: "London" },
      { to: "BKK", destination: "Bangkok" },
      { to: "SIN", destination: "Singapore" },
    ].filter((x) => x.to !== homeFrom);
    return dests.slice(0, 7).map((d, i) => ({
      ...DEALS[i % DEALS.length],
      id: i + 1,
      from: homeFrom,
      city: home?.city || homeFrom,
      to: d.to,
      destination: d.destination,
    }));
  }, [homeFrom, home?.city]);

  const routes = useMemo(
    () => deals.map((d) => ({ from: d.from, to: d.to })),
    [deals]
  );
  const { byKey, loading } = useLiveRoutePrices({ routes, enabled: true });

  const openLiveSearch = (deal) => {
    const key = routeKey(deal.from, deal.to);
    const fare = byKey[key];
    const depart =
      fare?.bestDate ||
      sampleNearTermDates(1)[0] ||
      (() => {
        const d = new Date();
        d.setDate(d.getDate() + 21);
        return d.toISOString().slice(0, 10);
      })();

    const params = new URLSearchParams({
      from: deal.from,
      to: deal.to,
      fromCity: deal.city,
      toCity: deal.destination,
      depart,
      adults: "1",
      children: "0",
      infants: "0",
      cabin: "Economy",
      trip: "One way",
    });
    navigate(`/flights?${params.toString()}`);
  };

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
        setCardWidth(Math.floor(width));
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

  return (
    <section
      aria-labelledby="flight-deals-heading"
      className="relative z-0 flex flex-col self-stretch max-w-[1604px] mb-16 md:mb-[120px] mx-auto gap-6 md:gap-7 scroll-mt-[88px]"
    >
      <ScrollReveal delay={0.1}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center self-stretch px-4 md:px-[53px]">
          <div className="flex flex-col shrink-0 items-start gap-1 md:gap-[7px] mb-4 md:mb-0">
            <span
              id="flight-deals-heading"
              className="text-[#001438] dark:text-white text-[28px] md:text-[40px] lg:text-[36px] 2xl:text-[50px] font-bold leading-tight"
            >
              Flight Deals Today
            </span>
            <span className="text-[#F97211] text-[16px] md:text-xl lg:text-[18px] 2xl:text-2xl font-medium">
              Popular routes with live from-fares
            </span>
          </div>
          <div className="flex w-full md:w-auto shrink-0 items-center justify-between md:justify-end gap-2 md:gap-3">
            <button
              type="button"
              onClick={() => navigate("/flights")}
              className="text-black dark:text-white text-[16px] md:text-xl font-medium cursor-pointer hover:underline mr-1 md:mr-2 bg-transparent border-0 p-0"
            >
              Search all flights
            </button>
            <div className="flex items-center gap-2 md:gap-3">
              <button
                type="button"
                onClick={scrollLeft}
                className="w-10 h-10 md:w-[50px] md:h-[50px] rounded-full border border-gray-200 dark:border-white/15 flex items-center justify-center bg-white dark:bg-[#121a2b] hover:bg-gray-50 dark:hover:bg-[#1a263d] shadow-sm transition-colors cursor-pointer"
              >
                <svg className="w-6 h-6 text-black dark:text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <button
                type="button"
                onClick={scrollRight}
                className="w-10 h-10 md:w-[50px] md:h-[50px] rounded-full border border-gray-200 dark:border-white/15 flex items-center justify-center bg-white dark:bg-[#121a2b] hover:bg-gray-50 dark:hover:bg-[#1a263d] shadow-sm transition-colors cursor-pointer"
              >
                <svg className="w-6 h-6 text-black dark:text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
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
            className="flex items-stretch overflow-x-auto gap-5 pb-4 px-4 md:px-[53px] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] scroll-smooth"
          >
            {deals.map((deal) => {
              const key = routeKey(deal.from, deal.to);
              const fare = byKey[key];
              const isLoading = Boolean(loading[key]) || fare === undefined;
              const min = fare?.minPrice;
              const hasPrice = typeof min === "number" && min > 0;

              return (
                <div
                  key={deal.id}
                  data-flight-deal-card
                  className="flex flex-col shrink-0 py-4 rounded-[23px] border border-solid transition-all hover:scale-[1.02] duration-200"
                  style={{
                    width: cardWidth || "calc(20% - 16px)",
                    backgroundColor: deal.cardBg,
                    borderColor: deal.cardBorder,
                  }}
                >
                  <div className="flex justify-between items-start mb-1 px-4">
                    <div className="flex flex-col items-start gap-[9px]">
                      <span
                        className="text-white text-[13px] font-bold py-0.5 px-2 rounded-[5px]"
                        style={{ backgroundColor: deal.discountBg }}
                      >
                        {deal.badge}
                      </span>
                      <span className="deal-city text-black dark:text-white text-[18px] md:text-[22px] font-bold">
                        {deal.city}
                      </span>
                    </div>
                    <svg
                      className="w-[40px] h-[40px] mt-1 opacity-20 dark:opacity-40"
                      fill={deal.planeColor}
                      viewBox="0 0 24 24"
                    >
                      <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
                    </svg>
                  </div>

                  <div className="flex items-center mb-[5px] px-4 gap-2">
                    <span className="deal-route text-[#666666] dark:text-gray-300 text-[14px] font-medium">{deal.from}</span>
                    <svg className="w-4 h-4" fill="none" stroke={deal.planeColor} strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                    <span className="deal-route text-[#666666] dark:text-gray-300 text-[14px] font-medium">{deal.to}</span>
                  </div>

                  <span className="deal-dest text-[#666666] dark:text-gray-400 text-[14px] font-normal mb-2 px-4">
                    {deal.destination}
                  </span>

                  <div className="flex items-center mb-3 px-4">
                    <div className="deal-line h-px w-[80%]" style={{ backgroundColor: deal.lineBg }} />
                    <svg
                      className="w-4 h-4 rotate-90 -ml-2"
                      fill={deal.planeColor}
                      viewBox="0 0 24 24"
                    >
                      <path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
                    </svg>
                  </div>

                  <div className="flex flex-col items-start mb-4 px-4 gap-1 min-h-[52px]">
                    <span className="deal-price text-black dark:text-white text-[18px] md:text-[20px] font-bold">
                      {isLoading
                        ? "Checking fares…"
                        : hasPrice
                          ? `From ${formatMoney(Math.round(min))}`
                          : "Live fares"}
                    </span>
                    <span className="deal-sub text-[#666666] dark:text-gray-400 text-[12px] md:text-[13px] font-normal">
                      {isLoading
                        ? "Checking live fares"
                        : hasPrice
                          ? "Lowest near-term fare found"
                          : "Tap to search live availability"}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="deal-btn flex items-center justify-center mx-4 py-[9px] rounded-[11px] border-0 font-semibold text-[14px] transition-all hover:opacity-90 active:scale-95 cursor-pointer"
                    style={{ backgroundColor: deal.btnBg, color: deal.btnText }}
                    onClick={() => openLiveSearch(deal)}
                  >
                    {hasPrice ? "View flights" : "Search live fares"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
