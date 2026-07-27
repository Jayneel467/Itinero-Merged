import React, { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import ScrollReveal from "../../../../components/ScrollReveal";
import SharedFlightSearchBar from "@/components/SharedFlightSearchBar";
import SharedHotelSearchBar from "@/components/SharedHotelSearchBar/SharedHotelSearchBar";

function PackagesPanel() {
  const navigate = useNavigate();
  return (
    <div className="w-full px-4 lg:px-6 2xl:px-0 mb-[40px] 2xl:mb-[90px]">
      <div
        className="max-w-[1600px] mx-auto rounded-[20px] lg:rounded-[25px] border border-[#525252] px-6 py-8 text-center"
        style={{ backgroundColor: "rgba(255, 255, 255, 0.07)" }}
      >
        <h2 className="text-white text-xl md:text-2xl font-bold mb-2">Packages aren’t live yet</h2>
        <p className="text-white/80 text-sm md:text-base max-w-xl mx-auto mb-6">
          Vero can still help you plan a trip with flights and day-by-day ideas. We won’t show fake package deals.
        </p>
        <button
          type="button"
          onClick={() => navigate("/vero")}
          className="inline-flex items-center justify-center bg-gradient-to-r from-[#F97316] to-[#EA580C] text-white font-semibold px-6 py-3 rounded-[14px] hover:from-[#FB923C] hover:to-[#F97316] transition-all"
        >
          Ask Vero to plan a package
        </button>
      </div>
    </div>
  );
}

export default function HeroSection() {
  const [activeSearchTab, setActiveSearchTab] = useState("Flights");

  return (
    <div
      className="flex flex-col items-start self-stretch bg-cover bg-center pt-[40px] md:pt-[60px] 2xl:pt-[84px] mx-[8px] md:mx-[15px] rounded-[24px] overflow-visible lg:min-h-[calc(100vh-120px)] 2xl:min-h-0"
      style={{ backgroundImage: "url(https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/6pn63j0i_expires_30_days.png)" }}
    >
      <ScrollReveal delay={0.1} className="w-full">
        <div className="flex flex-col items-center justify-center self-stretch mb-[20px] md:mb-[30px] 2xl:mb-[45px] text-center w-full px-4 md:px-0">
          <span className="text-white text-[32px] sm:text-[44px] lg:text-[40px] 2xl:text-[70px] font-bold leading-tight">Discover more <span className="text-orange-500">everywhere</span></span>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={0.2} className="w-full">
        <div className="flex flex-col items-center self-stretch mb-[30px] md:mb-[40px] 2xl:mb-[240px]">
          <div className="flex flex-nowrap items-center justify-center gap-2 md:gap-4 2xl:gap-0 px-1 md:px-0 w-full overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {[
            { id: "Flights", icon: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/wwpevqpz_expires_30_days.png" },
            { id: "Hotels", icon: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/ey7f1g0t_expires_30_days.png" },
            { id: "Packages", icon: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/d4zzs6iu_expires_30_days.png" }
          ].map((tab, idx) => {
             const isActive = activeSearchTab === tab.id;
             return (
               <button 
                 key={tab.id}
                 type="button"
                 onClick={() => setActiveSearchTab(tab.id)}
                 className={`relative flex shrink-0 items-center justify-center text-left py-2 lg:py-2 2xl:py-3 px-3 md:px-4 lg:px-[16px] 2xl:px-[26px] ${idx < 2 ? 'mr-0 lg:mr-[10px] 2xl:mr-[40px]' : ''} gap-1.5 md:gap-2 lg:gap-[8px] 2xl:gap-[13px] rounded-[80px] border-0 cursor-pointer transition-colors whitespace-nowrap`}
               >
                 {isActive && (
                   <motion.div
                     layoutId="activeSearchTabBackground"
                     className="absolute inset-0 bg-[#FFFFFF1A] rounded-[80px]"
                     initial={false}
                     transition={{ type: "spring", stiffness: 400, damping: 30 }}
                   />
                 )}
                 <img src={tab.icon} className="relative z-10 w-6 h-6 md:w-8 md:h-8 lg:w-[24px] lg:h-[24px] 2xl:w-[45px] 2xl:h-11 object-contain shrink-0" alt={tab.id} />
                 <span className="relative z-10 text-white text-[14px] md:text-[16px] lg:text-[16px] 2xl:text-[29px] font-semibold">{tab.id}</span>
               </button>
             );
          })}
        </div>
        </div>
      </ScrollReveal>

      <div className="flex-1 w-full" />

      {activeSearchTab === "Flights" && <SharedFlightSearchBar />}
      {activeSearchTab === "Hotels" && <SharedHotelSearchBar />}
      {activeSearchTab === "Packages" && <PackagesPanel />}
    </div>
  );
}
