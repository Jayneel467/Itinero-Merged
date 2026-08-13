import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { UtensilsCrossed } from "lucide-react";
import { irctcFoodUrl, trainFoodPagePath } from "../utils/irctcBook";
import styles from "./TrainTrackTimeline.module.css";

function delayTone(mins) {
  if (mins == null) return "";
  if (mins <= 0) return "ok";
  if (mins < 15) return "warn";
  return "late";
}

function delayLabel(mins) {
  if (mins == null) return "";
  if (mins <= 0) return "On time";
  return `${mins}m late`;
}

function km(n) {
  if (n == null || n === "") return "";
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  return `${Math.round(v)} km`;
}

export default function TrainTrackTimeline({ track, stations = [] }) {
  const all = Array.isArray(stations) && stations.length ? stations : track?.stations || [];
  const [haltsOnly, setHaltsOnly] = useState(false);
  const currentRef = useRef(null);

  const stops = useMemo(() => {
    if (!haltsOnly) return all;
    return all.filter((s) => s.is_stop !== false || s.phase === "current" || s.phase === "arrived");
  }, [all, haltsOnly]);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [stops, track?.current_station_code]);

  if (!track && !all.length) return null;

  const delay = track?.delay_minutes;
  const tone = delayTone(delay);
  const passCount = all.filter((s) => s.is_stop === false).length;
  const foodStops = all.filter((s) => s.food && s.is_stop !== false).length;
  const pantryOn = track?.pantry === true || track?.pantry === "true" || track?.pantry === 1;

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <div>
          <p className={styles.kicker}>Live running status</p>
          <h2>
            {track?.train_number} {track?.train_name || "Train"}
          </h2>
          <p className={styles.route}>
            {track?.source_name || track?.source_code || "-"} → {track?.dest_name || track?.dest_code || "-"}
            {track?.run_days ? ` · ${track.run_days}` : ""}
          </p>
        </div>
        <div className={`${styles.badge} ${tone ? styles[`badge_${tone}`] : ""}`}>
          {delay == null ? "Delay unknown" : delayLabel(delay)}
        </div>
      </header>

      <div className={styles.meta}>
        {track?.status_as_of ? <span>{track.status_as_of}</span> : null}
        {track?.start_date ? <span>Started {track.start_date}</span> : null}
        {track?.current_station ? (
          <span>
            Last reported: <b>{String(track.current_station).replace("~", "")}</b>
            {track.current_station_code ? ` (${track.current_station_code})` : ""}
          </span>
        ) : null}
        {track?.next_station_name ? (
          <span>
            Next halt: <b>{track.next_station_name}</b>
            {track.next_station_code ? ` (${track.next_station_code})` : ""}
            {track.next_in ? ` · ${track.next_in}` : ""}
          </span>
        ) : null}
        {track?.platform && Number(track.platform) > 0 ? <span>PF {track.platform}</span> : null}
        {track?.current_eta || track?.current_etd ? (
          <span>
            Live {track.current_eta ? `ETA ${track.current_eta}` : ""}
            {track.current_eta && track.current_etd ? " · " : ""}
            {track.current_etd ? `ETD ${track.current_etd}` : ""}
          </span>
        ) : null}
        {track?.on_time === true ? <span>On time on this feed</span> : null}
        {track?.is_run_day === false ? <span>Not a run day on this feed</span> : null}
        {pantryOn ? <span>Pantry car</span> : null}
        {foodStops ? <span>{foodStops} halt{foodStops === 1 ? "" : "s"} with food</span> : null}
        {track?.avg_speed ? <span>Avg {track.avg_speed} km/h</span> : null}
        {track?.ahead_text ? <span>{track.ahead_text}</span> : null}
        {track?.distance_km != null && track?.total_km != null ? (
          <span>
            {track.distance_km} / {track.total_km} km covered
          </span>
        ) : null}
      </div>

      {(track?.location_messages || []).length ? (
        <ul className={styles.msgs}>
          {track.location_messages.map((msg) => (
            <li key={msg}>{String(msg).replace(/~/g, "")}</li>
          ))}
        </ul>
      ) : track?.title ? (
        <p className={styles.titleMsg}>{String(track.title).replace(/~/g, "")}</p>
      ) : null}

      {track?.bubble?.text ? (
        <p className={styles.titleMsg}>
          {track.bubble.station ? `${track.bubble.station}: ` : ""}
          {track.bubble.text}
          {track.bubble.hint ? ` · ${track.bubble.hint}` : ""}
        </p>
      ) : null}

      <div className={styles.toolbar}>
        <button
          type="button"
          className={`${styles.toggle} ${!haltsOnly ? styles.toggleOn : ""}`}
          onClick={() => setHaltsOnly(false)}
        >
          All stations{passCount ? ` · ${passCount} no halt` : ""}
        </button>
        <button
          type="button"
          className={`${styles.toggle} ${haltsOnly ? styles.toggleOn : ""}`}
          onClick={() => setHaltsOnly(true)}
        >
          Halts only
        </button>
        <a
          className={styles.toggle}
          href={irctcFoodUrl({ trainNumber: track?.train_number, station: track?.current_station_code || track?.source_code })}
          target="_blank"
          rel="noopener noreferrer"
        >
          IRCTC eCatering
        </a>
        <Link
          className={styles.toggle}
          to={trainFoodPagePath({
            tab: "train",
            trainNumber: track?.train_number,
            boarding: track?.source_code || track?.current_station_code,
          })}
        >
          Food on train
        </Link>
      </div>

      <p className={styles.honesty}>
        Operational running status from the live feed - not a GPS map pin.
        {track?.gps_unable !== false ? " Exact coordinates unavailable." : ""}
        {" "}Station boards win if they disagree.
      </p>

      {stops.length ? (
        <ol className={styles.timeline}>
          <li className={styles.cols} aria-hidden>
            <span>Arrival</span>
            <span />
            <span>Station</span>
            <span>Departure</span>
          </li>
          {stops.map((stn, i) => {
            const phase = stn.phase || (i === 0 ? "departed" : "upcoming");
            const isPass = stn.is_stop === false;
            const arrTone = delayTone(stn.arrival_delay ?? stn.delay_minutes);
            const depTone = delayTone(stn.departure_delay ?? stn.delay_minutes);
            const liveArr = stn.eta || stn.sta || "-";
            const liveDep = isPass ? liveArr : stn.etd || stn.std || "-";
            return (
              <li
                key={`${stn.code || stn.name}-${i}`}
                ref={phase === "current" ? currentRef : undefined}
                className={`${styles.stop} ${styles[`stop_${phase}`] || ""} ${isPass ? styles.stop_pass : ""}`}
              >
                <div className={styles.times}>
                  <span className={styles.sch}>
                    {stn.sta || "-"}
                    {stn.day > 1 ? ` +${stn.day - 1}` : ""}
                  </span>
                  <strong className={arrTone ? styles[`live_${arrTone}`] : styles.live}>{liveArr}</strong>
                </div>
                <div className={styles.rail} aria-hidden>
                  <i />
                  <b />
                </div>
                <div className={styles.info}>
                  <div className={styles.stnTop}>
                    <em>{stn.code || "-"}</em>
                    {stn.food ? <UtensilsCrossed size={14} aria-label="Food" /> : null}
                    {isPass ? <span className={styles.pillPass}>No halt</span> : null}
                    {phase === "next" ? <span className={styles.pill}>Next halt</span> : null}
                    {phase === "current" ? <span className={styles.pillNow}>{isPass ? "Crossed" : "Now"}</span> : null}
                    {phase === "arrived" ? <span className={styles.pillNow}>Arrived</span> : null}
                  </div>
                  <strong>{stn.name || stn.code}</strong>
                  <p>
                    {[
                      km(stn.distance_km),
                      stn.platform && Number(stn.platform) > 0 ? `PF ${stn.platform}` : "",
                      isPass ? "Pass" : stn.halt ? `Halt ${stn.halt}m` : "",
                      stn.day ? `Day ${stn.day}` : "",
                      delayLabel(stn.delay_minutes),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {stn.hint ? <p className={styles.hint}>{stn.hint}</p> : null}
                </div>
                <div className={`${styles.times} ${styles.dep}`}>
                  <span className={styles.sch}>{isPass ? stn.sta || stn.std || "-" : stn.std || "-"}</span>
                  <strong className={depTone ? styles[`live_${depTone}`] : styles.live}>{liveDep}</strong>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={styles.empty}>Stop list not available on this feed yet. Try another start day.</p>
      )}

      <div className={styles.legend}>
        <span>Grey = scheduled</span>
        <span className={styles.live_ok}>Green = actual / expected</span>
        <span>Small dot = no halt (pass)</span>
        <span>Orange = last reported / next halt</span>
      </div>
    </div>
  );
}
