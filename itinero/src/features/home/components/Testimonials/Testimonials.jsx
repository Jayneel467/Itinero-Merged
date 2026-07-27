import React, { useRef, useState, useEffect } from "react";
import ScrollReveal from "../../../../components/ScrollReveal";

const reviews = [
  {
    id: 1,
    name: "Sophia Mitchell",
    location: "New York, USA",
    avatar: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/ezb480s4_expires_30_days.png",
    rating: "5.0",
    text: "“ Itinero made our honeymoon absolutely perfect. Every detail was seamless & stress-free.”",
    bg: "#F9F7FD",
    borderColor: "#E4D7FF",
    bottomImg: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/v9k2j59v_expires_30_days.png",
    bottomImgClasses: "absolute bottom-0 right-0 w-[284px] h-[123px] object-cover",
  },
  {
    id: 2,
    name: "David & Sarah",
    location: "London, UK",
    avatar: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/v0b5313r_expires_30_days.png",
    rating: "5.0",
    text: "“ The best travel platform I’ve used. Luxury stays, great prices, and incredible support! ”",
    bg: "#FEFAF6",
    borderColor: "#FFE3CF",
    bottomImg: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/q9f0c8qm_expires_30_days.png",
    bottomImgClasses: "absolute bottom-0 right-0 w-[263px] h-[158px] object-cover",
  },
  {
    id: 3,
    name: "Elena Rodriguez",
    location: "Madrid, Spain",
    avatar: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/6ihub74d_expires_30_days.png",
    rating: "5.0",
    text: "“ From booking to the entire journey everything was beyond expectations!”",
    bg: "#F6FAFF",
    borderColor: "#D0DEFF",
    bottomImg: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/pkx73rfx_expires_30_days.png",
    bottomImgClasses: "absolute bottom-0 right-0 w-[304px] h-[140px] object-cover",
  },
  {
    id: 4,
    name: "James Wilson",
    location: "Sydney, Australia",
    avatar: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/ezb480s4_expires_30_days.png",
    rating: "4.9",
    text: "“ Highly recommend Itinero for anyone looking for a hassle-free vacation. Amazing!”",
    bg: "#F9F7FD",
    borderColor: "#E4D7FF",
    bottomImg: "https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/v9k2j59v_expires_30_days.png",
    bottomImgClasses: "absolute bottom-0 right-0 w-[284px] h-[123px] object-cover",
  }
];

export default function Testimonials() {
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
        
        const CARDS = isMobile ? 1.1 : isTablet ? 1.5 : isLaptop ? 2 : isDesktop ? 2.5 : 3;
        const PADDING = isMobile ? 16 * 2 : 53 * 2;
        const GAP = 30; // gap-[30px]
        
        const w = wrapperRef.current.clientWidth;
        const width = (w - PADDING - GAP * (CARDS - 1)) / CARDS;
        setCardWidth(Math.floor(width) - 1); // -1 safety buffer
      }
    };
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -(cardWidth + 30), behavior: "smooth" });
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: cardWidth + 30, behavior: "smooth" });
    }
  };

  return (
    <div className="flex flex-col self-stretch max-w-[1604px] mb-16 md:mb-[100px] mx-auto gap-6 md:gap-10">
      <ScrollReveal delay={0.1}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center self-stretch px-4 md:px-[53px]">
        <div className="flex flex-col shrink-0 items-start gap-1 mb-4 md:mb-0">
          <span className="text-[#001438] text-[28px] md:text-[40px] lg:text-[36px] 2xl:text-[50px] font-bold leading-tight">
            Loved by Explorers
          </span>
          <span className="text-[#F97211] text-[16px] md:text-xl lg:text-[18px] 2xl:text-2xl font-medium">
            Real stories from real travellers who explored the world with Itinero.
          </span>
        </div>
        <div className="flex w-full md:w-auto shrink-0 items-center justify-between md:justify-end gap-2 md:gap-3">
          <span className="text-black text-[16px] md:text-xl font-medium cursor-pointer hover:underline mr-2 md:mr-4">
            View All Reviews
          </span>
          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={scrollLeft}
              className="w-10 h-10 md:w-[50px] md:h-[50px] rounded-full border border-gray-200 flex items-center justify-center bg-white hover:bg-gray-50 shadow-sm transition-colors"
            >
              <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <button
              onClick={scrollRight}
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
          className="flex items-stretch overflow-x-auto gap-[30px] pb-4 pt-2 px-4 md:px-[53px] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] scroll-smooth"
        >
          {reviews.map((review) => (
            <div
              key={review.id}
              className="flex flex-col shrink-0 pt-[21px] rounded-[20px] border border-solid hover:-translate-y-1 transition-transform cursor-pointer"
              style={{
                width: cardWidth || "calc(33.33% - 20px)",
                backgroundColor: review.bg,
                borderColor: review.borderColor,
                boxShadow: "0px 10px 20px #0000000A",
              }}
            >
              <div className="flex items-center self-stretch mb-4 md:mb-[29px] mx-4 md:mx-[25px]">
                <img
                  src={review.avatar}
                  className="w-12 h-12 md:w-20 md:h-20 mr-4 md:mr-6 object-cover rounded-full"
                  alt={review.name}
                />
                <div className="flex flex-col shrink-0 items-start gap-1">
                  <span className="text-black text-[18px] md:text-[22px] font-bold">{review.name}</span>
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 md:w-[18px] md:h-[18px] text-[#868686]" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                    </svg>
                    <span className="text-[#868686] text-[14px] md:text-lg font-medium">{review.location}</span>
                  </div>
                </div>
                <div className="flex-1" />
                <div className="flex shrink-0 items-center bg-[#FEFAF4] py-1.5 px-2 md:py-2 md:px-3 gap-1 rounded-[10px] border border-solid border-[#FFE1CB]">
                  <svg className="w-4 h-4 md:w-5 md:h-5 text-[#F97211]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                  </svg>
                  <span className="text-[#F97211] text-[18px] md:text-[22px] font-bold">{review.rating}</span>
                </div>
              </div>

              {/* Quote Mark */}
              <svg className="w-8 h-8 md:w-10 md:h-10 mb-2 md:mb-[13px] ml-4 md:ml-[25px] text-[#F97211] opacity-20" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
              </svg>

              <div className="relative flex flex-col items-start self-stretch h-[160px] md:h-[200px] ml-4 md:ml-[25px] overflow-hidden rounded-br-[20px]">
                <span className="text-black text-[16px] md:text-[20px] font-medium leading-snug w-[85%] relative z-10">
                  {review.text}
                </span>
                
                <div className="flex flex-row gap-1 relative z-10 mt-auto mb-[42px]">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <svg key={star} className="w-6 h-6 text-[#F97211]" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                    </svg>
                  ))}
                </div>

                <img
                  src={review.bottomImg}
                  className={review.bottomImgClasses}
                  alt="decoration"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </ScrollReveal>
  </div>
);
}
