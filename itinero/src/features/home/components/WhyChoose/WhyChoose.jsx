import React, { useState } from "react";
import ScrollReveal from "../../../../components/ScrollReveal";
import { useVeroUi } from "@/context/VeroUiContext";

/**
 * "Where Will you go next?" + dream-vacation prompt → opens Vero with that text.
 */
export default function WhyChoose() {
  const { openVero } = useVeroUi();
  const [query, setQuery] = useState("");

  function submitDream() {
    const text = query.trim();
    if (!text) {
      openVero("Help me plan a trip - where should I go next?");
      return;
    }
    openVero(
      `I want to plan a trip: ${text}. Suggest destinations and help me find live flights.`
    );
    setQuery("");
  }

  return (
    <div className="flex flex-col lg:flex-row items-center justify-between self-stretch mt-12 lg:mt-[56px] 2xl:mt-[80px] mb-12 lg:mb-[72px] 2xl:mb-[96px] mx-auto px-4 lg:px-[20px] 2xl:px-[53px] max-w-[1900px] w-full gap-8 lg:gap-4 overflow-hidden">
      <img
        src="https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/vswmpdvf_expires_30_days.png"
        className="w-[120px] md:w-[220px] lg:w-[150px] 2xl:w-[295px] object-contain shrink-0"
        alt=""
      />
      <div className="flex flex-col flex-1 items-center justify-center w-full max-w-[880px] 2xl:max-w-[1090px] shrink min-w-0">
        <ScrollReveal delay={0.1}>
          <div className="flex flex-col items-center mb-8 lg:mb-[40px] 2xl:mb-[70px] text-center">
            <span className="text-black text-[28px] lg:text-[36px] 2xl:text-[50px] font-semibold leading-tight">
              Where Will you go next?
            </span>
            <span className="text-[#777777] text-[16px] lg:text-[16px] 2xl:text-[20px] font-medium mt-2 lg:mt-3">
              Tell Vero your vibe - get destinations and live fares.
            </span>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={0.2} className="w-full">
          <form
            className="flex items-center bg-white py-3 lg:py-4 2xl:py-5 rounded-[50px] border-2 border-solid border-[#F97211] w-full"
            style={{ boxShadow: "0px 4px 14px #00000012" }}
            onSubmit={(e) => {
              e.preventDefault();
              submitDream();
            }}
          >
            <img
              src="https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/i5htp981_expires_30_days.png"
              className="w-6 h-6 lg:w-[24px] lg:h-[24px] 2xl:w-[30px] 2xl:h-[30px] ml-4 lg:ml-[25px] 2xl:ml-[37px] mr-3 lg:mr-[15px] 2xl:mr-[21px] object-fill shrink-0"
              alt=""
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Describe your dream vacation"
              className="text-black text-[16px] lg:text-[16px] 2xl:text-xl bg-transparent outline-none w-full placeholder:text-[#727272] pr-2"
              aria-label="Describe your dream vacation"
            />
            <button
              type="submit"
              className="shrink-0 mr-3 lg:mr-4 px-4 lg:px-5 py-2 rounded-full bg-[#F97211] text-white text-sm lg:text-base font-bold border-0 cursor-pointer hover:bg-[#e5660e] transition-colors"
            >
              Ask Vero
            </button>
          </form>
        </ScrollReveal>
      </div>
      <img
        src="https://storage.googleapis.com/tagjs-prod.appspot.com/v1/hurs0BoZOo/0ci4r7t6_expires_30_days.png"
        className="w-[150px] md:w-[260px] lg:w-[200px] 2xl:w-[349px] object-contain shrink-0"
        alt=""
      />
    </div>
  );
}
