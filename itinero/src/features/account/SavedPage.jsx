import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bookmark, Compass, MapPin, Sparkles, Trash2 } from "lucide-react";
import { PageLayout } from "@/components/layout";
import { PlacesCarousel, PlacesPhotoImg, ActionButton, ActionRow } from "@/components/shared";
import { useVeroUiOptional } from "@/context/VeroUiContext";
import { placesPhotoProxyUrl } from "@/hooks/usePlacesPhoto";
import { EXPLORE_CATALOG } from "@/features/explore/data/catalog";
import { veroInsights } from "@/features/explore/exploreEngine";
import { isSaved, listSaved, removeSaved, toggleSaved } from "./savedService";
import styles from "./SavedPage.module.css";

const STARTERS = ["udaipur", "bali", "dubai", "istanbul"]
  .map((slug) => EXPLORE_CATALOG.find((d) => d.slug === slug || d.id === slug))
  .filter(Boolean);

function destSlides(city, country = "", fallback = "", theme = "") {
  const c = String(city || "").trim();
  if (!c && !fallback) return [];
  const seen = new Set();
  const out = [];
  const push = (url) => {
    if (!url || seen.has(url) || out.length >= 4) return;
    seen.add(url);
    out.push(url);
  };
  if (c) {
    [
      `${c} landmark tourist attraction`,
      theme ? `${c} ${theme}` : `${c} scenic viewpoint`,
      `${c} famous place`,
      `${c} travel destination`,
    ].forEach((q, i) => {
      push(
        placesPhotoProxyUrl({
          city: c,
          country,
          query: q,
          index: i % 3,
          maxPx: 900,
        })
      );
    });
  }
  if (fallback) push(fallback);
  return out;
}

/**
 * Simple inspiration board - save / open / remove. No booking clutter.
 */
export default function SavedPage() {
  const navigate = useNavigate();
  const veroUi = useVeroUiOptional();
  const [rows, setRows] = useState(() => listSaved());

  const refresh = () => setRows(listSaved());

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    veroUi?.setPageContext?.({
      screen: "saved",
      results_summary: { count: rows.length },
      saved: {
        count: rows.length,
        titles: rows.slice(0, 8).map((r) => r.title).filter(Boolean),
      },
    });
    return () => veroUi?.clearPageContext?.();
  }, [rows, veroUi]);

  const starters = useMemo(
    () => STARTERS.filter((d) => !isSaved(`explore:${d.slug || d.id}`)).slice(0, 4),
    [rows]
  );

  const insights = useMemo(() => veroInsights({ origin: "BOM", originLabel: "Mumbai" }), [rows]);

  const askVero = () => {
    const savedNames = [
      insights.goFirst?.dest?.city,
      ...insights.otherSaved.map((r) => r.dest.city),
    ].filter(Boolean);
    const also = insights.alsoTry.map((r) => r.dest.city).filter(Boolean);
    const prompt = savedNames.length
      ? `I saved ${savedNames.join(", ")}. From those, where should I go first, and what else should I look at${also.length ? ` (maybe ${also.join(", ")})` : ""}? Vibe and season - no booking quotes.`
      : "I'm on Saved with an empty board. Suggest a few destinations worth bookmarking.";
    if (veroUi?.openVero) {
      veroUi.openVero({ prompt, source: "saved", forceNew: true });
      return;
    }
    navigate("/vero");
  };

  const saveStarter = (dest) => {
    toggleSaved({
      id: `explore:${dest.slug || dest.id}`,
      type: "destination",
      title: dest.city,
      subtitle: dest.country,
      url: `/explore/${dest.slug}`,
      image: dest.image,
    });
    refresh();
  };

  const goFirstSlides = useMemo(() => {
    const d = insights.goFirst?.dest;
    if (!d) return [];
    return destSlides(d.city, d.country, d.image, (d.themes || [])[0] || "");
  }, [insights.goFirst]);

  return (
    <PageLayout>
      <div className={styles.page}>
        <header className={styles.head}>
          <div>
            <p className={styles.kicker}>Your travel</p>
            <h1 className={styles.title}>Saved</h1>
            <p className={styles.lede}>
              Places you want later. Bookings stay in{" "}
              <Link to="/trips">My Trips</Link>.
            </p>
          </div>
          <ActionRow align="end" className={styles.headActions}>
            <ActionButton variant="ghost" pill onClick={askVero}>
              <Sparkles size={16} aria-hidden /> Ask Vero
            </ActionButton>
            <ActionButton to="/explore" pill>
              <Compass size={16} aria-hidden /> Explore
            </ActionButton>
          </ActionRow>
        </header>

        {insights.savedCount > 0 && insights.goFirst ? (
          <section className={styles.insights} aria-labelledby="saved-insights">
            <div className={styles.insightsHead}>
              <img
                className={styles.insightsAvatar}
                src={`${import.meta.env.BASE_URL}vero-chatbot.png`}
                alt=""
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              <div className={styles.insightsHeadCopy}>
                <p className={styles.insightsFrom}>From Vero</p>
                <h2 id="saved-insights">Where to go first</h2>
                <p className={styles.insightsLede}>{insights.lede}</p>
              </div>
              <button type="button" className={styles.insightsAsk} onClick={askVero}>
                <Sparkles size={15} aria-hidden /> Ask Vero to decide
              </button>
            </div>

            <div className={styles.insightHero}>
              <Link
                to={`/explore/${insights.goFirst.dest.slug}`}
                className={styles.insightHeroMedia}
              >
                <PlacesCarousel
                  slides={goFirstSlides}
                  fallback={insights.goFirst.dest.image}
                  alt={insights.goFirst.dest.city}
                  autoMs={3800}
                  className={styles.insightCarousel}
                />
                <span className={styles.insightBadge}>Go here first</span>
              </Link>
              <div className={styles.insightHeroBody}>
                <p className={styles.insightCountry}>
                  <MapPin size={12} aria-hidden /> {insights.goFirst.dest.country}
                </p>
                <h3>{insights.goFirst.dest.city}</h3>
                <p className={styles.insightWhy}>{insights.goFirst.why}</p>
                <div className={styles.insightChips}>
                  {(insights.goFirst.reasons || []).map((r) => (
                    <span key={r}>{r}</span>
                  ))}
                </div>
                <div className={styles.insightActions}>
                  <Link
                    to={`/explore/${insights.goFirst.dest.slug}`}
                    className={styles.insightOpen}
                  >
                    Open {insights.goFirst.dest.city}
                  </Link>
                  <button type="button" className={styles.insightGhost} onClick={askVero}>
                    Compare with Vero
                  </button>
                </div>
              </div>
            </div>

            {insights.otherSaved.length ? (
              <div className={styles.alsoBlock}>
                <div className={styles.alsoHead}>
                  <h3>Also on your board</h3>
                  <p>Saved, ranked after {insights.goFirst.dest.city}</p>
                </div>
                <div className={styles.alsoRow}>
                  {insights.otherSaved.map((row, i) => (
                    <Link
                      key={row.dest.id}
                      to={`/explore/${row.dest.slug}`}
                      className={styles.alsoCard}
                    >
                      <div className={styles.alsoMedia}>
                        <PlacesCarousel
                          slides={destSlides(
                            row.dest.city,
                            row.dest.country,
                            row.dest.image,
                            (row.dest.themes || [])[0] || ""
                          )}
                          fallback={row.dest.image}
                          alt={row.dest.city}
                          autoMs={4200 + i * 400}
                          className={styles.alsoCarousel}
                        />
                      </div>
                      <span className={styles.alsoCopy}>
                        <strong>{row.dest.city}</strong>
                        <em>{row.why}</em>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            {insights.alsoTry.length ? (
              <div className={styles.alsoBlock}>
                <div className={styles.alsoHead}>
                  <h3>Other places you’d like</h3>
                  <p>Not saved yet - close to your taste</p>
                </div>
                <div className={styles.alsoRow}>
                  {insights.alsoTry.map((row, i) => (
                    <Link
                      key={row.dest.id}
                      to={`/explore/${row.dest.slug}`}
                      className={styles.alsoCard}
                    >
                      <div className={styles.alsoMedia}>
                        <PlacesCarousel
                          slides={destSlides(
                            row.dest.city,
                            row.dest.country,
                            row.dest.image,
                            (row.dest.themes || [])[0] || ""
                          )}
                          fallback={row.dest.image}
                          alt={row.dest.city}
                          autoMs={4400 + i * 350}
                          className={styles.alsoCarousel}
                        />
                      </div>
                      <span className={styles.alsoCopy}>
                        <strong>{row.dest.city}</strong>
                        <em>{row.why}</em>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {rows.length === 0 ? (
          <section className={styles.empty}>
            <div className={styles.emptyIcon} aria-hidden>
              <Bookmark size={26} strokeWidth={2.2} />
            </div>
            <h2>Nothing saved yet</h2>
            <p>Tap Save on a destination from Explore, or start with one below.</p>

            {starters.length ? (
              <div className={styles.starterRow}>
                {starters.map((dest) => (
                  <button
                    key={dest.id}
                    type="button"
                    className={styles.starter}
                    onClick={() => saveStarter(dest)}
                  >
                    <PlacesPhotoImg
                      city={dest.city}
                      country={dest.country}
                      fallback={dest.image}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = `https://picsum.photos/seed/${dest.id}/640/480`;
                      }}
                    />
                    <span>
                      <strong>{dest.city}</strong>
                      <em>Save</em>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        ) : (
          <section className={styles.board} aria-label="Saved items">
            <div className={styles.boardHead}>
              <div>
                <p className={styles.kicker}>Your board</p>
                <h2>
                  {rows.length} saved place{rows.length === 1 ? "" : "s"}
                </h2>
              </div>
              <Link to="/explore" className={styles.boardLink}>
                Find more
              </Link>
            </div>
            <div className={styles.grid}>
              {rows.map((row, i) => {
                const isDest =
                  row.type === "destination" || String(row.id || "").startsWith("explore:");
                const slides = isDest
                  ? destSlides(row.title, row.subtitle || "", row.image || "")
                  : row.image
                    ? [row.image]
                    : [];
                return (
                  <article key={row.id} className={styles.card}>
                    <Link to={row.url || "/explore"} className={styles.media}>
                      {slides.length ? (
                        <PlacesCarousel
                          slides={slides}
                          fallback={row.image || ""}
                          alt={row.title}
                          autoMs={4000 + (i % 4) * 300}
                          className={styles.cardCarousel}
                        />
                      ) : (
                        <div className={styles.thumb} aria-hidden>
                          <Bookmark size={24} />
                        </div>
                      )}
                    </Link>
                    <div className={styles.body}>
                      <p className={styles.meta}>{row.subtitle || row.type || "Saved"}</p>
                      <h3>
                        <Link to={row.url || "/explore"}>{row.title}</Link>
                      </h3>
                      <div className={styles.actions}>
                        <Link to={row.url || "/explore"} className={styles.open}>
                          Open
                        </Link>
                        <button
                          type="button"
                          className={styles.remove}
                          aria-label={`Remove ${row.title}`}
                          onClick={() => {
                            removeSaved(row.id);
                            refresh();
                          }}
                        >
                          <Trash2 size={15} aria-hidden />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </PageLayout>
  );
}
