import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, MapPin, TrainFront, UtensilsCrossed } from "lucide-react";
import useStationSuggest from "../hooks/useStationSuggest";
import { trainService } from "../services/trainService";
import { irctcFoodUrl, stationCodeFrom, toDmy, toYmdDate, trainFoodUrl } from "../utils/irctcBook";
import styles from "./TrainFoodPanel.module.css";

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftYmd(ymd, days) {
  const base = toYmdDate(ymd) || todayYmd();
  const d = new Date(`${base}T00:00:00`);
  if (Number.isNaN(d.getTime())) return todayYmd();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function prettyDate(ymd) {
  const iso = toYmdDate(ymd);
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export default function TrainFoodPanel({
  initialTab = "train",
  initialPnr = "",
  initialNumber = "",
  initialBoarding = "",
  initialBoardingName = "",
  initialDate = "",
}) {
  const [tab, setTab] = useState(initialTab === "pnr" ? "pnr" : "train");
  const [pnr, setPnr] = useState(String(initialPnr || "").replace(/\D/g, "").slice(0, 10));
  const [trainNo, setTrainNo] = useState(String(initialNumber || "").replace(/\D/g, "").slice(0, 5));
  const [boarding, setBoarding] = useState(
    initialBoardingName || (initialBoarding ? String(initialBoarding).toUpperCase() : "")
  );
  const [boardingCode, setBoardingCode] = useState(String(initialBoarding || "").trim().toUpperCase());
  const [date, setDate] = useState(toYmdDate(initialDate) || todayYmd());
  const [stationOpen, setStationOpen] = useState(false);
  const [foodHalts, setFoodHalts] = useState([]);
  const [haltHint, setHaltHint] = useState("");

  const { stations, isLoading: stationLoading } = useStationSuggest(boarding, {
    enabled: tab === "train" && stationOpen,
  });

  useEffect(() => {
    setTab(initialTab === "pnr" ? "pnr" : "train");
    setPnr(String(initialPnr || "").replace(/\D/g, "").slice(0, 10));
    setTrainNo(String(initialNumber || "").replace(/\D/g, "").slice(0, 5));
    setBoarding(initialBoardingName || (initialBoarding ? String(initialBoarding).toUpperCase() : ""));
    setBoardingCode(String(initialBoarding || "").trim().toUpperCase());
    setDate(toYmdDate(initialDate) || todayYmd());
  }, [initialTab, initialPnr, initialNumber, initialBoarding, initialBoardingName, initialDate]);

  useEffect(() => {
    const num = String(trainNo || "").replace(/\D/g, "");
    if (tab !== "train" || !/^\d{4,5}$/.test(num)) {
      setFoodHalts([]);
      setHaltHint("");
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      trainService.track({ number: num, start_day: 0 }).then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res?.stations) ? res.stations : res?.track?.stations || [];
        const hits = rows
          .filter((s) => s?.food && s?.is_stop !== false && (s.name || s.code))
          .slice(0, 12)
          .map((s) => ({
            code: String(s.code || "").toUpperCase(),
            name: s.name || s.code,
            label: s.code ? `${s.name || s.code} (${String(s.code).toUpperCase()})` : s.name,
          }));
        setFoodHalts(hits);
        if (res?.ok === false || res?.mode === "degraded") {
          setHaltHint(res?.message || "Could not load food-halt flags for this train.");
        } else if (!hits.length) {
          setHaltHint("This live feed does not mark food at any halt. Kitchen coverage still depends on the order page.");
        } else {
          setHaltHint("");
        }
      });
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tab, trainNo]);

  const pnrOk = /^\d{10}$/.test(pnr);
  const trainOk = /^\d{4,5}$/.test(String(trainNo || "").replace(/\D/g, ""));
  const stationCode = boardingCode || stationCodeFrom(boarding);
  const stationOk = Boolean(stationCode || String(boarding || "").trim());
  const dateOk = Boolean(toYmdDate(date));
  const canOrder = tab === "pnr" ? pnrOk : trainOk && stationOk && dateOk;

  const partnerUrl = useMemo(() => trainFoodUrl({ pnr }), [pnr]);

  const officialUrl = useMemo(
    () =>
      irctcFoodUrl({
        pnr: tab === "pnr" ? pnr : "",
        trainNumber: trainNo,
        station: stationCode || boarding,
        date,
      }),
    [tab, pnr, trainNo, stationCode, boarding, date]
  );

  const orderNow = () => {
    if (!canOrder) return;
    window.open(tab === "pnr" && pnrOk ? partnerUrl : officialUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <section className={styles.wrap}>
      <div className={styles.hero}>
        <UtensilsCrossed size={22} aria-hidden />
        <div>
          <h2>
            Order <em>delicious food</em> on train
          </h2>
          <p>Get it delivered at your seat when the corridor is live.</p>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.tabs} role="tablist" aria-label="Find your journey">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "pnr"}
            className={tab === "pnr" ? styles.tabOn : styles.tab}
            onClick={() => setTab("pnr")}
          >
            PNR
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "train"}
            className={tab === "train" ? styles.tabOn : styles.tab}
            onClick={() => setTab("train")}
          >
            TRAIN
          </button>
        </div>

        {tab === "pnr" ? (
          <label className={styles.field}>
            <span>10-digit PNR</span>
            <input
              value={pnr}
              onChange={(e) => setPnr(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="Enter PNR"
              inputMode="numeric"
              maxLength={10}
              aria-label="10-digit PNR"
            />
          </label>
        ) : (
          <>
            <label className={styles.field}>
              <span>
                <TrainFront size={14} aria-hidden /> Train number / name
              </span>
              <input
                value={trainNo}
                onChange={(e) => setTrainNo(e.target.value.replace(/\D/g, "").slice(0, 5))}
                placeholder="e.g. 20901"
                inputMode="numeric"
                maxLength={5}
                aria-label="Train number"
              />
            </label>

            <label className={styles.field}>
              <span>
                <MapPin size={14} aria-hidden /> Boarding station
              </span>
              <input
                value={boarding}
                onChange={(e) => {
                  setBoarding(e.target.value);
                  setBoardingCode("");
                  setStationOpen(true);
                }}
                onFocus={() => setStationOpen(true)}
                onBlur={() => setTimeout(() => setStationOpen(false), 180)}
                placeholder="Station name or code"
                autoComplete="off"
                aria-label="Boarding station"
              />
              {stationOpen && (stations.length || stationLoading) ? (
                <div className={styles.menu} role="listbox">
                  {stationLoading && !stations.length ? <p className={styles.hint}>Searching stations…</p> : null}
                  {stations.map((s) => (
                    <button
                      key={s.code}
                      type="button"
                      className={styles.opt}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setBoarding(s.label || `${s.name} (${s.code})`);
                        setBoardingCode(s.code);
                        setStationOpen(false);
                      }}
                    >
                      <strong>{s.name}</strong>
                      <em>{s.code}</em>
                    </button>
                  ))}
                </div>
              ) : null}
            </label>

            <div className={styles.dateRow}>
              <label className={styles.field}>
                <span>
                  <CalendarDays size={14} aria-hidden /> Boarding date
                </span>
                <input
                  type="date"
                  value={toYmdDate(date) || ""}
                  onChange={(e) => setDate(e.target.value)}
                  aria-label="Boarding date"
                />
              </label>
              <div className={styles.quickDates}>
                <button type="button" onClick={() => setDate(shiftYmd(todayYmd(), -1))}>
                  Yesterday
                </button>
                <button type="button" onClick={() => setDate(todayYmd())}>
                  Today
                </button>
                <button type="button" onClick={() => setDate(shiftYmd(todayYmd(), 1))}>
                  Tomorrow
                </button>
              </div>
            </div>
            {dateOk ? <p className={styles.dateHint}>{prettyDate(date)} · {toDmy(date)}</p> : null}
          </>
        )}

        <button type="button" className={styles.order} disabled={!canOrder} onClick={orderNow}>
          Order now
        </button>
        <a className={styles.official} href={officialUrl} target="_blank" rel="noopener noreferrer">
          Open IRCTC eCatering
        </a>
        <p className={styles.honesty}>
          We don’t invent menus or prices. Order now opens IRCTC eCatering with this train and boarding
          station. A 10-digit PNR opens partner kitchens already filled in.
        </p>
      </div>

      {tab === "train" && trainOk ? (
        <div className={styles.halts}>
          <h3>Delivery-possible halts on this feed</h3>
          {haltHint ? <p>{haltHint}</p> : null}
          {foodHalts.length ? (
            <div className={styles.chips}>
              {foodHalts.map((s) => (
                <button
                  key={`${s.code}-${s.name}`}
                  type="button"
                  className={boardingCode === s.code ? styles.chipOn : styles.chip}
                  onClick={() => {
                    setBoarding(s.label);
                    setBoardingCode(s.code);
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
