import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { PageLayout } from "@/components/layout";
import PackageCard from "@/features/packages/components/PackageCard";
import { packageService } from "@/features/packages/services/packageService";
import usePackageLiveQuotes from "@/features/packages/hooks/usePackageLiveQuotes";
import { flightService } from "@/features/flights/services/flightService";
import { useCurrency } from "@/context/CurrencyContext";
import { useHomeLocation } from "@/context/HomeLocationContext";
import { useVeroUi } from "@/context/VeroUiContext";
import { HOME_ORIGIN_SESSION_KEY } from "@/services/homeLocation";
import { buildExplorePageContext } from "@/features/vero/utils/pageContext";
import {
  getDestinationBySlug,
  relatedDestinations,
  sampleDatesForMonth,
  TRAVEL_WAYS,
} from "./data/catalog";
import { getTravelIntel, summarizeIntelForVero } from "./data/travelIntel";
import { trackInterestEvent } from "@/services/interestTracker";
import { isSaved, toggleSaved } from "@/features/account/savedService";
import { isKlookEnabled, klookHref } from "@/services/klookAffiliate";
import { usePlacesPhoto } from "@/hooks/usePlacesPhoto";
import { PlacesPhotoImg } from "@/components/shared";
import styles from "./ExploreDetailPage.module.css";

const ORIGIN_KEY = HOME_ORIGIN_SESSION_KEY;

const TOC = [
  { id: "snapshot", label: "Snapshot" },
  { id: "health", label: "Health" },
  { id: "visa", label: "Visa" },
  { id: "when", label: "When to go" },
  { id: "money", label: "Money" },
  { id: "safety", label: "Safety" },
  { id: "around", label: "Getting around" },
  { id: "extras", label: "Extras" },
  { id: "culture", label: "Culture" },
];

function wayLabel(id) {
  return TRAVEL_WAYS.find((w) => w.id === id)?.label || id;
}

function emergencyLine(em = {}) {
  const parts = [];
  if (em.all) parts.push(`All ${em.all}`);
  if (em.police) parts.push(`Police ${em.police}`);
  if (em.ambulance) parts.push(`Ambulance ${em.ambulance}`);
  if (em.touristPolice) parts.push(`Tourist police ${em.touristPolice}`);
  return parts.join(" · ");
}

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function ExploreDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { formatMoney, currency } = useCurrency();
  const home = useHomeLocation();
  const { setPageContext, clearPageContext, openVero } = useVeroUi();

  const dest = useMemo(() => getDestinationBySlug(slug), [slug]);
  const placesHero = usePlacesPhoto({
    city: dest?.city || "",
    country: dest?.country || "",
    fallback: dest?.image || "",
    enabled: Boolean(dest?.city),
  });
  const intel = useMemo(() => getTravelIntel(dest), [dest]);
  const related = useMemo(() => relatedDestinations(dest, 6), [dest]);

  const [origin] = useState(() => {
    try {
      return sessionStorage.getItem(ORIGIN_KEY) || home.airportCode || "";
    } catch {
      return home.airportCode || "";
    }
  });
  const passportCountry = home.passportCountry || "";
  const passportLabel = home.passportLabel || "your passport";
  const hasPassport = Boolean(passportCountry);
  const visaCopy = !hasPassport
    ? ""
    : passportCountry === "IN"
      ? intel?.visa?.indian || intel?.visa?.general || ""
      : intel?.visa?.general ||
        `Visa rules depend on ${passportLabel}. Ask Vero for official sources for your nationality.`;
  const [fromPrice, setFromPrice] = useState(null);
  const [bestDate, setBestDate] = useState(null);
  const [fareLoading, setFareLoading] = useState(true);
  const [packages, setPackages] = useState([]);
  const { quotes: pkgQuotes, loading: pkgQuoteLoading } = usePackageLiveQuotes({
    packages,
    guests: 2,
    enabled: packages.length > 0,
  });
  const [activeToc, setActiveToc] = useState("snapshot");
  const [bookmarked, setBookmarked] = useState(() =>
    dest ? isSaved(`explore:${dest.slug || dest.id}`) : false
  );

  useEffect(() => {
    if (!dest) return;
    setBookmarked(isSaved(`explore:${dest.slug || dest.id}`));
    try {
      trackInterestEvent("search", {
        city: dest.city,
        destination: dest.city,
        country: dest.country || "",
        product: "explore",
        theme: (dest.themes || [])[0] || "",
      });
    } catch {
      /* optional */
    }
  }, [dest]);

  useEffect(() => {
    if (!dest) return undefined;
    if (!dest.iata) {
      setFromPrice(null);
      setBestDate(null);
      setFareLoading(false);
      return undefined;
    }
    let alive = true;
    setFareLoading(true);
    const dates = sampleDatesForMonth("").slice(0, 10);
    (async () => {
      try {
        const res = await flightService.priceCalendar({
          origin,
          destination: dest.iata,
          dates,
          adults: 1,
          cabin: "ECONOMY",
          currency,
        });
        if (!alive) return;
        const rows = Array.isArray(res?.dates) ? res.dates : [];
        let min = null;
        let date = null;
        for (const row of rows) {
          const p = row?.minPrice;
          if (typeof p === "number" && p > 0 && (min == null || p < min)) {
            min = p;
            date = row.date;
          }
        }
        setFromPrice(min);
        setBestDate(date);
      } catch {
        if (alive) {
          setFromPrice(null);
          setBestDate(null);
        }
      } finally {
        if (alive) setFareLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [dest, origin, currency]);

  useEffect(() => {
    if (!dest) return undefined;
    let alive = true;
    (async () => {
      const res = await packageService.list({
        region: dest.continent === "india" ? "domestic" : "international",
      });
      if (alive) {
        const list = Array.isArray(res?.packages) ? res.packages : [];
        const destThemes = new Set(dest.themes || []);
        const city = dest.city.toLowerCase();
        const country = (dest.country || "").toLowerCase();
        const scored = list
          .map((p) => {
            const themes = p.themes || (p.theme ? [p.theme] : []);
            const cities = (p.destinations || []).join(" ").toLowerCase();
            const title = (p.title || "").toLowerCase();
            const themeHit = themes.some((t) => destThemes.has(t));
            const cityHit =
              cities.includes(city) ||
              title.includes(city) ||
              (country && (cities.includes(country) || title.includes(country)));
            return { p, score: (cityHit ? 3 : 0) + (themeHit ? 1 : 0) };
          })
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score);
        setPackages((scored.length ? scored.map((x) => x.p) : list).slice(0, 6));
      }
    })();
    return () => {
      alive = false;
    };
  }, [dest]);

  useEffect(() => {
    if (!dest) return undefined;
    setPageContext(
      buildExplorePageContext({
        origin,
        continent: dest.continent,
        theme: dest.themes[0] || "",
        destinations: [
          {
            city: dest.city,
            iata: dest.iata,
            from_price: fromPrice,
          },
        ],
        detail: {
          slug: dest.slug,
          city: dest.city,
          country: dest.country,
          iata: dest.iata,
        },
        intel: summarizeIntelForVero(intel),
        currency,
        passportCountry,
        passportLabel,
        visaForYou: visaCopy,
      })
    );
    return () => clearPageContext();
  }, [
    dest,
    intel,
    origin,
    fromPrice,
    currency,
    passportCountry,
    passportLabel,
    visaCopy,
    setPageContext,
    clearPageContext,
  ]);

  const tocItems = useMemo(
    () => TOC.filter((item) => item.id !== "extras" || isKlookEnabled()),
    []
  );

  useEffect(() => {
    const ids = tocItems.map((t) => t.id);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setActiveToc(visible.target.id);
      },
      { rootMargin: "-120px 0px -55% 0px", threshold: [0.15, 0.35] }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [dest, tocItems]);

  if (!dest) {
    return (
      <PageLayout>
        <div className={styles.page}>
          <p className={styles.empty}>
            Destination not found. <Link to="/explore">Back to Explore</Link>
          </p>
        </div>
      </PageLayout>
    );
  }

  const openFlights = () => {
    const qs = new URLSearchParams({
      from: origin,
      to: dest.iata,
      trip: "oneway",
    });
    if (bestDate) qs.set("date", bestDate);
    navigate(`/flights?${qs.toString()}`);
  };

  const ask = (prompt) => openVero(prompt);
  const emLine = emergencyLine(intel.emergency);

  return (
    <PageLayout>
      <div className={styles.page}>
        <Link to="/explore" className={styles.back}>
          ← All destinations
        </Link>

        <section className={styles.hero}>
          <div className={styles.heroMedia}>
            <img
              src={placesHero || dest.image}
              alt=""
              onError={(e) => {
                e.currentTarget.onerror = null;
                if (dest.image && e.currentTarget.src !== dest.image) {
                  e.currentTarget.src = dest.image;
                  return;
                }
                e.currentTarget.src = `https://picsum.photos/seed/${dest.iata}/960/640`;
              }}
            />
          </div>
          <div className={styles.heroCopy}>
            <motion.p
              className={styles.kicker}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {dest.country}
              {dest.iata ? ` · ${dest.iata}` : " · Road trip"}
            </motion.p>
            <motion.h1
              className={styles.headline}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {dest.city}
            </motion.h1>
            <p className={styles.blurb}>{dest.blurb}</p>
            {dest.minTripDays ? (
              <p className={styles.tripHint}>
                Plan at least {dest.minTripDays} days for a meaningful visit.
              </p>
            ) : null}
            <div className={styles.tags}>
              {dest.themes.map((t) => (
                <span key={t} className={styles.tag}>
                  {wayLabel(t)}
                </span>
              ))}
            </div>
            <div className={styles.ctaRow}>
              <button type="button" className={styles.btnPrimary} onClick={openFlights}>
                Search flights
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => navigate(`/hotels?city=${encodeURIComponent(dest.city)}`)}
              >
                Find hotels
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={async () => {
                  const { shareItineroLink } = await import("@/services/shareLink");
                  await shareItineroLink({
                    title: `${dest.city} on Itinero`,
                    text: dest.blurb || `Explore ${dest.city} with Itinero`,
                    url: `/explore/${dest.slug || dest.id}`,
                    image: dest.image,
                  });
                }}
              >
                Share
              </button>
              <button
                type="button"
                className={styles.btnAsk}
                onClick={() =>
                  ask(
                    `I'm looking at ${dest.city}, ${dest.country}. Walk me through vaccinations, visa, malaria, and the best month to go.`
                  )
                }
              >
                Ask Vero
              </button>
              <button
                type="button"
                className={bookmarked ? styles.btnSaved : styles.btnGhost}
                onClick={() => {
                  const now = toggleSaved({
                    id: `explore:${dest.slug || dest.id}`,
                    type: "destination",
                    title: dest.city,
                    subtitle: dest.country,
                    url: `/explore/${dest.slug}`,
                    image: placesHero || dest.image,
                  });
                  setBookmarked(now);
                }}
              >
                {bookmarked ? "Saved" : "Save"}
              </button>
            </div>
          </div>
        </section>

        <nav className={styles.toc} aria-label="On this page">
          {tocItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.tocBtn} ${activeToc === item.id ? styles.tocBtnActive : ""}`}
              onClick={() => scrollToSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {intel.alerts?.length > 0 && (
          <div className={styles.alertRow} aria-label="Need to know">
            {intel.alerts.map((a) => (
              <span
                key={a.label}
                className={`${styles.alertPill} ${
                  a.tone === "health" ? styles.alertHealth : styles.alertVisa
                }`}
              >
                {a.label}
              </span>
            ))}
          </div>
        )}

        <section id="snapshot" className={styles.block}>
          <div className={styles.blockHead}>
            <div>
              <p className={styles.kicker}>Know before you go</p>
              <h2>Snapshot</h2>
            </div>
          </div>
          <div className={styles.factGrid}>
            <Fact label="Currency" value={intel.currency?.code ? `${intel.currency.code} · ${intel.currency.name}` : "-"} hint={intel.currency?.tip} />
            <Fact label="Language" value={(intel.language || []).join(" · ") || "-"} />
            <Fact label="Time zone" value={intel.timezone || "-"} />
            <Fact label="Plugs" value={intel.plugs || "-"} />
            <Fact label="Calling code" value={intel.callingCode || "-"} />
            <Fact label="Emergency" value={emLine || "-"} hint={intel.emergency?.note} />
          </div>
          {intel.notes?.length > 0 && (
            <ul className={styles.noteList}>
              {intel.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </section>

        <section id="health" className={styles.block}>
          <div className={styles.blockHead}>
            <div>
              <p className={styles.kicker}>Clinic + entry</p>
              <h2>Health & vaccinations</h2>
            </div>
            <button
              type="button"
              className={styles.linkAsk}
              onClick={() =>
                ask(
                  `What vaccinations do I need for ${dest.city}, ${dest.country}? Yellow fever, malaria, typhoid - tell me what is required vs recommended for a ${passportLabel} holder.`
                )
              }
            >
              Ask Vero about vaccines
            </button>
          </div>
          <p className={styles.lead}>
            See a travel clinic 4-6 weeks before departure. This is a planning snapshot, not a prescription.
          </p>

          {intel.health?.required?.length > 0 && (
            <>
              <h3 className={styles.subhead}>Entry / often checked</h3>
              <div className={styles.vaxList}>
                {intel.health.required.map((v) => (
                  <article key={v.name} className={`${styles.vaxCard} ${styles.vaxRequired}`}>
                    <strong>{v.name}</strong>
                    <p>{v.note}</p>
                  </article>
                ))}
              </div>
            </>
          )}

          {intel.health?.recommended?.length > 0 && (
            <>
              <h3 className={styles.subhead}>Usually recommended</h3>
              <div className={styles.vaxList}>
                {intel.health.recommended.map((v) => (
                  <article key={v.name} className={styles.vaxCard}>
                    <strong>{v.name}</strong>
                    {v.note ? <p>{v.note}</p> : null}
                  </article>
                ))}
              </div>
            </>
          )}

          <div className={styles.split2}>
            <article className={styles.infoCard}>
              <h3>Malaria</h3>
              <p>{intel.health?.malaria || "Ask a travel clinic for this region."}</p>
            </article>
            <article className={styles.infoCard}>
              <h3>Water</h3>
              <p>{intel.health?.water || "When unsure, bottled."}</p>
            </article>
            {intel.health?.altitude ? (
              <article className={styles.infoCard}>
                <h3>Altitude</h3>
                <p>{intel.health.altitude}</p>
              </article>
            ) : null}
            {(intel.health?.other || []).length > 0 ? (
              <article className={styles.infoCard}>
                <h3>Also worth knowing</h3>
                <ul>
                  {intel.health.other.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
              </article>
            ) : null}
          </div>
        </section>

        <section id="visa" className={styles.block}>
          <div className={styles.blockHead}>
            <div>
              <p className={styles.kicker}>Immigration</p>
              <h2>Visa & entry</h2>
            </div>
            <button
              type="button"
              className={styles.linkAsk}
              onClick={() =>
                hasPassport
                  ? ask(
                      `Do I need a visa for ${dest.country} on ${passportLabel}? e-visa, VOA, or embassy? My passport nationality is ${passportCountry}.`
                    )
                  : ask(
                      `I need visa advice for ${dest.country}. Ask me for my passport nationality first - do not assume Indian.`
                    )
              }
            >
              Ask Vero about visas
            </button>
          </div>
          <div className={styles.split2}>
            <article className={`${styles.infoCard} ${styles.infoAccent}`}>
              <h3>{hasPassport ? passportLabel : "Your passport"}</h3>
              <p>
                {hasPassport
                  ? visaCopy ||
                    `Ask Vero with your passport nationality for official ${dest.country} entry rules.`
                  : "Set passport nationality in Regional settings (header flag → Home location). We never assume Indian."}
              </p>
            </article>
            <article className={styles.infoCard}>
              <h3>Other passports</h3>
              <p>
                {intel.visa?.general ||
                  "Rules vary by nationality - confirm on the destination immigration site."}
              </p>
            </article>
          </div>
          {(intel.documents || []).length > 0 && (
            <>
              <h3 className={styles.subhead}>Carry at the airport</h3>
              <ul className={styles.chipList}>
                {intel.documents.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </>
          )}
          {(intel.official || []).length > 0 && (
            <p className={styles.officialLinks}>
              Official:{" "}
              {intel.official.map((o, i) => (
                <React.Fragment key={o.href || o.label}>
                  {i > 0 ? " · " : null}
                  <a href={o.href} target="_blank" rel="noreferrer">
                    {o.label}
                  </a>
                </React.Fragment>
              ))}
            </p>
          )}
        </section>

        <section id="when" className={styles.block}>
          <div className={styles.blockHead}>
            <div>
              <p className={styles.kicker}>Seasons</p>
              <h2>When to go</h2>
            </div>
          </div>
          <p className={styles.lead}>
            <strong>Best:</strong> {intel.when?.best || "Check local seasons."}
            {intel.when?.avoid ? (
              <>
                {" "}
                <strong>Mind:</strong> {intel.when.avoid}
              </>
            ) : null}
          </p>
          {(intel.when?.seasons || []).length > 0 && (
            <div className={styles.seasonGrid}>
              {intel.when.seasons.map((s) => (
                <article key={s.name} className={styles.seasonCard}>
                  <p className={styles.seasonMonths}>{s.months}</p>
                  <h3>{s.name}</h3>
                  <p>{s.note}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section id="money" className={styles.block}>
          <div className={styles.blockHead}>
            <div>
              <p className={styles.kicker}>Practical</p>
              <h2>Money & everyday</h2>
            </div>
          </div>
          <div className={styles.split3}>
            <article className={styles.infoCard}>
              <h3>Cards</h3>
              <p>{intel.money?.cards || "Cards in cities; cash elsewhere."}</p>
            </article>
            <article className={styles.infoCard}>
              <h3>ATMs</h3>
              <p>{intel.money?.atm || "Use bank ATMs when possible."}</p>
            </article>
            <article className={styles.infoCard}>
              <h3>Tipping</h3>
              <p>{intel.money?.tipping || "Follow local custom."}</p>
            </article>
          </div>
          {intel.currency?.tip ? <p className={styles.softHint}>{intel.currency.tip}</p> : null}
        </section>

        <section id="safety" className={styles.block}>
          <div className={styles.blockHead}>
            <div>
              <p className={styles.kicker}>{intel.safety?.level || "Awareness"}</p>
              <h2>Safety</h2>
            </div>
          </div>
          <ul className={styles.bulletList}>
            {(intel.safety?.tips || []).map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>

        <section id="around" className={styles.block}>
          <div className={styles.blockHead}>
            <div>
              <p className={styles.kicker}>On the ground</p>
              <h2>Getting around</h2>
            </div>
          </div>
          <ul className={styles.bulletList}>
            {(intel.gettingAround || []).map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>

        {isKlookEnabled() ? (
          <section id="extras" className={styles.block}>
            <div className={styles.blockHead}>
              <div>
                <p className={styles.kicker}>Optional partner</p>
                <h2>Pre-book only if you want</h2>
              </div>
            </div>
            <p className={styles.lead}>
              Visa, money, getting around, hotels, and flights stay on Itinero. Partner checkout
              (Klook) is last resort — we may earn a referral if you use it.
            </p>
            <div className={styles.partnerGrid}>
              <a
                className={styles.partnerCard}
                href={klookHref("activities", { city: dest.city, iata: dest.iata })}
                target="_blank"
                rel="sponsored noopener noreferrer"
              >
                <strong>Things to do</strong>
                <span>Tours, tickets, day trips</span>
              </a>
              <a
                className={styles.partnerCard}
                href={klookHref("cars", { city: dest.city, iata: dest.iata })}
                target="_blank"
                rel="sponsored noopener noreferrer"
              >
                <strong>Rent a car</strong>
                <span>Self-drive from local lessors</span>
              </a>
              <a
                className={styles.partnerCard}
                href={klookHref("transfers", { city: dest.city, iata: dest.iata })}
                target="_blank"
                rel="sponsored noopener noreferrer"
              >
                <strong>Airport transfer</strong>
                <span>Prebook pickup at {dest.iata || dest.city}</span>
              </a>
              <a
                className={styles.partnerCard}
                href={klookHref("esim", { city: dest.city, iata: dest.iata })}
                target="_blank"
                rel="sponsored noopener noreferrer"
              >
                <strong>eSIM</strong>
                <span>Data before you land</span>
              </a>
            </div>
          </section>
        ) : null}

        <section id="culture" className={styles.block}>
          <div className={styles.blockHead}>
            <div>
              <p className={styles.kicker}>Respect the place</p>
              <h2>Culture & packing</h2>
            </div>
          </div>
          <div className={styles.split2}>
            <article className={styles.infoCard}>
              <h3>Culture</h3>
              <ul>
                {(intel.culture || []).map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </article>
            <article className={styles.infoCard}>
              <h3>Pack</h3>
              <ul className={styles.chipList}>
                {(intel.packing || []).map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </article>
          </div>
        </section>

        <p className={styles.disclaimer}>{intel.disclaimer}</p>

        <section className={styles.block}>
          <div className={styles.blockHead}>
            <div>
              <p className={styles.kicker}>Live fares</p>
              <h2>From {origin}</h2>
            </div>
            <button type="button" className={styles.btnPrimary} onClick={openFlights}>
              Open flight search
            </button>
          </div>
          {fareLoading ? (
            <span className={styles.skeleton} />
          ) : !dest.iata ? (
            <p className={styles.fareHint}>
              No airport code - this is usually a road or ferry hop from your city. Search nearby airports
              or ask Vero for the best way in.
            </p>
          ) : typeof fromPrice === "number" ? (
            <>
              <p className={styles.fareBig}>From {formatMoney(fromPrice)}</p>
              <p className={styles.fareHint}>
                {bestDate
                  ? `Lowest sampled economy fare around ${bestDate} · 1 adult`
                  : "Sampled from the live price calendar - not a locked fare."}
              </p>
            </>
          ) : (
            <p className={styles.fareHint}>
              Live fare unavailable right now - search flights for current prices.
            </p>
          )}
        </section>

        {packages.length > 0 && (
          <section className={styles.block}>
            <div className={styles.blockHead}>
              <div>
                <p className={styles.kicker}>If you want it bundled</p>
                <h2>Matching packages</h2>
              </div>
              <Link to="/packages" className={styles.linkAsk}>
                Browse packages
              </Link>
              {dest.themes?.[0] ? (
                <Link
                  to={`/packages?theme=${encodeURIComponent(dest.themes[0])}`}
                  className={styles.linkAsk}
                >
                  {wayLabel(dest.themes[0])} trips
                </Link>
              ) : null}
            </div>
            <div className={styles.packagesGrid}>
              {packages.map((pkg) => {
                const slug = pkg.slug || pkg.id;
                return (
                  <PackageCard
                    key={pkg.id || pkg.slug}
                    pkg={pkg}
                    liveQuote={pkgQuotes[slug]}
                    liveLoading={Boolean(pkgQuoteLoading[slug])}
                  />
                );
              })}
            </div>
          </section>
        )}

        <section className={styles.block}>
          <div className={styles.blockHead}>
            <div>
              <p className={styles.kicker}>Same vibe</p>
              <h2>Related destinations</h2>
            </div>
          </div>
          <div className={styles.relatedGrid}>
            {related.map((d) => (
              <button
                key={d.id}
                type="button"
                className={styles.relatedCard}
                onClick={() => navigate(`/explore/${d.slug}`)}
              >
                <PlacesPhotoImg
                  city={d.city}
                  country={d.country}
                  fallback={d.image}
                  alt=""
                  loading="lazy"
                />
                <span>
                  <strong>{d.city}</strong>
                  <em>{d.country}</em>
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </PageLayout>
  );
}

function Fact({ label, value, hint }) {
  return (
    <article className={styles.fact}>
      <p className={styles.factLabel}>{label}</p>
      <p className={styles.factValue}>{value}</p>
      {hint ? <p className={styles.factHint}>{hint}</p> : null}
    </article>
  );
}
