import React, { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useCurrency } from "@/context/CurrencyContext";
import { PlacesCarousel } from "@/components/shared";
import { usePlacesGallery } from "@/hooks/usePlacesPhoto";
import { destForPackage } from "@/features/packages/utils/packageIntel";
import styles from "./PackageCard.module.css";

function regionLabel(region) {
  return region === "international" ? "International" : "Domestic";
}

function packageCities(pkg, dest) {
  const anchors = Array.isArray(pkg?.requiredAnchors) ? pkg.requiredAnchors.filter(Boolean) : [];
  const dests = Array.isArray(pkg?.destinations) ? pkg.destinations.filter(Boolean) : [];
  const extra = [dest?.city, pkg?.stay?.city, pkg?.flight?.gatewayCity].filter(Boolean);
  const list = [...(anchors.length ? anchors : dests), ...extra];
  const seen = new Set();
  return list.filter((c) => {
    const k = String(c || "").trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 4);
}

function packageCountry(pkg, dest) {
  if (dest?.country) return dest.country;
  if (String(pkg?.region || "").toLowerCase() === "domestic") return "India";
  return "";
}

export default function PackageCard({ pkg, liveQuote, liveLoading }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { formatMoney } = useCurrency();
  const dest = useMemo(() => destForPackage(pkg), [pkg]);
  const cities = useMemo(() => packageCities(pkg, dest), [pkg, dest]);
  const catalogCover = dest?.image || "";
  const cover = String(pkg?.coverImage || "").trim() || catalogCover;
  const fallbacks = useMemo(
    () => [pkg?.coverImage, catalogCover, ...(pkg?.gallery || [])].filter(Boolean),
    [pkg, catalogCover]
  );
  const slides = usePlacesGallery({
    cities,
    country: packageCountry(pkg, dest),
    theme: pkg?.theme || (pkg?.themes || [])[0] || "",
    fallbacks,
    maxSlides: 5,
    enabled: Boolean(cities.length || cover),
  });
  if (!pkg) return null;

  const nights = pkg.durationNights;
  const destLabel = cities.slice(0, 4).join(" · ");
  const region = regionLabel(pkg.region);
  const stayTotal = liveQuote?.stayTotal;
  const hasLive = typeof stayTotal === "number" && stayTotal > 0;
  const liveNights = liveQuote?.nights || nights;
  const perNight = hasLive && liveNights ? Math.round(stayTotal / liveNights) : null;
  const durationLabel =
    pkg.durationLabel || (nights ? `${nights} nights` : "");
  const chips = [
    ...(pkg.highlights || []),
    ...(pkg.inclusions || []),
  ]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 3);
  const themeLabel = String(pkg.theme || (pkg.themes || [])[0] || "").replace(/_/g, " ");

  const open = () => {
    const qs = new URLSearchParams();
    ["checkIn", "checkOut", "guests"].forEach((k) => {
      const v = searchParams.get(k);
      if (v) qs.set(k, v);
    });
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    navigate(`/packages/${pkg.slug || pkg.id}${suffix}`);
  };

  return (
    <button type="button" className={styles.card} onClick={open}>
      <div className={styles.media}>
        <PlacesCarousel
          slides={slides}
          fallback={cover}
          alt={pkg.title || ""}
          autoMs={3400}
        />
        <div className={styles.mediaShade} aria-hidden />
        <span className={styles.region}>{region}</span>
        <div className={styles.mediaMeta}>
          {themeLabel ? <p className={styles.theme}>{themeLabel}</p> : null}
          <p className={styles.mediaNights}>
            {durationLabel}
            {durationLabel && destLabel ? " · " : ""}
            {destLabel}
          </p>
        </div>
      </div>
      <div className={styles.body}>
        <h3 className={styles.title}>{pkg.title}</h3>
        {pkg.overview || pkg.tagline ? (
          <p className={styles.overview}>{pkg.overview || pkg.tagline}</p>
        ) : null}
        {chips.length > 0 && (
          <ul className={styles.chips}>
            {chips.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        )}
        <p className={styles.months}>
          {pkg.idealMonths?.length ? `Best ${pkg.idealMonths.slice(0, 4).join(" · ")}` : ""}
          {pkg.difficulty ? `${pkg.idealMonths?.length ? " · " : ""}${pkg.difficulty}` : ""}
        </p>
        {(pkg.activityTags || []).length > 0 ? (
          <p className={styles.gearHint}>
            Gear & rentals · {(pkg.activityTags || []).slice(0, 3).join(" · ")}
          </p>
        ) : null}
      </div>
      <div className={styles.priceBar}>
        <div className={styles.priceCopy}>
          {liveLoading ? (
            <>
              <span className={styles.priceKicker}>Live stay</span>
              <strong className={styles.checking}>Checking live rates…</strong>
            </>
          ) : hasLive ? (
            <>
              <span className={styles.priceKicker}>
                {perNight
                  ? `Stays from ${formatMoney(perNight)}/night`
                  : `Live stay${liveNights ? ` · ${liveNights}N` : ""}`}
                {liveQuote.hotelName ? ` · ${liveQuote.hotelName}` : ""}
              </span>
              <strong className={styles.price}>{formatMoney(stayTotal)}</strong>
            </>
          ) : (
            <>
              <span className={styles.priceKicker}>Stay for your dates</span>
              <strong className={styles.seeLive}>See live rate</strong>
            </>
          )}
        </div>
        <span className={styles.cta}>View</span>
      </div>
    </button>
  );
}
