import React, { useEffect, useState } from "react";
import AirlineMark from "./AirlineMark";
import { flightService } from "../services/flightService";
import styles from "./FlightTrackCard.module.css";

const TONE = {
  scheduled: "idle",
  delayed: "warn",
  departed: "ok",
  "en-route": "live",
  landed: "ok",
  cancelled: "bad",
  diverted: "warn",
  incident: "bad",
  unknown: "idle",
};

function delayLabel(mins) {
  if (mins == null || mins === "") return "";
  const n = Number(mins);
  if (!Number.isFinite(n)) return "";
  if (n < 0) return `${Math.abs(n)}m early`;
  if (n === 0) return "On time";
  return `${n}m late`;
}

function timePair(actual, estimated, scheduled) {
  const live = actual || estimated || "";
  const sch = scheduled || "";
  return { live: live || sch || "-", sch: sch && live && sch !== live ? sch : "" };
}

function cityLabel(name, iata) {
  const s = String(name || "").trim();
  const paren = s.match(/\(([^)]+)\)/);
  if (paren?.[1]) return paren[1].trim();
  const head = s.split("/")[0].trim();
  if (head && !/int'?l|international|airport|air force|base/i.test(head) && head.length < 28) {
    return head;
  }
  return iata || "";
}

function shortAircraft(raw) {
  return String(raw || "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fmtAlt(ft) {
  const n = Number(ft);
  if (!Number.isFinite(n)) return "";
  return `${Math.round(n).toLocaleString("en-IN")} ft`;
}

function fmtHdg(h) {
  const n = Number(h);
  if (!Number.isFinite(n)) return "";
  return `${Math.round((n + 360) % 360)}°`;
}

function gateLine(terminal, gate) {
  const t = terminal ? `T${String(terminal).replace(/^T/i, "")}` : "";
  const g = gate ? `Gate ${gate}` : "";
  return [t, g].filter(Boolean).join(" · ");
}

export default function FlightTrackCard({
  track: trackProp = null,
  flight = "",
  date = "",
  autoFetch = false,
  message = "",
  compact = false,
}) {
  const [track, setTrack] = useState(trackProp);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(message || "");

  useEffect(() => {
    setTrack(trackProp);
  }, [trackProp]);

  useEffect(() => {
    const code = String(flight || "").replace(/\s+/g, "").toUpperCase();
    if (!autoFetch || !code) return undefined;
    let alive = true;
    setLoading(true);
    setError("");
    flightService.track({ flight: code, date }).then((res) => {
      if (!alive) return;
      setLoading(false);
      if (res?.track) {
        setTrack(res.track);
        setError("");
        return;
      }
      setTrack(null);
      setError(res?.message || "No live status for this flight.");
    });
    return () => {
      alive = false;
    };
  }, [autoFetch, flight, date]);

  if (loading && !track) {
    return (
      <div className={styles.wrap}>
        <p className={styles.loading}>Checking live status…</p>
      </div>
    );
  }

  if (!track) {
    if (!error) return null;
    return (
      <div className={styles.wrap}>
        <p className={styles.empty}>{error}</p>
      </div>
    );
  }

  const status = String(track.status || "unknown");
  const tone = TONE[status] || "idle";
  const delay = delayLabel(track.delay_minutes);
  const dep = timePair(track.dep_actual, track.dep_estimated, track.dep_scheduled);
  const arr = timePair(track.arr_actual, track.arr_estimated, track.arr_scheduled);
  const pos = track.position && track.position.lat != null ? track.position : null;
  const code = track.flight_iata || flight || "-";
  const airline = track.airline_name || track.airline_iata || "";
  const callsign = track.callsign || track.operating_ident || "";
  const pct = Number(track.progress_pct);
  const hasPct = Number.isFinite(pct);
  const originCity = track.origin_city || cityLabel(track.origin_name, track.origin);
  const destCity = track.destination_city || cityLabel(track.destination_name, track.destination);
  const depGate = gateLine(track.dep_terminal, track.dep_gate);
  const arrGate = gateLine(track.arr_terminal, track.arr_gate);
  const aircraft = shortAircraft(track.aircraft_type);
  const alt = pos ? fmtAlt(pos.altitude_ft) : "";
  const spd = pos?.speed_kts != null ? `${pos.speed_kts} kt` : "";
  const hdg = pos ? fmtHdg(pos.heading) : "";

  const photo = String(track.aircraft_image || "").trim();
  const operating = track.operating_iata || "";
  const vert = track.vertical || pos?.vertical || "";

  return (
    <article className={`${styles.wrap} ${compact ? styles.compact : ""}`}>
      {photo ? (
        <div className={styles.photo}>
          <img src={photo} alt="" />
        </div>
      ) : null}
      <header className={styles.head}>
        <AirlineMark
          name={airline}
          code={track.airline_iata}
          flightNumber={code}
          size={48}
        />
        <div className={styles.headCopy}>
          <p className={styles.airline}>{airline || "Flight"}</p>
          <h2>{code}</h2>
          <p className={styles.callsign}>
            {[callsign && callsign !== String(code).replace(/\s+/g, "") ? callsign : "", operating && operating !== code ? operating : ""]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className={`${styles.badge} ${styles[`badge_${tone}`] || ""}`}>
          <span className={styles.pulse} data-live={tone === "live" ? "1" : "0"} />
          {track.status_label || status}
          {delay ? ` · ${delay}` : ""}
          {vert && vert !== "Level" ? ` · ${vert}` : ""}
        </div>
      </header>

      <div className={styles.routeBlock}>
        <div>
          <strong>{track.origin || "-"}</strong>
          <p>{originCity}</p>
          <em>{dep.live}</em>
          {dep.sch ? <span className={styles.sch}>sched {dep.sch}</span> : null}
          {depGate ? <span className={styles.gate}>{depGate}</span> : null}
        </div>
        <div className={styles.progressMid} aria-hidden>
          <div className={styles.bar}>
            <span style={{ width: `${Math.max(4, Math.min(100, hasPct ? pct : 8))}%` }} />
          </div>
        </div>
        <div className={styles.arr}>
          <strong>{track.destination || "-"}</strong>
          <p>{destCity}</p>
          <em>{arr.live}</em>
          {arr.sch ? <span className={styles.sch}>sched {arr.sch}</span> : null}
          {arrGate ? <span className={styles.gate}>{arrGate}</span> : null}
        </div>
      </div>

      {(hasPct || track.flown_km != null || track.remaining_km != null) && (
        <p className={styles.km}>
          {track.flown_km != null ? `${Math.round(track.flown_km)} km flown` : ""}
          {track.remaining_km != null ? ` · ${Math.round(track.remaining_km)} km left` : ""}
          {hasPct ? ` · ${Math.round(pct)}%` : ""}
        </p>
      )}

      {(alt || spd || hdg) && (
        <div className={styles.stats}>
          {alt ? (
            <div>
              <b>{alt}</b>
              <span>Altitude</span>
            </div>
          ) : null}
          {spd ? (
            <div>
              <b>{spd}</b>
              <span>Speed</span>
            </div>
          ) : null}
          {hdg ? (
            <div>
              <b>{hdg}</b>
              <span>Heading</span>
            </div>
          ) : null}
        </div>
      )}

      {track.ete_minutes ? (
        <p className={styles.km}>About {track.ete_minutes} min left at last-seen speed.</p>
      ) : null}

      {(aircraft || track.registration || track.engines) && (
        <p className={styles.metaLine}>
          {[
            aircraft || track.aircraft_model,
            track.registration,
            track.engines ? `${track.engines}-engine` : "",
            track.origin_icao && track.destination_icao
              ? `${track.origin_icao}→${track.destination_icao}`
              : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      <p className={styles.honesty}>Airport screens win if they disagree.</p>
    </article>
  );
}
