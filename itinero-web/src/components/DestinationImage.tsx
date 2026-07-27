"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { UnsplashPhoto } from "@/app/api/unsplash/route";

type Props = {
  query: string;
  fallbackSrc: string;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  showCredit?: boolean;
  fill?: boolean;
};

export function DestinationImage({
  query,
  fallbackSrc,
  alt,
  className,
  sizes = "300px",
  priority,
  showCredit = true,
  fill = true,
}: Props) {
  const [photo, setPhoto] = useState<UnsplashPhoto | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/unsplash?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (!cancelled && data?.photo) setPhoto(data.photo as UnsplashPhoto);
      } catch {
        if (!cancelled) {
          setPhoto({
            id: "local",
            url: fallbackSrc,
            thumb: fallbackSrc,
            alt,
            photographer: "Itinero",
            photographerUrl: "/",
            unsplashUrl: "https://unsplash.com",
            query,
            source: "fallback",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, fallbackSrc, alt]);

  const src = photo?.url || fallbackSrc;
  const isRemote = src.startsWith("http");

  return (
    <div className={`relative overflow-hidden ${className || ""}`}>
      {fill ? (
        <Image
          src={src}
          alt={photo?.alt || alt}
          fill
          priority={priority}
          className="object-cover"
          sizes={sizes}
          unoptimized={!isRemote}
        />
      ) : (
        <Image
          src={src}
          alt={photo?.alt || alt}
          width={1200}
          height={800}
          priority={priority}
          className="h-full w-full object-cover"
          sizes={sizes}
          unoptimized={!isRemote}
        />
      )}
      {showCredit && photo?.source === "unsplash" && (
        <p className="absolute bottom-2 left-2 z-10 rounded bg-black/50 px-2 py-0.5 text-[10px] text-white/90 backdrop-blur-sm">
          Photo by{" "}
          <a
            href={photo.photographerUrl}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-white"
          >
            {photo.photographer}
          </a>{" "}
          on{" "}
          <a
            href={photo.unsplashUrl}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-white"
          >
            Unsplash
          </a>
        </p>
      )}
    </div>
  );
}
