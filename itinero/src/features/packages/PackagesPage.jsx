import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { PageLayout } from "@/components/layout";
import SharedPackageSearchBar from "@/components/SharedPackageSearchBar/SharedPackageSearchBar";
import { TRAVEL_WAYS } from "@/features/explore/data/catalog";
import PackageCard from "./components/PackageCard";
import { packageService } from "./services/packageService";
import usePackageLiveQuotes from "./hooks/usePackageLiveQuotes";
import { LoadingState } from "@/components/shared";
import { useHomeLocationOptional } from "@/context/HomeLocationContext";
import { useVeroUi } from "@/context/VeroUiContext";
import {
  domesticRegionLabel,
  normalizeMarketCode,
  packageLooksIndiaDomestic,
  packageMarketScore,
  packageVisibleInMarket,
  shouldHideIndiaDomesticPackages,
} from "@/constants/marketAffinity";
import styles from "./PackagesPage.module.css";

const THEMES = [
  { id: "", label: "All" },
  { id: "hiking", label: "Hiking" },
  { id: "trekking", label: "Trekking" },
  { id: "biking", label: "Biking" },
  { id: "beach", label: "Beach" },
  { id: "adventure", label: "Adventure" },
  { id: "rafting", label: "Rafting" },
  { id: "scuba", label: "Scuba" },
  { id: "hills", label: "Hills" },
  { id: "wildlife", label: "Wildlife" },
  { id: "camping", label: "Camping" },
  { id: "pilgrimage", label: "Pilgrimage" },
  { id: "honeymoon", label: "Honeymoon" },
  { id: "city", label: "City" },
  { id: "safari", label: "Safari" },
  { id: "wellness", label: "Wellness" },
  { id: "islands", label: "Islands" },
  { id: "food", label: "Food" },
  { id: "culture", label: "Culture" },
];

const MORE_THEMES = TRAVEL_WAYS.filter((w) => !THEMES.some((t) => t.id === w.id));

const BUDGETS = [
  { id: "", label: "Any stay" },
  { id: "15000", label: "Stay under ₹15k" },
  { id: "30000", label: "Stay under ₹30k" },
  { id: "60000", label: "Stay under ₹60k" },
  { id: "100000", label: "Stay under ₹1L" },
];

const REGIONS = [
  { id: "", label: "All regions" },
  { id: "domestic", label: "Domestic" },
  { id: "international", label: "International" },
];

function parseSmartFilter(text) {
  const t = (text || "").trim().toLowerCase();
  if (!t) {
    return { q: "", theme: "", region: "", max_price: "", note: "Filters cleared." };
  }

  const next = { q: "", theme: "", region: "", max_price: "" };
  const notes = [];

  const priceMatch = t.match(/(?:under|below|less than|<)\s*₹?\s*([\d,]+)\s*(k)?/i);
  if (priceMatch) {
    let v = parseInt(priceMatch[1].replace(/,/g, ""), 10);
    if (priceMatch[2] || /k\b/.test(t)) {
      if (v < 1000) v *= 1000;
    }
    if (v <= 15000) next.max_price = "15000";
    else if (v <= 30000) next.max_price = "30000";
    else if (v <= 60000) next.max_price = "60000";
    else if (v <= 100000) next.max_price = "100000";
    else next.max_price = String(v);
    notes.push(`stay under ${v.toLocaleString("en-IN")}`);
  } else if (/10k|15k|10000|15000/.test(t)) {
    next.max_price = "15000";
    notes.push("stay under 15k");
  } else if (/25k|30k|25000|30000/.test(t)) {
    next.max_price = "30000";
    notes.push("stay under 30k");
  } else if (/50k|60k|50000|60000/.test(t)) {
    next.max_price = "60000";
    notes.push("stay under 60k");
  } else if (/1l|100k|100000/.test(t)) {
    next.max_price = "100000";
    notes.push("stay under 1L");
  }

  if (/international|abroad|overseas/.test(t)) {
    next.region = "international";
    notes.push("international");
  } else if (/domestic|india\b/.test(t)) {
    next.region = "domestic";
    notes.push("domestic");
  }

  const themeMap = [
    ["safari", /safari|kenya|mara|wildlife/],
    ["trekking", /trek|leh|ladakh|himalaya|kathmandu/],
    ["wellness", /wellness|yoga|spa|bali/],
    ["adventure", /adventure|raft|cape town|queenstown/],
    ["food", /food|tokyo|bangkok|street eat/],
    ["culture", /culture|jaipur|temple|heritage/],
    ["islands", /island|zanzibar|andaman|maldives/],
    ["pilgrimage", /pilgrim|chardham|kedarnath|varanasi|yatra/],
    ["beach", /beach|goa|coast/],
    ["hills", /hill|manali|kashmir|mountain|valley/],
    ["honeymoon", /honeymoon|romantic|couple/],
    ["family", /family|kids|singapore/],
    ["city", /city|dubai|singapore|udaipur|tokyo/],
  ];
  for (const [id, re] of themeMap) {
    if (re.test(t)) {
      next.theme = id;
      notes.push(id);
      break;
    }
  }

  const cleaned = t
    .replace(/(?:under|below|less than|<)\s*₹?\s*[\d,]+\s*k?/gi, "")
    .replace(/\b(international|domestic|abroad|overseas|india|pilgrim\w*|beach|hills?|honeymoon|romantic|couple|city|10k|25k|50k)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length >= 2) {
    next.q = cleaned;
    notes.push(`“${cleaned}”`);
  }

  return {
    ...next,
    note: notes.length
      ? `Let Vero Filter: ${notes.join(" · ")}`
      : "Couldn't match that - try a theme, budget, or destination.",
  };
}

export default function PackagesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [smartQuery, setSmartQuery] = useState("");
  const [smartNote, setSmartNote] = useState("");
  const [smartOpen, setSmartOpen] = useState(false);
  const { isOpen: veroOpen, setUiActionHandler } = useVeroUi();
  const home = useHomeLocationOptional();
  const homeMarket = normalizeMarketCode(home?.countryCode || home?.passportCountry || "");
  const checkIn = searchParams.get("checkIn") || "";
  const guests = Number(searchParams.get("guests") || 2);

  const regionOptions = useMemo(() => {
    if (shouldHideIndiaDomesticPackages(homeMarket)) {
      return [
        { id: "", label: "Trips for you" },
        { id: "international", label: "International" },
        { id: "domestic", label: "India circuits" },
      ];
    }
    return [
      { id: "", label: "All regions" },
      { id: "domestic", label: domesticRegionLabel(homeMarket) },
      { id: "international", label: "International" },
    ];
  }, [homeMarket]);

  const themeOptions = useMemo(() => {
    if (shouldHideIndiaDomesticPackages(homeMarket)) {
      return THEMES.filter((t) => t.id !== "pilgrimage");
    }
    return THEMES;
  }, [homeMarket]);

  const filters = useMemo(
    () => ({
      q: searchParams.get("q") || "",
      region: searchParams.get("region") || "",
      theme: searchParams.get("theme") || "",
      max_price: searchParams.get("max_price") || "",
    }),
    [searchParams]
  );

  const hasActiveFilters = Boolean(
    filters.q || filters.region || filters.theme || filters.max_price
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const params = {};
      if (filters.q) params.q = filters.q;
      if (filters.region) params.region = filters.region;
      if (filters.theme) params.theme = filters.theme;
      if (homeMarket) params.market = homeMarket;
      const res = await packageService.list(params);
      if (cancelled) return;
      setPackages(Array.isArray(res.packages) ? res.packages : []);
      setMessage(res.message || "");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.q, filters.region, filters.theme, homeMarket]);

  const applyFilters = (patch) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) => {
      if (!value) next.delete(key);
      else next.set(key, value);
    });
    setSearchParams(next);
  };

  const setFilter = (key, value) => {
    applyFilters({ [key]: value });
  };

  const applySmartFilter = () => {
    const parsed = parseSmartFilter(smartQuery);
    applyFilters({
      q: parsed.q,
      theme: parsed.theme,
      region: parsed.region,
      max_price: parsed.max_price,
    });
    setSmartNote(parsed.note);
  };

  const clearSmartFilter = () => {
    setSmartQuery("");
    setSmartNote("");
    applyFilters({ q: "", theme: "", region: "", max_price: "" });
  };

  const { quotes, loading: quoteLoading, checkIn: quoteCheckIn } = usePackageLiveQuotes({
    packages,
    checkIn,
    guests,
    enabled: !loading && packages.length > 0,
  });

  const quotesPending = packages.some((p) => quoteLoading[p.slug || p.id]);
  const visiblePackages = useMemo(() => {
    const cap = Number(filters.max_price) || 0;
    const wantsIndia =
      filters.region === "domestic" ||
      /\bindia\b|chardham|kedarnath|pilgrim/i.test(filters.q || "");
    const hideIndiaDefault = shouldHideIndiaDomesticPackages(homeMarket) && !wantsIndia;

    let list = !cap
      ? packages
      : quotesPending
        ? packages
        : packages.filter((p) => {
            const total = quotes[p.slug || p.id]?.stayTotal;
            return typeof total === "number" && total > 0 && total <= cap;
          });

    if (hideIndiaDefault) {
      list = list.filter((p) => packageVisibleInMarket(p, homeMarket) && !packageLooksIndiaDomestic(p));
    } else if (homeMarket) {
      list = list.filter((p) => packageVisibleInMarket(p, homeMarket));
    }

    return [...list].sort((a, b) => {
      const marketDelta = packageMarketScore(b, homeMarket) - packageMarketScore(a, homeMarket);
      if (marketDelta) return marketDelta;
      const qa = quotes[a.slug || a.id]?.stayTotal;
      const qb = quotes[b.slug || b.id]?.stayTotal;
      const aLive = typeof qa === "number" && qa > 0;
      const bLive = typeof qb === "number" && qb > 0;
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      if (aLive && bLive) return qa - qb;
      if (aLive !== bLive) return aLive ? -1 : 1;
      return String(a.title || "").localeCompare(String(b.title || ""));
    });
  }, [packages, filters.max_price, filters.region, filters.q, quotes, quotesPending, homeMarket]);

  const resultLabel = loading
    ? "Loading…"
    : quotesPending && filters.max_price
      ? `Matching live stay to budget… ${packages.length} packages`
      : `${visiblePackages.length} package${visiblePackages.length === 1 ? "" : "s"}`;

  useEffect(() => {
    setUiActionHandler(async (action) => {
      if (action?.type === "apply_nl_filter" || action?.type === "search_packages") {
        const parsed = parseSmartFilter(action.query || action.q || action.text || "");
        applyFilters({
          q: parsed.q || action.q || "",
          theme: parsed.theme || action.theme || "",
          region: parsed.region || action.region || "",
          max_price: parsed.max_price || action.max_price || "",
        });
        return { ok: true, message: parsed.note || "Packages updated" };
      }
      return { ok: false };
    });
    return () => setUiActionHandler(null);
  }, [setUiActionHandler, searchParams]);

  return (
    <PageLayout>
      <div className={`${styles.page}${veroOpen ? ` ${styles.veroCompact}` : ""}`}>
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <motion.p
              className={styles.brand}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              itinero packages
            </motion.p>
            <motion.h1
              className={styles.headline}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.08 }}
            >
              Templates Vero turns into <span className={styles.headlineAccent}>your trip</span>
            </motion.h1>
            <motion.p
              className={styles.sub}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.14 }}
            >
              Pick a circuit. Vero validates days, live stays, and flights before anything is bookable.{" "}
              <Link className={styles.heroLink} to="/explore">
                Explore destinations →
              </Link>
            </motion.p>
            <div className={styles.heroSearch}>
              <SharedPackageSearchBar compact />
            </div>
          </div>
        </section>

        <section className={styles.controls}>
          <div className={styles.controlsInner}>
            <div className={styles.toolbar}>
              <div className={styles.themeRow}>
                {themeOptions.map((t) => (
                  <button
                    key={t.id || "all"}
                    type="button"
                    className={`${styles.chip} ${filters.theme === t.id ? styles.chipActive : ""}`}
                    onClick={() => setFilter("theme", t.id)}
                  >
                    {t.label}
                  </button>
                ))}
                {MORE_THEMES.length > 0 && (
                  <label className={styles.moreWrap}>
                    <span className="sr-only">More ways</span>
                    <select
                      className={`${styles.moreSelect} ${
                        MORE_THEMES.some((w) => w.id === filters.theme) ? styles.chipActive : ""
                      }`}
                      value={MORE_THEMES.some((w) => w.id === filters.theme) ? filters.theme : ""}
                      onChange={(e) => setFilter("theme", e.target.value)}
                    >
                      <option value="">More ways</option>
                      {MORE_THEMES.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <div className={styles.toolbarRight}>
                <label className={styles.selectWrap}>
                  <span>Region</span>
                  <select
                    value={filters.region}
                    onChange={(e) => setFilter("region", e.target.value)}
                  >
                    {regionOptions.map((r) => (
                      <option key={r.id || "all-region"} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.selectWrap}>
                  <span>Live stay</span>
                  <select
                    value={filters.max_price}
                    onChange={(e) => setFilter("max_price", e.target.value)}
                  >
                    {BUDGETS.map((b) => (
                      <option key={b.id || "any"} value={b.id}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className={`${styles.smartChip} ${smartOpen ? styles.smartChipActive : ""}`}
                  onClick={() => setSmartOpen((v) => !v)}
                  aria-expanded={smartOpen}
                >
                  Let Vero Filter
                </button>
              </div>
            </div>

            {smartOpen && (
              <div className={styles.smartPanel}>
                <div className={styles.smartCopy}>
                  <strong>Let Vero Filter</strong>
                  <span>Theme, region, and live stay budget - not brochure prices.</span>
                </div>
                <div className={styles.smartRow}>
                  <input
                    className={styles.smartInput}
                    value={smartQuery}
                    onChange={(e) => setSmartQuery(e.target.value)}
                    placeholder="e.g. safari under 1L, honeymoon international, Chardham"
                    aria-label="Let Vero Filter"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        applySmartFilter();
                      }
                    }}
                  />
                  <button type="button" className={styles.smartApply} onClick={applySmartFilter}>
                    Ask Vero
                  </button>
                  <button type="button" className={styles.smartClear} onClick={clearSmartFilter}>
                    Clear
                  </button>
                </div>
                {smartNote && <p className={styles.smartNote}>{smartNote}</p>}
              </div>
            )}

            <div className={styles.metaRow}>
              <p className={styles.resultCount}>{resultLabel}</p>
              <div className={styles.metaRight}>
                {hasActiveFilters ? (
                  <button type="button" className={styles.clearFilters} onClick={clearSmartFilter}>
                    Clear filters
                  </button>
                ) : null}
                <p className={styles.honesty}>
                  {message ||
                    (shouldHideIndiaDomesticPackages(homeMarket) && !filters.region
                      ? "Showing trips for your region - India circuits are under India circuits filter."
                      : `Live stay · ${quoteCheckIn || "your dates"} · ${guests} guest${
                          guests === 1 ? "" : "s"
                        }`)}
                </p>
              </div>
            </div>
            {hasActiveFilters ? (
              <div className={styles.activeFilters} aria-label="Active filters">
                {filters.theme ? (
                  <span className={styles.filterPill}>
                    {THEMES.find((t) => t.id === filters.theme)?.label ||
                      MORE_THEMES.find((w) => w.id === filters.theme)?.label ||
                      filters.theme}
                  </span>
                ) : null}
                {filters.region ? (
                  <span className={styles.filterPill}>
                    {regionOptions.find((r) => r.id === filters.region)?.label || filters.region}
                  </span>
                ) : null}
                {filters.max_price ? (
                  <span className={styles.filterPill}>
                    {BUDGETS.find((b) => b.id === filters.max_price)?.label || filters.max_price}
                  </span>
                ) : null}
                {filters.q ? <span className={styles.filterPill}>“{filters.q}”</span> : null}
              </div>
            ) : null}
          </div>
        </section>

        <section className={styles.gridSection}>
          {loading && (
            <LoadingState
              title="Loading packages"
              message="Fetching curated itineraries…"
              skeleton="package"
              count={6}
            />
          )}
          {!loading && !visiblePackages.length && (
            <div className={styles.emptyState}>
              <p className={styles.state}>
                No packages match these filters. Try another live-stay budget, theme, or Let Vero Filter.
              </p>
              <div className={styles.emptyActions}>
                <button type="button" className={styles.emptyPrimary} onClick={clearSmartFilter}>
                  Clear filters
                </button>
                <Link className={styles.emptyLink} to="/explore">
                  Explore destinations
                </Link>
              </div>
            </div>
          )}
          {!loading && visiblePackages.length > 0 && (
            <div className={styles.grid}>
              {visiblePackages.map((pkg) => {
                const slug = pkg.slug || pkg.id;
                return (
                  <PackageCard
                    key={pkg.id}
                    pkg={pkg}
                    liveQuote={quotes[slug]}
                    liveLoading={Boolean(quoteLoading[slug])}
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>
    </PageLayout>
  );
}
