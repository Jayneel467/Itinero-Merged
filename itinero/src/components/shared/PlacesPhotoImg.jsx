import React, { useState } from "react";
import { placesPhotoProxyUrl, usePlacesPhoto } from "@/hooks/usePlacesPhoto";

/**
 * Drop-in <img> that prefers a same-origin Google Places landmark photo.
 */
export default function PlacesPhotoImg({
  city = "",
  country = "",
  query = "",
  fallback = "",
  alt = "",
  className,
  style,
  loading = "lazy",
  referrerPolicy,
  onError,
  enabled = true,
  ...rest
}) {
  const resolved = usePlacesPhoto({
    query,
    city,
    country,
    fallback,
    enabled: enabled && Boolean(city || query || country),
  });
  const [useFallback, setUseFallback] = useState(false);
  const proxy =
    enabled && (city || query || country)
      ? placesPhotoProxyUrl({ query, city, country })
      : "";
  const src = useFallback ? fallback || "" : resolved || proxy || fallback || "";

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      loading={loading}
      referrerPolicy={referrerPolicy || "no-referrer"}
      onError={(e) => {
        if (!useFallback && fallback && e.currentTarget.src !== fallback) {
          setUseFallback(true);
          e.currentTarget.src = fallback;
          return;
        }
        onError?.(e);
      }}
      {...rest}
    />
  );
}
