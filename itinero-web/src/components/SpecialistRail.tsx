"use client";

import type { Specialist } from "@/lib/types";
import { SPECIALIST_LABELS } from "@/lib/types";

const ORDER: Specialist[] = [
  "supervisor",
  "research",
  "flights",
  "hotels",
  "itinerary",
  "payment",
];

export function SpecialistRail({
  active,
  routePath,
}: {
  active: Specialist;
  routePath: string[];
}) {
  return (
    <div className="shrink-0 border-b border-[#E8EDF2] bg-white px-4 py-2">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
          {ORDER.map((s) => {
            const on = s === active;
            return (
              <span
                key={s}
                className={`rounded-[50px] px-3 py-1 text-[12px] font-semibold whitespace-nowrap transition ${
                  on
                    ? "bg-[#F97211] text-white shadow-[0_4px_15px_rgba(249,115,22,0.4)]"
                    : "bg-[#F2F2F2] text-[#637588]"
                }`}
              >
                {SPECIALIST_LABELS[s]}
              </span>
            );
          })}
        </div>
        <p className="truncate text-[11px] text-[#868686]">
          {routePath.length ? routePath.join(" → ") : "start → supervisor"}
        </p>
      </div>
    </div>
  );
}
