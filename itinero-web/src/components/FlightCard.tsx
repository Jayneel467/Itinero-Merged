"use client";

import { useState } from "react";
import type { FlightOffer, FlightSegment } from "@/lib/types";

export function fmtMoney(n: number, currency = "INR") {
  if (currency === "INR") return `₹${Math.round(n).toLocaleString("en-IN")}`;
  return `${currency} ${Math.round(n).toLocaleString()}`;
}

export function durationToMinutes(d: string): number {
  const m = d.match(/(\d+)\s*h\s*(\d+)/i);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  const only = d.match(/(\d+)\s*m/i);
  if (only) return parseInt(only[1], 10);
  return 9999;
}

function minsToLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ""}`.trim() : `${m}m`;
}

function layoverMinutes(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  try {
    const ms = new Date(b).getTime() - new Date(a).getTime();
    if (Number.isNaN(ms) || ms < 0) return null;
    return Math.round(ms / 60000);
  } catch {
    return null;
  }
}

function timeOf(iso?: string): string {
  if (!iso) return "--:--";
  try {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime()))
      return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  } catch {
    /* fall through */
  }
  return iso.slice(11, 16) || "--:--";
}

function dateOf(iso?: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime()))
      return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  } catch {
    /* ignore */
  }
  return "";
}

function AirlineLogo({ f, size = 40 }: { f: FlightOffer; size?: number }) {
  const [broken, setBroken] = useState(false);
  const monogram = (f.airline || "?").slice(0, 2).toUpperCase();
  if (f.airline_logo && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={f.airline_logo}
        alt={f.airline}
        width={size}
        height={size}
        onError={() => setBroken(true)}
        className="rounded-[10px] object-contain"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-[10px] bg-[#FFF1E8] text-[13px] font-black text-[#E65C00]"
      style={{ width: size, height: size }}
    >
      {monogram}
    </div>
  );
}

const AMENITY_ICON: Record<string, string> = {
  wifi: "M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3a4.24 4.24 0 00-6 0zm-4-4l2 2a7.07 7.07 0 0110 0l2-2C15.14 9.14 8.87 9.14 5 13z",
  seat_comfort:
    "M4 18v3h3v-3h10v3h3v-6H4v3zM19 10h3v3h-3v-3zM2 10h3v3H2v-3zm15 3H7V5c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2v8z",
  entertainment:
    "M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z",
  food: "M8.1 13.34l2.83-2.83L3.91 3.5a4 4 0 000 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.2-1.1-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L3.7 19.87l1.41 1.41L12 14.41l6.88 6.88 1.41-1.41L13.41 13l1.47-1.47z",
};

function amenityPath(category?: string | null, name?: string): string {
  const key = (category || name || "").toLowerCase();
  if (key.includes("wifi")) return AMENITY_ICON.wifi;
  if (key.includes("seat")) return AMENITY_ICON.seat_comfort;
  if (key.includes("entertain") || key.includes("tv")) return AMENITY_ICON.entertainment;
  if (key.includes("food") || key.includes("meal")) return AMENITY_ICON.food;
  return AMENITY_ICON.seat_comfort;
}

type DetailTab = "flight" | "fare" | "baggage" | "cancel" | "miles";

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "flight", label: "Flight Details" },
  { id: "fare", label: "Fare Details" },
  { id: "baggage", label: "Baggage Info" },
  { id: "cancel", label: "Cancellation" },
  { id: "miles", label: "Airline Miles" },
];

export function FlightCard({
  flight: f,
  onSelect,
  selectLabel = "Book Now",
  saved,
  onToggleSave,
  compact = false,
}: {
  flight: FlightOffer;
  onSelect?: (f: FlightOffer) => void;
  selectLabel?: string;
  saved?: boolean;
  onToggleSave?: (f: FlightOffer) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<DetailTab>("flight");
  const segments = f.segments || [];
  const stopsLabel =
    f.stops === 0 ? "Direct" : `${f.stops} stop${f.stops > 1 ? "s" : ""}`;
  const cabinKg = f.baggage_detail?.cabin_kg;
  const checkedKg = f.baggage_detail?.checked_kg;

  return (
    <article className="overflow-hidden rounded-[18px] border border-[#ECECEC] bg-white shadow-[0_6px_20px_rgba(16,24,40,0.06)] transition hover:border-[#FFC9AC]">
      <div className={`relative flex flex-col gap-4 p-4 md:flex-row md:items-center md:gap-5 ${compact ? "" : "md:p-5"}`}>
        {f.is_cheapest && (
          <span className="absolute left-4 top-0 -translate-y-1/2 rounded-[6px] bg-[#E6F6EC] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#12894B]">
            Best Value
          </span>
        )}

        {/* Airline */}
        <div className="flex min-w-[150px] items-center gap-3">
          <AirlineLogo f={f} />
          <div>
            <p className="text-[15px] font-bold leading-tight text-[#0B1F3A]">
              {f.airline}
            </p>
            <p className="text-[12px] text-[#8A94A6]">
              {f.flight_number
                ? `${f.segments?.[0]?.airline_code ?? ""}${f.flight_number}`
                : "—"}
              {f.cabin ? ` · ${f.cabin}` : ""}
            </p>
          </div>
        </div>

        {/* Times */}
        <div className="flex flex-1 items-center justify-between gap-3 md:justify-center md:gap-6">
          <div className="text-center">
            <p className="text-[20px] font-black leading-none text-[#0B1F3A] md:text-[22px]">
              {f.depart_time}
            </p>
            <p className="mt-1 text-[12px] font-semibold text-[#8A94A6]">{f.origin}</p>
          </div>
          <div className="flex min-w-[110px] flex-col items-center">
            <span className="text-[11px] text-[#8A94A6]">{f.duration}</span>
            <div className="my-1 flex w-full items-center">
              <span className="h-1.5 w-1.5 rounded-full bg-[#C7CED9]" />
              <span className="h-px flex-1 bg-[#D8DEE8]" />
              <svg width="14" height="14" viewBox="0 0 24 24" className="text-[#F97316]" fill="currentColor">
                <path d="M2.5 19h19v2h-19v-2zm19.57-9.36c-.21-.8-1.04-1.28-1.84-1.06L14.92 10 8 3.57 6.09 4.08l4.15 7.19-4.98 1.33-1.97-1.54-1.45.39 2.59 4.49L21 11.49c.81-.23 1.28-1.05 1.07-1.85z" />
              </svg>
              <span className="h-1.5 w-1.5 rounded-full bg-[#C7CED9]" />
            </div>
            <span className={`text-[11px] font-semibold ${f.stops === 0 ? "text-[#12894B]" : "text-[#8A94A6]"}`}>
              {stopsLabel}
            </span>
          </div>
          <div className="text-center">
            <p className="text-[20px] font-black leading-none text-[#0B1F3A] md:text-[22px]">
              {f.arrive_time}
            </p>
            <p className="mt-1 text-[12px] font-semibold text-[#8A94A6]">{f.destination}</p>
          </div>
        </div>

        {/* Baggage */}
        {(cabinKg != null || checkedKg != null) && !compact && (
          <div className="hidden min-w-[110px] flex-col gap-1 border-l border-[#EFEFEF] pl-4 text-[12px] text-[#4A5568] lg:flex">
            {cabinKg != null && (
              <span className="flex items-center gap-1.5">
                <BagIcon type="cabin" /> {cabinKg}kg Cabin
              </span>
            )}
            {checkedKg != null && (
              <span className="flex items-center gap-1.5">
                <BagIcon type="checked" /> {checkedKg}kg Checked
              </span>
            )}
          </div>
        )}

        {/* Price + CTA */}
        <div className="flex items-center justify-between gap-3 md:flex-col md:items-end md:justify-center">
          <div className="text-left md:text-right">
            <p className="text-[20px] font-black text-[#0B1F3A] md:text-[22px]">
              {fmtMoney(f.price, f.currency)}
            </p>
            <p className="text-[11px] text-[#8A94A6]">/ person</p>
          </div>
          <div className="flex items-center gap-2">
            {onToggleSave && (
              <button
                type="button"
                aria-label="Save flight"
                onClick={() => onToggleSave(f)}
                className={`flex h-9 w-9 items-center justify-center rounded-full border transition ${
                  saved
                    ? "border-[#F97316] bg-[#FFF1E8] text-[#F97316]"
                    : "border-[#E4E7EC] text-[#98A2B3] hover:border-[#FFC9AC]"
                }`}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                  <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 10-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" />
                </svg>
              </button>
            )}
            {onSelect && (
              <button
                type="button"
                onClick={() => onSelect(f)}
                className="rounded-[10px] bg-[#F97316] px-5 py-2 text-[13px] font-bold text-white shadow-[0_6px_16px_rgba(249,115,22,0.35)] transition hover:bg-[#e5670f]"
              >
                {selectLabel}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* View details toggle */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-center gap-1 border-t border-[#F0F0F0] py-2 text-[12px] font-semibold text-[#8A94A6] transition hover:text-[#F97316]"
      >
        View Details
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={`transition ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-[#F0F0F0] bg-[#FBFCFE] px-4 pb-5 pt-3 md:px-5">
          <div className="mb-4 flex flex-wrap gap-4 border-b border-[#ECECEC] text-[13px] font-semibold">
            {DETAIL_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`-mb-px border-b-2 pb-2 transition ${
                  tab === t.id
                    ? "border-[#F97316] text-[#F97316]"
                    : "border-transparent text-[#8A94A6] hover:text-[#0B1F3A]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "flight" && <FlightDetailTab flight={f} segments={segments} />}
          {tab === "fare" && <FareDetailTab flight={f} />}
          {tab === "baggage" && <BaggageDetailTab flight={f} />}
          {tab === "cancel" && (
            <p className="text-[13px] text-[#4A5568]">
              Cancellation and change rules are confirmed with the airline at the
              payment step. This fare
              {f.fare_family ? ` (${f.fare_family})` : ""} follows the carrier&apos;s
              standard policy — exact penalties are shown before you pay.
            </p>
          )}
          {tab === "miles" && (
            <p className="text-[13px] text-[#4A5568]">
              Frequent-flyer accrual depends on your {f.airline} membership and fare
              class. Add your loyalty number during traveller details to earn miles
              where eligible.
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function FlightDetailTab({
  flight: f,
  segments,
}: {
  flight: FlightOffer;
  segments: FlightSegment[];
}) {
  if (!segments.length) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex items-start gap-3 rounded-[14px] border border-[#ECECEC] bg-white p-4">
          <LogoBox logo={f.airline_logo} name={f.airline} />
          <div className="flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[16px] font-black text-[#0B1F3A]">
                {f.depart_time}{" "}
                <span className="text-[13px] font-semibold text-[#8A94A6]">
                  {f.origin}
                </span>
              </p>
              <span className="text-[11px] text-[#8A94A6]">{f.duration}</span>
              <p className="text-[16px] font-black text-[#0B1F3A]">
                {f.arrive_time}{" "}
                <span className="text-[13px] font-semibold text-[#8A94A6]">
                  {f.destination}
                </span>
              </p>
            </div>
            <p className="mt-1 text-[12px] text-[#8A94A6]">
              {f.airline}
              {f.flight_number ? ` · ${f.flight_number}` : ""}
            </p>
          </div>
        </div>
        <AmenitiesBlock flight={f} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {segments.map((s, i) => {
        const lay =
          i < segments.length - 1
            ? layoverMinutes(s.arrival, segments[i + 1].departure)
            : null;
        return (
          <div key={`${s.flight_number}-${i}`}>
            <div className="grid gap-4 rounded-[14px] border border-[#ECECEC] bg-white p-4 md:grid-cols-[1.4fr_1fr]">
              <div className="flex items-start gap-3">
                <LogoBox logo={s.logo} name={s.airline} />
                <div className="flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[16px] font-black text-[#0B1F3A]">
                      {timeOf(s.departure)}{" "}
                      <span className="text-[13px] font-semibold text-[#8A94A6]">
                        {s.from}
                      </span>
                    </p>
                    <span className="text-[11px] text-[#8A94A6]">
                      {s.duration_minutes ? minsToLabel(s.duration_minutes) : ""}
                    </span>
                    <p className="text-[16px] font-black text-[#0B1F3A]">
                      {timeOf(s.arrival)}{" "}
                      <span className="text-[13px] font-semibold text-[#8A94A6]">
                        {s.to}
                      </span>
                    </p>
                  </div>
                  <p className="mt-1 text-[12px] text-[#8A94A6]">
                    {dateOf(s.departure)} · {s.from_name}
                  </p>
                  <p className="text-[12px] text-[#8A94A6]">{s.to_name}</p>
                </div>
              </div>
              <div className="flex flex-col justify-center gap-1 border-t border-[#F0F0F0] pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
                <p className="text-[12px] font-semibold text-[#0B1F3A]">
                  {s.airline} {s.flight_number ? `· ${s.airline_code || ""}${s.flight_number}` : ""}
                </p>
                {s.operating_airline && s.operating_airline !== s.airline && (
                  <p className="text-[11px] text-[#8A94A6]">
                    Operated by {s.operating_airline}
                  </p>
                )}
              </div>
            </div>
            {lay != null && (
              <div className="my-2 flex items-center justify-center gap-2 text-[12px] font-semibold text-[#B26A00]">
                <span className="h-px w-8 bg-[#F0D9BE]" />
                {minsToLabel(lay)} layover in {s.to}
                <span className="h-px w-8 bg-[#F0D9BE]" />
              </div>
            )}
          </div>
        );
      })}
      <AmenitiesBlock flight={f} />
    </div>
  );
}

function AmenitiesBlock({ flight: f }: { flight: FlightOffer }) {
  const amenities = f.amenities || [];
  if (!amenities.length) return null;
  return (
    <div className="rounded-[14px] border border-[#ECECEC] bg-white p-4">
      <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#8A94A6]">
        Amenities
      </p>
      <div className="flex flex-wrap gap-4">
        {amenities.map((a) => (
          <div key={a.name} className="flex items-center gap-2 text-[12px] text-[#4A5568]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-[#F97316]">
              <path d={amenityPath(a.category, a.name)} />
            </svg>
            {a.name}
            {a.chargeable && <span className="text-[10px] text-[#B26A00]">(paid)</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function FareDetailTab({ flight: f }: { flight: FlightOffer }) {
  const rows: [string, string | null][] = [
    ["Base fare", f.price_base != null ? fmtMoney(f.price_base, f.currency) : null],
    ["Taxes", f.price_taxes != null ? fmtMoney(f.price_taxes, f.currency) : null],
    ["Fees", f.price_fees != null ? fmtMoney(f.price_fees, f.currency) : null],
  ];
  const known = rows.filter(([, v]) => v);
  return (
    <div className="max-w-[420px]">
      {f.fare_family && (
        <p className="mb-3 text-[13px]">
          <span className="text-[#8A94A6]">Fare family: </span>
          <span className="font-semibold text-[#0B1F3A]">{f.fare_family}</span>
        </p>
      )}
      {known.length > 0 ? (
        <dl className="space-y-2 text-[13px]">
          {known.map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-[#EFEFEF] pb-2">
              <dt className="text-[#8A94A6]">{k} (per adult)</dt>
              <dd className="font-semibold text-[#0B1F3A]">{v}</dd>
            </div>
          ))}
          <div className="flex justify-between pt-1">
            <dt className="font-bold text-[#0B1F3A]">Total / person</dt>
            <dd className="font-black text-[#F97316]">{fmtMoney(f.price, f.currency)}</dd>
          </div>
        </dl>
      ) : (
        <p className="text-[13px] text-[#4A5568]">
          Total {fmtMoney(f.price, f.currency)} per person. A full tax breakdown is
          confirmed with the airline before payment.
        </p>
      )}
      {f.seats_remaining != null && f.seats_remaining <= 9 && (
        <p className="mt-3 text-[12px] font-semibold text-[#C2410C]">
          Only {f.seats_remaining} seat{f.seats_remaining === 1 ? "" : "s"} left at this fare
        </p>
      )}
    </div>
  );
}

function BaggageDetailTab({ flight: f }: { flight: FlightOffer }) {
  const b = f.baggage_detail;
  if (!b || (b.cabin_kg == null && b.checked_kg == null && !b.has_carry_on && !b.has_checked)) {
    return (
      <p className="text-[13px] text-[#4A5568]">
        Baggage allowance for this fare is confirmed with the airline before payment.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-4 text-[13px]">
      <div className="flex items-center gap-2 rounded-[12px] border border-[#ECECEC] bg-white px-4 py-3">
        <BagIcon type="cabin" />
        <div>
          <p className="font-semibold text-[#0B1F3A]">Cabin baggage</p>
          <p className="text-[12px] text-[#8A94A6]">
            {b.cabin_kg != null
              ? `${b.cabin_kg}kg${b.cabin_pieces ? ` · ${b.cabin_pieces} pc` : ""}`
              : b.has_carry_on
                ? "Included"
                : "Not included"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-[12px] border border-[#ECECEC] bg-white px-4 py-3">
        <BagIcon type="checked" />
        <div>
          <p className="font-semibold text-[#0B1F3A]">Checked baggage</p>
          <p className="text-[12px] text-[#8A94A6]">
            {b.checked_kg != null
              ? `${b.checked_kg}kg${b.checked_pieces ? ` · ${b.checked_pieces} pc` : ""}`
              : b.has_checked
                ? "Included"
                : "Not included"}
          </p>
        </div>
      </div>
    </div>
  );
}

function LogoBox({ logo, name }: { logo?: string | null; name?: string }) {
  const [broken, setBroken] = useState(false);
  const monogram = (name || "?").slice(0, 2).toUpperCase();
  if (logo && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logo}
        alt={name || ""}
        onError={() => setBroken(true)}
        className="h-9 w-9 rounded-[8px] object-contain"
      />
    );
  }
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-[#FFF1E8] text-[11px] font-black text-[#E65C00]">
      {monogram}
    </div>
  );
}

function BagIcon({ type }: { type: "cabin" | "checked" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="1.8" className="shrink-0">
      {type === "cabin" ? (
        <>
          <rect x="6" y="7" width="12" height="14" rx="2" />
          <path d="M9 7V4h6v3" />
        </>
      ) : (
        <>
          <rect x="5" y="8" width="14" height="13" rx="2" />
          <path d="M9 8V5h6v3M9 12v5M15 12v5" />
        </>
      )}
    </svg>
  );
}
