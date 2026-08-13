"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GoogleMap, MarkerF, useJsApiLoader } from "@react-google-maps/api";

export type TripMapMarker = {
  lat: number;
  lng: number;
  label?: string;
};

type TripMapProps = {
  /** Explicit coordinates - preferred when available */
  markers?: TripMapMarker[];
  /** Geocode this place name when markers are empty */
  placeQuery?: string | null;
  className?: string;
  height?: number;
};

const DEFAULT_CENTER = { lat: 20.5937, lng: 78.9629 }; // India fallback

function hasValidCoords(m: TripMapMarker): boolean {
  return (
    Number.isFinite(m.lat) &&
    Number.isFinite(m.lng) &&
    Math.abs(m.lat) <= 90 &&
    Math.abs(m.lng) <= 180
  );
}

/**
 * Client-only Google Map. Hides itself when the key is missing or load fails.
 * Does not throw - safe for App Router pages.
 */
export function TripMap(props: TripMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || "";
  if (!apiKey) return null;
  return <TripMapInner apiKey={apiKey} {...props} />;
}

function TripMapInner({
  apiKey,
  markers,
  placeQuery,
  className,
  height = 200,
}: TripMapProps & { apiKey: string }) {
  const [failed, setFailed] = useState(false);
  const [geocoded, setGeocoded] = useState<TripMapMarker[]>([]);

  const explicit = useMemo(
    () => (markers || []).filter(hasValidCoords),
    [markers]
  );
  const markersKey = useMemo(
    () => explicit.map((m) => `${m.lat},${m.lng}`).join("|"),
    [explicit]
  );

  const { isLoaded, loadError } = useJsApiLoader({
    id: "itinero-google-maps",
    googleMapsApiKey: apiKey,
  });

  useEffect(() => {
    setFailed(false);
    setGeocoded([]);
  }, [placeQuery, markersKey]);

  useEffect(() => {
    if (loadError) setFailed(true);
  }, [loadError]);

  useEffect(() => {
    if (!isLoaded || explicit.length > 0 || !placeQuery?.trim()) {
      return;
    }

    let cancelled = false;
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: placeQuery.trim() }, (results, status) => {
      if (cancelled) return;
      if (status === "OK" && results?.[0]?.geometry?.location) {
        const loc = results[0].geometry.location;
        setGeocoded([
          {
            lat: loc.lat(),
            lng: loc.lng(),
            label: placeQuery.trim(),
          },
        ]);
      } else {
        // ZERO_RESULTS / REQUEST_DENIED / etc. - hide map quietly
        setFailed(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, markersKey, placeQuery, explicit.length]);

  const points = explicit.length > 0 ? explicit : geocoded;

  const onMapLoadError = useCallback(() => setFailed(true), []);

  if (failed || loadError) return null;
  if (!isLoaded) {
    return (
      <div
        className={`animate-pulse rounded-[16px] bg-[#E8EDF2] ${className || ""}`}
        style={{ height }}
        aria-hidden
      />
    );
  }

  // Waiting on geocode with no explicit markers
  if (points.length === 0) {
    if (placeQuery?.trim()) {
      return (
        <div
          className={`animate-pulse rounded-[16px] bg-[#E8EDF2] ${className || ""}`}
          style={{ height }}
          aria-hidden
        />
      );
    }
    return null;
  }

  const center =
    points.length === 1
      ? { lat: points[0].lat, lng: points[0].lng }
      : DEFAULT_CENTER;

  return (
    <div
      className={`overflow-hidden rounded-[16px] border border-[#E8EDF2] ${className || ""}`}
      style={{ height }}
    >
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        center={center}
        zoom={points.length === 1 ? 11 : 5}
        onLoad={(map) => {
          try {
            if (points.length > 1) {
              const bounds = new google.maps.LatLngBounds();
              points.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
              map.fitBounds(bounds, 48);
            }
          } catch {
            onMapLoadError();
          }
        }}
        options={{
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
        }}
      >
        {points.map((p, i) => (
          <MarkerF
            key={`${p.lat}-${p.lng}-${i}`}
            position={{ lat: p.lat, lng: p.lng }}
            title={p.label}
            label={
              p.label && points.length > 1
                ? { text: String(i + 1), color: "white", fontSize: "11px" }
                : undefined
            }
          />
        ))}
      </GoogleMap>
    </div>
  );
}

/** Pull destination label from itinerary title / summary for geocoding. */
export function destinationFromItinerary(data: {
  title?: string;
  summary?: { cities?: string } | null;
}): string | null {
  const cities = data.summary?.cities?.trim();
  if (cities && cities.toLowerCase() !== "your destination") return cities;
  const m = data.title?.match(/^Trip to\s+(.+)$/i);
  if (m?.[1] && m[1].toLowerCase() !== "your destination") return m[1].trim();
  return null;
}

/** Collect lat/lng from day stops when the API provides them. */
export function markersFromItineraryDays(
  days: Array<{
    day: number;
    title: string;
    lat?: number | null;
    lng?: number | null;
    items?: Array<{
      activity: string;
      lat?: number | null;
      lng?: number | null;
    }>;
  }>
): TripMapMarker[] {
  const out: TripMapMarker[] = [];
  for (const day of days) {
    if (
      day.lat != null &&
      day.lng != null &&
      Number.isFinite(day.lat) &&
      Number.isFinite(day.lng)
    ) {
      out.push({ lat: day.lat, lng: day.lng, label: `Day ${day.day}` });
    }
    for (const item of day.items || []) {
      if (
        item.lat != null &&
        item.lng != null &&
        Number.isFinite(item.lat) &&
        Number.isFinite(item.lng)
      ) {
        out.push({
          lat: item.lat,
          lng: item.lng,
          label: item.activity.slice(0, 40),
        });
      }
    }
  }
  return out;
}
