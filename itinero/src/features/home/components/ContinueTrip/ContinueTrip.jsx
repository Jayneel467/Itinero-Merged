import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTripsOptional } from "@/features/trips/TripContext";

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

/**
 * Kayak-style continue strip - only when the traveller already has a trip.
 */
export default function ContinueTrip() {
  const navigate = useNavigate();
  const tripCtx = useTripsOptional();
  const trips = tripCtx?.trips || [];

  const next = useMemo(() => {
    return trips
      .filter(isUpcoming)
      .sort((a, b) =>
        String(a.departDate || "9999").localeCompare(String(b.departDate || "9999"))
      )[0];
  }, [trips]);

  if (!next) return null;

  const resume = next.status === "draft" || next.status === "held";
  const dateLabel = prettyDate(next.departDate);
  const route =
    next.origin && next.destination
      ? `${next.origin} → ${next.destination}`
      : next.title || "Your trip";

  return (
    <div className="mx-auto mt-5 mb-2 w-full max-w-[1100px] px-4 lg:px-5">
      <button
        type="button"
        onClick={() => navigate(`/trips/${encodeURIComponent(next.id)}`)}
        className="flex w-full items-center gap-3 rounded-2xl border border-[#eadfd4] bg-white px-4 py-3 text-left shadow-[0_6px_18px_rgba(0,20,56,0.06)] transition-transform hover:-translate-y-0.5 cursor-pointer"
      >
        <img
          src={`${import.meta.env.BASE_URL}vero-chatbot.png`}
          alt=""
          className="h-10 w-10 shrink-0 rounded-full object-cover bg-[#fff3e9]"
        />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[11px] font-bold uppercase tracking-[0.08em] text-[#F97211]">
            {resume ? "Continue booking" : "Upcoming trip"}
          </p>
          <p className="m-0 truncate text-[15px] font-bold text-[#001438]">
            {route}
            {dateLabel ? <span className="font-medium text-[#667085]"> · {dateLabel}</span> : null}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[#001438] px-3.5 py-1.5 text-[13px] font-bold text-white">
          {resume ? "Resume" : "View trip"}
        </span>
      </button>
    </div>
  );
}
