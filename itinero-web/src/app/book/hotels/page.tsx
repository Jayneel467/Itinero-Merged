"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { searchHotels } from "@/lib/api";
import type { HotelOffer } from "@/lib/types";
import { SiteHeader } from "@/components/SiteHeader";
import { TripMap } from "@/components/TripMap";

export default function HotelsPage() {
  const [city, setCity] = useState("Goa");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [hotels, setHotels] = useState<HotelOffer[]>([]);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<HotelOffer | null>(null);
  const [pending, startTransition] = useTransition();

  function runSearch() {
    if (!checkIn || !checkOut) {
      setMessage("Select check-in and check-out.");
      return;
    }
    startTransition(async () => {
      const res = await searchHotels({
        city,
        check_in: checkIn,
        check_out: checkOut,
      });
      setHotels(res.hotels || []);
      setMessage(res.message || "");
    });
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <SiteHeader />
      <main className="mx-auto max-w-[960px] px-4 py-8 md:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[#F97211]">
              Manual booking
            </p>
            <h1 className="text-[28px] font-black text-navy">Hotels</h1>
          </div>
          <Link href="/book" className="text-[13px] font-semibold text-[#F97211]">
            ← Flights
          </Link>
        </div>

        <section className="rounded-[24px] border border-[#E8EDF2] bg-white p-6 shadow-soft">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[12px] text-muted">City</span>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full rounded-[14px] border border-[#E8EDF2] bg-[#F8F9FA] px-4 py-3 outline-none focus:border-[#F97316]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] text-muted">Check-in</span>
              <input
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                className="w-full rounded-[14px] border border-[#E8EDF2] bg-[#F8F9FA] px-4 py-3 outline-none focus:border-[#F97316]"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] text-muted">Check-out</span>
              <input
                type="date"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className="w-full rounded-[14px] border border-[#E8EDF2] bg-[#F8F9FA] px-4 py-3 outline-none focus:border-[#F97316]"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={runSearch}
            disabled={pending}
            className="btn-primary mt-5 px-8 py-3 text-[15px] font-bold disabled:opacity-50"
          >
            {pending ? "Searching…" : "Search hotels"}
          </button>
          {message && (
            <p className="mt-3 text-[13px] text-muted">{message}</p>
          )}
          {city.trim() && (
            <div className="mt-5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                Destination map
              </p>
              <TripMap placeQuery={city.trim()} height={200} />
            </div>
          )}
        </section>

        <div className="mt-6 grid gap-4">
          {hotels.map((h) => (
            <article
              key={h.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[#E8EDF2] bg-white p-5"
            >
              <div>
                <p className="font-bold text-navy">{h.name}</p>
                <p className="text-[13px] text-muted">
                  {"★".repeat(h.stars)} · {h.area}
                </p>
                <p className="mt-1 text-[12px] text-[#868686]">
                  {h.amenities.join(" · ")}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[20px] font-black text-navy">
                  ₹{h.price_per_night.toLocaleString()}
                  <span className="text-[12px] font-medium text-muted">
                    /night
                  </span>
                </p>
                <button
                  type="button"
                  className="btn-primary mt-2 px-4 py-1.5 text-[12px] font-bold"
                  onClick={() => setSelected(h)}
                >
                  Select
                </button>
              </div>
            </article>
          ))}
        </div>

        {selected && (
          <div className="mt-6 rounded-[20px] border border-[#FFE1CB] bg-[#FEFAF4] p-5">
            <p className="font-bold text-navy">Selected: {selected.name}</p>
            <p className="mt-1 text-[13px] text-muted">
              Hotel checkout is a stub — same pattern as flights for later
              LiteAPI / hotel_research_agent wiring.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
