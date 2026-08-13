import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { trainService } from "../services/trainService";
import { persistSelectedTrain } from "../utils/persistSelectedTrain";
import { irctcBookUrl, trainBookUrl, trainFoodPagePath, trainFoodUrl, trainScheduleUrl } from "../utils/irctcBook";
import styles from "./TrainCard.module.css";

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const AC_CODES = new Set(["1A", "2A", "3A", "3E", "CC", "EC", "EA"]);

function fareTone(status = "") {
  const s = String(status).toUpperCase();
  if (s.includes("AVL") || s.includes("AVAILABLE")) return "ok";
  if (s.includes("RAC")) return "warn";
  if (s.includes("WL") || s.includes("WAIT")) return "wait";
  if (s.includes("REGRET") || s.includes("DEPARTED") || s.includes("CANCEL")) return "bad";
  return "muted";
}

function formatInr(n) {
  if (n == null || n === 0) return null;
  return `₹${Number(n).toLocaleString("en-IN")}`;
}

function mondayFirstMask(rundays = "") {
  const m = String(rundays || "").padEnd(7, "0").slice(0, 7);
  if (!/^[01]{7}$/.test(m)) return null;
  return m.slice(1) + m[0];
}

function parseDaysFallback(days = "") {
  const s = String(days || "").toLowerCase();
  if (!s) return null;
  if (s === "daily") return "1111111";
  const names = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  return names.map((n) => (s.includes(n) ? "1" : "0")).join("");
}

export function classIsAvailable(cls) {
  const tone = fareTone(cls?.status || cls?.status_text || "");
  return tone === "ok";
}

export function classIsAc(code) {
  return AC_CODES.has(String(code || "").toUpperCase());
}

function kindLabel(train) {
  const blob = `${train?.kind || ""} ${train?.name || ""}`.toLowerCase();
  if (blob.includes("vande")) return "Vande Bharat";
  if (blob.includes("rajdhani")) return "Rajdhani";
  if (blob.includes("shatabdi")) return "Shatabdi";
  if (blob.includes("tejas")) return "Tejas";
  if (blob.includes("superfast") || /\bsf\b/.test(blob)) return "Superfast";
  return "";
}

function depMins(raw) {
  const m = String(raw || "").match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function overnight(dep, arr) {
  const a = depMins(dep);
  const b = depMins(arr);
  return a != null && b != null && b < a;
}

function startDayFromJourney(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ""))) return 0;
  const today = new Date();
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [y, m, d] = String(ymd).split("-").map(Number);
  const j = Date.UTC(y, m - 1, d);
  const diff = Math.round((t - j) / 86400000);
  if (diff <= 0) return 0;
  if (diff === 1) return 1;
  return 2;
}

function fareSeatLine(cls) {
  if (typeof cls?.available === "number") return `${cls.available} seats`;
  if (typeof cls?.waitlist === "number") return `WL ${cls.waitlist}`;
  return "";
}

export default function TrainCard({
  train,
  journeyDate = "",
  fromLabel = "",
  toLabel = "",
  quota = "GN",
  badges = [],
  onFares,
}) {
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const onFaresRef = useRef(onFares);
  const [visible, setVisible] = useState(false);
  const [fares, setFares] = useState([]);
  const [loadingFares, setLoadingFares] = useState(false);
  const [fareTick, setFareTick] = useState(0);
  onFaresRef.current = onFares;

  const date = train.date || journeyDate || "";
  const fromCode = train.from_code || "";
  const toCode = train.to_code || "";

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { rootMargin: "280px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    let live = true;
    if (!visible || !train.number || !fromCode || !toCode) return undefined;
    setLoadingFares(true);
    trainService
      .fares({
        number: train.number,
        origin: fromCode,
        destination: toCode,
        date,
        quota,
      })
      .then((res) => {
        if (!live) return;
        const list = Array.isArray(res?.classes) ? res.classes : [];
        setFares(list);
        onFaresRef.current?.(train.number, list);
      })
      .finally(() => {
        if (live) setLoadingFares(false);
      });
    return () => {
      live = false;
    };
  }, [visible, train.number, fromCode, toCode, date, quota, fareTick]);

  const runMask = useMemo(
    () => mondayFirstMask(train.rundays) || parseDaysFallback(train.days),
    [train.rundays, train.days]
  );

  if (!train?.number && !train?.name) return null;

  const startBook = (cls) => {
    persistSelectedTrain(train, {
      date,
      from_name: train.from_name || fromLabel,
      to_name: train.to_name || toLabel,
      class_code: cls?.code || "",
      fare: cls?.fare || null,
      status: cls?.status || cls?.status_text || "",
      status_text: cls?.status_text || cls?.status || "",
      available: cls?.available ?? null,
      waitlist: cls?.waitlist ?? null,
      book_url: cls?.book_url || trainBookUrl(train, date, cls?.code || "", quota),
      irctc_url: irctcBookUrl(train, date),
      schedule_url: trainScheduleUrl(train),
      food_url: trainFoodUrl({ trainNumber: train.number, from: fromCode, to: toCode, date }),
      quota,
    });
    navigate("/trains/book");
  };

  const openTrack = () => {
    const qs = new URLSearchParams({
      mode: "track",
      number: String(train.number || ""),
      start_day: String(startDayFromJourney(date)),
    });
    navigate(`/trains?${qs}`);
  };

  const openFood = () => {
    navigate(
      trainFoodPagePath({
        tab: "train",
        trainNumber: train.number,
        boarding: fromCode,
        date,
      })
    );
  };

  const kind = kindLabel(train);
  const plusDay = overnight(train.dep, train.arr);

  return (
    <article ref={rootRef} className={styles.card}>
      {badges.length || kind ? (
        <div className={styles.badges}>
          {kind ? <span className={styles.badgeKind}>{kind}</span> : null}
          {badges.map((b) => (
            <span key={b} className={b === "Fastest" ? styles.badgeFast : styles.badgeTop}>
              {b}
            </span>
          ))}
        </div>
      ) : null}

      <div className={styles.head}>
        <div>
          <strong className={styles.name}>
            <em>{train.number || "-"}</em> {train.name || "Train"}
          </strong>
          <p className={styles.runs}>
            <span>Runs on:</span>
            {runMask
              ? DAY_LETTERS.map((letter, i) => (
                  <b key={`${letter}-${i}`} className={runMask[i] === "1" ? styles.dayOn : styles.dayOff}>
                    {letter}
                  </b>
                ))
              : <em>{train.days || "Check days"}</em>}
          </p>
        </div>
        <button type="button" className={styles.ttLink} onClick={openTrack}>
          Time table →
        </button>
      </div>

      <div className={styles.timeline}>
        <div>
          <b>{train.dep || "-"}</b>
          <span>
            {fromCode || fromLabel}
            {train.from_name || fromLabel ? `, ${train.from_name || fromLabel}` : ""}
          </span>
        </div>
        <div className={styles.mid}>
          <em>{train.duration || ""}</em>
          <i />
        </div>
        <div className={styles.arr}>
          <b>
            {train.arr || "-"}
            {plusDay ? <i className={styles.plusDay}>+1</i> : null}
          </b>
          <span>
            {toCode || toLabel}
            {train.to_name || toLabel ? `, ${train.to_name || toLabel}` : ""}
          </span>
        </div>
      </div>

      <div className={styles.classes}>
        {!visible || loadingFares ? (
          <p className={styles.fareHint}>{visible ? "Loading coach fares…" : "Scroll to load coach fares"}</p>
        ) : fares.length === 0 ? (
          <p className={styles.fareHint}>Coach fares unavailable for this pair - pick a class at checkout.</p>
        ) : (
          fares.map((cls) => {
            const tone = fareTone(cls.status || cls.status_text);
            const chance = cls.confirm_chance ? `${cls.confirm_chance}%` : "";
            const seats = fareSeatLine(cls);
            const bookable = cls.bookable !== false && tone !== "bad";
            return (
              <div key={cls.code} className={`${styles.cls} ${styles[`cls_${tone}`]}`}>
                {quota === "TQ" ? <span className={styles.tatkal}>Tatkal</span> : null}
                <strong>
                  {cls.code}
                  {cls.name ? <i>{cls.name}</i> : null}
                </strong>
                <span>{formatInr(cls.fare) || "-"}</span>
                <em>{[cls.status_text || cls.status || "Check", seats, chance].filter(Boolean).join(" · ")}</em>
                <div className={styles.clsRow}>
                  <button
                    type="button"
                    className={styles.refresh}
                    aria-label={`Refresh ${cls.code}`}
                    onClick={() => setFareTick((n) => n + 1)}
                  >
                    <RefreshCw size={13} />
                  </button>
                  <button
                    type="button"
                    className={styles.bookMini}
                    disabled={!bookable}
                    onClick={() => bookable && startBook(cls)}
                  >
                    {bookable ? "Book now" : "Not bookable"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className={styles.footer}>
        <div className={styles.footerLinks}>
          <button type="button" className={styles.ghost} onClick={openTrack}>
            Live track
          </button>
          <button type="button" className={styles.ghost} onClick={openFood}>
            Food on train
          </button>
          {trainScheduleUrl(train) ? (
            <a className={styles.ghost} href={trainScheduleUrl(train)} target="_blank" rel="noopener noreferrer">
              Schedule
            </a>
          ) : null}
        </div>
        <button
          type="button"
          className={styles.ghostStrong}
          onClick={() => {
            const next = new Date(`${date}T00:00:00`);
            if (!Number.isNaN(next.getTime())) {
              next.setDate(next.getDate() + 1);
              const ymd = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
              const qs = new URLSearchParams({
                from: fromLabel || train.from_name || "",
                to: toLabel || train.to_name || "",
                when: ymd,
                date: ymd,
              });
              if (fromCode) qs.set("fromCode", fromCode);
              if (toCode) qs.set("toCode", toCode);
              navigate(`/trains?${qs}`);
            }
          }}
        >
          Next day availability
        </button>
      </div>
    </article>
  );
}
