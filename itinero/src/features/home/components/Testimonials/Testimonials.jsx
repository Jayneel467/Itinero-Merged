import React, { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ScrollReveal from "../../../../components/ScrollReveal";
import { hotelService } from "@/features/hotels/services/hotelService";
import { LoadingState } from "@/components/shared";

const CARD_THEMES = [
  {
    bg: "#F9F7FD",
    borderColor: "#E4D7FF",
    bottomImg: `${import.meta.env.BASE_URL}australia.png`,
    bottomImgClasses: "absolute bottom-0 right-0 w-[284px] h-[123px] object-cover",
    avatarBg: "#EDE5FF",
  },
  {
    bg: "#FEFAF6",
    borderColor: "#FFE3CF",
    bottomImg: `${import.meta.env.BASE_URL}us.png`,
    bottomImgClasses: "absolute bottom-0 right-0 w-[263px] h-[158px] object-cover",
    avatarBg: "#FFE8D6",
  },
  {
    bg: "#F6FAFF",
    borderColor: "#D0DEFF",
    bottomImg: `${import.meta.env.BASE_URL}newyork.png`,
    bottomImgClasses: "absolute bottom-0 right-0 w-[304px] h-[140px] object-cover",
    avatarBg: "#DCE8FF",
  },
];

function initials(name) {
  const parts = String(name || "Guest")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "G";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function scoreOnFive(score) {
  const n = Number(score);
  if (!Number.isFinite(n) || n <= 0) return null;
  // LiteAPI guest scores are typically /10
  const five = n > 5 ? n / 2 : n;
  return Math.max(0, Math.min(5, five));
}

function formatScore(score) {
  const five = scoreOnFive(score);
  return five != null ? five.toFixed(1) : "-";
}

function starFillCount(score) {
  const five = scoreOnFive(score);
  if (five == null) return 0;
  return Math.round(five);
}

export default function Testimonials() {
  const navigate = useNavigate();
  const scrollRef = useRef(null);
  const wrapperRef = useRef(null);
  const [cardWidth, setCardWidth] = useState(0);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    hotelService.getFeaturedReviews(12).then((res) => {
      if (cancelled) return;
      setLoading(false);
      const list = Array.isArray(res?.reviews) ? res.reviews : [];
      setReviews(list);
      if (!list.length) {
        setError(res?.message || "No live guest reviews available right now.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const updateWidth = () => {
      if (wrapperRef.current) {
        const isMobile = window.innerWidth < 768;
        const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;
        const isLaptop = window.innerWidth >= 1024 && window.innerWidth < 1280;
        const isDesktop = window.innerWidth >= 1280 && window.innerWidth < 1536;

        const CARDS = isMobile ? 1.1 : isTablet ? 1.5 : isLaptop ? 2 : isDesktop ? 2.5 : 3;
        const PADDING = isMobile ? 16 * 2 : 53 * 2;
        const GAP = 30;

        const w = wrapperRef.current.clientWidth;
        const width = (w - PADDING - GAP * (CARDS - 1)) / CARDS;
        setCardWidth(Math.floor(width) - 1);
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
    <div className="flex flex-col self-stretch max-w-[1604px] mb-14 md:mb-20 mx-auto gap-6 md:gap-8">
      <ScrollReveal delay={0.1}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center self-stretch px-4 md:px-[53px]">
          <div className="flex flex-col shrink-0 items-start gap-1 mb-4 md:mb-0">
            <span className="text-[#001438] dark:text-white text-[28px] md:text-[40px] lg:text-[36px] 2xl:text-[50px] font-bold leading-tight">
              Loved by Explorers
            </span>
            <span className="text-[#F97211] text-[16px] md:text-xl lg:text-[18px] 2xl:text-2xl font-medium">
              Real guest reviews from stays travellers book here.
            </span>
          </div>
          <div className="flex w-full md:w-auto shrink-0 items-center justify-between md:justify-end gap-2 md:gap-3">
            <button
              type="button"
              onClick={() => navigate("/hotels")}
              className="text-black dark:text-white text-[16px] md:text-xl font-medium cursor-pointer hover:underline mr-2 md:mr-4 bg-transparent border-0 p-0"
            >
              Browse stays
            </button>
            <div className="flex items-center gap-2 md:gap-3">
              <button
                type="button"
                onClick={scrollLeft}
                aria-label="Previous reviews"
                className="w-10 h-10 md:w-[50px] md:h-[50px] rounded-full border border-gray-200 dark:border-white/15 flex items-center justify-center bg-white dark:bg-[#121a2b] hover:bg-gray-50 dark:hover:bg-[#1a263d] shadow-sm transition-colors cursor-pointer"
              >
                <svg className="w-6 h-6 text-black dark:text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <button
                type="button"
                onClick={scrollRight}
                aria-label="Next reviews"
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
          {loading ? (
            <div className="px-4 md:px-[53px]">
              <LoadingState
                title="Loading guest reviews"
                message="Fetching recent stay reviews…"
                skeleton="lines"
                count={3}
              />
            </div>
          ) : null}

          {!loading && reviews.length === 0 ? (
            <p className="px-4 md:px-[53px] text-[#667085] text-[15px] md:text-lg">
              {error || "Guest reviews will appear here when stays are available."}
            </p>
          ) : null}

          {!loading && reviews.length > 0 ? (
            <div
              ref={scrollRef}
              className="flex items-stretch overflow-x-auto gap-[30px] pb-4 pt-2 px-4 md:px-[53px] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] scroll-smooth"
            >
              {reviews.map((review, index) => {
                const theme = CARD_THEMES[index % CARD_THEMES.length];
                const stars = starFillCount(review.score ?? review.rating);
                const place =
                  [review.hotelName, review.hotelCity || review.location]
                    .filter(Boolean)
                    .join(" · ") || review.location || "Guest stay";
                return (
                  <button
                    type="button"
                    key={review.id || `${review.name}-${review.date}-${index}`}
                    data-testimonial-card
                    onClick={() => {
                      if (review.hotelId) {
                        navigate(`/hotel/${encodeURIComponent(review.hotelId)}`);
                      }
                    }}
                    className="flex flex-col shrink-0 pt-[21px] rounded-[20px] border border-solid hover:-translate-y-1 transition-transform text-left cursor-pointer"
                    style={{
                      width: cardWidth || "calc(33.33% - 20px)",
                      backgroundColor: theme.bg,
                      borderColor: theme.borderColor,
                      boxShadow: "0px 10px 20px #0000000A",
                    }}
                  >
                    <div className="flex items-center self-stretch mb-4 md:mb-[29px] mx-4 md:mx-[25px]">
                      <div
                        className="testimonial-avatar w-12 h-12 md:w-20 md:h-20 mr-4 md:mr-6 rounded-full flex items-center justify-center shrink-0 font-bold text-[#001438] text-[14px] md:text-[22px]"
                        style={{ backgroundColor: theme.avatarBg }}
                        aria-hidden
                      >
                        {initials(review.name)}
                      </div>
                      <div className="flex flex-col shrink-0 items-start gap-1 min-w-0">
                        <span className="testimonial-name text-black dark:text-white text-[18px] md:text-[22px] font-bold truncate max-w-[180px] md:max-w-[220px]">
                          {review.name || "Guest"}
                        </span>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <svg className="w-4 h-4 md:w-[18px] md:h-[18px] text-[#868686] dark:text-gray-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                          </svg>
                          <span className="testimonial-location text-[#868686] dark:text-gray-400 text-[14px] md:text-lg font-medium truncate max-w-[160px] md:max-w-[200px]">
                            {place}
                          </span>
                        </div>
                      </div>
                      <div className="flex-1" />
                      <div className="testimonial-badge flex shrink-0 items-center bg-[#FEFAF4] dark:bg-[#182338] py-1.5 px-2 md:py-2 md:px-3 gap-1 rounded-[10px] border border-solid border-[#FFE1CB] dark:border-[#f97211]/30">
                        <svg className="w-4 h-4 md:w-5 md:h-5 text-[#F97211]" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                        </svg>
                        <span className="text-[#F97211] text-[18px] md:text-[22px] font-bold">
                          {formatScore(review.score ?? review.rating)}
                        </span>
                      </div>
                    </div>

                    <svg className="w-4 h-4 md:w-5 md:h-5 mb-1.5 md:mb-2 ml-4 md:ml-[25px] text-[#F97211] opacity-40" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                    </svg>

                    <div className="relative flex flex-col items-start self-stretch h-[160px] md:h-[200px] ml-4 md:ml-[25px] overflow-hidden rounded-br-[20px]">
                      <span className="testimonial-text text-black dark:text-white text-[16px] md:text-[20px] font-medium leading-snug w-[85%] relative z-10 line-clamp-4">
                        “{review.text}”
                      </span>

                      <div className="flex flex-row gap-1 relative z-10 mt-auto mb-[42px]">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <svg
                            key={star}
                            className={`w-6 h-6 ${star <= stars ? "text-[#F97211]" : "text-[#E5E7EB] dark:text-gray-700"}`}
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                          </svg>
                        ))}
                      </div>

                      <img
                        src={theme.bottomImg}
                        className={`${theme.bottomImgClasses} dark:opacity-30`}
                        alt=""
                        aria-hidden
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </ScrollReveal>
    </div>
  );
}
