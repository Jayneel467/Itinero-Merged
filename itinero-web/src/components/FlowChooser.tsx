import Link from "next/link";

/** Two clear entry points — Manual vs AI — without mixing UXs. */
export function FlowChooser() {
  return (
    <div
      className="animate-slide-up mt-8 grid max-w-[720px] gap-3 sm:grid-cols-2"
      style={{ animationDelay: "200ms" }}
    >
      <Link
        href="/book"
        className="group rounded-[20px] border border-white/25 bg-white/10 p-5 backdrop-blur-sm transition hover:bg-white/18"
      >
        <p className="text-[12px] font-semibold uppercase tracking-wide text-[#FFA755]">
          Manual booking
        </p>
        <p className="mt-1 text-[18px] font-bold text-white">
          You drive every step
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-white/75">
          Search → results → details → checkout. Classic forms for flights &
          hotels.
        </p>
        <span className="mt-4 inline-flex text-[13px] font-bold text-white group-hover:underline">
          Start booking →
        </span>
      </Link>
      <Link
        href="/ai"
        className="group rounded-[20px] border border-[#F97211]/50 bg-[#F97211]/20 p-5 backdrop-blur-sm transition hover:bg-[#F97211]/30"
      >
        <p className="text-[12px] font-semibold uppercase tracking-wide text-[#FFD5A8]">
          Complete AI flow
        </p>
        <p className="mt-1 text-[18px] font-bold text-white">
          Supervisor plans with you
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-white/75">
          Chat-first journey: research → flights → hotels → itinerary via
          specialist agents.
        </p>
        <span className="mt-4 inline-flex text-[13px] font-bold text-white group-hover:underline">
          Plan with AI →
        </span>
      </Link>
    </div>
  );
}
