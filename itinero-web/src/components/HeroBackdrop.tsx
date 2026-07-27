"use client";

import { DestinationImage } from "@/components/DestinationImage";

/** Full-bleed hero photo with Unsplash + Pixano navy/orange overlay. */
export function HeroBackdrop({
  query = "japan travel mountains",
  fallbackSrc = "/images/japan.png",
}: {
  query?: string;
  fallbackSrc?: string;
}) {
  return (
    <>
      <DestinationImage
        query={query}
        fallbackSrc={fallbackSrc}
        alt="Discover travel with Itinero"
        className="absolute inset-0"
        sizes="100vw"
        priority
        showCredit
      />
      <div
        className="absolute inset-0"
        style={{ background: "var(--gradient-hero)" }}
      />
    </>
  );
}
