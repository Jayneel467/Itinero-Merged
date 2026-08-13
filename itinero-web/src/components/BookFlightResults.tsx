"use client";

import { useMemo, useRef, useState } from "react";
import type { FlightOffer } from "@/lib/types";
import { FlightCard, fmtMoney, durationToMinutes } from "@/components/FlightCard";

export type SearchSummary = {
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string;
  tripType: "oneway" | "return";
  adults: number;
  children: number;
  cabin: string;
};

type SortTab = "recommended" | "cheapest" | "fastest";
type StopsFilter = "any" | "nonstop" | "1stop";
const INITIAL_BATCH = 15;
const STEP = 20;

const TIME_BUCKETS: { id: string; label: string; range: [number, number] }[] = [
  { id: "early", label: "Before 6 AM", range: [0, 6] },
  { id: "morning", label: "6 AM - 12 PM", range: [6, 12] },
  { id: "afternoon", label: "12 PM - 6 PM", range: [12, 18] },
  { id: "evening", label: "After 6 PM", range: [18, 24] },
];

function hourOf(t: string): number {
  const m = t.match(/(\d{1,2}):(\d{2})/);
  return m ? parseInt(m[1], 10) : -1;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayLabel(iso: string): { dow: string; day: string } {
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return { dow: "", day: iso };
  return {
    dow: d.toLocaleDateString("en-GB", { weekday: "short" }),
    day: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
  };
}

export function BookFlightResults({
  flights,
  totalOffers,
  search,
  onSelect,
  onModifySearch,
  onSearch,
  onOpenVero,
  pending,
  liteReady,
  message,
}: {
  flights: FlightOffer[];
  totalOffers?: number;
  search: SearchSummary;
  onSelect: (f: FlightOffer) => void;
  onModifySearch: () => void;
  onSearch: (s: SearchSummary) => void;
  onOpenVero?: () => void;
  pending?: boolean;
  liteReady?: boolean;
  message?: string;
}) {
  const [sortTab, setSortTab] = useState<SortTab>("recommended");
  const [stops, setStops] = useState<StopsFilter>("any");
  const [airlineSel, setAirlineSel] = useState<Set<string>>(new Set());
  const [airlineQuery, setAirlineQuery] = useState("");
  const [depBuckets, setDepBuckets] = useState<Set<string>>(new Set());
  const [arrBuckets, setArrBuckets] = useState<Set<string>>(new Set());
  const [visible, setVisible] = useState(INITIAL_BATCH);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [veroText, setVeroText] = useState("");
  const [veroNote, setVeroNote] = useState("");
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [edit, setEdit] = useState<SearchSummary>(search);

  // Price + duration bounds from the real result set
  const priceBounds = useMemo(() => {
    if (!flights.length) return { min: 0, max: 0 };
    const prices = flights.map((f) => f.price);
    return { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) };
  }, [flights]);
  const durBounds = useMemo(() => {
    if (!flights.length) return { min: 0, max: 0 };
    const ds = flights.map((f) => durationToMinutes(f.duration));
    return { min: Math.min(...ds), max: Math.max(...ds) };
  }, [flights]);

  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [maxDur, setMaxDur] = useState<number | null>(null);
  const effMaxPrice = maxPrice ?? priceBounds.max;
  const effMaxDur = maxDur ?? durBounds.max;

  const airlineCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of flights) m.set(f.airline, (m.get(f.airline) || 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [flights]);

  const filtered = useMemo(() => {
    let list = flights.filter((f) => {
      if (stops === "nonstop" && f.stops !== 0) return false;
      if (stops === "1stop" && f.stops !== 1) return false;
      if (airlineSel.size && !airlineSel.has(f.airline)) return false;
      if (f.price > effMaxPrice) return false;
      if (durationToMinutes(f.duration) > effMaxDur) return false;
      if (depBuckets.size) {
        const h = hourOf(f.depart_time);
        const ok = TIME_BUCKETS.some(
          (b) => depBuckets.has(b.id) && h >= b.range[0] && h < b.range[1]
        );
        if (!ok) return false;
      }
      if (arrBuckets.size) {
        const h = hourOf(f.arrive_time);
        const ok = TIME_BUCKETS.some(
          (b) => arrBuckets.has(b.id) && h >= b.range[0] && h < b.range[1]
        );
        if (!ok) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sortTab === "fastest")
        return durationToMinutes(a.duration) - durationToMinutes(b.duration);
      if (sortTab === "cheapest") return a.price - b.price;
      // recommended: cheapest-flagged first, then price
      if (!!b.is_cheapest !== !!a.is_cheapest) return a.is_cheapest ? -1 : 1;
      return a.price - b.price;
    });
    return list;
  }, [flights, stops, airlineSel, effMaxPrice, effMaxDur, depBuckets, arrBuckets, sortTab]);

  const shown = filtered.slice(0, visible);
  const grandTotal =
    totalOffers && totalOffers > flights.length ? totalOffers : flights.length;

  function toggleSet<T>(set: Set<T>, val: T): Set<T> {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    return next;
  }

  function applyVero(text: string) {
    const t = text.toLowerCase();
    const notes: string[] = [];
    const priceMatch = t.match(/(?:under|below|less than|<)\s*₹?\s*([\d,]+)\s*(k)?/);
    if (priceMatch) {
      let v = parseInt(priceMatch[1].replace(/,/g, ""), 10);
      if (priceMatch[2]) v *= 1000;
      setMaxPrice(v);
      notes.push(`under ${fmtMoney(v)}`);
    }
    if (/(no stop|non[- ]?stop|nonstop|direct|without stop)/.test(t)) {
      setStops("nonstop");
      notes.push("non-stop only");
    } else if (/1 stop|one stop/.test(t)) {
      setStops("1stop");
      notes.push("1 stop");
    }
    if (/cheap|lowest|budget/.test(t)) {
      setSortTab("cheapest");
      notes.push("cheapest first");
    }
    if (/fast|quick|short/.test(t)) {
      setSortTab("fastest");
      notes.push("fastest first");
    }
    const matchedAirlines = airlineCounts
      .map(([a]) => a)
      .filter((a) => t.includes(a.toLowerCase()));
    if (matchedAirlines.length) {
      setAirlineSel(new Set(matchedAirlines));
      notes.push(matchedAirlines.join(", "));
    }
    if (/morning/.test(t)) {
      setDepBuckets(new Set(["morning"]));
      notes.push("morning departures");
    }
    if (/evening|night/.test(t)) {
      setDepBuckets(new Set(["evening"]));
      notes.push("evening departures");
    }
    setVisible(INITIAL_BATCH);
    setVeroNote(
      notes.length
        ? `Filtered: ${notes.join(" · ")}`
        : "I couldn't spot a filter in that - try a price, airline, or 'non-stop'."
    );
  }

  function clearAll() {
    setStops("any");
    setAirlineSel(new Set());
    setDepBuckets(new Set());
    setArrBuckets(new Set());
    setMaxPrice(null);
    setMaxDur(null);
    setAirlineQuery("");
    setVeroNote("");
    setVisible(INITIAL_BATCH);
  }

  const dateStrip = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(search.departDate, i - 3)),
    [search.departDate]
  );
  const minPrice = priceBounds.min;

  const visibleAirlines = airlineCounts.filter(([a]) =>
    a.toLowerCase().includes(airlineQuery.toLowerCase())
  );

  return (
    <div className="pb-20">
      {/* HERO */}
      <section className="relative overflow-hidden rounded-[24px] text-white shadow-[0_20px_50px_rgba(11,31,58,0.25)]">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/images/heroFlights.png')" }}
        />
        <div className="hero-sky absolute inset-0 opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/45 via-black/15 to-transparent" />
        <div className="relative px-6 py-8 md:px-10 md:py-10">
          <h1 className="text-[34px] font-black leading-tight drop-shadow-sm md:text-[46px]">
            Beyond The Clouds
          </h1>
          <div className="mt-2 flex gap-2">
            {(["return", "oneway"] as const).map((tt) => (
              <button
                key={tt}
                type="button"
                onClick={() => setEdit({ ...edit, tripType: tt })}
                className={`rounded-[8px] px-3 py-1 text-[12px] font-semibold backdrop-blur ${
                  edit.tripType === tt
                    ? "bg-white/90 text-[#0B1F3A]"
                    : "bg-white/20 text-white"
                }`}
              >
                {tt === "return" ? "Return" : "One way"}
              </button>
            ))}
          </div>

          {/* Inline search summary bar */}
          <div className="mt-4 flex flex-col gap-2 rounded-[16px] bg-white/95 p-2 text-[#0B1F3A] shadow-lg backdrop-blur md:flex-row md:items-stretch">
            <HeroField label="From">
              <input
                value={edit.origin}
                maxLength={3}
                onChange={(e) => setEdit({ ...edit, origin: e.target.value.toUpperCase() })}
                className="w-full bg-transparent text-[15px] font-bold outline-none"
              />
            </HeroField>
            <HeroField label="Going To">
              <input
                value={edit.destination}
                maxLength={3}
                onChange={(e) =>
                  setEdit({ ...edit, destination: e.target.value.toUpperCase() })
                }
                className="w-full bg-transparent text-[15px] font-bold outline-none"
              />
            </HeroField>
            <HeroField label="Depart">
              <input
                type="date"
                value={edit.departDate}
                onChange={(e) => setEdit({ ...edit, departDate: e.target.value })}
                className="w-full bg-transparent text-[14px] font-semibold outline-none"
              />
            </HeroField>
            {edit.tripType === "return" && (
              <HeroField label="Return">
                <input
                  type="date"
                  value={edit.returnDate}
                  onChange={(e) => setEdit({ ...edit, returnDate: e.target.value })}
                  className="w-full bg-transparent text-[14px] font-semibold outline-none"
                />
              </HeroField>
            )}
            <HeroField label="Travellers & Class">
              <div className="flex items-center gap-1 text-[14px] font-semibold">
                <input
                  type="number"
                  min={1}
                  max={9}
                  value={edit.adults}
                  onChange={(e) =>
                    setEdit({ ...edit, adults: Math.max(1, Number(e.target.value)) })
                  }
                  className="w-8 bg-transparent outline-none"
                />
                <span className="text-[12px] font-normal text-[#8A94A6]">pax</span>
                <select
                  value={edit.cabin}
                  onChange={(e) => setEdit({ ...edit, cabin: e.target.value })}
                  className="bg-transparent text-[13px] font-semibold outline-none"
                >
                  <option value="ECONOMY">Economy</option>
                  <option value="PREMIUM_ECONOMY">Prem. Eco</option>
                  <option value="BUSINESS">Business</option>
                  <option value="FIRST">First</option>
                </select>
              </div>
            </HeroField>
            <button
              type="button"
              onClick={() => {
                setVisible(INITIAL_BATCH);
                onSearch(edit);
              }}
              disabled={pending}
              className="flex items-center justify-center gap-2 rounded-[12px] bg-[#F97316] px-6 py-3 text-[14px] font-bold text-white shadow-[0_8px_20px_rgba(249,115,22,0.4)] transition hover:bg-[#e5670f] disabled:opacity-60"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4-4" />
              </svg>
              {pending ? "Searching…" : "Search"}
            </button>
          </div>
        </div>
      </section>

      {/* DATE / PRICE STRIP */}
      <div className="mt-4 flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => onSearch({ ...edit, departDate: addDays(search.departDate, -1) })}
          className="flex w-9 items-center justify-center rounded-[12px] border border-[#E4E7EC] bg-white text-[#8A94A6] hover:text-[#F97316]"
          aria-label="Previous day"
        >
          ‹
        </button>
        <div className="flex flex-1 gap-2 overflow-x-auto rounded-[14px] bg-white p-2 shadow-[0_6px_20px_rgba(16,24,40,0.06)]">
          {dateStrip.map((iso) => {
            const active = iso === search.departDate;
            const { dow, day } = dayLabel(iso);
            return (
              <button
                key={iso}
                type="button"
                onClick={() => onSearch({ ...edit, departDate: iso })}
                className={`flex min-w-[92px] flex-1 flex-col items-center rounded-[12px] px-2 py-2 transition ${
                  active
                    ? "border border-[#F97316] bg-[#FFF7F0]"
                    : "border border-transparent hover:bg-[#F7F9FC]"
                }`}
              >
                <span className="text-[12px] font-semibold text-[#0B1F3A]">
                  {dow}, {day}
                </span>
                {active && minPrice > 0 ? (
                  <span className="mt-0.5 text-[13px] font-bold text-[#12894B]">
                    {fmtMoney(minPrice)}
                  </span>
                ) : (
                  <span className="mt-0.5 text-[12px] text-[#B7BFCC]">
                    {active ? "" : "-"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => onSearch({ ...edit, departDate: addDays(search.departDate, 1) })}
          className="flex w-9 items-center justify-center rounded-[12px] border border-[#E4E7EC] bg-white text-[#8A94A6] hover:text-[#F97316]"
          aria-label="Next day"
        >
          ›
        </button>
        <button
          type="button"
          onClick={() => dateInputRef.current?.showPicker?.()}
          className="relative hidden items-center gap-2 rounded-[12px] border border-[#E4E7EC] bg-white px-4 text-[13px] font-semibold text-[#0B1F3A] hover:border-[#FFC9AC] md:flex"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
          View Price Calendar
          <input
            ref={dateInputRef}
            type="date"
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(e) => e.target.value && onSearch({ ...edit, departDate: e.target.value })}
          />
        </button>
      </div>

      {/* HEADER ROW */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[22px] font-black text-[#0B1F3A]">
          {grandTotal} Flight{grandTotal === 1 ? "" : "s"} Found
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-[12px] border border-[#E4E7EC] bg-white p-1">
            {(
              [
                ["recommended", "Recommended"],
                ["cheapest", "Cheapest"],
                ["fastest", "Fastest"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSortTab(id)}
                className={`rounded-[9px] px-3 py-1.5 text-[12px] font-semibold transition ${
                  sortTab === id ? "bg-[#FFF1E8] text-[#E65C00]" : "text-[#8A94A6]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <select
            value={sortTab}
            onChange={(e) => setSortTab(e.target.value as SortTab)}
            className="rounded-[12px] border border-[#E4E7EC] bg-white px-3 py-2 text-[12px] font-semibold text-[#0B1F3A]"
          >
            <option value="recommended">Sort by: Recommended</option>
            <option value="cheapest">Sort by: Price</option>
            <option value="fastest">Sort by: Duration</option>
          </select>
        </div>
      </div>

      {/* MAIN GRID */}
      <div className="mt-4 grid gap-5 lg:grid-cols-[280px_1fr]">
        {/* SIDEBAR */}
        <aside className="flex flex-col gap-4">
          {/* Vero */}
          <div className="rounded-[18px] border border-[#FFD9BF] bg-gradient-to-b from-[#FFF7F0] to-white p-4 shadow-soft">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F97316] text-[13px] font-black text-white">
                V
              </span>
              <div>
                <p className="text-[14px] font-bold text-[#0B1F3A]">Let Vero Filter</p>
                <p className="text-[11px] text-[#8A94A6]">Vero can narrow this down</p>
              </div>
            </div>
            <textarea
              value={veroText}
              onChange={(e) => setVeroText(e.target.value)}
              placeholder="e.g. flights with no stopovers under ₹25,000"
              rows={2}
              className="mt-3 w-full resize-none rounded-[12px] border border-[#F0D9BE] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#F97316]"
            />
            <button
              type="button"
              onClick={() => applyVero(veroText)}
              className="mt-2 w-full rounded-[10px] bg-[#F97316] py-2 text-[13px] font-bold text-white transition hover:bg-[#e5670f]"
            >
              Filter flights
            </button>
            {veroNote && (
              <p className="mt-2 text-[11px] font-medium text-[#12894B]">{veroNote}</p>
            )}
          </div>

          {/* Track prices - placeholder (no historical data available) */}
          <div className="rounded-[18px] border border-[#E4E7EC] bg-white p-4 shadow-soft">
            <div className="flex items-center justify-between">
              <p className="text-[14px] font-bold text-[#0B1F3A]">Book Now</p>
              <span className="rounded-full bg-[#E6F6EC] px-2 py-0.5 text-[10px] font-bold text-[#12894B]">
                Live fares
              </span>
            </div>
            <p className="mt-1 text-[12px] text-[#8A94A6]">
              Fares update in real time from the airline feed.
            </p>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-[12px] font-semibold text-[#4A5568]">Track prices</p>
              <span className="flex h-5 w-9 items-center rounded-full bg-[#E4E7EC] px-0.5">
                <span className="h-4 w-4 rounded-full bg-white shadow" />
              </span>
            </div>
            <div className="mt-3 h-16 w-full overflow-hidden rounded-[10px] bg-[#F7F9FC]">
              <svg viewBox="0 0 200 60" className="h-full w-full" preserveAspectRatio="none">
                <path
                  d="M0 45 L200 45"
                  stroke="#D8DEE8"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                  fill="none"
                />
              </svg>
            </div>
            <p className="mt-1 text-[10px] text-[#B7BFCC]">
              Price history will appear once we have trend data.
            </p>
          </div>

          {/* Filters */}
          <div className="rounded-[18px] border border-[#E4E7EC] bg-white p-4 shadow-soft">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[14px] font-bold text-[#0B1F3A]">Filters</p>
              <button
                type="button"
                onClick={clearAll}
                className="text-[12px] font-semibold text-[#F97316]"
              >
                Clear All
              </button>
            </div>

            {/* Price */}
            <FilterGroup title="Price Range">
              <input
                type="range"
                min={priceBounds.min}
                max={priceBounds.max}
                value={effMaxPrice}
                onChange={(e) => {
                  setMaxPrice(Number(e.target.value));
                  setVisible(INITIAL_BATCH);
                }}
                className="w-full accent-[#F97316]"
              />
              <div className="flex justify-between text-[11px] text-[#8A94A6]">
                <span>{fmtMoney(priceBounds.min)}</span>
                <span className="font-semibold text-[#0B1F3A]">
                  ≤ {fmtMoney(effMaxPrice)}
                </span>
              </div>
            </FilterGroup>

            {/* Airlines */}
            <FilterGroup title="Airlines">
              <input
                value={airlineQuery}
                onChange={(e) => setAirlineQuery(e.target.value)}
                placeholder="Search Airline"
                className="mb-2 w-full rounded-[10px] border border-[#E4E7EC] px-3 py-1.5 text-[12px] outline-none focus:border-[#F97316]"
              />
              <div className="flex max-h-[168px] flex-col gap-1.5 overflow-y-auto pr-1">
                {visibleAirlines.map(([a, count]) => (
                  <label key={a} className="flex items-center justify-between text-[13px]">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={airlineSel.has(a)}
                        onChange={() => {
                          setAirlineSel((s) => toggleSet(s, a));
                          setVisible(INITIAL_BATCH);
                        }}
                        className="accent-[#F97316]"
                      />
                      {a}
                    </span>
                    <span className="text-[11px] text-[#B7BFCC]">{count}</span>
                  </label>
                ))}
              </div>
            </FilterGroup>

            {/* Stops */}
            <FilterGroup title="Stops">
              {(
                [
                  ["any", "Any"],
                  ["nonstop", "Non stop"],
                  ["1stop", "1 stop"],
                ] as const
              ).map(([id, label]) => (
                <label key={id} className="flex items-center gap-2 text-[13px]">
                  <input
                    type="radio"
                    name="bookstops"
                    checked={stops === id}
                    onChange={() => {
                      setStops(id);
                      setVisible(INITIAL_BATCH);
                    }}
                    className="accent-[#F97316]"
                  />
                  {label}
                </label>
              ))}
            </FilterGroup>

            {/* Departure time */}
            <FilterGroup title="Departure Time">
              <div className="grid grid-cols-2 gap-1.5">
                {TIME_BUCKETS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      setDepBuckets((s) => toggleSet(s, b.id));
                      setVisible(INITIAL_BATCH);
                    }}
                    className={`rounded-[9px] border px-2 py-1.5 text-[11px] font-semibold ${
                      depBuckets.has(b.id)
                        ? "border-[#F97316] bg-[#FFF1E8] text-[#E65C00]"
                        : "border-[#E4E7EC] text-[#8A94A6]"
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </FilterGroup>

            {/* Arrival time */}
            <FilterGroup title="Arrival Time">
              <div className="grid grid-cols-2 gap-1.5">
                {TIME_BUCKETS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      setArrBuckets((s) => toggleSet(s, b.id));
                      setVisible(INITIAL_BATCH);
                    }}
                    className={`rounded-[9px] border px-2 py-1.5 text-[11px] font-semibold ${
                      arrBuckets.has(b.id)
                        ? "border-[#F97316] bg-[#FFF1E8] text-[#E65C00]"
                        : "border-[#E4E7EC] text-[#8A94A6]"
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </FilterGroup>

            {/* Duration */}
            {durBounds.max > durBounds.min && (
              <FilterGroup title="Duration">
                <input
                  type="range"
                  min={durBounds.min}
                  max={durBounds.max}
                  value={effMaxDur}
                  onChange={(e) => {
                    setMaxDur(Number(e.target.value));
                    setVisible(INITIAL_BATCH);
                  }}
                  className="w-full accent-[#F97316]"
                />
                <div className="flex justify-between text-[11px] text-[#8A94A6]">
                  <span>Any</span>
                  <span className="font-semibold text-[#0B1F3A]">
                    ≤ {Math.floor(effMaxDur / 60)}h {effMaxDur % 60}m
                  </span>
                </div>
              </FilterGroup>
            )}

            {/* Refundable - not provided by the fares feed */}
            <div className="pt-3">
              <p className="text-[12px] font-bold uppercase tracking-wide text-[#8A94A6]">
                Refundable Flights
              </p>
              <p className="mt-1 text-[11px] text-[#B7BFCC]">
                Refund rules are confirmed with the airline at payment - not filterable
                from the live feed.
              </p>
            </div>
          </div>
        </aside>

        {/* RESULTS */}
        <section>
          {pending && (
            <div className="mb-4 animate-pulse rounded-[18px] bg-white p-6 text-[#8A94A6] shadow-soft">
              Fetching live fares from LiteAPI…
            </div>
          )}

          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-[#8A94A6]">
              Showing {shown.length} of {filtered.length} filtered
              {filtered.length !== flights.length ? ` · ${flights.length} total` : ""}
            </p>
            {liteReady && (
              <span className="text-[11px] text-[#B7BFCC]">Source: live · LiteAPI</span>
            )}
          </div>

          {!pending && filtered.length === 0 && (
            <div className="rounded-[20px] border border-dashed border-[#E4E7EC] bg-white p-10 text-center">
              <p className="font-bold text-[#0B1F3A]">No flights match these filters</p>
              <p className="mt-1 text-[13px] text-[#8A94A6]">
                {message || "Loosen a filter or pick another date."}
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-[10px] border border-[#E4E7EC] px-5 py-2 text-[13px] font-semibold"
                >
                  Clear filters
                </button>
                <button
                  type="button"
                  onClick={onModifySearch}
                  className="rounded-[10px] bg-[#F97316] px-5 py-2 text-[13px] font-bold text-white"
                >
                  Modify search
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {shown.map((f) => (
              <FlightCard
                key={f.id}
                flight={f}
                onSelect={onSelect}
                selectLabel="Book Now"
                saved={saved.has(f.id)}
                onToggleSave={(x) => setSaved((s) => toggleSet(s, x.id))}
              />
            ))}
          </div>

          {shown.length < filtered.length && (
            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => setVisible((v) => v + STEP)}
                className="rounded-[50px] border border-[#FFD9BF] bg-[#FFF7F0] px-8 py-3 text-[14px] font-bold text-[#E65C00] transition hover:bg-[#FFEFE2]"
              >
                Show all {filtered.length} flights
                <span className="ml-1 font-medium text-[#F79A5B]">
                  ({filtered.length - shown.length} more)
                </span>
              </button>
            </div>
          )}
        </section>
      </div>

      {/* Ask For Vero floating button */}
      <button
        type="button"
        onClick={onOpenVero}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-[#F97316] px-5 py-3 text-[14px] font-bold text-white shadow-[0_10px_30px_rgba(249,115,22,0.5)] transition hover:bg-[#e5670f]"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/25 text-[12px] font-black">
          V
        </span>
        Ask For Vero
      </button>

      <style jsx>{`
        .hero-sky {
          background:
            radial-gradient(120% 140% at 80% 0%, rgba(255, 173, 100, 0.85) 0%, rgba(255, 122, 89, 0) 55%),
            linear-gradient(120deg, #f79d5c 0%, #e0654e 42%, #7b3f7d 100%);
        }
        .hero-sky::after {
          content: "";
          position: absolute;
          right: 6%;
          top: 26%;
          width: 220px;
          height: 90px;
          background: rgba(255, 255, 255, 0.12);
          filter: blur(2px);
          clip-path: polygon(0 60%, 30% 55%, 55% 30%, 70% 45%, 100% 40%, 100% 100%, 0 100%);
        }
      `}</style>
    </div>
  );
}

function HeroField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center rounded-[10px] px-3 py-1.5 md:border-r md:border-[#EEF1F5]">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-[#8A94A6]">
        {label}
      </span>
      {children}
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[#F0F0F0] py-3 first:border-t-0 first:pt-0">
      <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#8A94A6]">
        {title}
      </p>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}
