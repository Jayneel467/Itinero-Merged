import React, { useState } from "react";
import ScrollReveal from "../../../../components/ScrollReveal";

const links = [
  { id: 1, name: "London", bg: "#EDF2FD", img: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/rx7ygbvv_expires_30_days.png" },
  { id: 2, name: "Dubai", bg: "#FEF4F0", img: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/n2pal10j_expires_30_days.png" },
  { id: 3, name: "Bengaluru", bg: "#EDF2FD", img: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/fmte7b82_expires_30_days.png" },
  { id: 4, name: "Toronto", bg: "#FEF4F0", img: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/chap8a84_expires_30_days.png" },
  { id: 5, name: "New Delhi", bg: "#EDF2FD", img: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/cgwl7r4q_expires_30_days.png" },
  { id: 6, name: "Mumbai", bg: "#FEF4F0", img: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/gg4yw85m_expires_30_days.png" },
  { id: 7, name: "Melbourne", bg: "#EDF2FD", img: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/dpcbs9vy_expires_30_days.png" },
  { id: 8, name: "Chicago", bg: "#FEF4F0", img: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/ry8gcf8x_expires_30_days.png" },
  { id: 9, name: "Singapore", bg: "#EDF2FD", img: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/h1ednxo1_expires_30_days.png" },
  { id: 10, name: "New York", bg: "#FEF4F0", img: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/ddfznwm9_expires_30_days.png" },
  { id: 11, name: "Hyderabad", bg: "#EDF2FD", img: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/i3021hag_expires_30_days.png" },
  { id: 12, name: "Phuket city", bg: "#FEF4F0", img: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/e0q9zfms_expires_30_days.png" },
  { id: 13, name: "Dallas", bg: "#EDF2FD", img: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/yxuht2uu_expires_30_days.png" },
  { id: 14, name: "Kochi", bg: "#FEF4F0", img: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/j390rxzd_expires_30_days.png" },
  { id: 15, name: "Chennai", bg: "#EDF2FD", img: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/r6qes585_expires_30_days.png" },
];

const getMockDetails = (cityName) => {
  return {
    hotels: [
      { name: `Premium Hotel ${cityName}`, price: "₹4,500+" },
      { name: `Luxury Resort ${cityName}`, price: "₹8,200+" },
      { name: `Budget Inn ${cityName}`, price: "₹2,100+" },
    ],
    flights: [
      { name: `Flight Mumbai - ${cityName}`, price: "₹12,400+" },
      { name: `Flight Delhi - ${cityName}`, price: "₹14,200+" },
      { name: `Flight Bangalore - ${cityName}`, price: "₹15,100+" },
    ]
  };
};

export default function TravelLinks() {
  const [expandedId, setExpandedId] = useState(null);

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const renderCard = (link) => {
    const isExpanded = expandedId === link.id;
    const details = getMockDetails(link.name);

    return (
      <div
        key={link.id}
        className={`flex flex-col bg-white rounded-[30px] p-4 cursor-pointer transition-all duration-300 shadow-sm hover:shadow-md border border-transparent hover:border-gray-100 ${
          !isExpanded ? "hover:-translate-y-1" : "shadow-md border-gray-100"
        }`}
        onClick={() => toggleExpand(link.id)}
      >
        {/* Header Row */}
        <div className="flex items-center w-full">
          {/* Icon Container */}
          <div
            className="flex items-center justify-center w-[60px] h-[60px] rounded-[19px] mr-5 shrink-0 transition-colors"
            style={{ backgroundColor: link.bg }}
          >
            <img src={link.img} className="w-[30px] h-[30px] object-contain" alt={link.name} />
          </div>

          {/* Text Content */}
          <div className="flex flex-col items-start gap-1">
            <span className="text-black text-[22px] font-bold">{link.name}</span>
            <div className="flex items-center gap-1.5 text-[#49607E] text-[15px] font-medium tracking-wide">
              <span className={isExpanded ? "text-[#F97211]" : ""}>FLIGHTS</span>
              <span className="text-gray-400">•</span>
              <span className={isExpanded ? "text-[#F97211]" : ""}>HOTELS</span>
            </div>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Chevron Arrow (points down by default, rotates up when expanded) */}
          <svg
            className={`w-5 h-5 text-gray-400 mr-2 shrink-0 transition-transform duration-300 ${
              isExpanded ? "rotate-180 text-[#F97211]" : ""
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* Expanded Content Wrapper */}
        <div 
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
            isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            <div className="flex flex-col mt-5 pt-4 border-t border-gray-100 px-2 pb-2 cursor-default"
              onClick={(e) => e.stopPropagation()} 
            >
              {/* Hotels List */}
              <div className="flex flex-col gap-3 mb-4">
                {details.hotels.map((hotel, idx) => (
                  <div key={idx} className="flex items-center justify-between group">
                    <span className="text-[#666666] text-[15px] group-hover:text-black transition-colors">{hotel.name}</span>
                    <span className="text-[#49607E] text-[15px] font-medium">{hotel.price}</span>
                  </div>
                ))}
              </div>

              {/* Inner Divider */}
              <div className="h-px w-full bg-gray-100 mb-4" />

              {/* Flights List */}
              <div className="flex flex-col gap-3">
                {details.flights.map((flight, idx) => (
                  <div key={idx} className="flex items-center justify-between group">
                    <span className="text-[#666666] text-[15px] group-hover:text-black transition-colors">{flight.name}</span>
                    <span className="text-[#49607E] text-[15px] font-medium">{flight.price}</span>
                  </div>
                ))}
              </div>
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
          <span className="text-[#001438] text-[28px] md:text-[40px] lg:text-[36px] 2xl:text-[50px] font-bold leading-tight">
            Start your travel planning here
          </span>
          <span className="text-[#F97211] text-[16px] md:text-xl lg:text-[18px] 2xl:text-2xl font-medium">
            Search flights, hotels & more
          </span>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={0.2} className="w-full">
        {/* Desktop Layout - 3 columns */}
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

        {/* Tablet Layout - 2 columns */}
        <div className="hidden md:flex xl:hidden flex-row gap-6 w-full items-start">
          <div className="flex flex-col flex-1 gap-6">
            {links.filter((_, i) => i % 2 === 0).map((link) => renderCard(link))}
          </div>
          <div className="flex flex-col flex-1 gap-6">
            {links.filter((_, i) => i % 2 === 1).map((link) => renderCard(link))}
          </div>
        </div>

        {/* Mobile Layout - 1 column */}
        <div className="flex md:hidden flex-col gap-4 w-full">
          {links.map((link) => renderCard(link))}
        </div>
      </ScrollReveal>
    </div>
  );
}
