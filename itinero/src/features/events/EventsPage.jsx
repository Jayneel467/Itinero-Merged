import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { PageLayout } from "@/components/layout";
import SharedEventSearchBar from "@/components/SharedEventSearchBar/SharedEventSearchBar";
import { LoadingState } from "@/components/shared";
import { useVeroUi } from "@/context/VeroUiContext";
import EventCard from "./components/EventCard";
import { eventService } from "./services/eventService";
import { isKlookEnabled, klookHref } from "@/services/klookAffiliate";
import styles from "./EventsPage.module.css";

const TYPES = [
  { id: "", label: "All" },
  { id: "music", label: "Music" },
  { id: "sports", label: "Sports" },
  { id: "theatre", label: "Theatre" },
  { id: "family", label: "Family" },
  { id: "film", label: "Film" },
];

const CITIES = [
  "New York",
  "London",
  "Orlando",
  "Los Angeles",
  "Chicago",
  "Paris",
  "Toronto",
  "Sydney",
];

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function plusDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function EventsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isOpen: veroOpen } = useVeroUi();
  const [data, setData] = useState({ events: [], total: 0, message: "", mode: "ok" });
  const [loading, setLoading] = useState(true);

  const filters = useMemo(
    () => ({
      city: searchParams.get("city") || "New York",
      keyword: searchParams.get("keyword") || "",
      classification: searchParams.get("classification") || "",
      start: searchParams.get("start") || todayYmd(),
      end: searchParams.get("end") || plusDays(14),
    }),
    [searchParams]
  );

  const setFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (!next.get("city")) next.set("city", filters.city);
    if (!next.get("start")) next.set("start", filters.start);
    if (!next.get("end")) next.set("end", filters.end);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    eventService
      .search({
        city: filters.city,
        keyword: filters.keyword || undefined,
        classification: filters.classification || undefined,
        start: filters.start,
        end: filters.end,
        size: 24,
      })
      .then((res) => {
        if (cancelled) return;
        setData({
          events: Array.isArray(res?.events) ? res.events : [],
          total: res?.total || 0,
          message: res?.message || "",
          mode: res?.mode || "ok",
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters.city, filters.keyword, filters.classification, filters.start, filters.end]);

  return (
    <PageLayout>
      <div className={`${styles.page}${veroOpen ? ` ${styles.veroCompact}` : ""}`}>
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <motion.p
              className={styles.brand}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              itinero events
            </motion.p>
            <motion.h1
              className={styles.headline}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
            >
              What’s on <span className={styles.headlineAccent}>tonight</span>
            </motion.h1>
            <motion.p
              className={styles.sub}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14 }}
            >
              Live concerts, sports, and theatre. Pick a show, then get tickets.
            </motion.p>
            <div className={styles.heroSearch}>
              <SharedEventSearchBar compact />
            </div>
          </div>
        </section>

        <section className={styles.controls}>
          <div className={styles.controlsInner}>
            <div className={styles.toolbar}>
              <div className={styles.themeRow}>
                {TYPES.map((t) => (
                  <button
                    key={t.id || "all"}
                    type="button"
                    className={`${styles.chip} ${filters.classification === t.id ? styles.chipActive : ""}`}
                    onClick={() => setFilter("classification", t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className={styles.themeRow}>
                {CITIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`${styles.chip} ${filters.city === c ? styles.chipActive : ""}`}
                    onClick={() => setFilter("city", c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.metaRow}>
              <p className={styles.resultCount}>
                {loading
                  ? "Loading live events…"
                  : `${data.events.length} event${data.events.length === 1 ? "" : "s"}`}
              </p>
              <p className={styles.honesty}>
                Live listings are strongest in US, UK, and Europe cities. Checkout opens on the official ticketing site.
              </p>
            </div>
          </div>
        </section>

        <section className={styles.gridSection}>
          {loading ? (
            <LoadingState title="Finding live events" message="Checking what’s on for your dates." count={6} />
          ) : data.events.length === 0 ? (
            <div className={styles.state}>
              <p>{data.message || "No events found."}</p>
              {isKlookEnabled() ? (
                <>
                  <p className={styles.klookHint}>
                    Try experiences and tickets on Klook instead. Checkout is on Klook - we may earn a referral if you book.
                  </p>
                  <a
                    className={styles.klookBtn}
                    href={klookHref("activities", { city: filters.city })}
                    target="_blank"
                    rel="sponsored noopener noreferrer"
                  >
                    Browse experiences
                  </a>
                </>
              ) : null}
            </div>
          ) : (
            <div className={styles.grid}>
              {data.events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )}
        </section>
      </div>
    </PageLayout>
  );
}
