"use client";

import { useState } from "react";
import type { FlightOffer } from "@/lib/types";
import { FlightCard } from "@/components/FlightCard";

const INITIAL_BATCH = 15;
const STEP = 15;

export function FlightResults({
  flights,
  onSelect,
  totalOffers,
}: {
  flights: FlightOffer[];
  onSelect?: (f: FlightOffer) => void;
  totalOffers?: number;
}) {
  const [visible, setVisible] = useState(INITIAL_BATCH);

  if (!flights.length) {
    return (
      <div className="rounded-[20px] border border-dashed border-[#E8EDF2] bg-[#F8F9FA] p-6 text-center">
        <p className="font-semibold text-navy">No flight results yet</p>
        <p className="mt-1 text-[13px] text-muted">
          Ask Itinero for a route, e.g. Mumbai to Delhi.
        </p>
      </div>
    );
  }

  const shown = flights.slice(0, visible);
  const total = totalOffers && totalOffers > flights.length ? totalOffers : flights.length;
  const remaining = flights.length - shown.length;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] font-semibold text-muted">
        Showing {shown.length} of {total} flight{total === 1 ? "" : "s"}
      </p>
      {shown.map((f) => (
        <FlightCard key={f.id} flight={f} onSelect={onSelect} selectLabel="Select" compact />
      ))}
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + STEP)}
          className="mx-auto mt-1 rounded-[50px] border border-[#FFD9BF] bg-[#FFF7F0] px-6 py-2.5 text-[13px] font-bold text-[#E65C00] transition hover:bg-[#FFEFE2]"
        >
          View {Math.min(STEP, remaining)} more{" "}
          <span className="font-medium text-[#F79A5B]">
            ({remaining} left)
          </span>
        </button>
      )}
    </div>
  );
}
