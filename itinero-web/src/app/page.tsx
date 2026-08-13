import Link from "next/link";
import Image from "next/image";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { FlowChooser } from "@/components/FlowChooser";
import { HeroBackdrop } from "@/components/HeroBackdrop";
import { DestinationImage } from "@/components/DestinationImage";

const DESTINATIONS = [
  { name: "Bali", meta: "East Java, Indonesia", image: "/images/bali.png", query: "Bali Indonesia temple beach" },
  { name: "New York", meta: "John F. Kennedy", image: "/images/newYork.png", query: "New York City skyline" },
  { name: "Darjeeling", meta: "West Bengal, India", image: "/images/darjeeling.png", query: "Darjeeling Himalaya tea" },
  { name: "Japan", meta: "Tokyo & beyond", image: "/images/japan.png", query: "Japan Kyoto cherry blossom" },
];

const FEATURES = [
  {
    title: "Plan With AI",
    body: "Get instant answers to your travel questions and personalized recommendations.",
    image: "/images/planAi.png",
    href: "/ai",
  },
  {
    title: "Best Time to Travel",
    body: "Find the perfect time to travel and save more on flights and hotels.",
    image: "/images/bestTime.png",
    href: "/book",
  },
  {
    title: "Explore More",
    body: "Discover amazing destinations that fit your budget and travel style.",
    image: "/images/explore.png",
    href: "/book",
  },
  {
    title: "Trips Made Easy",
    body: "Keep all your bookings, itineraries and reminders in one place.",
    image: "/images/trips.png",
    href: "/ai",
  },
];

const REVIEWS = [
  {
    name: "Sophia Mitchell",
    place: "New York, USA",
    quote:
      "Itinero made our honeymoon absolutely perfect. Every detail was seamless & stress-free.",
    avatar: "/images/sophiaAvatar.png",
  },
  {
    name: "James Wilson",
    place: "Sydney, Australia",
    quote:
      "Highly recommend Itinero for anyone looking for a hassle-free vacation. Amazing!",
    avatar: "/images/jamesAvatar.png",
  },
  {
    name: "Elena Rodriguez",
    place: "Madrid, Spain",
    quote:
      "From booking to the entire journey everything was beyond expectations!",
    avatar: "/images/emilyAvatar.png",
  },
];

const DEALS = [
  { from: "AMD", to: "BOM", price: "₹3,499", label: "Ahmedabad → Mumbai" },
  { from: "BOM", to: "DEL", price: "₹4,510", label: "Mumbai → Delhi" },
  { from: "DEL", to: "BLR", price: "₹5,199", label: "Delhi → Bengaluru" },
  { from: "BLR", to: "GOI", price: "₹4,050", label: "Bengaluru → Goa" },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />

      {/* Hero - Pixano visual language: navy + orange, brand-first */}
      <section className="relative overflow-hidden min-h-[70vh]">
        <HeroBackdrop />
        <div className="relative mx-auto max-w-[1280px] px-4 pb-16 pt-10 md:px-[53px] md:pb-24 md:pt-[60px] 2xl:pt-[84px]">
          <p className="animate-slide-up text-[13px] font-semibold uppercase tracking-wide text-white/80 md:text-[14px]">
            Discover more
          </p>
          <h1
            className="animate-slide-up mt-2 max-w-[850px] text-[32px] font-black leading-[1.15] tracking-tight text-white sm:text-[44px] md:text-[50px] 2xl:text-[70px]"
            style={{ animationDelay: "80ms" }}
          >
            Where will you go next?
          </h1>
          <p
            className="animate-slide-up mt-4 max-w-[595px] text-[16px] leading-relaxed text-white/85 md:text-[18px] 2xl:text-[20px]"
            style={{ animationDelay: "160ms" }}
          >
            Find the best flights and unforgettable experiences - with AI that
            plans, or classic booking when you want full control.
          </p>

          <FlowChooser />

          {/* Mini search tease matching Pixano tabs */}
          <div
            className="animate-slide-up mt-10 max-w-[880px] rounded-[24px] border border-white/20 bg-white/95 p-4 shadow-[0px_19px_36px_#0000001f] backdrop-blur-sm md:rounded-[32px] md:p-6"
            style={{ animationDelay: "280ms" }}
          >
            <div className="mb-4 flex gap-2 overflow-x-auto">
              {["Flights", "Hotels", "Packages"].map((tab, i) => (
                <span
                  key={tab}
                  className={`rounded-[80px] px-4 py-2 text-[13px] font-semibold whitespace-nowrap md:text-[14px] ${
                    i === 0
                      ? "bg-orange-50 text-[#F97211]"
                      : "bg-[#F2F2F2] text-[#637588]"
                  }`}
                >
                  {tab}
                </span>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <div className="rounded-[14px] border border-[#E8EDF2] bg-[#F8F9FA] px-4 py-3">
                <p className="text-[11px] text-[#868686]">From</p>
                <p className="text-[15px] font-semibold text-[#111418]">Mumbai (BOM)</p>
              </div>
              <div className="rounded-[14px] border border-[#E8EDF2] bg-[#F8F9FA] px-4 py-3">
                <p className="text-[11px] text-[#868686]">To</p>
                <p className="text-[15px] font-semibold text-[#111418]">Delhi (DEL)</p>
              </div>
              <Link
                href="/book"
                className="btn-primary flex items-center justify-center px-8 py-3 text-[15px] font-bold"
              >
                Search
              </Link>
            </div>
            <p className="mt-3 text-[12px] text-[#637588]">
              Prefer conversation?{" "}
              <Link href="/ai" className="font-semibold text-[#F97211] hover:underline">
                Plan with AI →
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-[linear-gradient(180deg,#f5f7fa_0%,#fff_100%)] py-16 md:py-20">
        <div className="mx-auto max-w-[1280px] px-4 md:px-[53px]">
          <div className="mb-10 max-w-[595px]">
            <h2 className="text-[26px] font-bold text-navy md:text-[32px] 2xl:text-[40px]">
              Your Journey, Our Priority
            </h2>
            <p className="mt-2 text-muted md:text-[16px]">
              Experience smarter travel planning with powerful tools, curated
              options & expert support.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => (
              <Link
                key={f.title}
                href={f.href}
                className="group rounded-[24px] bg-white p-5 shadow-soft transition hover:-translate-y-1 hover:shadow-[0_20px_50px_#00000026]"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="relative mx-auto mb-4 h-[160px] w-full">
                  <Image
                    src={f.image}
                    alt={f.title}
                    fill
                    className="object-contain"
                    sizes="280px"
                  />
                </div>
                <h3 className="text-[18px] font-bold text-navy group-hover:text-[#F97211]">
                  {f.title}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">
                  {f.body}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Trending */}
      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-[1280px] px-4 md:px-[53px]">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-[26px] font-bold text-navy md:text-[32px]">
                Trending Destinations
              </h2>
              <p className="mt-1 text-muted">
                Most loved places by travelers around the world
              </p>
            </div>
            <Link
              href="/book"
              className="text-[14px] font-semibold text-[#F97211] hover:underline"
            >
              View All Destinations
            </Link>
          </div>
          <div className="flex gap-5 overflow-x-auto pb-4 [scrollbar-width:none]">
            {DESTINATIONS.map((d) => (
              <Link
                key={d.name}
                href={`/book?to=${encodeURIComponent(d.name)}`}
                className="group relative h-[276px] w-[273px] shrink-0 overflow-hidden rounded-[24px]"
              >
                <DestinationImage
                  query={d.query}
                  fallbackSrc={d.image}
                  alt={d.name}
                  className="absolute inset-0 transition duration-500 group-hover:scale-105"
                  sizes="273px"
                  showCredit={false}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                <div className="absolute bottom-0 z-10 p-5 text-white">
                  <p className="text-[22px] font-bold">{d.name}</p>
                  <p className="text-[13px] text-white/80">{d.meta}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Deals */}
      <section className="bg-[#FEFAF4] py-16 md:py-20">
        <div className="mx-auto max-w-[1280px] px-4 md:px-[53px]">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-[26px] font-bold text-navy md:text-[32px]">
                Flight Deals Today
              </h2>
              <p className="mt-1 text-muted">
                Grab the best flight deals before they&apos;re gone!
              </p>
            </div>
            <Link
              href="/book"
              className="text-[14px] font-semibold text-[#F97211] hover:underline"
            >
              View All Deals
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {DEALS.map((deal) => (
              <Link
                key={deal.label}
                href={`/book?from=${deal.from}&to=${deal.to}`}
                className="rounded-[20px] border border-[#FFE1CB] bg-white p-5 transition hover:-translate-y-1 hover:shadow-md"
              >
                <p className="text-[13px] text-muted">{deal.label}</p>
                <p className="mt-2 text-[28px] font-black text-navy">
                  {deal.price}
                </p>
                <p className="mt-1 text-[12px] font-semibold text-[#F97211]">
                  Book manually →
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Reviews */}
      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-[1280px] px-4 md:px-[53px]">
          <div className="mb-10 text-center">
            <h2 className="text-[26px] font-bold text-navy md:text-[32px]">
              Loved by Explorers
            </h2>
            <p className="mt-2 text-muted">
              Real stories from real travellers who explored the world with
              Itinero.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {REVIEWS.map((r) => (
              <article
                key={r.name}
                className="rounded-[24px] border border-[#E8EDF2] bg-white p-6 shadow-soft"
              >
                <div className="mb-4 flex items-center gap-3">
                  <div className="relative h-12 w-12 overflow-hidden rounded-full">
                    <Image src={r.avatar} alt={r.name} fill className="object-cover" />
                  </div>
                  <div>
                    <p className="font-semibold text-navy">{r.name}</p>
                    <p className="text-[13px] text-muted">{r.place}</p>
                  </div>
                </div>
                <p className="text-[15px] leading-relaxed text-[#4A4A4A]">
                  “{r.quote}”
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-4 pb-20 md:px-[53px]">
        <div
          className="mx-auto flex max-w-[1280px] flex-col items-start justify-between gap-6 overflow-hidden rounded-[30px] px-8 py-10 text-white md:flex-row md:items-center md:px-12"
          style={{ background: "var(--gradient-navy)" }}
        >
          <div>
            <h2 className="text-[26px] font-bold md:text-[32px]">
              Start your travel planning here
            </h2>
            <p className="mt-2 max-w-xl text-white/75">
              Search flights, hotels & more - or let the supervisor agent drive
              the whole journey.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/book" className="btn-primary px-6 py-3 text-[15px] font-bold">
              Book manually
            </Link>
            <Link
              href="/ai"
              className="rounded-[50px] border border-white/30 bg-white/10 px-6 py-3 text-[15px] font-bold backdrop-blur-sm transition hover:bg-white/20"
            >
              Plan with AI
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
