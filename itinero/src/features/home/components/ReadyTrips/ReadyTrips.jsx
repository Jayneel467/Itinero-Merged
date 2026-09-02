import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ScrollReveal from "../../../../components/ScrollReveal";
import PackageCard from "@/features/packages/components/PackageCard";
import { packageService } from "@/features/packages/services/packageService";
import { useTripsOptional } from "@/features/trips/TripContext";
import { describeAirport } from "@/constants/airports";
import AirlineMark from "@/features/flights/components/AirlineMark";
import {
  inferAirlineCode,
  canonicalizeAirlineName,
} from "@/features/flights/utils/airlineIdentity";
import { useHomeLocationOptional } from "@/context/HomeLocationContext";
import { normalizeMarketCode } from "@/constants/marketAffinity";

const THEMES = [
  { id: "", label: "All" },
  { id: "pilgrimage", label: "Pilgrimage" },
  { id: "beach", label: "Beach" },
  { id: "hills", label: "Hills" },
  { id: "honeymoon", label: "Honeymoon" },
];

function prettyDate(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function isPast(trip) {
  const d = trip.returnDate || trip.departDate;
  if (!d) return trip.status === "abandoned" || trip.status === "cancelled";
  const t = new Date(`${d}T23:59:59`).getTime();
  return Number.isFinite(t) && t < Date.now();
}

function isUpcoming(trip) {
  if (trip.status === "abandoned" || trip.status === "cancelled") return false;
  if (isPast(trip)) return false;
  return trip.status === "confirmed" || trip.status === "held" || trip.status === "draft";
}

function tripKind(trip) {
  const types = new Set((trip.legs || []).map((l) => l.type));
  if (types.has("package")) return "Package";
  if (types.has("flight") && types.has("hotel")) return "Flight + stay";
  if (types.has("hotel")) return "Stay";
  if (types.has("flight")) return "Flight";
  return "Trip";
}

export default function ReadyTrips() {
  const navigate = useNavigate();
  const tripCtx = useTripsOptional();
  const trips = tripCtx?.trips || [];
  const home = useHomeLocationOptional();
  const homeMarket = normalizeMarketCode(home?.countryCode || home?.passportCountry || "");
  const [theme, setTheme] = useState("");
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef(null);

  const upcoming = useMemo(
    () =>
      trips
        .filter(isUpcoming)
        .sort((a, b) =>
          String(a.departDate || "9999").localeCompare(String(b.departDate || "9999"))
        )
        .slice(0, 3),
    [trips]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const params = {};
      if (theme) params.theme = theme;
      if (homeMarket) params.market = homeMarket;
      const res = await packageService.list(params);
      if (cancelled) return;
      const list = Array.isArray(res.packages) ? res.packages : [];
      setPackages(list.slice(0, 8));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [theme, homeMarket]);

  const scrollBy = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(280, el.clientWidth * 0.7), behavior: "smooth" });
  };

  return (
    <div className="flex flex-col self-stretch max-w-[1600px] mb-16 md:mb-[120px] mx-auto gap-6 md:gap-[36px] w-full">
      {upcoming.length > 0 ? (
        <ScrollReveal delay={0.08}>
          <div className="px-4 md:px-[53px]">
            <div className="flex items-baseline justify-between gap-4 mb-4">
              <span className="text-[#001438] text-[18px] md:text-[22px] font-bold">
                Continue your trip
              </span>
              <Link
                to="/trips"
                className="text-[#F97211] text-[14px] md:text-[16px] font-medium hover:underline"
              >
                My trips
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {upcoming.map((trip) => {
                const flight = (trip.legs || []).find((l) => l.type === "flight");
                const snap = flight?.flightSnapshot || {};
                const origin = String(trip.origin || snap.departure?.airport || "").toUpperCase();
                const dest = String(trip.destination || snap.arrival?.airport || "").toUpperCase();
                const airlineName = canonicalizeAirlineName(
                  flight?.airline || snap.airline?.name || "",
                  flight?.airlineCode || snap.airline?.code
                );
                const flightNo = snap.flightNumber || flight?.flightNumber || "";
                const status =
                  trip.status === "held"
                    ? "On hold"
                    : trip.status === "confirmed"
                      ? "Confirmed"
                      : "Draft";
                return (
                  <Link
                    key={trip.id}
                    to={`/trips/${trip.id}`}
                    className="flex items-center gap-3 bg-white rounded-[23px] p-4 no-underline text-inherit shadow-sm hover:shadow-md border border-gray-100"
                  >
                    {airlineName || flightNo ? (
                      <AirlineMark
                        code={inferAirlineCode(
                          airlineName,
                          flightNo,
                          flight?.airlineCode || snap.airline?.code
                        )}
                        name={airlineName}
                        logo={snap.airline?.logo || snap.logo || ""}
                        flightNumber={flightNo}
                        size={40}
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="m-0 text-[11px] font-bold tracking-wide uppercase text-[#F97211]">
                        {tripKind(trip)}
                      </p>
                      <p className="m-0 mt-0.5 text-[15px] font-bold text-[#001438] truncate">
                        {origin && dest
                          ? `${describeAirport(origin).city || origin} → ${describeAirport(dest).city || dest}`
                          : trip.title || tripKind(trip)}
                      </p>
                      <p className="m-0 mt-0.5 text-[13px] text-[#777777]">
                        {prettyDate(trip.departDate) || "Dates TBD"} · {status}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </ScrollReveal>
      ) : null}

      <ScrollReveal delay={0.1}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center self-stretch px-4 md:px-[53px]">
          <div className="flex flex-col shrink-0 items-start gap-1 mb-4 md:mb-0">
            <span className="text-[#001438] dark:text-white text-[28px] md:text-[40px] lg:text-[36px] 2xl:text-[50px] font-bold leading-tight">
              Ready-made trips
            </span>
            <span className="text-[#F97211] text-[16px] md:text-xl lg:text-[18px] 2xl:text-2xl font-medium">
              Flight + stay as one trip - pick a vibe
            </span>
          </div>
          <button
            type="button"
            onClick={() => navigate("/packages")}
            className="text-black dark:text-white text-[16px] md:text-xl font-medium cursor-pointer hover:underline bg-transparent border-0 p-0"
          >
            See all packages
          </button>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={0.14}>
        <div className="flex flex-wrap items-center gap-2 px-4 md:px-[53px]">
          {THEMES.map((t) => {
            const active = theme === t.id;
            return (
              <button
                key={t.id || "all"}
                type="button"
                onClick={() => setTheme(t.id)}
                className={`min-h-[38px] px-4 rounded-full text-[14px] font-semibold border cursor-pointer transition-colors ${
                  active
                    ? "bg-[#001438] dark:bg-[#F97211] text-white border-[#001438] dark:border-[#F97211]"
                    : "bg-white dark:bg-[#111c2e] text-[#49607E] dark:text-gray-300 border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/25"
                }`}
              >
                {t.label}
              </button>
            );
          })}
          <div className="flex-1" />
          <div className="hidden md:flex items-center">
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              className="w-10 h-10 md:w-[50px] md:h-[50px] rounded-full border border-gray-200 dark:border-white/15 flex items-center justify-center bg-white dark:bg-[#121a2b] hover:bg-gray-50 dark:hover:bg-[#1a263d] shadow-sm mr-2 md:mr-4 transition-colors cursor-pointer"
              aria-label="Previous packages"
            >
              <svg className="w-6 h-6 text-black dark:text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => scrollBy(1)}
              className="w-10 h-10 md:w-[50px] md:h-[50px] rounded-full border border-gray-200 dark:border-white/15 flex items-center justify-center bg-white dark:bg-[#121a2b] hover:bg-gray-50 dark:hover:bg-[#1a263d] shadow-sm transition-colors cursor-pointer"
              aria-label="Next packages"
            >
              <svg className="w-6 h-6 text-black dark:text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </div>
      </ScrollReveal>

      <ScrollReveal delay={0.18}>
        <div
          ref={scrollRef}
          className="flex items-stretch overflow-x-auto gap-5 pb-8 px-4 md:px-[53px] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] scroll-smooth"
        >
          {loading
            ? [1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="shrink-0 w-[280px] md:w-[300px] h-[340px] rounded-[16px] bg-gradient-to-r from-gray-100 via-gray-50 to-gray-100 animate-pulse"
                />
              ))
            : packages.map((pkg) => (
                <div key={pkg.slug || pkg.id} className="shrink-0 w-[280px] md:w-[300px]">
                  <PackageCard pkg={pkg} />
                </div>
              ))}
          {!loading && packages.length === 0 ? (
            <button
              type="button"
              onClick={() => navigate("/packages")}
              className="shrink-0 w-[280px] md:w-[300px] min-h-[220px] rounded-[23px] bg-white border border-gray-100 shadow-sm text-left p-6 cursor-pointer"
            >
              <p className="m-0 text-[18px] font-bold text-[#001438]">Browse all packages</p>
              <p className="m-0 mt-2 text-[14px] text-[#777777]">
                Pilgrimage, beach, hills, and honeymoon trips with a stay you can change.
              </p>
              <span className="inline-block mt-4 text-[#F97211] font-bold">Open packages →</span>
            </button>
          ) : null}
        </div>
      </ScrollReveal>
    </div>
  );
}
