import Link from "next/link";
import { AuthControls } from "@/components/AuthControls";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[#E8EDF2]/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-3 md:px-[53px]">
        <Link href="/" className="flex items-center gap-2">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-[12px] text-lg font-black text-white"
            style={{ background: "var(--gradient-primary)" }}
          >
            i
          </span>
          <span className="text-[20px] font-black tracking-tight text-navy">
            Itinero
          </span>
        </Link>
        <nav className="hidden items-center gap-6 text-[14px] font-medium text-[#637588] md:flex">
          <Link href="/book" className="hover:text-[#F97211]">
            Flights
          </Link>
          <Link href="/book/hotels" className="hover:text-[#F97211]">
            Hotels
          </Link>
          <Link href="/ai" className="hover:text-[#F97211]">
            Plan with AI
          </Link>
          <Link href="/account" className="hover:text-[#F97211]">
            Account
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/book"
            className="hidden rounded-[50px] border border-[#E8EDF2] px-4 py-2 text-[13px] font-semibold text-navy hover:border-[#F97211] sm:inline-flex"
          >
            Manual book
          </Link>
          <Link href="/ai" className="btn-primary hidden px-4 py-2 text-[13px] font-bold sm:inline-flex">
            AI trip
          </Link>
          <AuthControls />
        </div>
      </div>
    </header>
  );
}
