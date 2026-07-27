"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { sendChat } from "@/lib/api";
import type {
  ChatMessage,
  FlightOffer,
  ItineraryData,
  OrchestratorOutput,
  Specialist,
} from "@/lib/types";
import { FlightResults } from "@/components/FlightResults";
import { ItineraryView } from "@/components/ItineraryView";
import { BookingPanel } from "@/components/BookingPanel";
import { AuthControls } from "@/components/AuthControls";

type UiMessage = ChatMessage & {
  specialist?: Specialist;
  mode?: string;
  error?: string | null;
};

const SUGGESTIONS = [
  "Where should I go this weekend?",
  "Weather in Goa next week",
  "Mumbai to Delhi on 26 July",
  "Plan a 5-day trip to Surat",
  "Where to eat in Surat — I'm veg",
];

export default function AiPage() {
  const userId: string | null = null;
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      role: "assistant",
      content:
        "Hey — I'm Itinero. Tell me where you want to go, a flight you need, or just bounce trip ideas. I'll plan with you.",
      specialist: "supervisor",
    },
  ]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionContext, setSessionContext] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [flights, setFlights] = useState<FlightOffer[]>([]);
  const [itinerary, setItinerary] = useState<ItineraryData | null>(null);
  const [bookingReady, setBookingReady] = useState(false);
  const [paymentReady, setPaymentReady] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panel, setPanel] = useState<"flights" | "itinerary" | "booking">(
    "flights"
  );
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasSideContent =
    flights.length > 0 || !!itinerary || bookingReady || paymentReady;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  function applyOutput(out: OrchestratorOutput) {
    setSessionId(out.session_id);
    if (out.session_context) setSessionContext(out.session_context);

    if (out.flights?.length) {
      setFlights(out.flights as FlightOffer[]);
      setPanel("flights");
      setPanelOpen(true);
    }
    if (out.itinerary) {
      setItinerary(out.itinerary);
      setPanel("itinerary");
      setPanelOpen(true);
    }
    if (out.booking_ready || out.payment_ready) {
      setBookingReady(!!out.booking_ready);
      setPaymentReady(!!out.payment_ready);
      setPanel("booking");
      setPanelOpen(true);
    }
  }

  function onSend(text?: string) {
    const message = (text ?? input).trim();
    if (!message || pending) return;
    setInput("");
    setStatusHint("Planning…");
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: "user", content: message }]);

    startTransition(async () => {
      const out = await sendChat({
        message,
        session_id: sessionId,
        session_context: sessionContext,
        history,
        user_id: userId,
      });
      applyOutput(out);
      setStatusHint(null);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: out.response,
          specialist: out.active_specialist,
          mode: out.mode,
          error: out.error,
        },
      ]);
    });
  }

  return (
    <div className="ai-shell relative flex h-[100dvh] flex-col overflow-hidden">
      <div className="ai-shell__glow pointer-events-none absolute inset-0" aria-hidden />

      <header className="relative z-10 flex shrink-0 items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <Link
          href="/"
          className="font-[family-name:var(--font-itinero)] text-[1.35rem] font-black tracking-tight text-[#0c1f33]"
        >
          Itinero
        </Link>
        <div className="flex items-center gap-3">
          {hasSideContent && (
            <button
              type="button"
              onClick={() => setPanelOpen((v) => !v)}
              className="hidden rounded-full border border-[#d7e0ea]/60 bg-white/50 px-3 py-1.5 text-[12px] font-medium text-[#49607e] backdrop-blur-sm transition hover:border-[#F97211]/50 hover:text-[#0c1f33] lg:inline-flex"
            >
              {panelOpen ? "Hide results" : "Show results"}
            </button>
          )}
          <Link
            href="/book"
            className="text-[12px] font-medium text-[#7a8fa3] transition hover:text-[#F97211]"
          >
            Manual booking
          </Link>
          <AuthControls compact />
        </div>
      </header>

      <div className="relative z-10 mx-auto flex min-h-0 w-full flex-1">
        <section
          className={`flex min-h-0 flex-1 flex-col transition-[max-width] duration-500 ease-out ${
            panelOpen && hasSideContent ? "lg:max-w-[calc(100%-420px)]" : "max-w-full"
          }`}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-6">
            <div
              className={`mx-auto flex flex-col gap-5 pt-2 transition-all duration-500 ${
                panelOpen && hasSideContent ? "max-w-[640px]" : "max-w-[720px]"
              }`}
            >
              {messages.length <= 1 && !pending && (
                <div className="ai-hero animate-fade-in py-10 text-center sm:py-16">
                  <p className="mb-3 text-[13px] font-medium uppercase tracking-[0.18em] text-[#8aa0b4]">
                    Your trip companion
                  </p>
                  <h1 className="ai-hero__title text-[2.15rem] font-semibold leading-[1.15] tracking-tight text-[#0c1f33] sm:text-[2.75rem]">
                    Where to next?
                  </h1>
                  <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-[#5a7189]">
                    Flights, weather, food, or a full plan — just say it in your own words.
                  </p>
                </div>
              )}

              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`animate-slide-up flex ${
                    m.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[min(92%,560px)] px-4 py-3.5 text-[15px] leading-[1.65] sm:px-5 ${
                      m.role === "user"
                        ? "rounded-[22px] rounded-br-[8px] bg-[#0c1f33] text-white shadow-[0_8px_28px_rgba(12,31,51,0.18)]"
                        : "rounded-[22px] rounded-bl-[8px] border border-white/70 bg-white/75 text-[#1a2b3c] shadow-[0_10px_40px_rgba(12,31,51,0.06)] backdrop-blur-md"
                    }`}
                  >
                    <div
                      className="prose-itinero whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{
                        __html: formatLiteMarkdown(m.content),
                      }}
                    />
                  </div>
                </div>
              ))}

              {(pending || statusHint) && (
                <div className="flex items-center gap-2 pl-1 text-[13px] text-[#7a8fa3]">
                  <span className="ai-pulse inline-block h-1.5 w-1.5 rounded-full bg-[#F97211]" />
                  {statusHint || "Planning…"}
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          <div className="shrink-0 px-4 pb-5 pt-2 sm:px-6 sm:pb-7">
            <div
              className={`mx-auto transition-all duration-500 ${
                panelOpen && hasSideContent ? "max-w-[640px]" : "max-w-[720px]"
              }`}
            >
              {messages.length <= 2 && (
                <div className="mb-3 flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => onSend(q)}
                      disabled={pending}
                      className="rounded-full border border-[#cfdcea]/80 bg-white/60 px-3.5 py-1.5 text-[12.5px] text-[#3d556c] shadow-[0_2px_12px_rgba(12,31,51,0.04)] backdrop-blur-sm transition hover:border-[#F97211]/45 hover:bg-white hover:text-[#0c1f33] disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              <form
                className="flex items-center gap-2 rounded-[28px] border border-white/80 bg-white/80 p-1.5 shadow-[0_16px_48px_rgba(12,31,51,0.08)] backdrop-blur-xl"
                onSubmit={(e) => {
                  e.preventDefault();
                  onSend();
                }}
              >
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask anything about your trip…"
                  className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[15px] text-[#0c1f33] outline-none placeholder:text-[#9aadc0]"
                />
                <button
                  type="submit"
                  disabled={pending || !input.trim()}
                  className="shrink-0 rounded-full bg-[#F97211] px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_6px_20px_rgba(249,114,17,0.35)] transition hover:bg-[#e5670f] disabled:opacity-40"
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        </section>

        {/* Side panel — only when there are real results */}
        {hasSideContent && panelOpen && (
          <aside className="animate-fade-in hidden w-[420px] shrink-0 flex-col border-l border-[#d7e0ea]/50 bg-white/55 backdrop-blur-xl lg:flex">
            <div className="flex items-center gap-1 border-b border-[#d7e0ea]/60 px-3 py-2">
              {(
                [
                  ["flights", "Flights", flights.length > 0],
                  ["itinerary", "Itinerary", !!itinerary],
                  ["booking", "Booking", bookingReady || paymentReady],
                ] as const
              )
                .filter(([, , show]) => show)
                .map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPanel(id)}
                    className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
                      panel === id
                        ? "bg-[#0c1f33] text-white"
                        : "text-[#637588] hover:bg-white/70"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="ml-auto text-[12px] text-[#8aa0b4] hover:text-[#0c1f33]"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {panel === "flights" && flights.length > 0 && (
                <FlightResults
                  flights={flights}
                  onSelect={(f) =>
                    onSend(
                      `Select flight ${f.airline} ${f.flight_number || f.id}`
                    )
                  }
                />
              )}
              {panel === "itinerary" && itinerary && (
                <ItineraryView data={itinerary} />
              )}
              {panel === "booking" && (
                <BookingPanel
                  bookingReady={bookingReady}
                  paymentReady={paymentReady}
                  onConfirm={() => onSend("Yes, confirm booking")}
                  onPay={() => onSend("Pay now")}
                />
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Mobile results sheet */}
      {hasSideContent && (
        <div className="relative z-10 border-t border-[#d7e0ea]/60 bg-white/80 px-4 py-2 backdrop-blur-md lg:hidden">
          <button
            type="button"
            onClick={() => setPanelOpen((v) => !v)}
            className="w-full rounded-full bg-[#0c1f33] py-2.5 text-[13px] font-semibold text-white"
          >
            {panelOpen
              ? "Back to chat"
              : flights.length
                ? `View ${flights.length} flights`
                : itinerary
                  ? "View itinerary"
                  : "View booking"}
          </button>
          {panelOpen && (
            <div className="mt-3 max-h-[45vh] overflow-y-auto pb-2">
              {flights.length > 0 && (
                <FlightResults
                  flights={flights}
                  onSelect={(f) =>
                    onSend(
                      `Select flight ${f.airline} ${f.flight_number || f.id}`
                    )
                  }
                />
              )}
              {itinerary && <ItineraryView data={itinerary} />}
              {(bookingReady || paymentReady) && (
                <BookingPanel
                  bookingReady={bookingReady}
                  paymentReady={paymentReady}
                  onConfirm={() => onSend("Yes, confirm booking")}
                  onPay={() => onSend("Pay now")}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatLiteMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br/>");
}
