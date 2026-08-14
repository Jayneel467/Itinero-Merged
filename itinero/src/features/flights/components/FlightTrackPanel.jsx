import React, { useEffect, useState } from "react";
import { Radar, Search } from "lucide-react";
import { flightService } from "../services/flightService";
import FlightTrackCard from "./FlightTrackCard";
import FlightTrackMap from "./FlightTrackMap";
import AirportBoard from "./AirportBoard";
import styles from "./FlightTrackPanel.module.css";

const QUICK_AIRPORTS = ["STV", "AMD", "BOM", "DEL", "PNQ", "BLR", "HYD", "GOI", "DXB"];

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function FlightTrackPanel({
  initialFlight = "",
  initialDate = "",
  initialAirport = "",
  onQueryChange,
}) {
  const startAirport = Boolean(initialAirport && !initialFlight);
  const [mode, setMode] = useState(startAirport ? "airport" : "flight");
  const [flight, setFlight] = useState(initialFlight);
  const [date, setDate] = useState(initialDate || todayYmd());
  const [airportQ, setAirportQ] = useState(initialAirport);
  const [tab, setTab] = useState("departures");
  const [suggest, setSuggest] = useState([]);
  const [airportTyping, setAirportTyping] = useState(false);
  const [result, setResult] = useState(null);
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setFlight(initialFlight);
  }, [initialFlight]);

  useEffect(() => {
    if (initialDate) setDate(initialDate);
  }, [initialDate]);

  useEffect(() => {
    if (initialAirport) setAirportQ(initialAirport);
    if (initialAirport && !initialFlight) setMode("airport");
  }, [initialAirport, initialFlight]);

  useEffect(() => {
    const code = String(initialFlight || "").replace(/\s+/g, "").toUpperCase();
    if (!code) {
      setResult(null);
      return undefined;
    }
    setMode("flight");
    let alive = true;
    setLoading(true);
    flightService.track({ flight: code, date: initialDate || date || "" }).then((res) => {
      if (!alive) return;
      setLoading(false);
      setResult(res);
    });
    return () => {
      alive = false;
    };
  }, [initialFlight, initialDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const code = String(initialAirport || "").replace(/\s+/g, "").toUpperCase();
    if (!code || initialFlight) return undefined;
    let alive = true;
    setLoading(true);
    flightService.airportBoard(code).then((res) => {
      if (!alive) return;
      setLoading(false);
      setBoard(res);
    });
    return () => {
      alive = false;
    };
  }, [initialAirport, initialFlight]);

  useEffect(() => {
    const code = String(initialFlight || flight || "").replace(/\s+/g, "").toUpperCase();
    const status = result?.track?.status || "";
    if (!code || !["en-route", "departed"].includes(status)) return undefined;
    const tick = window.setInterval(() => {
      flightService.track({ flight: code, date: initialDate || date || "" }).then((res) => {
        if (res?.track) setResult(res);
      });
    }, 40000);
    return () => window.clearInterval(tick);
  }, [initialFlight, initialDate, date, flight, result?.track?.status]);

  useEffect(() => {
    const code = String(initialAirport || airportQ || "").replace(/\s+/g, "").toUpperCase();
    if (mode !== "airport" || !code || initialFlight) return undefined;
    const tick = window.setInterval(() => {
      flightService.airportBoard(code).then((res) => {
        if (res?.airport) setBoard(res);
      });
    }, 50000);
    return () => window.clearInterval(tick);
  }, [mode, initialAirport, airportQ, initialFlight]);

  useEffect(() => {
    const q = String(airportQ || "").trim();
    const loaded = String(board?.airport?.iata || board?.airport?.icao || "").toUpperCase();
    const exact = q.replace(/\s+/g, "").toUpperCase() === loaded && loaded.length >= 3;
    if (!airportTyping || q.length < 2 || exact) {
      setSuggest([]);
      return undefined;
    }
    let alive = true;
    const t = window.setTimeout(() => {
      flightService.searchAirports(q, 6).then((res) => {
        if (!alive) return;
        const list = Array.isArray(res?.airports) ? res.airports : [];
        const needle = q.replace(/\s+/g, "").toUpperCase();
        const filtered =
          needle.length === 3
            ? list.filter((item) => String(item.code || "").toUpperCase().startsWith(needle[0]))
            : list;
        setSuggest(filtered.slice(0, 6));
      });
    }, 220);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [airportQ, airportTyping, board?.airport?.iata, board?.airport?.icao]);

  function submitFlight(e) {
    e?.preventDefault?.();
    const code = String(flight || "").replace(/\s+/g, "").toUpperCase();
    if (!code) return;
    if (onQueryChange) {
      onQueryChange({ flight: code, date, airport: initialAirport || "" });
      return;
    }
    setLoading(true);
    flightService.track({ flight: code, date }).then((res) => {
      setLoading(false);
      setResult(res);
    });
  }

  function submitAirport(code) {
    const next = String(code || airportQ || "").replace(/\s+/g, "").toUpperCase();
    if (next.length < 3) return;
    setMode("airport");
    setAirportTyping(false);
    setAirportQ(next);
    setSuggest([]);
    if (onQueryChange) {
      onQueryChange({ flight: "", date: "", airport: next });
      return;
    }
    setLoading(true);
    flightService.airportBoard(next).then((res) => {
      setLoading(false);
      setBoard(res);
    });
  }

  const track = result?.track || null;
  const airport = board?.airport || null;

  return (
    <section className={styles.shell}>
      <aside className={styles.rail}>
        <header className={styles.top}>
          <span className={styles.heroIcon} aria-hidden>
            <Radar size={22} strokeWidth={2.2} />
          </span>
          <div>
            <h1>{mode === "airport" ? "Airport board" : "Track a flight"}</h1>
            <p>
              {mode === "airport"
                ? "Live departures and arrivals. Airport screens win."
                : "Live when the feed has it. Airport screens win."}
            </p>
          </div>
        </header>

        <div className={styles.modeSwitch} role="tablist" aria-label="Track mode">
          <button
            type="button"
            className={mode === "flight" ? styles.modeOn : styles.mode}
            onClick={() => setMode("flight")}
          >
            Flight
          </button>
          <button
            type="button"
            className={mode === "airport" ? styles.modeOn : styles.mode}
            onClick={() => setMode("airport")}
          >
            Airport board
          </button>
        </div>

        {mode === "flight" ? (
          <form className={styles.form} onSubmit={submitFlight}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Flight number</span>
              <input
                value={flight}
                onChange={(e) => setFlight(e.target.value.toUpperCase())}
                placeholder="e.g. AI802"
                aria-label="Flight number"
                autoCapitalize="characters"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Flight date"
              />
            </label>
            <button type="submit" disabled={loading || !String(flight || "").trim()}>
              <Search size={16} strokeWidth={2.4} aria-hidden />
              {loading ? "Checking…" : "Track flight"}
            </button>
          </form>
        ) : (
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              submitAirport(airportQ);
            }}
          >
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Airport</span>
              <input
                value={airportQ}
                onChange={(e) => {
                  setAirportTyping(true);
                  setAirportQ(e.target.value.toUpperCase());
                }}
                onFocus={() => setAirportTyping(true)}
                onBlur={() => window.setTimeout(() => setAirportTyping(false), 180)}
                placeholder="STV or Surat"
                aria-label="Airport"
                autoCapitalize="characters"
              />
            </label>
            <button type="submit" disabled={loading || String(airportQ || "").trim().length < 3}>
              <Radar size={16} strokeWidth={2.4} aria-hidden />
              {loading ? "Loading…" : "Open board"}
            </button>
          </form>
        )}

        <p className={styles.chipsHead}>Quick airports</p>
        <div className={styles.chips}>
          {QUICK_AIRPORTS.map((code) => {
            const on = String(airportQ || "").replace(/\s+/g, "").toUpperCase() === code;
            return (
              <button
                key={code}
                type="button"
                className={on ? styles.chipOn : undefined}
                onClick={() => submitAirport(code)}
                aria-pressed={on}
              >
                {code}
              </button>
            );
          })}
        </div>

        {mode === "airport" && airportTyping && suggest.length ? (
          <ul className={styles.suggest}>
            {suggest.slice(0, 6).map((item) => (
              <li key={item.code || item.id}>
                <button type="button" onClick={() => submitAirport(item.code)}>
                  <strong>{item.code}</strong>
                  <span>{item.city || item.name}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {mode === "flight" && initialAirport ? (
          <button
            type="button"
            className={styles.backBoard}
            onClick={() => {
              setMode("airport");
              if (onQueryChange) onQueryChange({ flight: "", date: "", airport: initialAirport });
            }}
          >
            ← Back to {initialAirport} board
          </button>
        ) : null}

        <div className={styles.body}>
          {mode === "airport" ? (
            <AirportBoard
              airport={airport}
              tab={tab}
              onTab={setTab}
              loading={loading}
              message={board?.message || ""}
              onPickFlight={({ flight: nextFlight, date: nextDate }) => {
                setMode("flight");
                setFlight(nextFlight || "");
                if (nextDate) setDate(nextDate);
                if (onQueryChange) {
                  onQueryChange({
                    flight: nextFlight,
                    date: nextDate || "",
                    airport: airport?.iata || airportQ,
                  });
                }
              }}
            />
          ) : loading && !track ? (
            <p className={styles.state}>Checking live status…</p>
          ) : track ? (
            <FlightTrackCard track={track} compact />
          ) : result?.message ? (
            <p className={styles.state}>{result.message}</p>
          ) : (
            <p className={styles.state}>
              Enter a flight number and date, or tap an airport chip to open the live board.
            </p>
          )}
        </div>
      </aside>
      <div className={styles.mapCol}>
        {mode === "airport" ? <FlightTrackMap airport={airport} /> : <FlightTrackMap track={track} />}
      </div>
    </section>
  );
}
