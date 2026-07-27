import Link from "next/link";

export function SiteFooter() {
  return (
    <footer
      className="text-white"
      style={{ background: "var(--gradient-footer)" }}
    >
      <div className="mx-auto max-w-[1280px] px-4 py-12 md:px-[53px]">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          <div className="max-w-md">
            <p className="text-[22px] font-black">Itinero</p>
            <p className="mt-3 text-[14px] leading-relaxed text-white/70">
              Itinero Travels Private Limited is your intelligent travel
              companion. Discover unbeatable global deals, smart routing, and
              seamless booking all powered by advanced AI. Travel smarter,
              everywhere.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-8 text-[14px]">
            <div>
              <p className="mb-3 font-semibold text-white">Product</p>
              <ul className="space-y-2 text-white/65">
                <li>
                  <Link href="/book" className="hover:text-[#F97211]">
                    Manual booking
                  </Link>
                </li>
                <li>
                  <Link href="/ai" className="hover:text-[#F97211]">
                    AI supervisor
                  </Link>
                </li>
                <li>
                  <Link href="/ai?panel=itinerary" className="hover:text-[#F97211]">
                    Itineraries
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="mb-3 font-semibold text-white">Support</p>
              <ul className="space-y-2 text-white/65">
                <li>Easy Booking</li>
                <li>Fast & Secure</li>
                <li>24/7 Support</li>
              </ul>
            </div>
          </div>
        </div>
        <p className="mt-10 border-t border-white/10 pt-6 text-[12px] text-white/50">
          © {new Date().getFullYear()} Itinero Travels Private Limited. All
          rights reserved. Homepage visual language adapted from{" "}
          <a
            href="https://pixano.in/itinero/"
            className="underline hover:text-white"
            target="_blank"
            rel="noreferrer"
          >
            pixano.in/itinero
          </a>
          .
        </p>
      </div>
    </footer>
  );
}
