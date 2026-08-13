import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { PageLayout } from "@/components/layout";
import useAirportSuggest from "@/features/flights/hooks/useAirportSuggest";
import { useCurrency } from "@/context/CurrencyContext";
import { useHomeLocation } from "@/context/HomeLocationContext";
import { HOME_ORIGIN_SESSION_KEY } from "@/services/homeLocation";
import { useVeroUi } from "@/context/VeroUiContext";
import { buildExplorePageContext } from "@/features/vero/utils/pageContext";
import { isSaved, toggleSaved } from "@/features/account/savedService";
import useExploreFromPrices from "./hooks/useExploreFromPrices";
import { PlacesPhotoImg } from "@/components/shared";
import ExploreMap from "./components/ExploreMap";
import DestinationCard from "./components/DestinationCard";
import { EXPLORE_CATALOG, TRAVEL_WAYS, destinationsByTheme } from "./data/catalog";
import { CRAVINGS, FEEL_LIKE, HERO_HINTS } from "./data/editorial";
import { exploreService } from "./services/exploreService";
import {
  activeMoments,
  closerThanYouThink,
  collectionById,
  lightAlert,
  rankDestinations,
  surprisePick,
  veroPicks,
  veroInsights,
  worthGoingNow,
} from "./exploreEngine";
import { DISLIKE_REASONS, dislikeDestination, getExploreTaste, markExploreSeen } from "./exploreTaste";
import { getTravelIntel } from "./data/travelIntel";
import {
  domesticRegionLabel,
  isDomesticDestination,
  isInternationalDestination,
  normalizeMarketCode,
} from "@/constants/marketAffinity";
import styles from "./ExplorePage.module.css";

const ORIGIN_KEY = HOME_ORIGIN_SESSION_KEY;

const MAP_FILTERS = [
  { id: "domestic", label: "Domestic" },
  { id: "international", label: "International" },
  { id: "beach", label: "Beach" },
  { id: "cool", label: "Cool weather" },
  { id: "under8h", label: "Under 8h away" },
  { id: "this-month", label: "Good this month" },
  { id: "visa-light", label: "Visa-friendly" },
  { id: "food", label: "Food" },
  { id: "adventure", label: "Adventure" },
];

const SCOPE_FILTERS = new Set(["domestic", "international"]);

/** Home vibe tiles and deep links use ?theme= - map to globe filters / ranking. */
const THEME_TO_MAP_FILTER = {
  beach: "beach",
  food: "food",
  adventure: "adventure",
  hills: "hills",
  city: "city",
  pilgrimage: "pilgrimage",
  honeymoon: "honeymoon",
  wildlife: "wildlife",
  culture: "culture",
  wellness: "wellness",
  islands: "islands",
  trekking: "trekking",
  safari: "safari",
};

function toggleMapFilter(cur, id) {
  if (SCOPE_FILTERS.has(id)) {
    if (cur.includes(id)) return cur.filter((x) => x !== id);
    return [...cur.filter((x) => !SCOPE_FILTERS.has(x)), id];
  }
  return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
}

function originCityLabel(code, fallback) {
  const hit = EXPLORE_CATALOG.find((d) => d.iata === code);
  return hit ? `${hit.city}` : fallback || code;
}

function DestPhoto({ dest, className }) {
  if (!dest) return null;
  return (
    <PlacesPhotoImg
      className={className}
      city={dest.city}
      country={dest.country}
      fallback={dest.image}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={(e) => {
        e.currentTarget.onerror = null;
        e.currentTarget.src = `https://picsum.photos/seed/${encodeURIComponent(dest.id || dest.city || "itinero")}/900/700`;
      }}
    />
  );
}

function destImgProps(src, seed) {
  return {
    src,
    alt: "",
    loading: "lazy",
    referrerPolicy: "no-referrer",
    onError: (e) => {
      e.currentTarget.onerror = null;
      e.currentTarget.src = `https://picsum.photos/seed/${encodeURIComponent(seed || "itinero")}/900/700`;
    },
  };
}

export default function ExplorePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { theme: themeParam } = useParams();
  const { formatMoney } = useCurrency();
  const home = useHomeLocation();
  const { setPageContext, clearPageContext, openVero } = useVeroUi();

  useEffect(() => {
    if (themeParam && !searchParams.get("theme")) {
      setSearchParams({ theme: themeParam }, { replace: true });
    }
  }, [themeParam, searchParams, setSearchParams]);

  const [origin, setOrigin] = useState(() => {
    try {
      return sessionStorage.getItem(ORIGIN_KEY) || home.airportCode || "";
    } catch {
      return home.airportCode || "";
    }
  });
  const [originLabel, setOriginLabel] = useState(() =>
    originCityLabel(origin || home.airportCode || "", home.city || "Your city")
  );
  const [originQuery, setOriginQuery] = useState("");
  const [originOpen, setOriginOpen] = useState(false);
  const [hintIdx, setHintIdx] = useState(0);
  const [moodQuery, setMoodQuery] = useState("");
  const [mapFilters, setMapFilters] = useState([]);
  const [surprise, setSurprise] = useState(null);
  const [surpriseSkip, setSurpriseSkip] = useState([]);
  const [surpriseMood, setSurpriseMood] = useState("");
  const [dislikeFor, setDislikeFor] = useState(null);
  const [tasteTick, setTasteTick] = useState(0);
  const [catalogTick, setCatalogTick] = useState(0);

  const homeMarket = normalizeMarketCode(home.countryCode || home.passportCountry || "");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await exploreService.hydrateCatalog(
        homeMarket ? { market: homeMarket } : {}
      );
      if (cancelled) return;
      if (Array.isArray(res.destinations) && res.destinations.length) {
        setCatalogTick((n) => n + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [homeMarket]);

  useEffect(() => {
    if (!home.airportCode) return;
    try {
      const stored = sessionStorage.getItem(ORIGIN_KEY);
      if (stored) return;
    } catch {
      /* ignore */
    }
    setOrigin(home.airportCode);
    setOriginLabel(originCityLabel(home.airportCode, home.city || home.originLabel));
  }, [home.airportCode, home.city, home.originLabel]);

  const cravingId = searchParams.get("craving") || "";
  const feelId = searchParams.get("feel") || "";
  const momentId = searchParams.get("moment") || "";
  const themeId = searchParams.get("theme") || "";
  const themeMeta = useMemo(
    () => TRAVEL_WAYS.find((w) => w.id === themeId) || null,
    [themeId]
  );
  const collection = useMemo(
    () =>
      cravingId
        ? collectionById("craving", cravingId)
        : feelId
          ? collectionById("feel", feelId)
          : momentId
            ? collectionById("moment", momentId)
            : null,
    [cravingId, feelId, momentId]
  );

  useEffect(() => {
    if (!themeId) return;
    const filterId = THEME_TO_MAP_FILTER[themeId] || themeId;
    setMapFilters((cur) => (cur.includes(filterId) ? cur : [...cur, filterId]));
  }, [themeId]);

  const themeDestinations = useMemo(() => {
    if (!themeId || collection) return [];
    return rankDestinations(destinationsByTheme(themeId), {
      origin,
      homeCountry: homeMarket,
      query: moodQuery,
      mapFilters,
    })
      .slice(0, 12)
      .map((x) => x.dest);
  }, [themeId, collection, origin, homeMarket, moodQuery, mapFilters, tasteTick, catalogTick]);

  const { airports: originSuggestions, isLoading: originSuggestLoading } =
    useAirportSuggest(originQuery, { enabled: originOpen });

  useEffect(() => {
    const t = window.setInterval(() => setHintIdx((i) => (i + 1) % HERO_HINTS.length), 4200);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    setOriginLabel(originCityLabel(origin, originLabel));
  }, [origin]); // eslint-disable-line react-hooks/exhaustive-deps

  const nowWorth = useMemo(
    () => worthGoingNow(new Date(), { origin, homeCountry: homeMarket }),
    [origin, homeMarket, catalogTick]
  );
  const moments = useMemo(() => activeMoments(new Date()), []);
  const closer = useMemo(() => closerThanYouThink(origin, homeMarket), [origin, homeMarket, catalogTick]);
  const picks = useMemo(
    () => veroPicks({ origin, query: moodQuery, mapFilters, originLabel, homeCountry: homeMarket }),
    [origin, originLabel, moodQuery, mapFilters, homeMarket, tasteTick, catalogTick]
  );
  const insights = useMemo(
    () => veroInsights({ origin, query: moodQuery, mapFilters, originLabel, homeCountry: homeMarket }),
    [origin, originLabel, moodQuery, mapFilters, homeMarket, tasteTick, catalogTick]
  );

  const mapPool = useMemo(() => {
    let list = EXPLORE_CATALOG.filter((d) => d.lat != null && d.lng != null);
    if (mapFilters.includes("domestic")) {
      list = list.filter((d) => isDomesticDestination(d, homeMarket || "IN"));
    } else if (mapFilters.includes("international")) {
      list = list.filter((d) => isInternationalDestination(d, homeMarket || "IN"));
    }
    return rankDestinations(list, { origin, homeCountry: homeMarket, query: moodQuery, mapFilters })
      .slice(0, 60)
      .map((x) => x.dest);
  }, [origin, homeMarket, moodQuery, mapFilters, catalogTick]);

  const fareDests = useMemo(() => {
    // Keep fare lookups light - map pins don't need live calendar spam.
    const ids = new Set([
      ...nowWorth.map((w) => w.dest.id),
      ...picks.map((p) => p.dest.id),
      ...(insights.goFirst ? [insights.goFirst.dest.id] : []),
      ...insights.otherSaved.map((p) => p.dest.id),
      ...insights.alsoTry.map((p) => p.dest.id),
      ...(collection?.items || []).slice(0, 8).map((d) => d.id),
      ...themeDestinations.slice(0, 8).map((d) => d.id),
      ...closer.slice(0, 5).map((c) => c.dest.id),
    ]);
    return EXPLORE_CATALOG.filter((d) => ids.has(d.id) && d.iata);
  }, [nowWorth, picks, insights, collection, themeDestinations, closer, catalogTick]);

  const { prices, loading } = useExploreFromPrices({
    origin,
    destinations: fareDests,
    monthKey: "",
    enabled: Boolean(origin && origin.length === 3),
  });

  useEffect(() => {
    setPageContext(
      buildExplorePageContext({
        origin,
        destinations: (collection?.items || nowWorth.map((w) => w.dest)).slice(0, 12).map((d) => ({
          city: d.city,
          iata: d.iata,
          from_price: prices[d.iata] ?? null,
        })),
        theme: cravingId || feelId || themeId || "",
        passportCountry: home.passportCountry,
        passportLabel: home.passportLabel,
      })
    );
    return () => clearPageContext();
  }, [
    origin,
    collection,
    nowWorth,
    prices,
    cravingId,
    feelId,
    themeId,
    home.passportCountry,
    home.passportLabel,
    setPageContext,
    clearPageContext,
  ]);

  const pickOrigin = (airport) => {
    const code = String(airport?.code || "").toUpperCase().slice(0, 3);
    if (!code) return;
    setOrigin(code);
    setOriginLabel(`${airport.city || code}`);
    setOriginQuery("");
    setOriginOpen(false);
    home.setHomeAirport(airport);
    try {
      sessionStorage.setItem(ORIGIN_KEY, code);
    } catch {
      /* ignore */
    }
  };

  const askMood = (text) => {
    const q = (text || moodQuery || HERO_HINTS[hintIdx]).trim();
    if (!q) return;
    if (text && text !== moodQuery) setMoodQuery(text);
    // Page should visibly react - shortlist re-ranks from moodQuery.
    requestAnimationFrame(() => {
      document.getElementById("vero-insights")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    openVero({
      prompt: `I'm on Explore from ${originLabel}. I'm in the mood for: ${q}. Suggest 2-3 places - vibe and why, not booking quotes.`,
      forceNew: true,
      source: "explore",
    });
  };

  const rollSurprise = (moodOverride) => {
    const moodKey = typeof moodOverride === "string" ? moodOverride : surpriseMood;
    if (typeof moodOverride === "string") setSurpriseMood(moodOverride);
    const moodQueryMap = {
      beach: "beach",
      hills: "hills mountains",
      city: "city nightlife",
      close: "nearby weekend close short",
    };
    const mood = moodQueryMap[moodKey] || moodKey || moodQuery;
    const pick = surprisePick(surpriseSkip, { origin, query: mood, homeCountry: homeMarket });
    if (pick) {
      markExploreSeen(pick.dest.id);
      setSurprise(pick);
      setSurpriseSkip((ids) => [pick.dest.id, ...ids].slice(0, 20));
    }
  };

  const surpriseTeasers = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const row of [...closer, ...nowWorth]) {
      const d = row.dest;
      if (!d?.image || seen.has(d.id)) continue;
      seen.add(d.id);
      out.push(d);
      if (out.length >= 3) break;
    }
    return out;
  }, [closer, nowWorth]);

  const saveDest = (dest) => {
    toggleSaved({
      id: `explore:${dest.slug || dest.id}`,
      type: "destination",
      title: dest.city,
      subtitle: dest.country,
      url: `/explore/${dest.slug}`,
      image: dest.image,
    });
    setTasteTick((n) => n + 1);
  };

  const money = (n) => formatMoney(Math.round(Number(n)));

  return (
    <PageLayout>
      <div className={styles.page}>
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <motion.p
              className={styles.brandMark}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              itinero<span className={styles.brandDot}>.</span>
            </motion.p>
            <motion.h1
              className={styles.headline}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.05 }}
            >
              Where do you want to <em>feel alive</em> next?
            </motion.h1>
            <p className={styles.sub}>
              Tell Vero the mood - we’ll show places worth the trip, not a random list.
            </p>

            <div className={styles.askBar}>
              <input
                value={moodQuery}
                onChange={(e) => setMoodQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") askMood();
                }}
                placeholder={HERO_HINTS[hintIdx]}
                aria-label="Ask Vero what you're in the mood for"
              />
              <button type="button" onClick={() => askMood()}>
                Ask Vero
              </button>
            </div>

            <div className={styles.heroChips}>
              <div className={styles.originChip}>
                <button type="button" onClick={() => setOriginOpen((v) => !v)}>
                  From {originLabel}
                </button>
                {originOpen ? (
                  <div className={styles.originPop}>
                    <input
                      autoFocus
                      value={originQuery}
                      onChange={(e) => setOriginQuery(e.target.value)}
                      placeholder="City or airport"
                    />
                    <ul>
                      {originSuggestLoading ? <li>Searching…</li> : null}
                      {(originSuggestions || []).slice(0, 7).map((a) => (
                        <li key={`${a.code}-${a.city}`}>
                          <button type="button" onClick={() => pickOrigin(a)}>
                            {a.city} ({a.code})
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className={styles.ghostChip}
                onClick={() => askMood(`What’s great this season from ${originLabel}?`)}
              >
                This season
              </button>
              <button
                type="button"
                className={styles.ghostChip}
                onClick={() => {
                  rollSurprise();
                  document.getElementById("surprise-me")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Surprise me
              </button>
              <button
                type="button"
                className={styles.ghostChip}
                onClick={() => navigate("/packages")}
              >
                Ready-made packages
              </button>
            </div>
          </div>
        </section>

        {themeMeta && !collection ? (
          <section className={styles.section}>
            <button
              type="button"
              className={styles.backLink}
              onClick={() => setSearchParams({}, { replace: true })}
            >
              ← All Explore
            </button>
            <header className={styles.sectionHead}>
              <div>
                <p className={styles.kicker}>Travel style</p>
                <h2>{themeMeta.label}</h2>
                <p>{themeMeta.blurb}</p>
              </div>
              <button
                type="button"
                className={styles.textLink}
                onClick={() => navigate(`/packages?theme=${encodeURIComponent(themeId)}`)}
              >
                Matching packages →
              </button>
            </header>
            <div className={styles.cardGrid}>
              {themeDestinations.map((d) => (
                <DestinationCard
                  key={d.id}
                  dest={d}
                  price={d.iata ? prices[d.iata] : null}
                  priceLoading={d.iata ? Boolean(loading[d.iata]) : false}
                  formatMoney={money}
                  originHours={d.flightHoursApprox}
                  alert={lightAlert(d, getTravelIntel(d))}
                />
              ))}
            </div>
          </section>
        ) : null}

        {collection ? (
          <section className={styles.section}>
            <button type="button" className={styles.backLink} onClick={() => setSearchParams({}, { replace: true })}>
              ← All Explore
            </button>
            <header className={styles.sectionHead}>
              <div>
                <p className={styles.kicker}>Collection</p>
                <h2>{collection.title}</h2>
                <p>{collection.blurb}</p>
              </div>
            </header>
            <div className={styles.cardGrid}>
              {collection.items.map((d) => (
                <DestinationCard
                  key={d.id}
                  dest={d}
                  price={prices[d.iata]}
                  priceLoading={Boolean(loading[d.iata])}
                  formatMoney={money}
                  originHours={d.flightHoursApprox}
                  alert={lightAlert(d, getTravelIntel(d))}
                />
              ))}
            </div>
          </section>
        ) : !themeMeta ? (
          <>
            <section className={styles.section} aria-labelledby="worth-now">
              <header className={styles.sectionHead}>
                <div>
                  <p className={styles.kicker}>Time-sensitive</p>
                  <h2 id="worth-now">Worth going for right now</h2>
                  <p>Windows that won’t wait - season, light, and the trip you’d regret skipping.</p>
                </div>
              </header>
              <div className={styles.editorialGrid}>
                {nowWorth.map((row) => (
                  <DestinationCard
                    key={row.dest.id}
                    dest={row.dest}
                    timely={row.timely}
                    why={row.why}
                    price={prices[row.dest.iata]}
                    priceLoading={Boolean(loading[row.dest.iata])}
                    formatMoney={money}
                    originHours={row.dest.flightHoursApprox}
                    alert={lightAlert(row.dest, getTravelIntel(row.dest))}
                  />
                ))}
              </div>
            </section>

            <section className={styles.globeSection} aria-labelledby="globe">
              <div className={styles.globePanel}>
                <div className={styles.globeStage}>
                  <ExploreMap
                    destinations={mapPool}
                    prices={prices}
                    originHoursById={Object.fromEntries(mapPool.map((d) => [d.id, d.flightHoursApprox]))}
                    formatMoney={(n) => money(n)}
                    onSelect={(d) => navigate(`/explore/${d.slug}`)}
                  />

                  <div className={styles.globeOverlay}>
                    <header className={styles.globeHead}>
                      <p className={styles.globeKicker}>Serendipity</p>
                      <h2 id="globe">Land somewhere you weren’t searching for</h2>
                      <p>One spin. A real place - not another ranked list.</p>
                    </header>

                    <div className={styles.globeFilters}>
                      <div className={styles.scopeToggle} role="group" aria-label="Trip scope">
                        {MAP_FILTERS.filter((f) => SCOPE_FILTERS.has(f.id)).map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            className={mapFilters.includes(f.id) ? styles.scopeOn : ""}
                            onClick={() => setMapFilters((cur) => toggleMapFilter(cur, f.id))}
                          >
                            {f.id === "domestic"
                              ? homeMarket === "US"
                                ? "USA"
                                : homeMarket === "IN" || !homeMarket
                                  ? "India"
                                  : "Domestic"
                              : f.label}
                          </button>
                        ))}
                      </div>
                      <div className={styles.vibeRow} role="group" aria-label="Vibe filters">
                        {MAP_FILTERS.filter((f) => !SCOPE_FILTERS.has(f.id)).map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            className={mapFilters.includes(f.id) ? styles.vibeOn : ""}
                            onClick={() => setMapFilters((cur) => toggleMapFilter(cur, f.id))}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className={styles.section} aria-labelledby="craving">
              <header className={styles.sectionHead}>
                <div>
                  <h2 id="craving">What are you craving?</h2>
                </div>
                <button type="button" className={styles.textLink} onClick={() => navigate("/explore?craving=different-world")}>
                  See all travel styles →
                </button>
              </header>
              <div className={styles.craveGrid}>
                {CRAVINGS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={styles.crave}
                    onClick={() => setSearchParams({ craving: c.id })}
                  >
                    <img {...destImgProps(c.image, c.id)} />
                    <span>
                      <strong>{c.label}</strong>
                      <em>{c.blurb}</em>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.section} aria-labelledby="feel">
              <header className={styles.sectionHead}>
                <div>
                  <p className={styles.kicker}>Analogues</p>
                  <h2 id="feel">Places that feel like…</h2>
                  <p>Same vibe. Different passport stamp - or none at all.</p>
                </div>
              </header>
              <div className={styles.feelGrid}>
                {FEEL_LIKE.map((f) => {
                  const seed = EXPLORE_CATALOG.find((d) => d.id === f.destIds?.[0]);
                  return (
                  <button
                    key={f.id}
                    type="button"
                    className={styles.feelCard}
                    onClick={() => setSearchParams({ feel: f.id })}
                  >
                    <PlacesPhotoImg
                      city={seed?.city || ""}
                      country={seed?.country || ""}
                      query={seed ? `${seed.city} ${seed.country} landmark` : f.title}
                      fallback={f.image}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = `https://picsum.photos/seed/${encodeURIComponent(f.id)}/900/700`;
                      }}
                    />
                    <span>
                      <strong>{f.title}</strong>
                      <em>{f.blurb}</em>
                    </span>
                  </button>
                  );
                })}
              </div>
            </section>

            <section className={`${styles.section} ${styles.veroSection}`} aria-labelledby="vero-insights">
              <header className={styles.sectionHead}>
                <div className={styles.veroHead}>
                  <img
                    className={styles.veroAvatar}
                    src={`${import.meta.env.BASE_URL}vero-chatbot.png`}
                    alt=""
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                  <div>
                    <p className={styles.kicker}>From Vero</p>
                    <h2 id="vero-insights">{insights.headline}</h2>
                    <p>{insights.lede}</p>
                    {insights.tasteLabels?.length ? (
                      <div className={styles.insightTaste}>
                        {insights.tasteLabels.map((t) => (
                          <span key={t}>{t}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.insightAsk}
                  onClick={() => {
                    const savedNames = [
                      insights.goFirst?.dest?.city,
                      ...insights.otherSaved.map((r) => r.dest.city),
                    ].filter(Boolean);
                    const also = insights.alsoTry.map((r) => r.dest.city).filter(Boolean);
                    openVero({
                      forceNew: true,
                      source: "explore",
                      prompt: savedNames.length
                        ? `I saved ${savedNames.join(", ")}. From those, where should I go first from ${originLabel}, and what else should I look at${also.length ? ` (maybe ${also.join(", ")})` : ""}? Vibe and season - no booking quotes.`
                        : `I'm on Explore from ${originLabel} with no saved places yet. Suggest 3 places worth saving for a trip I’d actually take.`,
                    });
                  }}
                >
                  Ask Vero to decide
                </button>
              </header>

              {insights.goFirst ? (
                <div className={styles.insightHero}>
                  <button
                    type="button"
                    className={styles.insightHeroMedia}
                    onClick={() => navigate(`/explore/${insights.goFirst.dest.slug}`)}
                  >
                    <DestPhoto dest={insights.goFirst.dest} />
                    <span className={styles.insightBadge}>Go here first</span>
                  </button>
                  <div className={styles.insightHeroBody}>
                    <p className={styles.pickCountry}>{insights.goFirst.dest.country}</p>
                    <h3>{insights.goFirst.dest.city}</h3>
                    <p className={styles.pickWhy}>{insights.goFirst.why}</p>
                    {prices[insights.goFirst.dest.iata] ? (
                      <p className={styles.insightFare}>
                        From {money(prices[insights.goFirst.dest.iata])} · snapshot
                      </p>
                    ) : null}
                    <div className={styles.reasonChips}>
                      {(insights.goFirst.reasons || []).map((r) => (
                        <span key={r}>{r}</span>
                      ))}
                    </div>
                    <div className={styles.pickActions}>
                      <button type="button" onClick={() => navigate(`/explore/${insights.goFirst.dest.slug}`)}>
                        Open {insights.goFirst.dest.city}
                      </button>
                      <button type="button" onClick={() => saveDest(insights.goFirst.dest)}>
                        {isSaved(`explore:${insights.goFirst.dest.slug || insights.goFirst.dest.id}`)
                          ? "Saved ♡"
                          : "Save ♡"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className={styles.insightEmpty}>
                  <p>
                    Heart a few destinations while you browse. Then I’ll tell you{" "}
                    <strong>which saved place to take first</strong> - and what else fits the same vibe.
                  </p>
                </div>
              )}

              {insights.otherSaved.length ? (
                <div className={styles.insightBlock}>
                  <h3 className={styles.insightSub}>Also on your board</h3>
                  <div className={styles.insightSavedRow}>
                    {insights.otherSaved.map((row) => (
                      <button
                        key={row.dest.id}
                        type="button"
                        className={styles.insightSavedCard}
                        onClick={() => navigate(`/explore/${row.dest.slug}`)}
                      >
                        <DestPhoto dest={row.dest} />
                        <span>
                          <strong>{row.dest.city}</strong>
                          <em>{row.why}</em>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className={styles.insightBlock}>
                <h3 className={styles.insightSub}>
                  {insights.savedCount ? "Other places you’d like" : "I’d send you here next"}
                </h3>
                <div className={styles.pickGrid}>
                  {(insights.alsoTry.length ? insights.alsoTry : picks).map((row) => {
                    const saved = isSaved(`explore:${row.dest.slug || row.dest.id}`);
                    return (
                      <article key={row.dest.id} className={styles.pickCard}>
                        <button
                          type="button"
                          className={styles.pickMedia}
                          onClick={() => navigate(`/explore/${row.dest.slug}`)}
                        >
                          <DestPhoto dest={row.dest} />
                        </button>
                        <div>
                          <p className={styles.pickCountry}>{row.dest.country}</p>
                          <h3>{row.dest.city}</h3>
                          <p className={styles.pickWhy}>{row.why}</p>
                          {prices[row.dest.iata] ? (
                            <p className={styles.insightFare}>From {money(prices[row.dest.iata])} · snapshot</p>
                          ) : null}
                          {row.reasons?.length ? (
                            <div className={styles.reasonChips}>
                              {row.reasons.map((r) => (
                                <span key={r}>{r}</span>
                              ))}
                            </div>
                          ) : null}
                          <div className={styles.pickActions}>
                            <button type="button" onClick={() => saveDest(row.dest)}>
                              {saved ? "Saved ♡" : "Save ♡"}
                            </button>
                            <button type="button" onClick={() => setDislikeFor(row.dest)}>
                              Not for me
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                openVero(
                                  `On Explore - why ${row.dest.city} for someone flying from ${originLabel}${
                                    moodQuery ? ` who’s in the mood for “${moodQuery.trim()}”` : ""
                                  }? Be specific.`
                                )
                              }
                            >
                              Ask Vero why
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className={styles.section} aria-labelledby="moments">
              <header className={styles.sectionHead}>
                <div>
                  <h2 id="moments">Travel for a moment</h2>
                  <p>These cards expire with the season - they don’t live forever.</p>
                </div>
              </header>
              <div className={styles.momentGrid}>
                {moments.map((m) => (
                  <button key={m.id} type="button" className={styles.moment} onClick={() => setSearchParams({ moment: m.id })}>
                    <PlacesPhotoImg
                      query={`${m.place || m.title} landmark tourist attraction`}
                      city={String(m.place || "").split(/[&/,]/)[0].trim()}
                      fallback={m.image}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = `https://picsum.photos/seed/${encodeURIComponent(m.id)}/900/700`;
                      }}
                    />
                    <span>
                      <strong>{m.title}</strong>
                      <em>{m.place}</em>
                      <small>{m.reason}</small>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.section} aria-labelledby="closer">
              <header className={styles.sectionHead}>
                <div>
                  <h2 id="closer">Closer than you think</h2>
                  <p>From {originLabel} - useful even when you’re not planning a big vacation.</p>
                </div>
              </header>
              <div className={styles.closerRow}>
                {closer.map((row) => (
                  <button key={row.dest.id} type="button" className={styles.closerCard} onClick={() => navigate(`/explore/${row.dest.slug}`)}>
                    <DestPhoto dest={row.dest} />
                    <strong>{row.dest.city}</strong>
                    <em>
                      {row.label} · {row.mode}
                    </em>
                  </button>
                ))}
              </div>
            </section>

            <section id="surprise-me" className={styles.surprise} aria-labelledby="surprise">
              <div className={styles.surpriseGlow} aria-hidden />
              <div className={styles.surpriseInner}>
                <div className={styles.surpriseCopy}>
                  <p className={styles.kicker}>Can’t decide?</p>
                  <h2 id="surprise">Take me somewhere</h2>
                  <p>One destination. One reason. No 12-option spiral.</p>

                  <div className={styles.surpriseMoods} role="group" aria-label="Surprise mood">
                    {[
                      { id: "", label: "Anywhere" },
                      { id: "beach", label: "Beach" },
                      { id: "hills", label: "Hills" },
                      { id: "city", label: "City" },
                      { id: "close", label: "Nearby" },
                    ].map((m) => (
                      <button
                        key={m.label}
                        type="button"
                        className={surpriseMood === m.id ? styles.surpriseMoodOn : ""}
                        onClick={() => setSurpriseMood(m.id)}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {!surprise ? (
                    <button type="button" className={styles.surpriseCta} onClick={() => rollSurprise()}>
                      Surprise me
                    </button>
                  ) : (
                    <div className={styles.surpriseCard}>
                      <DestPhoto dest={surprise.dest} />
                      <div>
                        <p className={styles.surpriseLanded}>Your pick</p>
                        <h3>
                          {surprise.dest.city}
                          {surprise.dest.country ? `, ${surprise.dest.country}` : ""}
                        </h3>
                        <p>{surprise.why}</p>
                        <div className={styles.pickActions}>
                          <button type="button" onClick={() => navigate(`/explore/${surprise.dest.slug}`)}>
                            Open
                          </button>
                          <button type="button" onClick={() => saveDest(surprise.dest)}>
                            {isSaved(`explore:${surprise.dest.slug}`) ? "Saved ♡" : "Save ♡"}
                          </button>
                          <button type="button" onClick={() => rollSurprise()}>
                            Another
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className={styles.surpriseVisual} aria-hidden={!surpriseTeasers.length}>
                  <div className={styles.surpriseStack}>
                    {surpriseTeasers.map((d, i) => (
                      <DestPhoto
                        key={d.id}
                        dest={d}
                        className={styles[`surpriseShot${i + 1}`]}
                      />
                    ))}
                  </div>
                  <p className={styles.surpriseVisualCap}>From short hops to farther firsts</p>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {!collection ? (
          <section className={styles.packagesBridge} aria-labelledby="packages-bridge">
            <div className={styles.packagesBridgeInner}>
              <div>
                <p className={styles.kicker}>Bookable circuits</p>
                <h2 id="packages-bridge">Turn inspiration into a trip</h2>
                <p>
                  Curated flight + stay packages with live hotel rates - Vero validates the itinerary
                  before you pay.
                </p>
              </div>
              <div className={styles.packagesBridgeActions}>
                <button type="button" className={styles.packagesBridgePrimary} onClick={() => navigate("/packages")}>
                  Browse packages
                </button>
                <button
                  type="button"
                  className={styles.packagesBridgeGhost}
                  onClick={() => openVero({ prompt: "Help me pick a package for my mood and dates.", source: "explore" })}
                >
                  Ask Vero
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {dislikeFor ? (
          <div className={styles.modal} role="dialog" aria-label="Not for me">
            <div className={styles.modalCard}>
              <p>Why isn’t {dislikeFor.city} for you?</p>
              <div className={styles.pickActions}>
                {DISLIKE_REASONS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      dislikeDestination(dislikeFor.id, r.id);
                      setDislikeFor(null);
                      setTasteTick((n) => n + 1);
                    }}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <button type="button" className={styles.textLink} onClick={() => setDislikeFor(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </PageLayout>
  );
}
