import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { BedDouble, Package, Plane, Ticket, Train, Waypoints } from "lucide-react";
import ScrollReveal from "../../../../components/ScrollReveal";
import SharedFlightSearchBar from "@/components/SharedFlightSearchBar";
import SharedHotelSearchBar from "@/components/SharedHotelSearchBar/SharedHotelSearchBar";
import SharedPackageSearchBar from "@/components/SharedPackageSearchBar/SharedPackageSearchBar";
import SharedEventSearchBar from "@/components/SharedEventSearchBar/SharedEventSearchBar";
import { useHomeLocationOptional } from "@/context/HomeLocationContext";
import { isTrainsMarket } from "@/constants/regionalFeatures";
import "./HeroSection.css";

// Saved from the Pixano/Figma export in itinero-web (CDN links expired).
const HERO_BG = `${import.meta.env.BASE_URL}hero.jpg`;

const ALL_TABS = [
  { id: "Flights", Icon: Plane },
  { id: "Hotels", Icon: BedDouble },
  { id: "Packages", Icon: Package },
  { id: "Events", Icon: Ticket },
  { id: "Trains", Icon: Train, badge: "India", indiaOnly: true },
  { id: "Transits", Icon: Waypoints, badge: "Beta" },
];

export default function HeroSection() {
  const navigate = useNavigate();
  const home = useHomeLocationOptional();
  const showTrains = isTrainsMarket({
    countryCode: home?.countryCode,
    passportCountry: home?.passportCountry,
  });
  const tabs = useMemo(
    () => ALL_TABS.filter((t) => !t.indiaOnly || showTrains),
    [showTrains]
  );
  const [activeSearchTab, setActiveSearchTab] = useState("Flights");

  const handleTabClick = (tabId) => {
    if (tabId === "Trains") {
      navigate("/trains");
      return;
    }
    if (tabId === "Transits" || tabId === "Buses") {
      navigate("/transits");
      return;
    }
    setActiveSearchTab(tabId);
  };

  return (
    <div
      className="hero-section flex flex-col items-start self-stretch bg-cover bg-center pt-[40px] md:pt-[60px] 2xl:pt-[84px] mx-[8px] md:mx-[15px] rounded-[24px] overflow-visible lg:min-h-[calc(100vh-120px)] 2xl:min-h-0"
      style={{
        backgroundColor: "#001438",
        backgroundImage: `url(${HERO_BG})`,
      }}
    >
      <ScrollReveal delay={0.1} className="w-full">
        <div className="flex flex-col items-center justify-center self-stretch mb-[20px] md:mb-[30px] 2xl:mb-[45px] text-center w-full px-4 md:px-0">
          <span className="hero-section__title text-[32px] sm:text-[44px] lg:text-[40px] 2xl:text-[70px] font-bold leading-tight">
            Discover more <span className="text-orange-500">everywhere</span>
          </span>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={0.2} className="w-full">
        <div className="flex flex-col items-center self-stretch mb-[30px] md:mb-[40px] 2xl:mb-[240px]">
          <div className="flex flex-nowrap items-center justify-start md:justify-center gap-2 md:gap-3 2xl:gap-4 px-4 md:px-0 w-full overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {tabs.map((tab) => {
              const isActive = activeSearchTab === tab.id;
              const Icon = tab.Icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabClick(tab.id)}
                  className={`hero-section__tab relative flex shrink-0 items-center justify-center text-left py-2 lg:py-2 2xl:py-3 px-3 md:px-4 lg:px-[16px] 2xl:px-[22px] gap-1.5 md:gap-2 lg:gap-[8px] 2xl:gap-[12px] rounded-[80px] border-0 cursor-pointer transition-all whitespace-nowrap ${
                    isActive
                      ? "hero-section__tab--active bg-white/20 backdrop-blur-md shadow-sm"
                      : "hover:bg-white/10"
                  }`}
                >
                  <Icon
                    className="relative z-10 w-6 h-6 md:w-7 md:h-7 lg:w-[22px] lg:h-[22px] 2xl:w-10 2xl:h-10 text-white shrink-0"
                    strokeWidth={2.1}
                    aria-hidden
                  />
                  <span className="relative z-10 text-white text-[13px] md:text-[15px] lg:text-[15px] 2xl:text-[26px] font-semibold drop-shadow-sm">
                    {tab.id}
                  </span>
                  {tab.badge ? (
                    <span className="relative z-10 ml-0.5 inline-flex items-center rounded-full bg-[#F97211] px-1.5 py-0.5 text-[9px] md:text-[10px] 2xl:text-[12px] font-extrabold uppercase tracking-[0.08em] text-white">
                      {tab.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </ScrollReveal>

      <div className="flex-1 w-full" />

      {activeSearchTab === "Flights" && <SharedFlightSearchBar />}
      {activeSearchTab === "Hotels" && <SharedHotelSearchBar mode="hotels" />}
      {activeSearchTab === "Packages" && <SharedPackageSearchBar />}
      {activeSearchTab === "Events" && <SharedEventSearchBar />}
    </div>
  );
}
