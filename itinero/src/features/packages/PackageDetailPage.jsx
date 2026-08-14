import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Ban,
  CalendarDays,
  Check,
  Coffee,
  FileText,
  Gauge,
  Info,
  MapPin,
  Plane,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { PageLayout } from "@/components/layout";
import { useCurrency } from "@/context/CurrencyContext";
import { useVeroUi } from "@/context/VeroUiContext";
import useAirportSuggest from "@/features/flights/hooks/useAirportSuggest";
import { buildPackageDetailPageContext } from "@/features/vero/utils/pageContext";
import { packageService } from "./services/packageService";
import { LoadingState, PlacesCarousel } from "@/components/shared";
import { usePlacesGallery } from "@/hooks/usePlacesPhoto";
import ItineraryDayMedia from "./components/ItineraryDayMedia";
import ItineraryPlaceRow from "./components/ItineraryPlaceRow";
import StayCard from "./components/StayCard";
import ActivityKit from "./components/ActivityKit";
import PackageTripHub from "./components/PackageTripHub";
import { intelForPackage } from "./utils/packageIntel";
import { formatEstimateRange, formatTransfer } from "./utils/itineraryFormat";
import { isSaved, onSavedChange, toggleSaved } from "@/features/account/savedService";
import styles from "./PackageDetailPage.module.css";

function isFlightExclusion(text) {
  return /\b(flight|flights|airfare|airline)\b/i.test(String(text || ""));
}

function tipKind(text) {
  const t = String(text || "").toLowerCase();
  if (/visa|eta|passport|entry/.test(t)) return "docs";
  if (/yellow fever|malaria|vaccin|prophylaxis|health|medical/.test(t)) return "health";
  if (/airport|wilson|flight|hop|nbo|transfer/.test(t)) return "travel";
  return "note";
}

function knowIcon(idOrTitle) {
  const t = String(idOrTitle || "").toLowerCase();
  if (/passport/.test(t)) return FileText;
  if (/visa|eta/.test(t)) return ShieldCheck;
  if (/month|season|weather/.test(t)) return CalendarDays;
  if (/pace|difficulty/.test(t)) return Gauge;
  return Info;
}

function addDaysYmd(ymd, nights) {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + nights);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultCheckIn() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

function formatDisplayDate(ymd) {
  try {
    return new Date(`${ymd}T12:00:00`).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return ymd;
  }
}

function minsLabel(mins) {
  const n = Number(mins) || 0;
  if (!n) return null;
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "itinerary", label: "Itinerary" },
  { id: "stays", label: "Stays" },
  { id: "flights", label: "Flights" },
  { id: "info", label: "Important info" },
];

export default function PackageDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { formatMoney } = useCurrency();
  const { setPageContext, clearPageContext, setUiActionHandler, openVero } = useVeroUi();

  const [pkg, setPkg] = useState(null);
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState("");
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapStay, setSwapStay] = useState(null);
  const [altHotels, setAltHotels] = useState([]);
  const [swapLoading, setSwapLoading] = useState(false);
  const [flightSwapOpen, setFlightSwapOpen] = useState(false);
  const [altFlights, setAltFlights] = useState([]);
  const [flightSwapLoading, setFlightSwapLoading] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [itineraryNote, setItineraryNote] = useState("");
  const [tab, setTab] = useState("itinerary");
  const [selectedDay, setSelectedDay] = useState(null);
  const [dayPreview, setDayPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const savedId = `package:${slug || ""}`;
  const [saved, setSaved] = useState(() => isSaved(savedId));

  useEffect(() => {
    const sync = () => setSaved(isSaved(`package:${slug || ""}`));
    sync();
    return onSavedChange(sync);
  }, [slug]);

  const recDays = pkg?.recommendedDurationDays || [];
  const defaultNights = Math.max(
    1,
    Number(pkg?.durationNights) || (Number(recDays[0]) ? Number(recDays[0]) - 1 : 3)
  );
  const checkIn = searchParams.get("checkIn") || defaultCheckIn();
  const checkOut = searchParams.get("checkOut") || addDaysYmd(checkIn, defaultNights);
  const guests = Number(searchParams.get("guests") || 2);
  const hotelId = searchParams.get("hotelId") || "";
  const hotelIdsParam = searchParams.get("hotelIds") || "";
  const origin = (searchParams.get("origin") || "").toUpperCase().slice(0, 3);
  const flightOfferId = searchParams.get("flightOfferId") || "";
  const variant = searchParams.get("variant") || "";

  const [originOpen, setOriginOpen] = useState(false);
  const [originQuery, setOriginQuery] = useState("");
  const [originLabel, setOriginLabel] = useState("");
  const originWrapRef = useRef(null);

  const hotelIdsMap = useMemo(() => {
    if (!hotelIdsParam) return {};
    try {
      const parsed = JSON.parse(hotelIdsParam);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }, [hotelIdsParam]);

  const { airports: originSuggestions, isLoading: originSuggestLoading } =
    useAirportSuggest(originQuery, { enabled: originOpen });

  useEffect(() => {
    const onDoc = (e) => {
      if (originWrapRef.current && !originWrapRef.current.contains(e.target)) {
        setOriginOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await packageService.get(slug, {
        check_in: checkIn,
        check_out: checkOut,
        guests,
        origin: origin || undefined,
        variant: variant || undefined,
      });
      if (cancelled) return;
      if (!res.package) {
        setError(res.message || "Package not found");
        setLoading(false);
        return;
      }
      setPkg(res.package);
      setActiveImage(0);
      if (!searchParams.get("checkOut")) {
        const n = Math.max(1, Number(res.package.durationNights) || 3);
        const next = new URLSearchParams(searchParams);
        if (!searchParams.get("checkIn")) next.set("checkIn", checkIn);
        next.set("checkOut", addDaysYmd(searchParams.get("checkIn") || checkIn, n));
        setSearchParams(next, { replace: true });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // template load once per slug; dates refresh via quote
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const refreshQuote = useCallback(async () => {
    if (!slug) return;
    setQuoting(true);
    const res = await packageService.quote(slug, {
      check_in: checkIn,
      check_out: checkOut,
      guests,
      hotel_id: hotelId || undefined,
      hotel_ids: Object.keys(hotelIdsMap).length ? JSON.stringify(hotelIdsMap) : undefined,
      origin: origin || undefined,
      include_flights: true,
      flight_offer_id: flightOfferId || undefined,
      variant: variant || undefined,
      quote_mode: "full",
    });
    setQuote(res.quote || null);
    if (res.instance && res.package) {
      setPkg((prev) => ({
        ...(prev || res.package),
        ...res.package,
        itinerary: res.instance.days || res.package.itinerary,
        instance: res.instance,
      }));
    }
    const noStay = !(res.quote?.stays || []).some((s) => s.room) && !res.quote?.room;
    if (res.error && noStay) setError(res.message || "");
    else setError("");
    setQuoting(false);
  }, [slug, checkIn, checkOut, guests, hotelId, hotelIdsMap, origin, flightOfferId, variant]);

  useEffect(() => {
    if (!pkg) return;
    refreshQuote();
  }, [pkg?.id, refreshQuote]);

  const updateDates = useCallback(
    (patch) => {
      const next = new URLSearchParams(searchParams);
      Object.entries(patch).forEach(([k, v]) => {
        if (v == null || v === "") next.delete(k);
        else next.set(k, String(v));
      });
      setSearchParams(next);
    },
    [searchParams, setSearchParams]
  );

  const pickOrigin = (airport) => {
    const code = String(airport?.code || "").toUpperCase().slice(0, 3);
    if (!code) return;
    setOriginLabel(`${airport.city || code} (${code})`);
    setOriginQuery("");
    setOriginOpen(false);
    updateDates({ origin: code, flightOfferId: "" });
  };

  const clearOrigin = () => {
    setOriginLabel("");
    setOriginQuery("");
    updateDates({ origin: "", flightOfferId: "" });
  };

  const openSwap = async (stay = null) => {
    const target =
      stay ||
      quote?.stays?.[0] || {
        city: pkg?.stay?.city || pkg?.destinations?.[0],
        checkIn,
        checkOut,
      };
    setSwapStay(target);
    setSwapOpen(true);
    setSwapLoading(true);
    const res = await packageService.hotels(slug, {
      check_in: target.checkIn || checkIn,
      check_out: target.checkOut || checkOut,
      guests,
      city: target.city,
    });
    setAltHotels(Array.isArray(res.hotels) ? res.hotels : []);
    setSwapLoading(false);
  };

  const selectHotel = (id) => {
    const city = swapStay?.city;
    if (city) {
      updateDates({ hotelIds: JSON.stringify({ ...hotelIdsMap, [city]: id }), hotelId: "" });
    } else {
      updateDates({ hotelId: id });
    }
    setSwapOpen(false);
    setSwapStay(null);
  };

  const openFlightSwap = async () => {
    if (!origin) {
      setOriginOpen(true);
      setTab("flights");
      return;
    }
    setFlightSwapOpen(true);
    setFlightSwapLoading(true);
    const res = await packageService.flights(slug, {
      origin,
      check_in: checkIn,
      check_out: checkOut,
      guests,
      limit: 12,
    });
    setAltFlights(Array.isArray(res.flights) ? res.flights : []);
    setFlightSwapLoading(false);
  };

  const selectFlight = (offerId) => {
    if (!offerId) return;
    updateDates({ flightOfferId: offerId });
    setFlightSwapOpen(false);
  };

  const applyDayPatch = (dayNum, patch) => {
    setPkg((prev) => {
      if (!prev) return prev;
      const itinerary = (prev.itinerary || prev.instance?.days || []).map((d) => {
        if (Number(d.day) !== Number(dayNum)) return d;
        return {
          ...d,
          ...patch,
          title: patch.title != null ? String(patch.title) : d.title,
          description: patch.description != null ? String(patch.description) : d.description,
          narrative: patch.narrative != null ? String(patch.narrative) : d.narrative || d.description,
          activities: Array.isArray(patch.activities) ? patch.activities.map(String) : d.activities,
          stayCity: patch.stayCity != null ? String(patch.stayCity) : d.stayCity,
          meals: patch.meals != null ? patch.meals : d.meals,
          pace: patch.pace != null ? patch.pace : d.pace,
          flags: Array.isArray(patch.flags) ? patch.flags : d.flags,
          departAfter: patch.departAfter != null ? patch.departAfter : d.departAfter,
        };
      });
      return {
        ...prev,
        itinerary,
        instance: prev.instance ? { ...prev.instance, days: itinerary } : prev.instance,
      };
    });
    setItineraryNote(`Day ${dayNum} updated`);
    setSelectedDay(Number(dayNum));
    setTab("itinerary");
  };

  const openLightenPreview = async (dayNum) => {
    setSelectedDay(Number(dayNum));
    setTab("itinerary");
    setPreviewLoading(true);
    const res = await packageService.previewDay(slug, {
      day: dayNum,
      check_in: checkIn,
      check_out: checkOut,
      variant: variant || undefined,
    });
    setPreviewLoading(false);
    if (res?.ok && res.preview) setDayPreview(res.preview);
  };

  const applyVeroAction = useCallback(
    async (action) => {
      if (!action?.type) return { ok: false };
      if (action.type === "preview_lighten_day" || action.type === "lighten_day") {
        const dayNum = Number(action.day || 2);
        await openLightenPreview(dayNum);
        return { ok: true, message: `Preview for day ${dayNum}` };
      }
      if (action.type === "apply_itinerary_patch" && action.patch) {
        applyDayPatch(action.day || action.patch.day, action.patch);
        setDayPreview(null);
        return { ok: true, message: `Day ${action.day} applied` };
      }
      if (action.type === "patch_itinerary_day") {
        applyDayPatch(action.day, action);
        return { ok: true, message: `Day ${action.day} updated` };
      }
      if (action.type === "set_duration_days") {
        const days = Math.max(2, Number(action.days) || 10);
        updateDates({ checkOut: addDaysYmd(checkIn, days - 1), variant: "" });
        return { ok: true, message: `Dates extended to ${days} days` };
      }
      if (action.type === "set_plan_variant") {
        updateDates({ variant: action.variant || "do_dham" });
        return { ok: true, message: "Switched to the shorter two-dham plan" };
      }
      if (action.type === "set_origin") {
        const code = String(action.origin || "").toUpperCase().slice(0, 3);
        if (!/^[A-Z]{3}$/.test(code)) return { ok: false, message: "Need a 3-letter airport code." };
        setOriginLabel(code);
        updateDates({ origin: code, flightOfferId: "" });
        return { ok: true, message: `Origin set to ${code}` };
      }
      if (action.type === "set_flight_offer" && action.offerId) {
        updateDates({ flightOfferId: String(action.offerId) });
        return { ok: true, message: "Flight updated" };
      }
      if (action.type === "open_flight_swap") {
        await openFlightSwap();
        return { ok: true, message: "Opened flight options" };
      }
      if (action.type === "open_hotel_swap" || action.type === "propose_hotel_swap") {
        const city = action.city;
        const stay =
          (quote?.stays || []).find(
            (s) => String(s.city || "").toLowerCase() === String(city || "").toLowerCase()
          ) || null;
        await openSwap(stay);
        return { ok: true, message: city ? `Hotel swap · ${city}` : "Hotel swap opened" };
      }
      if (action.type === "select_day") {
        setSelectedDay(Number(action.day) || null);
        setTab("itinerary");
        return { ok: true };
      }
      return { ok: false };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [updateDates, quote, origin, checkIn, checkOut, guests, slug, variant]
  );

  useEffect(() => {
    setUiActionHandler(applyVeroAction);
    return () => setUiActionHandler(null);
  }, [applyVeroAction, setUiActionHandler]);

  const instance = pkg?.instance || quote?.instance || null;
  const days = instance?.days || pkg?.itinerary || [];
  const validation = quote?.validation || instance?.validation || null;
  const status = quote?.status || null;
  const pricing = quote?.pricing || null;

  useEffect(() => {
    if (!pkg) return;
    setPageContext(
      buildPackageDetailPageContext({
        pkg: { ...pkg, itinerary: days, instance },
        quote,
        checkIn,
        checkOut,
        guests,
        origin,
        flightOfferId,
        variant,
        selectedDay,
        path: `/packages/${pkg.slug || slug}`,
      })
    );
  }, [
    pkg,
    quote,
    days,
    instance,
    checkIn,
    checkOut,
    guests,
    origin,
    flightOfferId,
    variant,
    selectedDay,
    slug,
    setPageContext,
  ]);

  useEffect(() => () => clearPageContext(), [clearPageContext]);

  const packageCities = useMemo(() => {
    if (!pkg) return [];
    const anchors = (pkg.requiredAnchors || []).filter(Boolean);
    const dests = (pkg.destinations || []).filter(Boolean);
    return (anchors.length ? anchors : dests).slice(0, 4);
  }, [pkg]);
  const isDomesticPkg = String(pkg?.region || "").toLowerCase() === "domestic";
  const gallerySlides = usePlacesGallery({
    cities: packageCities,
    country: isDomesticPkg ? "India" : "",
    theme: pkg?.theme || (pkg?.themes || [])[0] || "",
    fallbacks: [pkg?.coverImage, ...(pkg?.gallery || [])].filter(Boolean),
    maxSlides: 6,
    enabled: Boolean(pkg && (packageCities.length || pkg.coverImage)),
  });
  const placesCover0 = gallerySlides[0] || pkg?.coverImage || "";

  const gallery = gallerySlides;

  if (loading) {
    return (
      <PageLayout>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
          <LoadingState
            variant="page"
            title="Building your package"
            message="Validating the circuit, then quoting live stays…"
            skeleton="package"
            count={3}
          />
        </div>
      </PageLayout>
    );
  }

  if (!pkg) {
    return (
      <PageLayout>
        <p className={styles.state}>{error || "Package not found."}</p>
      </PageLayout>
    );
  }

  const hotel = quote?.hotel;
  const room = quote?.room;
  const stayTotal = quote?.stayTotal;
  const flight = quote?.flight;
  const flightTotal = quote?.flightTotal;
  const quoteNights = quote?.nights || instance?.nights || defaultNights;
  const gateway =
    quote?.flightMeta?.gateway || quote?.package?.flightGateway || pkg?.flightGateway;
  const stays = quote?.stays?.length
    ? quote.stays
    : hotel
      ? [
          {
            id: "stay-0",
            city: hotel.city || pkg.destinations?.[0],
            nights: quoteNights,
            checkIn,
            checkOut,
            label: `${hotel.city || "Stay"} · ${quoteNights}N`,
            hotel,
            room,
            stayTotal,
          },
        ]
      : instance?.staySegments || [];

  const itineraryOk = validation?.ok !== false && status?.itinerary !== "INVALID";
  const canPay = Boolean(pricing?.canPay || quote?.canPay) && itineraryOk;
  const bookable = pricing?.bookableTotal ?? quote?.bookableTotal ?? null;
  const payNow = pricing?.payNow ?? quote?.payNow ?? null;
  const estLo = pricing?.estimatedTripMin ?? quote?.estimatedTripMin;
  const estHi = pricing?.estimatedTripMax ?? quote?.estimatedTripMax;
  const extraLo = pricing?.estimatedExtrasMin ?? quote?.estimatedExtrasMin;
  const extraHi = pricing?.estimatedExtrasMax ?? quote?.estimatedExtrasMax;
  const attention = status?.attention || [];
  const know = instance?.know || pkg.knowBeforeYouGo || [];
  const groundEstimates = instance?.estimates || null;
  const isDomestic = String(pkg.region || "").toLowerCase() === "domestic";
  const activityKit = pkg.activityKit || null;
  const { dest: intelDest, intel } = intelForPackage(pkg);

  const handleBook = () => {
    if (!canPay) return;
    navigate(`/packages/${pkg.slug || slug}/checkout`, {
      state: {
        package: { ...pkg, itinerary: days },
        quote,
        checkIn,
        checkOut,
        guests,
        origin: origin || undefined,
        stays,
        flight: flight || null,
      },
    });
  };

  const ctaLabel = !itineraryOk
    ? "Fix itinerary first"
    : !stayTotal
      ? "Fix availability"
      : attention.length
        ? "Complete package"
        : payNow
          ? `Pay now · ${formatMoney(payNow)}`
          : "Complete package";

  const inclusions = (() => {
    const base = [...(pkg.inclusions || [])];
    if (flight && flightTotal != null) {
      const label = `Return flights ${flight.origin} → ${flight.destination}`;
      if (!base.some((x) => /return flights/i.test(x))) base.unshift(label);
    }
    return base;
  })();

  const exclusions = (() => {
    const base = pkg.exclusions || [];
    if (flight && flightTotal != null) return base.filter((x) => !isFlightExclusion(x));
    return base;
  })();

  const durationLabel =
    pkg.durationLabel ||
    (recDays.length
      ? recDays[0] === recDays[recDays.length - 1]
        ? `${recDays[0]} days`
        : `${recDays[0]}-${recDays[recDays.length - 1]} days`
      : `${quoteNights + 1} days`);

  const statusDot = (s) => {
    if (s === "SELECTED" || s === "VALIDATED" || s === "AVAILABLE") return styles.ok;
    if (s === "INVALID" || s === "UNAVAILABLE") return styles.bad;
    return styles.warn;
  };

  return (
    <PageLayout>
      <div className={styles.page}>
        <div className={styles.topBar}>
          <Link to="/packages" className={styles.backLink}>
            <ArrowLeft size={16} /> Back to packages
          </Link>
          <div className={styles.topBarActions}>
            <button
              type="button"
              className={saved ? styles.saveBtnOn : styles.saveBtn}
              onClick={() => {
                const next = toggleSaved({
                  id: `package:${pkg?.slug || slug}`,
                  type: "package",
                  title: pkg?.title || "Package",
                  subtitle: (pkg?.destinations || []).slice(0, 3).join(" · ") || "Package",
                  url: `/packages/${pkg?.slug || slug}`,
                  image: pkg?.coverImage || "",
                });
                setSaved(Boolean(next));
              }}
            >
              {saved ? "Saved" : "Save"}
            </button>
            <button type="button" className={styles.veroBtn} onClick={() => openVero()}>
              Customize with Vero
            </button>
          </div>
        </div>

        <header className={styles.head}>
          <p className={styles.kicker}>
            {instance?.variant === "do_dham" ? "Dynamic package" : "Curated template"}
            {origin ? " · Your trip" : ""}
          </p>
          <h1 className={styles.pageTitle}>{instance?.instanceTitle || pkg.title}</h1>
          <p className={styles.headMeta}>
            <CalendarDays size={14} />
            {durationLabel}
            <span>·</span>
            {formatDisplayDate(checkIn)} → {formatDisplayDate(checkOut)}
            <span>·</span>
            <Users size={14} />
            {guests} traveler{guests === 1 ? "" : "s"}
            {(pkg.destinations || []).length ? (
              <>
                <span>·</span>
                <MapPin size={14} />
                {(pkg.requiredAnchors?.length
                  ? pkg.requiredAnchors
                  : pkg.destinations || []
                )
                  .slice(0, 4)
                  .join(" · ")}
              </>
            ) : null}
          </p>
        </header>

        {gallery[0] && (
          <div className={styles.heroStage}>
            <div className={styles.heroMain}>
              <PlacesCarousel
                slides={gallery}
                fallback={pkg.coverImage || ""}
                alt={pkg.title || ""}
                autoMs={4200}
                className={styles.heroCarousel}
              />
            </div>
            {gallery.length > 1 && (
              <div className={styles.heroSide}>
                {gallery.slice(1, 4).map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    className={styles.heroSideShot}
                    onClick={() => setActiveImage(i + 1)}
                  >
                    <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {validation && validation.ok === false && (
          <section className={styles.alert} role="status">
            <strong>This package is not ready to book</strong>
            {(validation.issues || [])
              .filter((i) => i.severity === "error")
              .map((i) => (
                <p key={i.code || i.message}>{i.message}</p>
              ))}
            {(validation.offers || []).length > 0 && (
              <div className={styles.alertActions}>
                {validation.offers.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className={styles.offerBtn}
                    onClick={() => {
                      if (o.action === "set_duration_days") {
                        updateDates({
                          checkOut: addDaysYmd(checkIn, Number(o.days) - 1),
                          variant: "",
                        });
                      } else if (o.action === "set_plan_variant") {
                        updateDates({ variant: o.variant || "do_dham" });
                      }
                    }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        <section className={styles.summaryStrip}>
          <div>
            <p className={styles.summaryKicker}>
              {status?.package === "READY_TO_BOOK"
                ? "Ready to book"
                : attention.length
                  ? `${attention.length} thing${attention.length === 1 ? "" : "s"} need${attention.length === 1 ? "s" : ""} attention`
                  : "Almost ready"}
            </p>
            <ul className={styles.statusList}>
              <li className={statusDot(status?.itinerary || validation?.status)}>
                Itinerary · {(status?.itinerary || validation?.status || "-").replace(/_/g, " ")}
              </li>
              <li className={statusDot(status?.hotel)}>
                Hotels ·{" "}
                {status?.hotelNightsTotal
                  ? `${status.hotelNightsOk || 0}/${status.hotelNightsTotal} nights`
                  : status?.hotel || "-"}
              </li>
              <li className={statusDot(status?.flight)}>
                Flight ·{" "}
                {origin
                  ? flight
                    ? `${flight.origin}→${flight.destination}`
                    : "searching"
                  : "origin required"}
              </li>
            </ul>
          </div>
          <div className={styles.summaryPrice}>
            {bookable ? (
              <>
                <span>Bookable now</span>
                <strong>{formatMoney(bookable)}</strong>
              </>
            ) : quoting ? (
              <span>Quoting stays…</span>
            ) : (
              <span>No bookable total yet</span>
            )}
            {estLo && estHi ? (
              <p className={styles.estLine}>
                Estimated trip {formatMoney(estLo)}
                {estHi !== estLo ? `-${formatMoney(estHi)}` : ""}
              </p>
            ) : null}
          </div>
        </section>

        <nav className={styles.tabs} aria-label="Package sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? styles.tabActive : styles.tab}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className={styles.layout}>
          <div className={styles.main}>
            {tab === "overview" && (
              <section className={styles.section}>
                <h2>About this trip</h2>
                {pkg.overview && <p className={styles.overview}>{pkg.overview}</p>}
                {pkg.highlights?.length > 0 && (
                  <ul className={styles.highlights}>
                    {pkg.highlights.map((h) => (
                      <li key={h}>
                        <Check size={16} />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {(pkg.routeConcept || pkg.requiredAnchors || []).length > 0 && (
                  <div className={styles.routeBlock}>
                    <h3>Route</h3>
                    <p>
                      {(pkg.routeConcept || pkg.requiredAnchors || []).join(" → ")}
                    </p>
                    {pkg.recommendedDurationDays?.length ? (
                      <p className={styles.sectionHint}>
                        Recommended{" "}
                        {pkg.recommendedDurationDays[0] === pkg.recommendedDurationDays.at(-1)
                          ? `${pkg.recommendedDurationDays[0]} days`
                          : `${pkg.recommendedDurationDays[0]}-${pkg.recommendedDurationDays.at(-1)} days`}
                        {pkg.minDurationDays ? ` · minimum ${pkg.minDurationDays} days for full circuit` : ""}
                      </p>
                    ) : null}
                  </div>
                )}
                <PackageTripHub
                  dest={intelDest}
                  intel={intel}
                  pkg={pkg}
                  origin={origin}
                  checkIn={checkIn}
                  checkOut={checkOut}
                  guests={guests}
                  isDomestic={isDomestic}
                  compact
                  onAskVero={(prompt) => openVero({ prompt, source: "package-hub" })}
                  onOpenInfo={() => setTab("info")}
                />
                <ActivityKit kit={activityKit} compact onOpenInfo={() => setTab("info")} />
                <div className={styles.split}>
                  <div className={styles.listCard}>
                    <h2>What’s included</h2>
                    <ul>
                      {inclusions.map((item) => (
                        <li key={item}>
                          <Check size={14} className={styles.inclIcon} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className={styles.listCard}>
                    <h2>Not included</h2>
                    <ul>
                      {exclusions.map((item) => (
                        <li key={item}>
                          <X size={14} className={styles.exclIcon} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            )}

            {tab === "itinerary" && (
              <section className={styles.section}>
                <h2>Day-by-day</h2>
                <p className={styles.sectionHint}>
                  Structured itinerary - Vero can lighten a day, then you apply it.
                  {itineraryNote ? ` · ${itineraryNote}` : ""}
                </p>
                <div className={styles.timeline}>
                  {days.map((day) => {
                    const mins = (day.transfers || []).reduce(
                      (s, t) => s + Number(t.estimated_duration_minutes || 0),
                      0
                    );
                    const active = Number(day.day) === Number(selectedDay);
                    return (
                      <article
                        key={day.day}
                        className={`${styles.day} ${active ? styles.dayActive : ""}`}
                        onClick={() => setSelectedDay(Number(day.day))}
                      >
                        <div className={styles.dayRail}>
                          <div className={styles.dayNum}>Day {day.day}</div>
                          <div className={styles.dayLine} aria-hidden="true" />
                        </div>
                        <div className={styles.dayBody}>
                          <div className={styles.dayHead}>
                            <h3>{day.title}</h3>
                            <button
                              type="button"
                              className={styles.linkBtn}
                              onClick={(e) => {
                                e.stopPropagation();
                                openLightenPreview(day.day);
                              }}
                            >
                              Make lighter
                            </button>
                          </div>
                          {day.date && (
                            <p className={styles.dayDate}>{formatDisplayDate(day.date)}</p>
                          )}
                          <div className={styles.dayContent}>
                            <ItineraryDayMedia
                              day={day}
                              country={isDomestic ? "India" : ""}
                              fallback={placesCover0 || pkg.coverImage || ""}
                            />
                            <div className={styles.dayCopy}>
                              <p className={styles.dayNarrative}>{day.narrative || day.description}</p>
                              {Array.isArray(day.activities) && day.activities.length > 0 && (
                                <ul className={styles.placeList}>
                                  {day.activities.map((a, ai) => (
                                    <ItineraryPlaceRow
                                      key={`a-${day.day}-${a}`}
                                      label={a}
                                      city={day.stayCity || day.destination || day.origin || ""}
                                      country={isDomestic ? "India" : ""}
                                      kind="activity"
                                      index={ai}
                                    />
                                  ))}
                                </ul>
                              )}
                              {Array.isArray(day.optionalActivities) &&
                                day.optionalActivities.length > 0 && (
                                  <div className={styles.optionalBlock}>
                                    <p className={styles.optionalLabel}>Optional add-ons</p>
                                    <ul className={styles.placeList}>
                                      {day.optionalActivities.map((a, ai) => (
                                        <ItineraryPlaceRow
                                          key={`o-${day.day}-${a}`}
                                          label={a}
                                          city={day.stayCity || day.destination || day.origin || ""}
                                          country={isDomestic ? "India" : ""}
                                          kind="activity"
                                          index={ai + 1}
                                        />
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              {Array.isArray(day.meals) && day.meals.length > 0 && (
                                <div className={styles.mealsBlock}>
                                  <p className={styles.optionalLabel}>Meals & food</p>
                                  <ul className={styles.mealsGrid}>
                                    {day.meals.map((m, mi) => (
                                      <ItineraryPlaceRow
                                        key={`m-${day.day}-${m}`}
                                        label={m}
                                        city={day.stayCity || day.destination || day.origin || ""}
                                        country={isDomestic ? "India" : ""}
                                        kind="meal"
                                        index={mi + Number(day.day || 0)}
                                      />
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {Array.isArray(day.transfers) && day.transfers.length > 0 && (
                                <div className={styles.transfersBlock}>
                                  <p className={styles.optionalLabel}>Transfers</p>
                                  <ul className={styles.transferList}>
                                    {day.transfers.map((t, ti) => (
                                      <li key={`t-${day.day}-${ti}`}>{formatTransfer(t)}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              <div className={styles.dayMeta}>
                                {day.origin && day.destination && day.origin !== day.destination && (
                                  <span>
                                    {day.origin} → {day.destination}
                                  </span>
                                )}
                                {mins ? <span>Road {minsLabel(mins)}</span> : null}
                                {day.stayCity && <span>Stay: {day.stayCity}</span>}
                                {day.pace && <span className={styles.pacePill}>{day.pace}</span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            {tab === "stays" && (
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <h2>{stays.length > 1 ? "Your stays" : "Your stay"}</h2>
                  {stays.length <= 1 && (
                    <button type="button" className={styles.linkBtn} onClick={() => openSwap()}>
                      Change hotel
                    </button>
                  )}
                </div>
                {stays.length > 1 ? (
                  <div className={styles.stayRoute} aria-label="Stay route">
                    {stays.map((seg, i) => (
                      <React.Fragment key={seg.id || `${seg.city}-${i}`}>
                        {i > 0 ? <span className={styles.stayRouteArrow} aria-hidden>→</span> : null}
                        <span className={styles.stayRouteStop}>
                          <em>{i + 1}</em>
                          {seg.city || "Stay"}
                          {seg.nights ? (
                            <small>
                              {seg.nights}N
                            </small>
                          ) : null}
                        </span>
                      </React.Fragment>
                    ))}
                  </div>
                ) : null}
                {quote?.multiStayNote && <p className={styles.sectionHint}>{quote.multiStayNote}</p>}
                {quoting && <p className={styles.muted}>Updating live stay quote…</p>}
                {stays.length > 0 ? (
                  <div className={styles.staysList}>
                    {stays.map((seg, i) => (
                      <StayCard
                        key={seg.id || `${seg.city}-${i}`}
                        seg={{
                          ...seg,
                          checkInLabel: formatDisplayDate(seg.checkIn),
                          checkOutLabel: formatDisplayDate(seg.checkOut),
                        }}
                        index={i}
                        total={stays.length}
                        coverFallback={pkg.coverImage || ""}
                        formatMoney={formatMoney}
                        onChange={(s) => openSwap(s)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className={styles.muted}>
                    {error || "No live hotel quote for these dates."}
                  </p>
                )}
              </section>
            )}

            {tab === "flights" && (
              <section className={styles.section}>
                <div className={styles.sectionHead}>
                  <h2>Your flight</h2>
                  {origin && (
                    <button type="button" className={styles.linkBtn} onClick={openFlightSwap}>
                      Find cheaper return
                    </button>
                  )}
                </div>
                {!origin && (
                  <p className={styles.sectionHint}>
                    Add origin in the trip rail to include return flights
                    {gateway?.airport ? ` to ${gateway.city || gateway.airport}` : ""}. The rest of
                    the package stays put.
                  </p>
                )}
                {origin && flight && (
                  <div className={styles.staysList}>
                    <div className={styles.stayCard}>
                      <div className={styles.flightStayIcon} aria-hidden>
                        <Plane size={28} />
                      </div>
                      <div className={styles.stayBody}>
                        <div className={styles.stayLabelRow}>
                          <span className={styles.stayCityPill}>
                            Return · {flight.origin} → {flight.destination}
                          </span>
                          <button type="button" className={styles.linkBtn} onClick={openFlightSwap}>
                            Change
                          </button>
                        </div>
                        <h3>
                          {flight.airline || "Airline"}
                          {flight.airlineCode ? ` · ${flight.airlineCode}` : ""}
                        </h3>
                        <p className={styles.muted}>
                          {formatDisplayDate(flight.departDate || checkIn)} →{" "}
                          {formatDisplayDate(flight.returnDate || checkOut)}
                          {flight.departTime ? ` · Depart ${flight.departTime}` : ""}
                        </p>
                        {flightTotal != null && (
                          <p className={styles.stayPrice}>
                            {formatMoney(flightTotal)} · return for {guests} traveller
                            {guests === 1 ? "" : "s"}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {origin && !flight && (
                  <p className={styles.muted}>
                    {quote?.flightMeta?.message || "No return flights for these dates."}
                  </p>
                )}
              </section>
            )}

            {tab === "info" && (
              <section className={styles.section} id="know">
                <div className={styles.sectionHead}>
                  <h2>Know before you go</h2>
                  {!isDomestic ? (
                    <button
                      type="button"
                      className={styles.linkBtn}
                      onClick={() =>
                        openVero({
                          prompt: `For my ${pkg.title || "trip"} to ${(pkg.destinations || []).join(" / ") || "this destination"}, check passport, visa/ETA, and health notes from official sources. Keep it practical - no brochure fluff.`,
                          source: "package-info",
                        })
                      }
                    >
                      <Sparkles size={14} aria-hidden /> Ask Vero
                    </button>
                  ) : null}
                </div>
                <p className={styles.sectionHint}>
                  Specific to this trip
                  {isDomestic ? " - no embassy or visa module on a domestic India circuit." : "."}{" "}
                  City intel, stays, flights, and gear stay on Itinero.
                </p>

                {gallerySlides.length ? (
                  <div className={styles.knowHero}>
                    <div className={styles.knowHeroMedia}>
                      <PlacesCarousel
                        slides={gallerySlides.slice(0, 4)}
                        fallback={pkg.coverImage || ""}
                        alt={(pkg.destinations || []).join(", ") || pkg.title || "Destination"}
                        autoMs={4200}
                        className={styles.knowHeroCarousel}
                      />
                    </div>
                    <div className={styles.knowHeroCopy}>
                      <p className={styles.knowHeroKicker}>On the ground</p>
                      <h3>
                        {(pkg.destinations || []).filter(Boolean).join(" · ") || pkg.title}
                      </h3>
                      <p>
                        {pkg.groupSizeHint
                          ? `Built for ${pkg.groupSizeHint.toLowerCase()}.`
                          : "Practical notes before you lock flights and hotels."}{" "}
                        {pkg.idealMonths?.length
                          ? `Best window: ${pkg.idealMonths.slice(0, 4).join(", ")}${
                              pkg.idealMonths.length > 4 ? "…" : ""
                            }.`
                          : ""}
                      </p>
                    </div>
                  </div>
                ) : null}

                <div className={styles.facts}>
                  {pkg.idealMonths?.length > 0 && (
                    <div className={styles.factCard}>
                      <span className={styles.factIcon} aria-hidden>
                        <CalendarDays size={16} />
                      </span>
                      <strong>Best months</strong>
                      <span>{pkg.idealMonths.join(", ")}</span>
                    </div>
                  )}
                  {pkg.difficulty && (
                    <div className={styles.factCard}>
                      <span className={styles.factIcon} aria-hidden>
                        <Gauge size={16} />
                      </span>
                      <strong>Pace</strong>
                      <span>{pkg.difficulty}</span>
                    </div>
                  )}
                  {know.map((m) => {
                    const Icon = knowIcon(m.id || m.title);
                    return (
                      <div key={m.id || m.title} className={styles.factCard}>
                        <span className={styles.factIcon} aria-hidden>
                          <Icon size={16} />
                        </span>
                        <strong>{m.title}</strong>
                        <span>{m.body}</span>
                      </div>
                    );
                  })}
                </div>

                {groundEstimates ? (
                  <div className={styles.groundBlock}>
                    <h3>Estimated on-ground costs</h3>
                    <p className={styles.sectionHint}>
                      Transfers, meals, and local entry - not charged at checkout. Plan separately.
                    </p>
                    <dl className={styles.groundGrid}>
                      {groundEstimates.transfers ? (
                        <>
                          <dt>Transfers</dt>
                          <dd>
                            {formatEstimateRange(
                              groundEstimates.transfers.min,
                              groundEstimates.transfers.max,
                              formatMoney
                            )}
                          </dd>
                        </>
                      ) : null}
                      {groundEstimates.meals ? (
                        <>
                          <dt>Meals</dt>
                          <dd>
                            {formatEstimateRange(
                              groundEstimates.meals.min,
                              groundEstimates.meals.max,
                              formatMoney
                            )}
                          </dd>
                        </>
                      ) : null}
                      {groundEstimates.darshan ? (
                        <>
                          <dt>Entry / darshan</dt>
                          <dd>
                            {formatEstimateRange(
                              groundEstimates.darshan.min,
                              groundEstimates.darshan.max,
                              formatMoney
                            )}
                          </dd>
                        </>
                      ) : null}
                      {groundEstimates.totalMin != null ? (
                        <>
                          <dt>Total estimate</dt>
                          <dd>
                            {formatEstimateRange(
                              groundEstimates.totalMin,
                              groundEstimates.totalMax,
                              formatMoney
                            )}
                          </dd>
                        </>
                      ) : null}
                    </dl>
                    {(groundEstimates.notes || []).map((n) => (
                      <p key={n} className={styles.groundNote}>
                        {n}
                      </p>
                    ))}
                  </div>
                ) : null}

                <PackageTripHub
                  dest={intelDest}
                  intel={intel}
                  pkg={pkg}
                  origin={origin}
                  checkIn={checkIn}
                  checkOut={checkOut}
                  guests={guests}
                  isDomestic={isDomestic}
                  onAskVero={(prompt) => openVero({ prompt, source: "package-hub" })}
                />

                <ActivityKit
                  kit={activityKit}
                  onAskVero={(prompt) => openVero({ prompt, source: "package-gear" })}
                />

                {(pkg.goodToKnow || []).length > 0 && isDomestic === false && (
                  <div className={styles.tipsBlock}>
                    <div className={styles.tipsHead}>
                      <ShieldAlert size={16} aria-hidden />
                      <h3>Trip-specific tips</h3>
                    </div>
                    <ul className={styles.tipsList}>
                      {(pkg.goodToKnow || []).map((item) => {
                        const kind = tipKind(item);
                        return (
                          <li key={item} className={styles[`tip_${kind}`] || styles.tip_note}>
                            <span className={styles.tipMark} aria-hidden>
                              {kind === "health" ? (
                                <ShieldAlert size={14} />
                              ) : kind === "docs" ? (
                                <FileText size={14} />
                              ) : kind === "travel" ? (
                                <Plane size={14} />
                              ) : (
                                <Info size={14} />
                              )}
                            </span>
                            <p>{item}</p>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </section>
            )}
          </div>

          <aside className={styles.rail}>
            <div className={styles.railCard}>
              <p className={styles.railEyebrow}>Your trip</p>
              <div className={styles.summaryChips}>
                <span>{formatDisplayDate(checkIn)}</span>
                <span>→</span>
                <span>{formatDisplayDate(checkOut)}</span>
              </div>

              <div className={styles.originBlock} ref={originWrapRef}>
                <label className={styles.field}>
                  <span>Flying from</span>
                  <div className={styles.originInputWrap}>
                    <Plane size={14} className={styles.originIcon} aria-hidden />
                    <input
                      type="text"
                      placeholder={
                        gateway
                          ? `City or airport → ${gateway.city || gateway.airport}`
                          : "City or airport"
                      }
                      value={originOpen ? originQuery : originLabel || (origin ? origin : "")}
                      onFocus={() => {
                        setOriginOpen(true);
                        setOriginQuery("");
                      }}
                      onChange={(e) => {
                        setOriginOpen(true);
                        setOriginQuery(e.target.value);
                      }}
                      autoComplete="off"
                    />
                    {origin ? (
                      <button
                        type="button"
                        className={styles.originClear}
                        onClick={clearOrigin}
                        aria-label="Clear origin"
                      >
                        <X size={14} />
                      </button>
                    ) : null}
                  </div>
                </label>
                {originOpen && (originQuery.length >= 2 || originSuggestions.length > 0) && (
                  <ul className={styles.originSuggest} role="listbox">
                    {originSuggestLoading && originSuggestions.length === 0 && (
                      <li className={styles.originHint}>Searching airports…</li>
                    )}
                    {originSuggestions.map((a) => (
                      <li key={a.code}>
                        <button type="button" onClick={() => pickOrigin(a)}>
                          <strong>{a.code}</strong>
                          <span>
                            {a.city}
                            {a.name ? ` · ${a.name}` : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <label className={styles.field}>
                <span>Start</span>
                <input
                  type="date"
                  value={checkIn}
                  onChange={(e) => {
                    const cin = e.target.value;
                    const span = Math.max(1, (new Date(checkOut) - new Date(cin)) / 86400000 || defaultNights);
                    updateDates({
                      checkIn: cin,
                      checkOut: addDaysYmd(cin, Math.max(1, Math.round(span))),
                    });
                  }}
                />
              </label>
              <label className={styles.field}>
                <span>End</span>
                <input
                  type="date"
                  value={checkOut}
                  onChange={(e) => updateDates({ checkOut: e.target.value })}
                />
              </label>
              <label className={styles.field}>
                <span>Travelers</span>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={guests}
                  onChange={(e) =>
                    updateDates({ guests: Math.max(1, Number(e.target.value) || 1) })
                  }
                />
              </label>

              <div className={styles.compRows}>
                <div>
                  <span>Flight</span>
                  <strong>{origin ? (flight ? "Selected" : "Add") : "Not added"}</strong>
                </div>
                <div>
                  <span>Hotels</span>
                  <strong>
                    {status?.hotelNightsTotal
                      ? `${status.hotelNightsOk || 0}/${status.hotelNightsTotal}`
                      : quoting
                        ? "…"
                        : "-"}
                  </strong>
                </div>
                <div>
                  <span>Itinerary</span>
                  <strong>{itineraryOk ? "Ready" : "Needs review"}</strong>
                </div>
              </div>

              <div className={styles.priceBlock}>
                {stayTotal != null && (
                  <div className={styles.priceRow}>
                    <span>Hotels (bookable)</span>
                    <span>{formatMoney(stayTotal)}</span>
                  </div>
                )}
                {flightTotal != null && (
                  <div className={styles.priceRow}>
                    <span>Flights (bookable)</span>
                    <span>{formatMoney(flightTotal)}</span>
                  </div>
                )}
                {extraLo != null && extraHi != null && extraHi > 0 && (
                  <div className={styles.priceRow}>
                    <span>Estimated extras</span>
                    <span>
                      {formatMoney(extraLo)}
                      {extraHi !== extraLo ? `-${formatMoney(extraHi)}` : ""}
                    </span>
                  </div>
                )}
                {bookable != null && (
                  <div className={styles.totalRow}>
                    <span>Bookable now</span>
                    <strong>{formatMoney(bookable)}</strong>
                  </div>
                )}
                {estLo != null && estHi != null && (
                  <p className={styles.estLine}>
                    Estimated trip {formatMoney(estLo)}
                    {estHi !== estLo ? `-${formatMoney(estHi)}` : ""}
                  </p>
                )}
                {quoting && <p className={styles.muted}>Refreshing quote…</p>}
                {!payNow && <p className={styles.finePrint}>Nothing payable until a stay is live and the itinerary validates.</p>}
                <p className={styles.finePrint}>
                  {quote?.honesty ||
                    "Bookable is live hotels/flights. Ground, meals, and darshan are estimates."}
                </p>
              </div>

              <button
                type="button"
                className={styles.bookBtn}
                disabled={!canPay}
                onClick={handleBook}
              >
                {ctaLabel}
              </button>
              <button type="button" className={styles.secondaryBtn} onClick={() => openVero()}>
                Ask Vero to change this
              </button>
            </div>
          </aside>
        </div>

        <p className={styles.pageClose}>
          Discover more <em>everywhere</em>. Your trip doesn’t end at checkout - Vero stays with you
          for the next move.
        </p>
      </div>

      {dayPreview && (
        <div className={styles.drawerOverlay} onClick={() => setDayPreview(null)}>
          <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
            <div className={styles.drawerHead}>
              <h2>Make Day {dayPreview.day} lighter</h2>
              <button type="button" onClick={() => setDayPreview(null)} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            {previewLoading ? (
              <p className={styles.muted}>Checking Day {dayPreview.day}…</p>
            ) : (
              <>
                <div className={styles.compare}>
                  <div>
                    <p className={styles.compareLabel}>Before</p>
                    <p>{minsLabel(dayPreview.before?.activeMinutes) || "-"} active</p>
                    <p>{dayPreview.before?.pace}</p>
                    <p>{(dayPreview.before?.activities || []).join(" · ") || "-"}</p>
                  </div>
                  <div>
                    <p className={styles.compareLabel}>After</p>
                    <p>{minsLabel(dayPreview.after?.activeMinutes) || "-"} active</p>
                    <p>
                      {dayPreview.after?.pace}
                      {dayPreview.after?.departAfter
                        ? ` · leave after ${dayPreview.after.departAfter}`
                        : ""}
                    </p>
                    <p>{(dayPreview.after?.activities || []).join(" · ") || "-"}</p>
                  </div>
                </div>
                <p className={styles.sectionHint}>{dayPreview.after?.narrative}</p>
                <button
                  type="button"
                  className={styles.bookBtn}
                  onClick={() => {
                    applyDayPatch(dayPreview.day, dayPreview.patch || {});
                    setDayPreview(null);
                  }}
                >
                  Apply change
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {swapOpen && (
        <div className={styles.drawerOverlay} onClick={() => setSwapOpen(false)}>
          <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
            <div className={styles.drawerHead}>
              <h2>
                Change hotel
                {swapStay?.city ? ` · ${swapStay.city}` : ""}
              </h2>
              <button type="button" onClick={() => setSwapOpen(false)} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            {swapStay && (
              <>
                {swapLoading && <p className={styles.muted}>Finding stays in {swapStay.city}…</p>}
                <div className={styles.hotelList}>
                  {altHotels.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      className={styles.hotelOption}
                      onClick={() => selectHotel(h.id)}
                    >
                      <img src={h.image || pkg.coverImage} alt="" />
                      <div>
                        <strong>{h.name}</strong>
                        <p>
                          {h.stars ? `${h.stars}★ · ` : ""}
                          {h.price != null ? `From ${formatMoney(h.price)} / night` : h.location}
                        </p>
                      </div>
                    </button>
                  ))}
                  {!swapLoading && !altHotels.length && (
                    <p className={styles.muted}>No alternate hotels for these dates.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {flightSwapOpen && (
        <div className={styles.drawerOverlay} onClick={() => setFlightSwapOpen(false)}>
          <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
            <div className={styles.drawerHead}>
              <h2>
                Change flight
                {origin && gateway?.airport ? ` · ${origin} → ${gateway.airport}` : ""}
              </h2>
              <button type="button" onClick={() => setFlightSwapOpen(false)} aria-label="Close">
                <X size={20} />
              </button>
            </div>
            {flightSwapLoading && <p className={styles.muted}>Finding return flights…</p>}
            <div className={styles.hotelList}>
              {altFlights.map((f) => {
                const oid = f.offerId || f.id;
                const selected =
                  oid && (oid === flightOfferId || oid === flight?.offerId || oid === flight?.id);
                const save =
                  flightTotal != null && f.price != null ? Number(flightTotal) - Number(f.price) : 0;
                return (
                  <button
                    key={oid || `${f.airline}-${f.departTime}-${f.price}`}
                    type="button"
                    className={`${styles.hotelOption} ${styles.flightOption}`}
                    onClick={() => selectFlight(oid)}
                  >
                    <div className={styles.flightOptionIcon} aria-hidden>
                      <Plane size={22} />
                    </div>
                    <div>
                      <strong>
                        {f.airline || "Airline"}
                        {selected ? " · Current" : save > 0 ? ` · Save ${formatMoney(save)}` : ""}
                      </strong>
                      <p>
                        {[
                          f.departTime && `Dep ${f.departTime}`,
                          f.duration,
                          f.stops != null
                            ? Number(f.stops) === 0
                              ? "Nonstop"
                              : `${f.stops} stop(s)`
                            : null,
                          f.price != null ? formatMoney(f.price) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  </button>
                );
              })}
              {!flightSwapLoading && !altFlights.length && (
                <p className={styles.muted}>No alternate flights for these dates.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
