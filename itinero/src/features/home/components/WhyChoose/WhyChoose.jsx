import React from "react";
import ScrollReveal from "../../../../components/ScrollReveal";

/**
 * "Where Will you go next?" + search bar + features row.
 * EXACT copy from Figma export lines 214–285.
 */
export default function WhyChoose() {
  return (
    <div className="flex flex-col lg:flex-row items-center justify-between self-stretch mt-16 lg:mt-[80px] 2xl:mt-[120px] mb-16 lg:mb-[100px] 2xl:mb-[172px] mx-auto px-4 lg:px-[20px] 2xl:px-[53px] max-w-[1900px] w-full gap-8 lg:gap-4 overflow-hidden">
      <img
        src={"https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/vswmpdvf_expires_30_days.png"}
        className="w-[120px] md:w-[220px] lg:w-[150px] 2xl:w-[295px] object-contain shrink-0"
      />
      <div className="flex flex-col flex-1 items-center justify-center w-full max-w-[880px] 2xl:max-w-[1090px] shrink min-w-0">
        <ScrollReveal delay={0.1}>
          <div className="flex flex-col items-center mb-8 lg:mb-[40px] 2xl:mb-[70px] text-center">
            <span className="text-black text-[28px] lg:text-[36px] 2xl:text-[50px] font-semibold leading-tight">
              {"Where Will you go next?"}
            </span>
            <span className="text-[#777777] text-[16px] lg:text-[16px] 2xl:text-[20px] font-medium mt-2 lg:mt-3">
              {"Find the best flights and unforgettable experiences."}
            </span>
          </div>
        </ScrollReveal>
        
        <ScrollReveal delay={0.2} className="w-full">
          <div className="flex items-center bg-white py-3 lg:py-4 2xl:py-5 mb-8 lg:mb-[50px] 2xl:mb-[70px] rounded-[50px] border-2 border-solid border-[#F97211] w-full"
            style={{
              boxShadow: "0px 4px 14px #00000012"
            }}>
            <img
              src={"https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/i5htp981_expires_30_days.png"}
              className="w-6 h-6 lg:w-[24px] lg:h-[24px] 2xl:w-[30px] 2xl:h-[30px] ml-4 lg:ml-[25px] 2xl:ml-[37px] mr-3 lg:mr-[15px] 2xl:mr-[21px] object-fill shrink-0"
            />
            <input
              type="text"
              placeholder="Describe your dream vacation"
              className="text-black text-[16px] lg:text-[16px] 2xl:text-xl bg-transparent outline-none w-full placeholder:text-[#727272] pr-4 lg:pr-6 2xl:pr-8"
            />
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.3} className="w-full">
          <div className="grid grid-cols-[1fr_auto_1fr] lg:flex lg:flex-nowrap flex-wrap items-center justify-start lg:justify-between gap-y-6 lg:gap-y-0 gap-x-2 lg:gap-x-4 2xl:gap-x-12 w-full pl-2 sm:pl-8 lg:pl-0">
            {/* Best Price */}
          <div className="flex items-center justify-start gap-2 lg:gap-2 2xl:gap-3 min-w-0">
            <div className="w-[36px] h-[36px] lg:w-[40px] lg:h-[40px] 2xl:w-[50px] 2xl:h-[50px] rounded-full bg-[#F97316] flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 lg:w-5 lg:h-5 2xl:w-6 2xl:h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M5.25 2.25a3 3 0 00-3 3v4.318a3 3 0 00.879 2.121l9.58 9.581c.92.92 2.39 1.186 3.548.428a18.849 18.849 0 005.441-5.44c.758-1.16.492-2.629-.428-3.548l-9.58-9.581a3 3 0 00-2.122-.879H5.25zM6.375 7.5a1.125 1.125 0 100-2.25 1.125 1.125 0 000 2.25z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-black text-[14px] lg:text-[14px] 2xl:text-[18px] font-semibold leading-tight mb-1 whitespace-nowrap">Best Price</span>
              <span className="text-[#777777] text-[12px] lg:text-[12px] 2xl:text-[16px] font-medium leading-tight">Guaranteed</span>
            </div>
          </div>

          <div className="w-px h-10 sm:h-12 bg-gray-300 lg:bg-gray-200 shrink-0 hidden lg:block" />

          {/* Easy Booking */}
          <div className="flex items-center justify-start gap-2 lg:gap-2 2xl:gap-3 min-w-0">
            <div className="w-[36px] h-[36px] lg:w-[40px] lg:h-[40px] 2xl:w-[50px] 2xl:h-[50px] rounded-full bg-[#F97316] flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 lg:w-5 lg:h-5 2xl:w-6 2xl:h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5zM6 10.5a.75.75 0 00-.75.75v1.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75v-1.5a.75.75 0 00-.75-.75H6zm7.5 0a.75.75 0 00-.75.75v1.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75v-1.5a.75.75 0 00-.75-.75h-1.5zm-7.5 4.5a.75.75 0 00-.75.75v1.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75v-1.5a.75.75 0 00-.75-.75H6zm7.5 0a.75.75 0 00-.75.75v1.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75v-1.5a.75.75 0 00-.75-.75h-1.5z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-black text-[14px] lg:text-[14px] 2xl:text-[18px] font-semibold leading-tight mb-1 whitespace-nowrap">Easy Booking</span>
              <span className="text-[#777777] text-[12px] lg:text-[12px] 2xl:text-[16px] font-medium leading-tight">Fast & Secure</span>
            </div>
          </div>

          <div className="hidden lg:block w-px h-10 bg-gray-200 shrink-0" />

          {/* 24/7 Support */}
          <div className="flex items-center justify-start gap-2 lg:gap-2 2xl:gap-3 min-w-0">
            <div className="w-[36px] h-[36px] lg:w-[40px] lg:h-[40px] 2xl:w-[50px] 2xl:h-[50px] rounded-full bg-[#F97316] flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 lg:w-5 lg:h-5 2xl:w-6 2xl:h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M1.5 4.5a3 3 0 013-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 01-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 006.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 011.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 01-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-black text-[14px] lg:text-[14px] 2xl:text-[18px] font-semibold leading-tight mb-1 whitespace-nowrap">24/7 Support</span>
              <span className="text-[#777777] text-[12px] lg:text-[12px] 2xl:text-[16px] font-medium leading-tight">We're here for you</span>
            </div>
          </div>

          <div className="w-px h-10 sm:h-12 bg-gray-300 lg:bg-gray-200 shrink-0 hidden lg:block" />

          {/* Safe & Reliable */}
          <div className="flex items-center justify-start gap-2 lg:gap-2 2xl:gap-3 min-w-0">
            <div className="w-[36px] h-[36px] lg:w-[40px] lg:h-[40px] 2xl:w-[50px] 2xl:h-[50px] rounded-full bg-[#F97316] flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 lg:w-5 lg:h-5 2xl:w-6 2xl:h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 00-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08zm3.094 8.016a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-black text-[14px] lg:text-[14px] 2xl:text-[18px] font-semibold leading-tight mb-1 whitespace-nowrap">Safe & Reliable</span>
              <span className="text-[#777777] text-[12px] lg:text-[12px] 2xl:text-[16px] font-medium leading-tight">Your Journey, Our priority</span>
            </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
      <img
        src={"https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/0ci4r7t6_expires_30_days.png"}
        className="w-[150px] md:w-[260px] lg:w-[200px] 2xl:w-[349px] object-contain shrink-0"
      />
    </div>
  );
}
