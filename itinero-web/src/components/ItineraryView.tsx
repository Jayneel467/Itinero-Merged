"use client";

import type { ItineraryData } from "@/lib/types";
import { DestinationImage } from "@/components/DestinationImage";
import {
  TripMap,
  destinationFromItinerary,
  markersFromItineraryDays,
} from "@/components/TripMap";

export function ItineraryView({ data }: { data: ItineraryData | null }) {
  if (!data) {
    return (
      <div className="overflow-hidden rounded-[20px] border border-dashed border-[#E8EDF2] bg-[#F8F9FA]">
        <div className="relative h-36 w-full">
          <DestinationImage
            query="scenic travel itinerary mountains"
            fallbackSrc="/images/explore.png"
            alt="Plan an itinerary"
            className="absolute inset-0"
            sizes="420px"
            showCredit
          />
        </div>
        <div className="p-6 text-center">
          <p className="font-semibold text-navy">No itinerary yet</p>
          <p className="mt-1 text-[13px] text-muted">
            Ask: &quot;Plan a 5-day trip to Bali&quot;
          </p>
        </div>
      </div>
    );
  }

  const placeQuery = destinationFromItinerary(data);
  const stopMarkers = markersFromItineraryDays(data.days);

  return (
    <div>
      <div className="relative mb-4 h-28 overflow-hidden rounded-[16px]">
        <DestinationImage
          query={data.title.replace(/^Trip to\s*/i, "") || "travel"}
          fallbackSrc="/images/explore.png"
          alt={data.title}
          className="absolute inset-0"
          sizes="420px"
          showCredit={false}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <h3 className="absolute bottom-3 left-3 z-10 text-[18px] font-bold text-white">
          {data.title}
        </h3>
      </div>

      {(stopMarkers.length > 0 || placeQuery) && (
        <div className="mb-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
            {stopMarkers.length > 1 ? "Day stops" : "Destination"}
          </p>
          <TripMap
            markers={stopMarkers.length > 0 ? stopMarkers : undefined}
            placeQuery={stopMarkers.length > 0 ? null : placeQuery}
            height={180}
          />
        </div>
      )}

      <div className="mt-2 flex flex-col gap-4">
        {data.days.map((day) => (
          <div
            key={day.day}
            className="rounded-[18px] border border-[#E8EDF2] bg-[#FEFAF4] p-4"
          >
            <p className="text-[12px] font-bold uppercase tracking-wide text-[#F97211]">
              Day {day.day}
            </p>
            <p className="mt-0.5 font-semibold text-navy">{day.title}</p>
            <ul className="mt-3 space-y-2">
              {day.items.map((item, i) => (
                <li key={i} className="flex gap-3 text-[13px]">
                  <span className="w-20 shrink-0 font-medium text-muted">
                    {item.time}
                  </span>
                  <span className="text-[#4A4A4A]">{item.activity}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
