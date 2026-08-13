import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Radar,
  ShieldCheck,
  SlidersHorizontal,
  Ticket,
  TrainFront,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { PageLayout } from "@/components/layout";
import { LoadingState } from "@/components/shared";
import { useVeroUi } from "@/context/VeroUiContext";
import { buildTrainsPageContext } from "@/features/vero/utils/pageContext";
import { railDisplayName } from "@/features/vero/utils/pageFilterIntent";
import TrainCard, { classIsAc, classIsAvailable } from "./components/TrainCard";
import TrainModifySearchBar from "./components/TrainModifySearchBar";
import TrainTrackTimeline from "./components/TrainTrackTimeline";
import TrainFoodPanel from "./components/TrainFoodPanel";
import PnrStatusCard from "./components/PnrStatusCard";
import { trainService } from "./services/trainService";
import RegionalGate from "@/features/regional/RegionalGate";
import { useHomeLocationOptional } from "@/context/HomeLocationContext";
import { isTrainsMarket } from "@/constants/regionalFeatures";
import styles from "./TrainsPage.module.css";

const WINDOWS = [
  { id: "morning", label: "Morning (06 AM - 12 noon)" },
  { id: "afternoon", label: "Afternoon (12 noon - 06 PM)" },
  { id: "evening", label: "Evening (06 PM - 12 midnight)" },
  { id: "night", label: "Night (12 midnight - 06 AM)" },
];

const CLASSES = [
  { id: "CC", label: "CC · Chair Car" },
  { id: "EC", label: "EC · Exec. Chair" },
  { id: "SL", label: "SL · Sleeper" },
  { id: "3E", label: "3E · AC 3E" },
  { id: "3A", label: "3A · AC 3 Tier" },
  { id: "2A", label: "2A · AC 2 Tier" },
  { id: "1A", label: "1A · AC First" },
  { id: "2S", label: "2S · Second Sitting" },
];

const QUOTAS = [
  { id: "GN", label: "General" },
  { id: "LD", label: "Ladies" },
  { id: "TQ", label: "Tatkal" },
  { id: "SS", label: "Sr. Citizen" },
];

const KINDS = [
  { id: "vande", label: "Vande Bharat" },
  { id: "rajdhani", label: "Rajdhani" },
  { id: "shatabdi", label: "Shatabdi" },
  { id: "sf", label: "Superfast" },
];

const MODES = [
  { id: "search", label: "Search trains" },
  { id: "track", label: "Live track" },
  { id: "pnr", label: "PNR status" },
  { id: "food", label: "Food on train" },
];

const FEATURES = [
  {
    Icon: TrainFront,
    title: "Live corridors",
    copy: "Timetable and coach fares on the pair you search - no invented inventory.",
  },
  {
    Icon: Radar,
    title: "Live track",
    copy: "Station-by-station running status inside Itinero when you need it.",
  },
  {
    Icon: Ticket,
    title: "PNR status",
    copy: "CNF / RAC / WL from the partner feed - IRCTC stays official.",
  },
  {
    Icon: UtensilsCrossed,
    title: "Honest handoff",
    copy: "Book on partner checkout for the exact train you picked. We never invent a fare.",
  },
];

const POPULAR_PAIRS = [
  { from: "Surat", to: "Vadodara", fromCode: "ST", toCode: "BRC" },
  { from: "Mumbai Central", to: "Ahmedabad", fromCode: "MMCT", toCode: "ADI" },
  { from: "New Delhi", to: "Jaipur", fromCode: "NDLS", toCode: "JP" },
  { from: "Pune", to: "Mumbai CSMT", fromCode: "PUNE", toCode: "CSMT" },
  { from: "Chennai Central", to: "KSR Bengaluru", fromCode: "MAS", toCode: "SBC" },
  { from: "Ahmedabad", to: "Mumbai Central", fromCode: "ADI", toCode: "MMCT" },
];

function tomorrowYmd() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function kindOf(train) {
  const blob = `${train.name || ""} ${train.kind || ""}`.toLowerCase();
  if (blob.includes("vande")) return "vande";
  if (blob.includes("rajdhani")) return "rajdhani";
  if (blob.includes("shatabdi")) return "shatabdi";
  if (blob.includes("superfast") || /\bsf\b/.test(blob)) return "sf";
  return "other";
}

function depMins(raw) {
  const m = String(raw || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 99_999;
  return Number(m[1]) * 60 + Number(m[2]);
}

function durationMins(raw) {
  const s = String(raw || "");
  const h = /(\d+)\s*h/i.exec(s);
  const m = /(\d+)\s*m/i.exec(s);
  const total = (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
  return total || 99_999;
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

function dateChip(iso) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return { iso, line: iso, tatkal: false };
  const today = toYmd(new Date());
  const tom = (() => {
    const n = new Date();
    n.setDate(n.getDate() + 1);
    return toYmd(n);
  })();
  return {
    iso,
    line: d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
    tatkal: iso === today || iso === tom,
  };
}

function ordinal(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  const last = n % 10;
  if (last === 1) return `${n}st`;
  if (last === 2) return `${n}nd`;
  if (last === 3) return `${n}rd`;
  return `${n}th`;
}

function startDayLabel(offset) {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  const mon = d.toLocaleDateString("en-IN", { month: "short" });
  const label = `${ordinal(d.getDate())} ${mon}`;
  if (offset === 0) return `Today - ${label}`;
  if (offset === 1) return `Yesterday - ${label}`;
  return `Day before - ${label}`;
}

function Check({ checked, onChange, label }) {
  return (
    <label className={styles.check}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

export default function TrainsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { setPageContext, clearPageContext, isOpen: veroOpen } = useVeroUi();
  const home = useHomeLocationOptional();
  const trainsOk = isTrainsMarket({
    countryCode: home?.countryCode,
    passportCountry: home?.passportCountry,
  });

  const [data, setData] = useState({
    trains: [],
    total: 0,
    message: "",
    mode: "ok",
    from_code: "",
    to_code: "",
    from_name: "",
    to_name: "",
  });
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState("recommended");
  const [quota, setQuota] = useState("GN");
  const [quick, setQuick] = useState({ available: false, ac: false, fromExact: false, toExact: false });
  const [depWindows, setDepWindows] = useState([]);
  const [arrWindows, setArrWindows] = useState([]);
  const [classFilter, setClassFilter] = useState([]);
  const [kindFilter, setKindFilter] = useState([]);
  const [faresByNumber, setFaresByNumber] = useState({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [trackNumber, setTrackNumber] = useState(searchParams.get("number") || "");
  const [trackDay, setTrackDay] = useState(Number(searchParams.get("start_day") || 0));
  const [track, setTrack] = useState(null);
  const [trackLoading, setTrackLoading] = useState(false);
  const [pnrInput, setPnrInput] = useState(searchParams.get("pnr") || "");
  const [pnr, setPnr] = useState(null);
  const [pnrLoading, setPnrLoading] = useState(false);
  const [searchHint, setSearchHint] = useState("");
  const [draftFrom, setDraftFrom] = useState("Surat");
  const [draftTo, setDraftTo] = useState("Vadodara");
  const [draftWhen, setDraftWhen] = useState(() => tomorrowYmd());
  const reqRef = useRef(0);
  const pnrReqRef = useRef(0);

  const pageMode = ["track", "pnr", "food"].includes(searchParams.get("mode") || "")
    ? searchParams.get("mode")
    : "search";

  const fromParam = searchParams.get("from") || searchParams.get("origin") || "";
  const toParam = searchParams.get("to") || searchParams.get("destination") || "";
  const hasSearch = Boolean(String(fromParam).trim() && String(toParam).trim());

  const whenParam = searchParams.get("when") || searchParams.get("date") || "";
  const windowParam = searchParams.get("window") || "";
  const fromCodeParam = (searchParams.get("fromCode") || "").toUpperCase();
  const toCodeParam = (searchParams.get("toCode") || "").toUpperCase();

  const filters = useMemo(
    () => ({
      from: railDisplayName(fromParam || draftFrom || "Surat"),
      to: railDisplayName(toParam || draftTo || "Vadodara"),
      when: whenParam || draftWhen || "tomorrow",
      window: windowParam,
      fromCode: fromCodeParam,
      toCode: toCodeParam,
    }),
    [fromParam, toParam, whenParam, windowParam, fromCodeParam, toCodeParam, draftFrom, draftTo, draftWhen]
  );

  const journeyYmd = whenToYmd(filters.when);
  const dateChips = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        return dateChip(toYmd(d));
      }),
    []
  );

  const setMode = (id) => {
    const next = new URLSearchParams(searchParams);
    if (id === "search") next.delete("mode");
    else next.set("mode", id);
    setSearchParams(next, { replace: true });
  };

  const applySearch = (patch) => {
    const next = new URLSearchParams(searchParams);
    next.delete("mode");
    const from = String(patch.from ?? filters.from ?? draftFrom).trim();
    const to = String(patch.to ?? filters.to ?? draftTo).trim();
    if (!from || !to) {
      setSearchHint("Enter both From and To stations, or tap a popular corridor.");
      return;
    }
    setSearchHint("");
    setDraftFrom(from);
    setDraftTo(to);
    next.set("from", from);
    next.set("to", to);
    if ("fromCode" in patch) {
      if (patch.fromCode) next.set("fromCode", String(patch.fromCode).toUpperCase());
      else next.delete("fromCode");
    } else if (patch.from) {
      next.delete("fromCode");
    }
    if ("toCode" in patch) {
      if (patch.toCode) next.set("toCode", String(patch.toCode).toUpperCase());
      else next.delete("toCode");
    } else if (patch.to) {
      next.delete("toCode");
    }
    const when = patch.when ?? filters.when ?? draftWhen;
    if (when) {
      next.set("when", when);
      setDraftWhen(/^\d{4}-\d{2}-\d{2}$/.test(when) ? when : draftWhen);
      if (/^\d{4}-\d{2}-\d{2}$/.test(when)) next.set("date", when);
    }
    if (patch.window != null) {
      if (patch.window) next.set("window", patch.window);
      else next.delete("window");
    }
    setSearchParams(next, { replace: true });
  };

  const clearToLanding = () => {
    setSearchParams(new URLSearchParams(), { replace: true });
    setData({
      trains: [],
      total: 0,
      message: "",
      mode: "ok",
      from_code: "",
      to_code: "",
      from_name: "",
      to_name: "",
    });
    setLoading(false);
  };

  const loadTrains = useCallback(() => {
    if (!hasSearch) {
      setLoading(false);
      return;
    }
    const req = ++reqRef.current;
    setLoading(true);
    setFaresByNumber({});
    trainService
      .search({
        origin: filters.fromCode || filters.from,
        destination: filters.toCode || filters.to,
        when: filters.when,
        window: filters.window || undefined,
        date: /^\d{4}-\d{2}-\d{2}$/.test(filters.when) ? filters.when : undefined,
        limit: 120,
      })
      .then((res) => {
        if (req !== reqRef.current) return;
        setData({
          trains: Array.isArray(res?.trains) ? res.trains : [],
          total: res?.total || 0,
          message: res?.message || "",
          mode: res?.mode || "ok",
          from_code: res?.from_code || "",
          to_code: res?.to_code || "",
          from_name: res?.from_name || "",
          to_name: res?.to_name || "",
        });
      })
      .finally(() => {
        if (req === reqRef.current) setLoading(false);
      });
  }, [hasSearch, filters.from, filters.to, filters.fromCode, filters.toCode, filters.when, filters.window]);

  useEffect(() => {
    if (pageMode === "search" && hasSearch) loadTrains();
  }, [loadTrains, pageMode, hasSearch]);

  useEffect(() => {
    const n = searchParams.get("number") || "";
    const day = Number(searchParams.get("start_day") || 0);
    if (pageMode !== "track" || !n) return undefined;
    let cancelled = false;
    const load = (silent = false) => {
      if (!silent) setTrackLoading(true);
      trainService.track({ number: n, start_day: day }).then((res) => {
        if (cancelled) return;
        setTrackNumber(n);
        setTrackDay(day);
        setTrack(res);
        setTrackLoading(false);
      });
    };
    load(false);
    const timer = window.setInterval(() => load(true), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pageMode, searchParams]);

  const loadPnr = useCallback((digits) => {
    if (!/^\d{10}$/.test(digits)) return;
    const req = ++pnrReqRef.current;
    setPnrLoading(true);
    trainService.pnr({ pnr: digits }).then((res) => {
      if (req !== pnrReqRef.current) return;
      setPnr(res);
      setPnrLoading(false);
    });
  }, []);

  useEffect(() => {
    const p = searchParams.get("pnr") || "";
    if (pageMode === "pnr" && /^\d{10}$/.test(p)) {
      setPnrInput(p);
      loadPnr(p);
    }
  }, [pageMode, searchParams, loadPnr]);

  useEffect(() => {
    setPageContext(
      buildTrainsPageContext({
        origin: filters.from,
        destination: filters.to,
        when: filters.when,
        window: filters.window,
        fromCode: filters.fromCode || data.from_code,
        toCode: filters.toCode || data.to_code,
        trains: data.trains,
        isLoading: loading,
        mode: pageMode,
        food: {
          tab: searchParams.get("tab") || (searchParams.get("pnr") ? "pnr" : "train"),
          pnr: searchParams.get("pnr") || "",
          number: searchParams.get("number") || "",
          boarding: searchParams.get("fromCode") || searchParams.get("from") || "",
          date: searchParams.get("date") || journeyYmd,
        },
      })
    );
  }, [
    filters,
    data.trains,
    data.from_code,
    data.to_code,
    loading,
    searchParams,
    setPageContext,
    pageMode,
    journeyYmd,
  ]);

  useEffect(() => () => clearPageContext(), [clearPageContext]);

  const onFares = useCallback((number, classes) => {
    setFaresByNumber((prev) => ({ ...prev, [number]: classes }));
  }, []);

  const listed = useMemo(() => {
    let rows = data.trains.slice();
    if (kindFilter.length) rows = rows.filter((t) => kindFilter.includes(kindOf(t)));
    if (depWindows.length) {
      rows = rows.filter((t) => depWindows.includes(windowOfMins(depMins(t.dep))));
    }
    if (arrWindows.length) {
      rows = rows.filter((t) => arrWindows.includes(windowOfMins(depMins(t.arr))));
    }
    const fromCode = (data.from_code || filters.fromCode || "").toUpperCase();
    const toCode = (data.to_code || filters.toCode || "").toUpperCase();
    if (quick.fromExact && fromCode) rows = rows.filter((t) => String(t.from_code || "").toUpperCase() === fromCode);
    if (quick.toExact && toCode) rows = rows.filter((t) => String(t.to_code || "").toUpperCase() === toCode);
    if (classFilter.length || quick.available || quick.ac) {
      rows = rows.filter((t) => {
        const fares = faresByNumber[t.number];
        if (!fares) return true;
        let pool = fares;
        if (classFilter.length) pool = pool.filter((c) => classFilter.includes(c.code));
        if (!pool.length) return false;
        if (quick.ac && !pool.some((c) => classIsAc(c.code))) return false;
        if (quick.available && !pool.some((c) => classIsAvailable(c))) return false;
        return true;
      });
    }
    if (sort === "arr") rows.sort((a, b) => depMins(a.arr) - depMins(b.arr));
    else if (sort === "dur") rows.sort((a, b) => durationMins(a.duration) - durationMins(b.duration));
    else if (sort === "dep") rows.sort((a, b) => depMins(a.dep) - depMins(b.dep));
    else {
      rows.sort((a, b) => {
        const ka = kindOf(a);
        const kb = kindOf(b);
        const rank = (k) => (k === "vande" ? 0 : k === "rajdhani" || k === "shatabdi" ? 1 : 2);
        if (rank(ka) !== rank(kb)) return rank(ka) - rank(kb);
        return depMins(a.dep) - depMins(b.dep);
      });
    }
    return rows;
  }, [data.trains, data.from_code, data.to_code, filters.fromCode, filters.toCode, kindFilter, depWindows, arrWindows, quick, classFilter, faresByNumber, sort]);

  const fastestNumber = useMemo(() => {
    if (!listed.length) return "";
    return [...listed].sort((a, b) => durationMins(a.duration) - durationMins(b.duration))[0]?.number || "";
  }, [listed]);

  const runTrack = (day = trackDay) => {
    const number = String(trackNumber || "").replace(/\D/g, "");
    if (!number) return;
    const next = new URLSearchParams(searchParams);
    next.set("mode", "track");
    next.set("number", number);
    next.set("start_day", String(day || 0));
    setSearchParams(next, { replace: true });
  };

  const runPnr = () => {
    const digits = String(pnrInput || "").replace(/\D/g, "");
    if (!/^\d{10}$/.test(digits)) return;
    const current = (searchParams.get("pnr") || "").replace(/\D/g, "");
    const next = new URLSearchParams(searchParams);
    next.set("mode", "pnr");
    next.set("pnr", digits);
    if (pageMode === "pnr" && current === digits) {
      loadPnr(digits);
      return;
    }
    setSearchParams(next, { replace: true });
  };

  const toggleArr = (id, list, setList) => {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const setFeat = (key) => {
    if (key === "all") {
      setQuick({ available: false, ac: false, fromExact: false, toExact: false });
      setKindFilter([]);
      setDepWindows([]);
      setClassFilter([]);
      return;
    }
    if (key === "available") {
      setQuick((q) => ({ ...q, available: !q.available }));
      return;
    }
    if (key === "ac") {
      setQuick((q) => ({ ...q, ac: !q.ac }));
      return;
    }
    if (key === "vande" || key === "rajdhani" || key === "shatabdi") {
      setKindFilter((list) => (list.includes(key) ? list.filter((x) => x !== key) : [...list, key]));
      return;
    }
    if (key === "night") {
      setDepWindows((list) => (list.includes("night") ? list.filter((x) => x !== "night") : ["night"]));
    }
  };

  const fromCode = data.from_code || filters.fromCode || "ST";
  const toCode = data.to_code || filters.toCode || "BRC";
  const trackData = track?.track || null;
  const featAllClear =
    !quick.available &&
    !quick.ac &&
    !kindFilter.length &&
    !depWindows.length &&
    !classFilter.length;

  const sidebar = (
    <aside className={styles.sidebar}>
      <div className={styles.sideCard}>
        <h3>Quick filters</h3>
        <Check
          checked={quick.available}
          onChange={() => setQuick((q) => ({ ...q, available: !q.available }))}
          label="Show available only"
        />
        <Check
          checked={quick.ac}
          onChange={() => setQuick((q) => ({ ...q, ac: !q.ac }))}
          label="Show AC only"
        />
        <Check
          checked={quick.fromExact}
          onChange={() => setQuick((q) => ({ ...q, fromExact: !q.fromExact }))}
          label={`Train from ${fromCode} only`}
        />
        <Check
          checked={quick.toExact}
          onChange={() => setQuick((q) => ({ ...q, toExact: !q.toExact }))}
          label={`Train reaching ${toCode} only`}
        />
      </div>

      <div className={styles.sideCard}>
        <h3>Quota</h3>
        {QUOTAS.map((q) => (
          <Check
            key={q.id}
            checked={quota === q.id}
            onChange={() => setQuota(q.id)}
            label={q.label}
          />
        ))}
      </div>

      <div className={styles.sideCard}>
        <h3>Departure time</h3>
        {WINDOWS.map((w) => (
          <Check
            key={`dep-${w.id}`}
            checked={depWindows.includes(w.id)}
            onChange={() => toggleArr(w.id, depWindows, setDepWindows)}
            label={w.label}
          />
        ))}
      </div>

      <div className={styles.sideCard}>
        <h3>Arrival time</h3>
        {WINDOWS.map((w) => (
          <Check
            key={`arr-${w.id}`}
            checked={arrWindows.includes(w.id)}
            onChange={() => toggleArr(w.id, arrWindows, setArrWindows)}
            label={w.label}
          />
        ))}
      </div>

      <div className={styles.sideCard}>
        <h3>Class</h3>
        {CLASSES.map((c) => (
          <Check
            key={c.id}
            checked={classFilter.includes(c.id)}
            onChange={() => toggleArr(c.id, classFilter, setClassFilter)}
            label={c.label}
          />
        ))}
      </div>

      <div className={styles.sideCard}>
        <h3>Train type</h3>
        {KINDS.map((k) => (
          <Check
            key={k.id}
            checked={kindFilter.includes(k.id)}
            onChange={() => toggleArr(k.id, kindFilter, setKindFilter)}
            label={k.label}
          />
        ))}
      </div>
    </aside>
  );

  if (!trainsOk) {
    return (
      <RegionalGate
        product="Trains"
        market="India"
        reason="Trains on Itinero use Indian Railways / IRCTC corridors and coach fares. They only apply when your home region or passport is India."
      />
    );
  }

  if (pageMode === "search" && !hasSearch) {
    return (
      <PageLayout>
        <div className={`${styles.page}${veroOpen ? ` ${styles.veroCompact}` : ""}`}>
          <div className={styles.landing}>
            <header className={styles.hero}>
              <div className={styles.heroCopy}>
                <p className={styles.brand}>itinero trains · India</p>
                <h1>Search trains, track running status, check PNR</h1>
                <p className={styles.lede}>
                  Pick a corridor for live coach fares, then finish on partner checkout. Track and PNR stay
                  inside Itinero.
                </p>
              </div>

              <div className={styles.searchInHero}>
                <TrainModifySearchBar
                  className={styles.heroSearchBar}
                  from={draftFrom}
                  to={draftTo}
                  fromCode=""
                  toCode=""
                  when={draftWhen}
                  onSearch={(next) => applySearch(next)}
                  submitLabel="Search trains"
                />
                {searchHint ? <p className={styles.searchHint}>{searchHint}</p> : null}
              </div>
            </header>

            <section className={styles.promise} aria-labelledby="train-features">
              <div className={styles.promiseIntro}>
                <p className={styles.promiseEyebrow}>What you get</p>
                <h2 id="train-features" className={styles.promiseTitle}>
                  Built for the rails
                </h2>
              </div>
              <ol className={styles.promiseSteps}>
                {FEATURES.map(({ Icon, title, copy }, i) => (
                  <li key={title} className={styles.promiseStep}>
                    <span className={styles.promiseNum} aria-hidden>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className={styles.promiseIcon} aria-hidden>
                      <Icon size={20} strokeWidth={2.15} />
                    </span>
                    <strong>{title}</strong>
                    <p>{copy}</p>
                  </li>
                ))}
              </ol>
            </section>

            <section className={styles.corridors} aria-labelledby="popular-rail">
              <div className={styles.corridorIntro}>
                <div>
                  <h2 id="popular-rail">Popular corridors</h2>
                  <p>Tap a route - we search tomorrow’s live trains.</p>
                </div>
              </div>
              <div className={styles.corridorGrid}>
                {POPULAR_PAIRS.map((pair) => (
                  <button
                    key={`${pair.fromCode}-${pair.toCode}`}
                    type="button"
                    className={styles.corridorTile}
                    onClick={() =>
                      applySearch({
                        from: pair.from,
                        to: pair.to,
                        fromCode: pair.fromCode,
                        toCode: pair.toCode,
                        when: tomorrowYmd(),
                      })
                    }
                  >
                    <span className={styles.corridorCities}>
                      <span className={styles.corridorFrom}>{pair.from}</span>
                      <span className={styles.corridorArrow} aria-hidden>
                        →
                      </span>
                      <span className={styles.corridorTo}>{pair.to}</span>
                    </span>
                    <span className={styles.corridorMeta}>Tomorrow</span>
                  </button>
                ))}
              </div>
            </section>

            <div className={styles.landingModes}>
              {MODES.filter((m) => m.id !== "search").map((m) => (
                <button key={m.id} type="button" className={styles.modeLight} onClick={() => setMode(m.id)}>
                  {m.label}
                </button>
              ))}
            </div>

            <p className={styles.note}>
              <ShieldCheck size={14} aria-hidden />
              Beta - live feeds only. Final ticket is issued by IRCTC / partner checkout.
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
              <p className={styles.brand}>itinero trains · India</p>
              <h1>
                {pageMode === "search"
                  ? `${data.from_name || filters.from}${
                      data.from_code || filters.fromCode ? ` (${data.from_code || filters.fromCode})` : ""
                    } → ${data.to_name || filters.to}${
                      data.to_code || filters.toCode ? ` (${data.to_code || filters.toCode})` : ""
                    }`
                  : pageMode === "pnr"
                    ? pnrInput && /^\d{10}$/.test(String(pnrInput).replace(/\D/g, ""))
                      ? `PNR ${String(pnrInput).replace(/\D/g, "")}`
                      : "PNR status"
                    : pageMode === "food"
                      ? "Food on train"
                      : "Search, track and check PNR"}
              </h1>
            </div>
            <div className={styles.modes}>
              {pageMode === "search" && hasSearch ? (
                <button type="button" className={styles.changeSearch} onClick={clearToLanding}>
                  New search
                </button>
              ) : null}
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`${styles.mode} ${pageMode === m.id ? styles.modeOn : ""}`}
                  onClick={() => setMode(m.id)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        {pageMode === "search" ? (
          <>
            <div className={styles.modifyWrap}>
              <TrainModifySearchBar
                from={data.from_name || filters.from}
                to={data.to_name || filters.to}
                fromCode={filters.fromCode || data.from_code}
                toCode={filters.toCode || data.to_code}
                when={filters.when}
                onSearch={(next) => applySearch(next)}
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
                  {chip.tatkal ? <em>Tatkal open</em> : <span>&nbsp;</span>}
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
                      ? "Finding trains…"
                      : `We found ${listed.length} train${listed.length === 1 ? "" : "s"} on this route`}
                  </p>
                  <label className={styles.sortWrap}>
                    <span>Sorted by</span>
                    <select value={sort} onChange={(e) => setSort(e.target.value)}>
                      <option value="recommended">Recommended</option>
                      <option value="dep">Departure</option>
                      <option value="arr">Arrival</option>
                      <option value="dur">Duration</option>
                    </select>
                  </label>
                </div>
                <p className={styles.honesty}>
                  Live coach fares. Final ticket is issued by IRCTC - we only hand off this exact train.
                </p>

                <div className={styles.featured}>
                  <button
                    type="button"
                    className={`${styles.featChip} ${featAllClear ? styles.featOn : ""}`}
                    onClick={() => setFeat("all")}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className={`${styles.featChip} ${quick.available ? styles.featOn : ""}`}
                    onClick={() => setFeat("available")}
                  >
                    Available
                  </button>
                  <button
                    type="button"
                    className={`${styles.featChip} ${quick.ac ? styles.featOn : ""}`}
                    onClick={() => setFeat("ac")}
                  >
                    AC
                  </button>
                  <button
                    type="button"
                    className={`${styles.featChip} ${kindFilter.includes("vande") ? styles.featOn : ""}`}
                    onClick={() => setFeat("vande")}
                  >
                    Vande Bharat
                  </button>
                  <button
                    type="button"
                    className={`${styles.featChip} ${kindFilter.includes("rajdhani") ? styles.featOn : ""}`}
                    onClick={() => setFeat("rajdhani")}
                  >
                    Rajdhani
                  </button>
                  <button
                    type="button"
                    className={`${styles.featChip} ${kindFilter.includes("shatabdi") ? styles.featOn : ""}`}
                    onClick={() => setFeat("shatabdi")}
                  >
                    Shatabdi
                  </button>
                  <button
                    type="button"
                    className={`${styles.featChip} ${depWindows.length === 1 && depWindows[0] === "night" ? styles.featOn : ""}`}
                    onClick={() => setFeat("night")}
                  >
                    Night
                  </button>
                </div>

                {loading ? (
                  <LoadingState title="Finding trains" message="Live timetable + coach fares for your corridor." count={4} />
                ) : listed.length === 0 ? (
                  <div className={styles.state}>
                    <h3 className={styles.stateTitle}>No trains on this filter</h3>
                    <p>{data.message || "Try another date, clear filters, or pick a nearby corridor."}</p>
                    <div className={styles.stateActions}>
                      <button type="button" className={styles.retry} onClick={() => setFeat("all")}>
                        Clear filters
                      </button>
                      {data.mode === "degraded" ? (
                        <button type="button" className={styles.retryGhost} onClick={loadTrains}>
                          Retry
                        </button>
                      ) : (
                        <button type="button" className={styles.retryGhost} onClick={clearToLanding}>
                          New search
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className={styles.list}>
                    {listed.map((train) => {
                      const badges = [];
                      if (train.number === fastestNumber) badges.push("Fastest");
                      const k = kindOf(train);
                      if (k === "vande" || k === "rajdhani" || k === "shatabdi") badges.push("Top choice");
                      return (
                        <TrainCard
                          key={`${train.number}-${train.dep}`}
                          train={train}
                          journeyDate={train.date || journeyYmd}
                          fromLabel={data.from_name || filters.from}
                          toLabel={data.to_name || filters.to}
                          quota={quota}
                          badges={badges}
                          onFares={onFares}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </>
        ) : null}

        {pageMode === "track" ? (
          <section className={`${styles.panel} ${styles.panelTrack}`}>
            <div className={styles.trackForm}>
              <input
                value={trackNumber}
                onChange={(e) => setTrackNumber(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runTrack();
                }}
                placeholder="Train number e.g. 22452"
                inputMode="numeric"
              />
              <select
                value={trackDay}
                onChange={(e) => {
                  const day = Number(e.target.value);
                  setTrackDay(day);
                  if (String(trackNumber || "").replace(/\D/g, "")) runTrack(day);
                }}
                aria-label="Start day"
              >
                <option value={0}>{startDayLabel(0)}</option>
                <option value={1}>{startDayLabel(1)}</option>
                <option value={2}>{startDayLabel(2)}</option>
              </select>
              <button type="button" onClick={() => runTrack()}>
                Track
              </button>
            </div>
            {trackLoading && !trackData ? (
              <LoadingState title="Checking running status" message="Live station times - not a GPS pin." count={3} />
            ) : trackData ? (
              <TrainTrackTimeline track={trackData} stations={track?.stations || trackData.stations || []} />
            ) : track?.message ? (
              <p className={styles.state}>{track.message}</p>
            ) : (
              <p className={styles.state}>
                Enter a train number to track inside Itinero - scheduled vs actual at every halt and no-halt station.
              </p>
            )}
          </section>
        ) : null}

        {pageMode === "pnr" ? (
          <section className={styles.panel}>
            <h2>PNR status</h2>
            <p className={styles.honesty}>Partner feed - never invent CNF / RAC / WL. IRCTC remains official.</p>
            <form
              className={styles.trackForm}
              onSubmit={(e) => {
                e.preventDefault();
                runPnr();
              }}
            >
              <input
                value={pnrInput}
                onChange={(e) => setPnrInput(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="10-digit PNR"
                inputMode="numeric"
                maxLength={10}
                aria-label="10-digit PNR"
              />
              <button type="submit" disabled={String(pnrInput || "").replace(/\D/g, "").length !== 10}>
                Check PNR
              </button>
            </form>
            {pnrLoading ? (
              <LoadingState title="Checking PNR" message="Partner status only - IRCTC is official." count={3} />
            ) : pnr?.ok && pnr?.pnr ? (
              <PnrStatusCard data={pnr.pnr} />
            ) : pnr?.message ? (
              <div className={styles.state}>
                <p>{pnr.message}</p>
                <div className={styles.stateActions}>
                  <button type="button" className={styles.retry} onClick={runPnr}>
                    Try again
                  </button>
                  <button
                    type="button"
                    className={styles.retryGhost}
                    onClick={() =>
                      window.open(
                        "https://www.indianrail.gov.in/enquiry/PNR/PnrEnquiry.html",
                        "_blank",
                        "noopener,noreferrer"
                      )
                    }
                  >
                    Open IRCTC PNR
                  </button>
                </div>
              </div>
            ) : (
              <p className={styles.state}>Enter a 10-digit PNR.</p>
            )}
          </section>
        ) : null}

        {pageMode === "food" ? (
          <TrainFoodPanel
            initialTab={searchParams.get("tab") || (searchParams.get("pnr") ? "pnr" : "train")}
            initialPnr={searchParams.get("pnr") || ""}
            initialNumber={searchParams.get("number") || ""}
            initialBoarding={searchParams.get("fromCode") || searchParams.get("from") || ""}
            initialBoardingName={searchParams.get("boarding") || ""}
            initialDate={searchParams.get("date") || journeyYmd}
          />
        ) : null}
      </div>
    </PageLayout>
  );
}
