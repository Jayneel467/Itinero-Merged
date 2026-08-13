import React, { useMemo } from "react";
import styles from "./AirportBoard.module.css";

const TABS = [
  { id: "departures", label: "Departures" },
  { id: "arrivals", label: "Arrivals" },
  { id: "enroute", label: "Inbound" },
  { id: "scheduled", label: "Scheduled" },
  { id: "on_ground", label: "On ground" },
];

function dayLabel(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(ymd || ""))) return "";
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { weekday: "long", month: "short", day: "numeric" });
}

function statusTone(status) {
  const s = String(status || "").toLowerCase();
  if (s === "departed" || s === "landed") return "ok";
  if (s === "en-route") return "air";
  if (s === "delayed") return "late";
  if (s === "cancelled" || s === "diverted") return "bad";
  return "muted";
}

function BoardRow({ row, kind, onPick }) {
  const code = row.flight_iata || row.ident || row.callsign || "";
  const other = row.other_iata || row.other_city || row.aircraft_type || "";
  const time = kind === "arrivals" || kind === "enroute" ? row.arr_time || row.dep_time : row.dep_time || row.arr_time;
  return (
    <button
      type="button"
      className={styles.row}
      onClick={() => onPick?.(row)}
    >
      <span className={styles.time}>
        {time || "-"}
        {row.tz ? <small>{row.tz}</small> : null}
      </span>
      <span className={styles.mid}>
        <strong>{row.airline_name || "Flight"}</strong>
        <span>
          {code}
          {other ? ` · ${other}` : ""}
          {row.aircraft_code ? ` · ${row.aircraft_code}` : ""}
        </span>
      </span>
      <span className={`${styles.badge} ${styles[statusTone(row.status)]}`}>
        {row.status_label || (row.on_ground ? "On ground" : "Nearby")}
      </span>
    </button>
  );
}

export default function AirportBoard({
  airport,
  tab,
  onTab,
  onPickFlight,
  loading,
  message,
}) {
  const rows = useMemo(() => {
    if (!airport) return [];
    if (tab === "on_ground") return airport.on_ground || [];
    return airport[tab] || [];
  }, [airport, tab]);

  const groups = useMemo(() => {
    const out = [];
    let last = null;
    rows.forEach((row) => {
      const label = dayLabel(row.date);
      if (label && label !== last) {
        out.push({ type: "day", label });
        last = label;
      }
      out.push({ type: "row", row });
    });
    return out;
  }, [rows]);

  if (loading && !airport) {
    return <p className={styles.state}>Loading live board…</p>;
  }
  if (!airport) {
    return <p className={styles.state}>{message || "Pick an airport to see live departures and arrivals."}</p>;
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <h2>{airport.name || "Airport"}</h2>
        <p>
          <strong>{airport.iata || airport.icao}</strong>
          {airport.icao && airport.iata ? ` / ${airport.icao}` : ""}
          {airport.coord ? " · map pin is the field, not every aircraft" : ""}
        </p>
      </header>
      <div className={styles.tabs} role="tablist" aria-label="Airport board">
        {TABS.map((item) => {
          const count =
            item.id === "on_ground"
              ? airport.on_ground?.length || 0
              : airport[item.id]?.length || 0;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? styles.tabOn : styles.tab}
              onClick={() => onTab?.(item.id)}
            >
              {item.label}
              <small>{count}</small>
            </button>
          );
        })}
      </div>
      <div className={styles.list}>
        {!groups.length ? (
          <p className={styles.state}>
            No live rows on this tab. Airport screens still win - we don’t invent a schedule.
          </p>
        ) : (
          groups.map((item, idx) =>
            item.type === "day" ? (
              <p key={`d-${item.label}-${idx}`} className={styles.day}>
                {item.label}
              </p>
            ) : (
              <BoardRow
                key={`${item.row.ident || item.row.callsign || idx}-${idx}`}
                row={item.row}
                kind={tab}
                onPick={(row) => {
                  if (tab === "on_ground") return;
                  onPickFlight?.({
                    flight: row.ident || row.flight_iata,
                    date: row.date || "",
                  });
                }}
              />
            )
          )
        )}
      </div>
    </div>
  );
}
