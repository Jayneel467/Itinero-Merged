import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  Bus,
  CircleHelp,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { PageLayout } from "@/components/layout";
import { LoadingState } from "@/components/shared";
import { useHomeLocationOptional } from "@/context/HomeLocationContext";
import { useVeroUi } from "@/context/VeroUiContext";
import { buildBusesPageContext } from "@/features/vero/utils/pageContext";
import TrainModifySearchBar from "@/features/trains/components/TrainModifySearchBar";
import BusCard from "./components/BusCard";
import { BUS_CITIES, EU_PAIRS, INDIA_PAIRS, US_PAIRS } from "./data/busCities";
import { busService } from "./services/busService";
import { busBookUrl, busRegion } from "./utils/busBook";
import styles from "./BusesPage.module.css";

const WINDOWS = [
  { id: "morning", label: "Morning (06 AM - 12 noon)" },
  { id: "afternoon", label: "Afternoon (12 noon - 06 PM)" },
  { id: "evening", label: "Evening (06 PM - 12 midnight)" },
  { id: "night", label: "Night (12 midnight - 06 AM)" },
];

const MODES = [
  {
    Icon: Building2,
    kicker: "Same city",
    title: "City buses, metro & tram",
    copy: "Search two places in the same city. We show the route, boarding stop, and walk/ride steps — like Google Maps. You pay on the bus or at the metro gate.",
  },
  {
    Icon: Bus,
    kicker: "City to city",
    title: "Intercity coaches",
    copy: "Search two cities. We list private and state coaches with type (AC, sleeper, Volvo) and a live fare when we have one. You finish the ticket with our booking partner.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Search from and to",
    copy: "Type a city or a stop. Same city = local transit. Two cities = coaches.",
  },
  {
    n: "02",
    title: "Pick a date",
    copy: "Or tap a popular route below — we search tomorrow’s rides.",
  },
  {
    n: "03",
    title: "Open a ride",
    copy: "City cards give directions. Coach cards send you to partner checkout. We never invent a price.",
  },
];

const FAQ = [
  {
    q: "Is this trains or flights?",
    a: "No. Transits is only buses, metro, tram, ferry, and coaches between cities. Indian Railways is on Trains. Air tickets are on Flights.",
  },
  {
    q: "Do I buy the ticket on Itinero?",
    a: "City rides: no — pay on the vehicle. Coaches: pick the operator here, then complete payment on our partner site. We never make up a fare.",
  },
  {
    q: "Why is it marked beta?",
    a: "We only show live feeds. If a route isn’t listed, try a nearby city name or a popular route below.",
  },
];

function depMins(raw) {
  const m = String(raw || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 99_999;
  return Number(m[1]) * 60 + Number(m[2]);
}

function durationMins(bus) {
  if (typeof bus?.duration_mins === "number" && bus.duration_mins > 0) return bus.duration_mins;
  const s = String(bus?.duration || "");
  const h = /(\d+)\s*h/i.exec(s);
  const m = /(\d+)\s*m/i.exec(s);
  if (!h && !m) return depMins(bus?.arr) - depMins(bus?.dep) || 99_999;
  return (h ? Number(h[1]) : 0) * 60 + (m ? Number(m[1]) : 0);
}

function windowOfMins(mins) {
  if (mins >= 6 * 60 && mins < 12 * 60) return "morning";
  if (mins >= 12 * 60 && mins < 18 * 60) return "afternoon";
  if (mins >= 18 * 60 && mins < 24 * 60) return "evening";
  return "night";
}

function toYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function whenToYmd(when) {
  const t = String(when || "").trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date();
  if (t === "today") return toYmd(d);
  d.setDate(d.getDate() + 1);
  return toYmd(d);
}

function dateChip(iso, index) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return { iso, line: iso, sub: "" };
  return {
    iso,
    line: index === 0 ? "Today" : index === 1 ? "Tomorrow" : d.toLocaleDateString("en-GB", { weekday: "short" }),
    sub: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
  };
}

function Check({ checked, onChange, label, count }) {
  return (
    <label className={styles.check}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{label}</span>
      {count != null ? <em>{count}</em> : null}
    </label>
  );
}

function tomorrowYmd() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toYmd(d);
}

export default function BusesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const homeCtx = useHomeLocationOptional();
  const homeCity = String(homeCtx?.home?.city || "").trim();
  const { setPageContext, clearPageContext, isOpen: veroOpen } = useVeroUi();

  const fromParam = searchParams.get("from") || searchParams.get("origin") || "";
  const toParam = searchParams.get("to") || searchParams.get("destination") || "";
  const whenParam = searchParams.get("when") || searchParams.get("date") || "tomorrow";
  const windowParam = searchParams.get("window") || "";
  const hasSearch = Boolean(fromParam.trim() && toParam.trim());

  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [draftWhen, setDraftWhen] = useState(() => tomorrowYmd());
  const homePrefillDone = useRef(false);

  useEffect(() => {
    if (homePrefillDone.current || hasSearch || draftFrom || !homeCity) return;
    homePrefillDone.current = true;
    setDraftFrom(homeCity);
  }, [homeCity, hasSearch, draftFrom]);

  const [data, setData] = useState({
    buses: [],
    total: 0,
    message: "",
    user_message: "",
    region: "",
    mode: "ok",
    local: false,
  });
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState("dep");
  const [quick, setQuick] = useState({
    ac: false,
    sleeper: false,
    seater: false,
    volvo: false,
    rtc: false,
    nonac: false,
    live: false,
  });
  const [depWindows, setDepWindows] = useState([]);
  const [operators, setOperators] = useState([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const reqRef = useRef(0);

  // Depend on string params - not the searchParams object (new identity each render → update loop).
  const filters = useMemo(
    () => ({
      from: fromParam.trim(),
      to: toParam.trim(),
      when: whenParam,
      window: windowParam,
    }),
    [fromParam, toParam, whenParam, windowParam]
  );

  const journeyYmd = whenToYmd(filters.when || draftWhen);
  const dateChips = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        return dateChip(toYmd(d), i);
      }),
    []
  );

  const [searchHint, setSearchHint] = useState("");

  const applySearch = (patch) => {
    const next = new URLSearchParams(searchParams);
    const from = (patch.from ?? filters.from ?? draftFrom).trim();
    const to = (patch.to ?? filters.to ?? draftTo).trim();
    if (!from || !to) {
      setSearchHint("Enter both a start and a destination, or tap a popular route.");
      return;
    }
    setSearchHint("");
    next.set("from", from);
    next.set("to", to);
    const when = patch.when ?? filters.when ?? draftWhen;
    if (when) {
      next.set("when", when);
      if (/^\d{4}-\d{2}-\d{2}$/.test(when)) next.set("date", when);
    }
    if (patch.window != null) {
      if (patch.window) next.set("window", patch.window);
      else next.delete("window");
    }
    setDraftFrom(from);
    setDraftTo(to);
    if (when) setDraftWhen(whenToYmd(when));
    setSearchParams(next, { replace: false });
  };

  const clearToLanding = () => {
    setSearchParams({}, { replace: false });
    setData({
      buses: [],
      total: 0,
      message: "",
      user_message: "",
      region: "",
      mode: "ok",
      local: false,
    });
    setLoading(false);
    setQuick({ ac: false, sleeper: false, seater: false, volvo: false, rtc: false, nonac: false, live: false });
    setDepWindows([]);
    setOperators([]);
  };

  const loadBuses = useCallback(() => {
    if (!filters.from || !filters.to) return;
    const req = ++reqRef.current;
    setLoading(true);
    setOperators([]);
    setData((prev) => ({ ...prev, buses: [], total: 0, message: "", user_message: "" }));
    busService
      .search({
        origin: filters.from,
        destination: filters.to,
        when: filters.when,
        window: filters.window || undefined,
        date: /^\d{4}-\d{2}-\d{2}$/.test(filters.when) ? filters.when : undefined,
        limit: 80,
      })
      .then((res) => {
        if (req !== reqRef.current) return;
        setData({
          buses: Array.isArray(res?.buses) ? res.buses : [],
          total: res?.total || 0,
          message: res?.message || "",
          user_message: res?.user_message || "",
          region: res?.region || "",
          mode: res?.mode || "ok",
          local: Boolean(res?.local || (res?.buses || []).some((b) => b.local)),
        });
        setOperators([]);
      })
      .finally(() => {
        if (req === reqRef.current) setLoading(false);
      });
  }, [filters.from, filters.to, filters.when, filters.window]);

  useEffect(() => {
    if (!hasSearch) {
      reqRef.current += 1;
      setLoading(false);
      setData((prev) => {
        if (
          !prev.buses.length &&
          !prev.total &&
          !prev.message &&
          !prev.user_message
        ) {
          return prev;
        }
        return { ...prev, buses: [], total: 0, message: "", user_message: "" };
      });
      return;
    }
    loadBuses();
  }, [hasSearch, loadBuses]);

  useEffect(() => {
    setPageContext(
      buildBusesPageContext({
        origin: hasSearch ? filters.from : "",
        destination: hasSearch ? filters.to : "",
        when: filters.when,
        window: filters.window,
        buses: data.buses,
        isLoading: loading,
      })
    );
  }, [
    hasSearch,
    filters.from,
    filters.to,
    filters.when,
    filters.window,
    data.buses,
    loading,
    setPageContext,
  ]);

  useEffect(() => () => clearPageContext(), [clearPageContext]);

  const operatorCounts = useMemo(() => {
    const map = new Map();
    data.buses.forEach((b) => {
      const name = String(b.operator || "").trim();
      if (!name) return;
      map.set(name, (map.get(name) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [data.buses]);

  const listed = useMemo(() => {
    let rows = data.buses.slice();
    if (quick.ac) rows = rows.filter((b) => b.ac || (/\bac\b/i.test(b.bus_type || "") && !/non[\s-]?ac/i.test(b.bus_type || "")));
    if (quick.nonac) rows = rows.filter((b) => b.non_ac || /non[\s-]?a\/?c/i.test(b.bus_type || ""));
    if (quick.sleeper) rows = rows.filter((b) => b.sleeper || /sleeper/i.test(b.bus_type || ""));
    if (quick.seater) rows = rows.filter((b) => b.seater || /seater/i.test(b.bus_type || "") || !b.sleeper);
    if (quick.volvo) rows = rows.filter((b) => b.volvo || /volvo/i.test(`${b.bus_type} ${b.operator}`));
    if (quick.rtc) rows = rows.filter((b) => b.rtc || /gsrtc|msrtc|ksrtc|rsrtc|state road/i.test(b.operator || ""));
    if (quick.live) rows = rows.filter((b) => b.live_tracking);
    if (depWindows.length) {
      rows = rows.filter((b) => depWindows.includes(windowOfMins(depMins(b.dep))));
    }
    if (operators.length) {
      rows = rows.filter((b) => operators.includes(b.operator));
    }
    if (sort === "arr") rows.sort((a, b) => depMins(a.arr) - depMins(b.arr));
    else if (sort === "dur") rows.sort((a, b) => durationMins(a) - durationMins(b));
    else if (sort === "fare") {
      rows.sort((a, b) => {
        const fa = typeof a.fare === "number" ? a.fare : 9e9;
        const fb = typeof b.fare === "number" ? b.fare : 9e9;
        return fa - fb;
      });
    } else if (sort === "rating") {
      rows.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
    } else rows.sort((a, b) => depMins(a.dep) - depMins(b.dep));
    return rows;
  }, [data.buses, quick, depWindows, operators, sort]);

  const counts = useMemo(() => {
    const rows = data.buses;
    return {
      ac: rows.filter((b) => b.ac || (/\bac\b/i.test(b.bus_type || "") && !/non[\s-]?ac/i.test(b.bus_type || ""))).length,
      nonac: rows.filter((b) => b.non_ac || /non[\s-]?a\/?c/i.test(b.bus_type || "")).length,
      sleeper: rows.filter((b) => b.sleeper || /sleeper/i.test(b.bus_type || "")).length,
      seater: rows.filter((b) => b.seater || /seater/i.test(b.bus_type || "")).length,
      volvo: rows.filter((b) => b.volvo || /volvo/i.test(`${b.bus_type} ${b.operator}`)).length,
      rtc: rows.filter((b) => b.rtc || /gsrtc|msrtc|ksrtc|rsrtc|state road/i.test(b.operator || "")).length,
      live: rows.filter((b) => b.live_tracking).length,
      night: rows.filter((b) => windowOfMins(depMins(b.dep)) === "night").length,
    };
  }, [data.buses]);

  const fastestId = useMemo(() => {
    if (!listed.length) return "";
    return listed.reduce((best, b) => (durationMins(b) < durationMins(best) ? b : best)).id || "";
  }, [listed]);

  const cheapestId = useMemo(() => {
    const priced = listed.filter((b) => typeof b.fare === "number");
    if (!priced.length) return "";
    return priced.reduce((best, b) => (b.fare < best.fare ? b : best)).id || "";
  }, [listed]);

  const regionGuess = busRegion(filters.from || draftFrom || homeCity || "Surat", filters.to || draftTo || "Vadodara");
  const region = data.region || regionGuess;
  const popularPairs = region === "US" ? US_PAIRS : region === "EU" ? EU_PAIRS : INDIA_PAIRS;
  const partnerUrl = busBookUrl({ from: filters.from, to: filters.to, date: journeyYmd });
  const emptyCopy =
    data.user_message ||
    (data.message && !/do not invent|left buses page/i.test(data.message)
      ? data.message
      : data.local
        ? `No live transit found for ${filters.from} → ${filters.to} right now.`
        : `No live coaches found from ${filters.from} to ${filters.to} on this date. Open partner checkout for more operators.`);

  const toggleWin = (id) => {
    setDepWindows((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const toggleOp = (name) => {
    setOperators((cur) => (cur.includes(name) ? cur.filter((x) => x !== name) : [...cur, name]));
  };

  const setFeat = (key) => {
    if (key === "all") {
      setQuick({ ac: false, sleeper: false, seater: false, volvo: false, rtc: false, nonac: false, live: false });
      setDepWindows([]);
      return;
    }
    if (key === "night") {
      setDepWindows((cur) => (cur.length === 1 && cur[0] === "night" ? [] : ["night"]));
      return;
    }
    setQuick((q) => ({ ...q, [key]: !q[key] }));
  };

  const sidebar = (
    <aside className={styles.sidebar}>
      <div className={styles.sideCard}>
        <h3>Quick filters</h3>
        <Check checked={quick.ac} onChange={() => setQuick((q) => ({ ...q, ac: !q.ac }))} label="AC only" count={counts.ac} />
        {region === "IN" ? (
          <>
            <Check checked={quick.nonac} onChange={() => setQuick((q) => ({ ...q, nonac: !q.nonac }))} label="Non-AC" count={counts.nonac} />
            <Check checked={quick.sleeper} onChange={() => setQuick((q) => ({ ...q, sleeper: !q.sleeper }))} label="Sleeper" count={counts.sleeper} />
            <Check checked={quick.seater} onChange={() => setQuick((q) => ({ ...q, seater: !q.seater }))} label="Seater" count={counts.seater} />
            <Check checked={quick.volvo} onChange={() => setQuick((q) => ({ ...q, volvo: !q.volvo }))} label="Volvo" count={counts.volvo} />
            <Check checked={quick.rtc} onChange={() => setQuick((q) => ({ ...q, rtc: !q.rtc }))} label="State buses (RTC)" count={counts.rtc} />
            <Check checked={quick.live} onChange={() => setQuick((q) => ({ ...q, live: !q.live }))} label="Live tracking" count={counts.live} />
          </>
        ) : null}
      </div>
      <div className={styles.sideCard}>
        <h3>Departure time</h3>
        {WINDOWS.map((w) => (
          <Check key={w.id} checked={depWindows.includes(w.id)} onChange={() => toggleWin(w.id)} label={w.label} />
        ))}
      </div>
      {operatorCounts.length ? (
        <div className={styles.sideCard}>
          <h3>Operators</h3>
          <div className={styles.opList}>
            {operatorCounts.slice(0, 16).map(([name, n]) => (
              <Check key={name} checked={operators.includes(name)} onChange={() => toggleOp(name)} label={name} count={n} />
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );

  if (!hasSearch) {
    return (
      <PageLayout>
        <div className={`${styles.page}${veroOpen ? ` ${styles.veroCompact}` : ""}`}>
          <header className={styles.hero}>
            <div className={styles.heroInner}>
              <p className={styles.brand}>Transits · beta</p>
              <h1 className={styles.headline}>
                Buses, metro, and coaches — <span className={styles.headlineAccent}>one search</span>
              </h1>
              <p className={styles.lede}>
                Need a city bus or a coach between cities? Search from and to. Trains stay on Trains. Flights stay on Flights.
              </p>
              <div className={styles.searchInHero}>
                <TrainModifySearchBar
                  className={styles.heroSearchBar}
                  from={draftFrom}
                  to={draftTo}
                  when={draftWhen}
                  onSearch={applySearch}
                  fromLabel="From"
                  toLabel="To"
                  fromPlaceholder="City or stop"
                  toPlaceholder="City or stop"
                  stationSuggest={false}
                  cityOptions={BUS_CITIES}
                  placeSuggest
                  submitLabel="Search rides"
                />
                {searchHint ? <p className={styles.searchHint}>{searchHint}</p> : null}
              </div>
            </div>
          </header>

          <div className={styles.landing}>
            <section className={styles.modes} aria-labelledby="transit-modes">
              <div className={styles.sectionIntro}>
                <p className={styles.sectionEyebrow}>What Transits is</p>
                <h2 id="transit-modes">Two kinds of rides</h2>
                <p>Same search bar. What you get depends on whether you stay in one city or travel between two.</p>
              </div>
              <div className={styles.modeGrid}>
                {MODES.map(({ Icon, kicker, title, copy }) => (
                  <article key={title} className={styles.modeCard}>
                    <span className={styles.modeIcon} aria-hidden>
                      <Icon size={22} strokeWidth={2.1} />
                    </span>
                    <p className={styles.modeKicker}>{kicker}</p>
                    <h3>{title}</h3>
                    <p>{copy}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className={styles.how} aria-labelledby="transit-how">
              <div className={styles.sectionIntro}>
                <p className={styles.sectionEyebrow}>How it works</p>
                <h2 id="transit-how">Three steps</h2>
              </div>
              <ol className={styles.stepGrid}>
                {STEPS.map(({ n, title, copy }) => (
                  <li key={n} className={styles.stepCard}>
                    <span className={styles.stepNum} aria-hidden>
                      {n}
                    </span>
                    <strong>{title}</strong>
                    <p>{copy}</p>
                  </li>
                ))}
              </ol>
            </section>

            <section className={styles.corridors} aria-labelledby="popular-routes">
              <div className={styles.sectionIntro}>
                <h2 id="popular-routes">Popular routes</h2>
                <p>Tap a pair — we search tomorrow’s live rides.</p>
              </div>
              <div className={styles.corridorGrid}>
                {popularPairs.map(([a, b]) => (
                  <button
                    key={`${a}-${b}`}
                    type="button"
                    className={styles.corridorTile}
                    onClick={() => applySearch({ from: a, to: b, when: tomorrowYmd() })}
                  >
                    <span className={styles.corridorCities}>
                      <span className={styles.corridorFrom}>{a}</span>
                      <span className={styles.corridorArrow} aria-hidden>
                        <ArrowRight size={14} />
                      </span>
                      <span className={styles.corridorTo}>{b}</span>
                    </span>
                    <span className={styles.corridorMeta}>Tomorrow</span>
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.faq} aria-labelledby="transit-faq">
              <div className={styles.sectionIntro}>
                <p className={styles.sectionEyebrow}>
                  <CircleHelp size={14} aria-hidden /> Good to know
                </p>
                <h2 id="transit-faq">Before you search</h2>
              </div>
              <div className={styles.faqList}>
                {FAQ.map(({ q, a }) => (
                  <article key={q} className={styles.faqItem}>
                    <h3>{q}</h3>
                    <p>{a}</p>
                  </article>
                ))}
              </div>
            </section>

            <p className={styles.note}>
              <ShieldCheck size={16} aria-hidden />
              Beta — we only show live operators, stops, and prices. Nothing is invented.
            </p>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className={`${styles.page}${veroOpen ? ` ${styles.veroCompact}` : ""}`}>
        <header className={styles.top}>
          <div className={styles.topInner}>
            <div>
              <p className={styles.brand}>Transits · beta</p>
              <h1>
                Rides from {filters.from} to {filters.to}
              </h1>
              <p className={styles.topSub}>City buses, metro, and coaches — not trains or flights.</p>
            </div>
            <button type="button" className={styles.changeSearch} onClick={clearToLanding}>
              New search
            </button>
          </div>
        </header>

        <div className={styles.modifyWrap}>
          <TrainModifySearchBar
            from={filters.from}
            to={filters.to}
            when={filters.when}
            onSearch={applySearch}
            fromLabel="From"
            toLabel="To"
            fromPlaceholder="City or stop"
            toPlaceholder="City or stop"
            stationSuggest={false}
            cityOptions={BUS_CITIES}
            placeSuggest
            submitLabel="Update search"
          />
        </div>

        <div className={styles.dateRail} role="listbox" aria-label="Journey date">
          {dateChips.map((chip) => (
            <button
              key={chip.iso}
              type="button"
              className={`${styles.dateChip} ${chip.iso === journeyYmd ? styles.dateOn : ""}`}
              onClick={() => applySearch({ when: chip.iso })}
            >
              <strong>{chip.line}</strong>
              {chip.sub ? <span>{chip.sub}</span> : null}
            </button>
          ))}
        </div>

        <div className={styles.layout}>
          <button type="button" className={styles.filtersBtn} onClick={() => setFiltersOpen(true)}>
            <SlidersHorizontal size={16} /> Filters
          </button>
          <div className={styles.desktopSide}>{sidebar}</div>
          {filtersOpen ? (
            <div
              className={styles.drawer}
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget) setFiltersOpen(false);
              }}
            >
              <div className={styles.drawerPanel}>
                <div className={styles.drawerHead}>
                  <strong>Filters</strong>
                  <button type="button" onClick={() => setFiltersOpen(false)} aria-label="Close filters">
                    <X size={18} />
                  </button>
                </div>
                {sidebar}
              </div>
            </div>
          ) : null}

          <section className={styles.results}>
            <div className={styles.metaRow}>
              <p className={styles.resultCount}>
                {loading
                  ? "Finding transits…"
                  : `${listed.length} option${listed.length === 1 ? "" : "s"} on this route`}
              </p>
              <label className={styles.sortWrap}>
                <span>Sorted by</span>
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="dep">Departure</option>
                  <option value="arr">Arrival</option>
                  <option value="dur">Duration</option>
                  <option value="fare">Fare</option>
                  <option value="rating">Rating</option>
                </select>
              </label>
            </div>
            <p className={styles.honesty}>
              {data.local || listed.some((b) => b.local)
                ? "These are public transits (bus, metro, tram, ferry). Each card shows where to board. Pay on the vehicle — we don’t sell this ticket."
                : region === "IN"
                  ? listed.some((b) => b.kind === "coach")
                    ? "These are coaches between cities. Prices are live when listed. You’ll finish booking with our partner — we never make up a fare."
                    : "Live coaches when the feed is up, otherwise city transits. Partner checkout has more operators."
                  : "Public transits and coaches when this route is covered. Full ticket at partner checkout."}
            </p>
            <div className={styles.featured}>
              <button
                type="button"
                className={`${styles.featChip} ${!quick.ac && !quick.sleeper && !quick.volvo && !quick.rtc && !quick.nonac && !quick.live && !depWindows.length ? styles.featOn : ""}`}
                onClick={() => setFeat("all")}
              >
                All
              </button>
              <button type="button" className={`${styles.featChip} ${quick.ac ? styles.featOn : ""}`} onClick={() => setFeat("ac")}>
                AC{counts.ac ? ` · ${counts.ac}` : ""}
              </button>
              {region === "IN" ? (
                <>
                  <button type="button" className={`${styles.featChip} ${quick.nonac ? styles.featOn : ""}`} onClick={() => setFeat("nonac")}>
                    Non-AC{counts.nonac ? ` · ${counts.nonac}` : ""}
                  </button>
                  <button type="button" className={`${styles.featChip} ${quick.sleeper ? styles.featOn : ""}`} onClick={() => setFeat("sleeper")}>
                    Sleeper{counts.sleeper ? ` · ${counts.sleeper}` : ""}
                  </button>
                  <button type="button" className={`${styles.featChip} ${quick.seater ? styles.featOn : ""}`} onClick={() => setFeat("seater")}>
                    Seater{counts.seater ? ` · ${counts.seater}` : ""}
                  </button>
                  <button type="button" className={`${styles.featChip} ${quick.volvo ? styles.featOn : ""}`} onClick={() => setFeat("volvo")}>
                    Volvo{counts.volvo ? ` · ${counts.volvo}` : ""}
                  </button>
                  <button type="button" className={`${styles.featChip} ${quick.rtc ? styles.featOn : ""}`} onClick={() => setFeat("rtc")}>
                    State{counts.rtc ? ` · ${counts.rtc}` : ""}
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className={`${styles.featChip} ${depWindows.length === 1 && depWindows[0] === "night" ? styles.featOn : ""}`}
                onClick={() => setFeat("night")}
              >
                Night{counts.night ? ` · ${counts.night}` : ""}
              </button>
            </div>

            {loading ? (
              <LoadingState
                title={region === "IN" && !data.local ? "Finding coaches" : "Finding transits"}
                message={
                  region === "IN" && !data.local
                    ? "Live operators, types, seats, and fares on this route."
                    : "Bus, metro, tram, rail, and ferry — same coverage as Google Maps."
                }
                count={4}
              />
            ) : listed.length === 0 ? (
              <div className={styles.state}>
                <h3 className={styles.stateTitle}>No rides on this filter</h3>
                <p>{emptyCopy}</p>
                <div className={styles.stateActions}>
                  <button type="button" className={styles.retry} onClick={() => setFeat("all")}>
                    Clear filters
                  </button>
                  <button
                    type="button"
                    className={styles.retryGhost}
                    onClick={() => window.open(partnerUrl, "_blank", "noopener,noreferrer")}
                  >
                    {data.local ? "Open directions" : "Open partner checkout"}
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.list}>
                {listed.map((bus) => {
                  const badges = [];
                  if (bus.rtc) badges.push("State");
                  if (bus.primo) badges.push("Primo");
                  if (bus.live_tracking) badges.push("Live tracking");
                  if (bus.id && bus.id === fastestId) badges.push("Fastest");
                  if (bus.id && bus.id === cheapestId) badges.push("Cheapest");
                  return (
                    <BusCard
                      key={bus.id || `${bus.operator}-${bus.dep}`}
                      bus={bus}
                      journeyDate={bus.date || journeyYmd}
                      fromLabel={filters.from}
                      toLabel={filters.to}
                      badges={badges}
                    />
                  );
                })}
                {data.local ? null : (
                  <button
                    type="button"
                    className={styles.retry}
                    onClick={() => window.open(partnerUrl, "_blank", "noopener,noreferrer")}
                  >
                    See more operators on partner checkout
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </PageLayout>
  );
}
