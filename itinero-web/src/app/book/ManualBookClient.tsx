"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  searchFlights,
  selectFlight,
  prebookFlight,
  getHealth,
} from "@/lib/api";
import type { FlightOffer, HealthStatus } from "@/lib/types";
import { SiteHeader } from "@/components/SiteHeader";
import { BookFlightResults, type SearchSummary } from "@/components/BookFlightResults";

type Step =
  | "search"
  | "results"
  | "detail"
  | "traveler"
  | "review"
  | "pay"
  | "done";

const STEPS: { id: Step; label: string }[] = [
  { id: "search", label: "Search" },
  { id: "results", label: "Flights" },
  { id: "detail", label: "Fare" },
  { id: "traveler", label: "Travellers" },
  { id: "review", label: "Review" },
  { id: "pay", label: "Pay" },
];

function inr(n: number, currency = "INR") {
  if (currency === "INR") return `₹${Math.round(n).toLocaleString("en-IN")}`;
  return `${currency} ${Math.round(n).toLocaleString()}`;
}

export default function ManualBookClient() {
  const params = useSearchParams();
  const router = useRouter();
  const [step, setStep] = useState<Step>("search");
  const [tripType, setTripType] = useState<"oneway" | "return">("oneway");
  const [origin, setOrigin] = useState(params.get("from") || "BOM");
  const [destination, setDestination] = useState(
    (() => {
      const to = params.get("to") || "DEL";
      if (to === "Bali") return "DPS";
      if (to === "New York") return "JFK";
      if (to === "Japan") return "NRT";
      return to.slice(0, 3).toUpperCase();
    })()
  );
  const [departDate, setDepartDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [cabin, setCabin] = useState("ECONOMY");
  const [flights, setFlights] = useState<FlightOffer[]>([]);
  const [totalOffers, setTotalOffers] = useState<number>(0);
  const [selected, setSelected] = useState<FlightOffer | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [sessionContext, setSessionContext] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [pending, startTransition] = useTransition();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [prebookInfo, setPrebookInfo] = useState<{
    prebook_id?: string;
    price?: number | string;
    currency?: string;
    publishable_key?: string;
    message?: string;
  } | null>(null);

  const [traveler, setTraveler] = useState({
    first_name: "",
    last_name: "",
    birthday: "",
    gender: "M",
    nationality: "IN",
    document_type: "passport",
    document_number: "",
    document_expiry: "",
    document_issue_country: "IN",
    email: "",
    phone: "",
  });

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  function doSearch(s: {
    origin: string;
    destination: string;
    departDate: string;
    returnDate: string;
    tripType: "oneway" | "return";
    adults: number;
    children: number;
    cabin: string;
  }) {
    setError("");
    if (!s.departDate) {
      setError("Select a departure date.");
      return;
    }
    if (s.origin.length !== 3 || s.destination.length !== 3) {
      setError("Use 3-letter IATA codes (e.g. BOM, DEL).");
      return;
    }
    // Reflect the (possibly edited) params back into page state
    setOrigin(s.origin);
    setDestination(s.destination);
    setDepartDate(s.departDate);
    setReturnDate(s.returnDate);
    setTripType(s.tripType);
    setAdults(s.adults);
    setChildren(s.children);
    setCabin(s.cabin);
    startTransition(async () => {
      const h = await getHealth();
      setHealth(h);
      const res = await searchFlights({
        origin: s.origin,
        destination: s.destination,
        depart_date: s.departDate,
        return_date: s.tripType === "return" ? s.returnDate || undefined : undefined,
        adults: s.adults,
        children: s.children,
        cabin: s.cabin,
        session_id: sessionId,
      });
      setFlights(res.flights || []);
      setTotalOffers(res.total_offers || res.flights?.length || 0);
      setMessage(res.message || "");
      setSessionId(res.session_id);
      if (res.session_context) setSessionContext(res.session_context);
      setStep("results");
      if (!res.flights?.length) {
        setError(res.error || "No flights found. Try different dates.");
      }
    });
  }

  function runSearch() {
    doSearch({
      origin,
      destination,
      departDate,
      returnDate,
      tripType,
      adults,
      children,
      cabin,
    });
  }

  function onSelectOffer(f: FlightOffer) {
    setSelected(f);
    setError("");
    startTransition(async () => {
      if (!sessionId) {
        setStep("detail");
        return;
      }
      const res = await selectFlight({
        session_id: sessionId,
        offer_id: f.offer_id || f.id,
        offer_index: f.index,
        session_context: sessionContext,
      });
      if (res.session_context) setSessionContext(res.session_context);
      if (res.flight) setSelected(res.flight);
      if (!res.ok && res.error) setMessage(res.error);
      setStep("detail");
    });
  }

  function submitTravelers() {
    if (
      !traveler.first_name ||
      !traveler.last_name ||
      !traveler.birthday ||
      !traveler.document_number ||
      !traveler.document_expiry ||
      !traveler.email ||
      !traveler.phone
    ) {
      setError("Fill all required traveller and contact fields.");
      return;
    }
    setError("");
    setStep("review");
  }

  function doPrebook() {
    if (!sessionId || !selected) return;
    setError("");
    startTransition(async () => {
      const res = await prebookFlight({
        session_id: sessionId,
        session_context: sessionContext,
        passengers: [
          {
            first_name: traveler.first_name,
            last_name: traveler.last_name,
            birthday: traveler.birthday,
            gender: traveler.gender,
            nationality: traveler.nationality,
            document_type: traveler.document_type,
            document_number: traveler.document_number,
            document_expiry: traveler.document_expiry,
            document_issue_country: traveler.document_issue_country,
            passenger_type: 0,
          },
        ],
        contact: {
          first_name: traveler.first_name,
          last_name: traveler.last_name,
          email: traveler.email,
          phone_country_code: "91",
          phone_number: traveler.phone.replace(/\D/g, "").slice(-10),
        },
      });
      if (res.session_context) setSessionContext(res.session_context);
      if (res.ok) {
        setPrebookInfo({
          ...res.prebook,
          message: res.message,
        });
        setStep("pay");
      } else {
        setError(res.error || "Prebook failed. Check gateway logs / LiteAPI keys.");
      }
    });
  }

  return (
    <div className="min-h-screen bg-[#F0F4F8]">
      <SiteHeader />

      {/* Sticky OTA search strip on booking steps (results has its own hero bar) */}
      {step !== "search" && step !== "results" && step !== "done" && (
        <div className="border-b border-[#E8EDF2] bg-white">
          <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
            <p className="text-[14px] font-semibold text-navy">
              {origin} → {destination}
              <span className="ml-2 font-normal text-muted">
                {departDate}
                {adults} adult{adults > 1 ? "s" : ""} · {cabin}
              </span>
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep("results")}
                className="rounded-[50px] border border-[#E8EDF2] px-3 py-1.5 text-[12px] font-semibold"
              >
                Back to flights
              </button>
              <Link
                href="/ai"
                className="rounded-[50px] border border-[#FFE1CB] bg-[#FEFAF4] px-3 py-1.5 text-[12px] font-semibold text-[#E65C00]"
              >
                Switch to AI
              </Link>
            </div>
          </div>
        </div>
      )}

      <main
        className={`mx-auto px-4 py-6 md:px-8 md:py-8 ${
          step === "results" ? "max-w-[1280px]" : "max-w-[1100px]"
        }`}
      >
        {/* Progress stepper (hidden on the results browse view) */}
        {step !== "results" && (
          <ol className="mb-8 flex flex-wrap gap-2">
            {STEPS.map((s, i) => {
              const active = i <= Math.max(stepIndex, 0) || step === "done";
              const current = s.id === step;
              return (
                <li
                  key={s.id}
                  className={`rounded-[50px] px-3 py-1.5 text-[12px] font-semibold ${
                    current
                      ? "bg-[#F97211] text-white shadow-[0_4px_15px_rgba(249,115,22,0.35)]"
                      : active
                        ? "bg-[#001438] text-white"
                        : "bg-white text-[#868686]"
                  }`}
                >
                  {i + 1}. {s.label}
                </li>
              );
            })}
          </ol>
        )}

        {error && (
          <div className="mb-4 rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
            {error}
          </div>
        )}

        {/* SEARCH */}
        {step === "search" && (
          <section className="overflow-hidden rounded-[24px] bg-white shadow-[0px_19px_36px_#0000001f]">
            <div
              className="px-6 py-5 text-white md:px-8"
              style={{ background: "var(--gradient-navy)" }}
            >
              <p className="text-[12px] font-semibold uppercase tracking-wide text-[#FFA755]">
                Manual booking · MakeMyTrip-style
              </p>
              <h1 className="mt-1 text-[26px] font-black md:text-[32px]">
                Book flights
              </h1>
              <p className="mt-1 text-[14px] text-white/70">
                Forms only - synced to the same LiteAPI session as AI booking.
              </p>
            </div>
            <div className="p-6 md:p-8">
              <div className="mb-4 flex gap-2">
                {(
                  [
                    ["oneway", "One way"],
                    ["return", "Return"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTripType(id)}
                    className={`rounded-[50px] px-4 py-2 text-[13px] font-semibold ${
                      tripType === id
                        ? "bg-[#F97211] text-white"
                        : "bg-[#F2F2F2] text-[#637588]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="From (IATA)">
                  <input
                    className="field"
                    value={origin}
                    maxLength={3}
                    onChange={(e) => setOrigin(e.target.value.toUpperCase())}
                    placeholder="BOM"
                  />
                </Field>
                <Field label="To (IATA)">
                  <input
                    className="field"
                    value={destination}
                    maxLength={3}
                    onChange={(e) =>
                      setDestination(e.target.value.toUpperCase())
                    }
                    placeholder="DEL"
                  />
                </Field>
                <Field label="Departure">
                  <input
                    type="date"
                    className="field"
                    value={departDate}
                    onChange={(e) => setDepartDate(e.target.value)}
                  />
                </Field>
                {tripType === "return" && (
                  <Field label="Return">
                    <input
                      type="date"
                      className="field"
                      value={returnDate}
                      onChange={(e) => setReturnDate(e.target.value)}
                    />
                  </Field>
                )}
                <Field label="Adults">
                  <input
                    type="number"
                    min={1}
                    max={9}
                    className="field"
                    value={adults}
                    onChange={(e) => setAdults(Number(e.target.value))}
                  />
                </Field>
                <Field label="Children">
                  <input
                    type="number"
                    min={0}
                    max={8}
                    className="field"
                    value={children}
                    onChange={(e) => setChildren(Number(e.target.value))}
                  />
                </Field>
                <Field label="Cabin">
                  <select
                    className="field"
                    value={cabin}
                    onChange={(e) => setCabin(e.target.value)}
                  >
                    <option value="ECONOMY">Economy</option>
                    <option value="PREMIUM_ECONOMY">Premium Economy</option>
                    <option value="BUSINESS">Business</option>
                    <option value="FIRST">First</option>
                  </select>
                </Field>
              </div>
              <button
                type="button"
                onClick={runSearch}
                disabled={pending}
                className="btn-primary mt-6 w-full py-3.5 text-[16px] font-bold disabled:opacity-50 sm:w-auto sm:px-12"
              >
                {pending ? "Searching live fares…" : "Search flights"}
              </button>
              <p className="mt-3 text-[12px] text-muted">
                Also{" "}
                <Link href="/book/hotels" className="text-[#F97211] hover:underline">
                  search hotels
                </Link>{" "}
                (stub inventory) · Prefer chat?{" "}
                <Link href="/ai" className="text-[#F97211] hover:underline">
                  AI trip planner
                </Link>
              </p>
            </div>
          </section>
        )}

        {/* RESULTS */}
        {step === "results" && (
          <BookFlightResults
            flights={flights}
            totalOffers={totalOffers}
            search={{
              origin,
              destination,
              departDate,
              returnDate,
              tripType,
              adults,
              children,
              cabin,
            }}
            onSelect={onSelectOffer}
            onModifySearch={() => setStep("search")}
            onSearch={(s: SearchSummary) => doSearch(s)}
            onOpenVero={() => router.push("/ai")}
            pending={pending}
            liteReady={!!health?.configured?.liteapi}
            message={message}
          />
        )}

        {/* DETAIL */}
        {step === "detail" && selected && (
          <section className="rounded-[24px] border border-[#E8EDF2] bg-white p-6 shadow-soft md:p-8">
            <h2 className="text-[22px] font-black text-navy">Fare details</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-[16px] bg-[#F8F9FA] p-4">
                <p className="font-bold text-navy">
                  {selected.airline} {selected.flight_number}
                </p>
                <p className="mt-2 text-[14px]">
                  {selected.origin} {selected.depart_time} →{" "}
                  {selected.destination} {selected.arrive_time}
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  {selected.duration} ·{" "}
                  {selected.stops === 0 ? "Non-stop" : `${selected.stops} stop(s)`}
                </p>
                <p className="mt-1 text-[13px] text-muted">
                  Cabin: {selected.cabin || cabin}
                  {selected.baggage ? ` · Baggage: ${selected.baggage}` : " · Check airline baggage rules at payment"}
                </p>
              </div>
              <div className="rounded-[16px] border border-[#FFE1CB] bg-[#FEFAF4] p-4">
                <p className="text-[13px] text-muted">Total for {adults} adult(s)</p>
                <p className="text-[32px] font-black text-[#F97211]">
                  {inr(selected.price * adults, selected.currency)}
                </p>
                <button
                  type="button"
                  className="btn-primary mt-4 w-full py-3 text-[14px] font-bold"
                  onClick={() => setStep("traveler")}
                >
                  Continue to travellers
                </button>
                <button
                  type="button"
                  className="mt-2 w-full text-[13px] font-semibold text-[#F97211]"
                  onClick={() => setStep("results")}
                >
                  ← Back to results
                </button>
              </div>
            </div>
          </section>
        )}

        {/* TRAVELER */}
        {step === "traveler" && (
          <section className="rounded-[24px] border border-[#E8EDF2] bg-white p-6 shadow-soft md:p-8">
            <h2 className="text-[22px] font-black text-navy">Traveller details</h2>
            <p className="mt-1 text-[13px] text-muted">
              Same passenger fields Travel_Agent / LiteAPI prebook expects.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["first_name", "First name"],
                  ["last_name", "Last name"],
                  ["birthday", "Date of birth", "date"],
                  ["document_number", "Passport / ID number"],
                  ["document_expiry", "Document expiry", "date"],
                  ["email", "Email", "email"],
                  ["phone", "Mobile (10 digit)"],
                ] as const
              ).map(([key, label, type]) => (
                <Field key={key} label={label}>
                  <input
                    className="field"
                    type={type || "text"}
                    value={traveler[key]}
                    onChange={(e) =>
                      setTraveler({ ...traveler, [key]: e.target.value })
                    }
                  />
                </Field>
              ))}
              <Field label="Gender">
                <select
                  className="field"
                  value={traveler.gender}
                  onChange={(e) =>
                    setTraveler({ ...traveler, gender: e.target.value })
                  }
                >
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </Field>
              <Field label="Nationality (ISO)">
                <input
                  className="field"
                  value={traveler.nationality}
                  maxLength={2}
                  onChange={(e) =>
                    setTraveler({
                      ...traveler,
                      nationality: e.target.value.toUpperCase(),
                    })
                  }
                />
              </Field>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                className="btn-primary px-8 py-3 text-[14px] font-bold"
                onClick={submitTravelers}
              >
                Continue to review
              </button>
              <button
                type="button"
                className="text-[13px] font-semibold text-[#F97211]"
                onClick={() => setStep("detail")}
              >
                ← Back
              </button>
            </div>
          </section>
        )}

        {/* REVIEW */}
        {step === "review" && selected && (
          <section className="rounded-[24px] border border-[#E8EDF2] bg-white p-6 shadow-soft md:p-8">
            <h2 className="text-[22px] font-black text-navy">Review booking</h2>
            <dl className="mt-4 space-y-3 text-[14px]">
              <Row
                k="Flight"
                v={`${selected.airline} ${selected.flight_number || ""} · ${selected.origin}→${selected.destination}`}
              />
              <Row
                k="Traveller"
                v={`${traveler.first_name} ${traveler.last_name}`}
              />
              <Row k="Contact" v={traveler.email} />
              <Row
                k="Amount"
                v={inr(selected.price * adults, selected.currency)}
              />
              <Row k="Session" v={sessionId || "-"} />
            </dl>
            <button
              type="button"
              disabled={pending}
              className="btn-primary mt-6 w-full py-3.5 text-[15px] font-bold disabled:opacity-50"
              onClick={doPrebook}
            >
              {pending ? "Creating LiteAPI hold…" : "Hold fare & continue to pay"}
            </button>
            <button
              type="button"
              className="mt-3 text-[13px] font-semibold text-[#F97211]"
              onClick={() => setStep("traveler")}
            >
              ← Edit travellers
            </button>
          </section>
        )}

        {/* PAY */}
        {step === "pay" && selected && (
          <section className="rounded-[24px] border border-[#FFE1CB] bg-[#FEFAF4] p-6 md:p-8">
            <h2 className="text-[22px] font-black text-navy">Payment</h2>
            <p className="mt-2 text-[14px] text-muted">
              LiteAPI Payment SDK path (`LITEAPI_USE_PAYMENT_SDK=true`). Card UI
              mounts when LiteAPI returns a publishable key on prebook - we never
              store card data in this app.
            </p>
            <div className="mt-4 rounded-[16px] bg-white p-4 text-[14px]">
              <Row
                k="Amount due"
                v={inr(
                  Number(prebookInfo?.price ?? selected.price * adults),
                  String(prebookInfo?.currency || selected.currency)
                )}
              />
              <Row k="Prebook ID" v={prebookInfo?.prebook_id || "(pending)"} />
              <Row
                k="Publishable key"
                v={
                  prebookInfo?.publishable_key
                    ? `${String(prebookInfo.publishable_key).slice(0, 8)}…`
                    : "Not returned yet - complete in sandbox / enable SDK keys"
                }
              />
            </div>
            {prebookInfo?.message && (
              <p className="mt-3 text-[13px] text-muted">{prebookInfo.message}</p>
            )}
            <button
              type="button"
              className="btn-primary mt-6 w-full py-3.5 text-[15px] font-bold"
              onClick={() => setStep("done")}
            >
              Confirm booking (demo complete)
            </button>
          </section>
        )}

        {/* DONE */}
        {step === "done" && (
          <section className="rounded-[24px] bg-white p-10 text-center shadow-soft">
            <p className="text-[14px] font-semibold uppercase tracking-wide text-[#F97211]">
              Confirmed
            </p>
            <h2 className="mt-2 text-[32px] font-black text-navy">
              You&apos;re all set
            </h2>
            <p className="mt-2 text-muted">
              {traveler.first_name}, your {selected?.airline} trip{" "}
              {origin}→{destination} is held in session{" "}
              <span className="font-mono text-[12px]">{sessionId}</span>.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                className="btn-primary px-6 py-3 text-[14px] font-bold"
                onClick={() => {
                  setStep("search");
                  setSelected(null);
                  setFlights([]);
                  setPrebookInfo(null);
                }}
              >
                Book another
              </button>
              <Link
                href="/ai"
                className="rounded-[50px] border border-[#E8EDF2] px-6 py-3 text-[14px] font-semibold"
              >
                Continue in AI chat
              </Link>
            </div>
          </section>
        )}
      </main>

      <style jsx global>{`
        .field {
          width: 100%;
          border-radius: 14px;
          border: 1px solid #e8edf2;
          background: #f8f9fa;
          padding: 0.75rem 1rem;
          font-size: 15px;
          outline: none;
        }
        .field:focus {
          border-color: #f97316;
          box-shadow: 0 0 0 1px #f97316;
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[#E8EDF2] py-2 last:border-0">
      <dt className="text-muted">{k}</dt>
      <dd className="text-right font-semibold text-navy">{v}</dd>
    </div>
  );
}
