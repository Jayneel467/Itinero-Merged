import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCurrency } from "@/context/CurrencyContext";
import { persistSelectedBus } from "../utils/persistSelectedBus";
import { busBookUrl, cityDirectionsUrl, isLocalCityBus } from "../utils/busBook";
import styles from "./BusCard.module.css";

function stopLabel(bus) {
  if (bus.transfers > 1) return `${bus.transfers} transfers`;
  if (bus.transfers === 1) return "1 transfer";
  if (bus.stops > 1) return `${bus.stops} stops`;
  if (bus.stops === 1) return "1 stop";
  return "Direct";
}

function hex(value, fallback) {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  return raw.startsWith("#") ? raw : `#${raw}`;
}

function lineMark(leg) {
  return String(leg?.name_short || leg?.trip_short || leg?.vehicle || "R")
    .replace(/\s+/g, "")
    .slice(0, 3);
}

function isCoach(bus) {
  return bus?.kind === "coach" || String(bus?.vehicle_type || "").toUpperCase() === "COACH";
}

function FareBlock({ bus, formatFrom }) {
  const label = String(bus.fare_label || "").trim();
  const amount = Number(bus.fare);
  const cur = String(bus.fare_currency || bus.currency || "USD").toUpperCase();
  const hasAmount = Number.isFinite(amount) && amount > 0;
  if (hasAmount) {
    const primary = formatFrom(amount, cur, { maximumFractionDigits: 2 });
    const hint = isCoach(bus) ? "Live fare" : label && label !== primary ? label : "Live Google fare";
    return (
      <>
        <strong>{primary}</strong>
        <span>{hint}</span>
      </>
    );
  }
  return <span>{label || "Fare not listed"}</span>;
}

function ModeRail({ legs, modes }) {
  const chips = legs.length
    ? legs.map((leg) =>
        leg.kind === "walk"
          ? { label: "Walk", walk: true }
          : {
              label: leg.name_short || leg.vehicle || "Ride",
              color: hex(leg.color, "#001438"),
              text: hex(leg.text_color, "#fff"),
            }
      )
    : (modes || []).map((label) => ({ label, walk: /^walk$/i.test(label) }));
  if (chips.length < 2) return null;
  return (
    <p className={styles.modes} aria-label="Journey modes">
      {chips.map((chip, i) => (
        <span key={`${chip.label}-${i}`}>
          {i ? <i aria-hidden>›</i> : null}
          <em
            className={chip.walk ? styles.modeWalk : styles.modeRide}
            style={chip.walk ? undefined : { background: chip.color, color: chip.text }}
          >
            {chip.label}
          </em>
        </span>
      ))}
    </p>
  );
}

function RideStep({ leg }) {
  const bg = hex(leg.color, "#001438");
  const fg = hex(leg.text_color, "#fff");
  const meta = [
    leg.trip_short ? `Trip ${leg.trip_short}` : "",
    leg.stop_count ? `${leg.stop_count} stop${leg.stop_count === 1 ? "" : "s"}` : "",
    leg.headway,
    leg.duration,
    leg.distance,
  ].filter(Boolean);
  return (
    <li className={styles.rideStep} style={{ "--spine": bg }}>
      {leg.icon_uri ? (
        <img className={styles.legIcon} src={leg.icon_uri} alt="" />
      ) : (
        <span className={styles.lineMark} style={{ background: bg, color: fg }}>
          {lineMark(leg)}
        </span>
      )}
      <div className={styles.stepBody}>
        <div className={styles.stepHead}>
          <strong>{leg.name || leg.vehicle || "Transit"}</strong>
          {leg.vehicle && leg.vehicle !== leg.name ? <em>{leg.vehicle}</em> : null}
        </div>
        {leg.headsign ? <p className={styles.towards}>Towards {leg.headsign}</p> : null}
        <div className={styles.stops}>
          <div className={styles.stopRow}>
            <time>{leg.dep || "-"}</time>
            <span>{leg.from_stop || "Board"}</span>
          </div>
          {meta.length ? <p className={styles.legMeta}>{meta.join(" · ")}</p> : null}
          <div className={styles.stopRow}>
            <time>{leg.arr || "-"}</time>
            <span>{leg.to_stop || "Alight"}</span>
          </div>
        </div>
      </div>
    </li>
  );
}

function WalkStep({ leg }) {
  const note =
    leg.instruction && !/^walk$/i.test(leg.instruction) ? leg.instruction : "Walk to next stop";
  return (
    <li className={styles.walkStep}>
      <span className={styles.walkMark} aria-hidden />
      <div className={styles.stepBody}>
        <strong>{[leg.duration || "Walk", leg.distance].filter(Boolean).join(" · ")}</strong>
        <p className={styles.walkNote}>{note}</p>
      </div>
    </li>
  );
}

export default function BusCard({ bus, journeyDate = "", fromLabel = "", toLabel = "", badges = [] }) {
  const navigate = useNavigate();
  const { formatFrom } = useCurrency();
  const [open, setOpen] = useState(false);
  if (!bus?.operator && !bus?.dep && bus?.vehicle_type !== "WALK") return null;

  const date = bus.date || journeyDate || "";
  const from = bus.from_name || fromLabel;
  const to = bus.to_name || toLabel;
  const local = Boolean(bus.local) || isLocalCityBus(from, to) || bus.vehicle_type === "WALK";
  const mapsUrl =
    bus.maps_url ||
    cityDirectionsUrl(from, to, { fromStop: bus.from_stop, toStop: bus.to_stop });
  const bookUrl =
    bus.book_url && !local
      ? bus.book_url
      : busBookUrl({
          from,
          to,
          date,
          dep: bus.dep,
          operator: bus.operator,
          bus_type: bus.bus_type,
          ac: bus.ac,
          sleeper: bus.sleeper,
          volvo: bus.volvo,
          local,
          fromStop: bus.from_stop,
          toStop: bus.to_stop,
          operator_id: bus.operator_id,
        });
  const agencies =
    Array.isArray(bus.agencies) && bus.agencies.length
      ? bus.agencies
      : [
          bus.agency_uri || bus.agency_phone
            ? { name: bus.operator, uri: bus.agency_uri || "", phone: bus.agency_phone || "" }
            : null,
        ].filter(Boolean);
  const agencyUrl =
    bus.line_uri ||
    bus.agency_uri ||
    agencies.find((a) => a.uri)?.uri ||
    (bus.legs || []).find((l) => l.agency_uri || l.line_uri)?.line_uri ||
    (bus.legs || []).find((l) => l.agency_uri)?.agency_uri ||
    "";
  const legs = Array.isArray(bus.legs) ? bus.legs : [];
  const coach = isCoach(bus);
  const vehicle = bus.vehicle || bus.bus_type || "Transit";
  const rideLegs = legs.filter((l) => l.kind !== "walk");
  const primary = rideLegs[0] || bus;
  const title = coach
    ? bus.operator || bus.name || vehicle
    : bus.name_short || primary.name_short || bus.name || primary.name || vehicle;
  const subtitle = coach
    ? [bus.bus_type, bus.service_name && bus.service_name !== bus.operator ? bus.service_name : ""]
        .filter(Boolean)
        .join(" · ")
    : [bus.operator && bus.operator !== title ? bus.operator : "", bus.headsign ? `towards ${bus.headsign}` : ""]
        .filter(Boolean)
        .join(" · ");
  const modes = Array.isArray(bus.modes) ? bus.modes : [];
  const warnings = Array.isArray(bus.warnings) ? bus.warnings.filter(Boolean) : [];
  const markBg = hex(primary.color || bus.color, "#001438");
  const markFg = hex(primary.text_color || bus.text_color, "#fff");

  const openMaps = (e) => {
    e?.stopPropagation?.();
    window.open(mapsUrl, "_blank", "noopener,noreferrer");
  };

  const openAgency = (e, url = agencyUrl) => {
    e?.stopPropagation?.();
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const startBook = (e) => {
    e?.stopPropagation?.();
    if (local) {
      openMaps(e);
      return;
    }
    persistSelectedBus(bus, {
      date,
      from_name: from,
      to_name: to,
      book_url: bookUrl,
      maps_url: mapsUrl,
    });
    navigate("/transits/book");
  };

  return (
    <article
      className={`${styles.card}${open ? ` ${styles.cardOpen}` : ""}`}
      onClick={() => setOpen((v) => !v)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((v) => !v);
        }
      }}
      role="button"
      tabIndex={0}
      aria-expanded={open}
    >
      {badges.length ? (
        <div className={styles.badges}>
          {badges.map((b) => (
            <span key={b} className={b === "Fastest" ? styles.badgeFast : styles.badgeTop}>
              {b}
            </span>
          ))}
        </div>
      ) : null}

      <div className={styles.head}>
        <span className={styles.headMark} style={{ background: markBg, color: markFg }}>
          {bus.icon_uri ? <img src={bus.icon_uri} alt="" /> : lineMark(primary)}
        </span>
        <div className={styles.headCopy}>
          <strong className={styles.name}>{title}</strong>
          {subtitle ? <p className={styles.type}>{subtitle}</p> : null}
        </div>
        <div className={styles.tags}>
          {Number(bus.fare) > 0 ? (
            <em className={styles.tagFare}>
              {formatFrom(Number(bus.fare), bus.fare_currency || bus.currency || "USD", {
                maximumFractionDigits: 0,
              })}
            </em>
          ) : null}
          {Number(bus.rating) > 0 ? <em className={styles.tagRating}>{Number(bus.rating).toFixed(1)}★</em> : null}
          {coach && bus.bus_type ? <em>{bus.bus_type}</em> : vehicle ? <em>{vehicle}</em> : null}
          {bus.seats ? <em>{bus.seats} seats{bus.single_seats ? ` · ${bus.single_seats} single` : ""}</em> : null}
          {bus.live_tracking ? <em className={styles.tagAccent}>Live tracking</em> : null}
          {bus.primo ? <em className={styles.tagAccent}>Primo</em> : null}
          {bus.headway ? <em className={styles.tagAccent}>{bus.headway}</em> : null}
        </div>
      </div>

      <ModeRail legs={legs} modes={modes} />

      <div className={styles.timeline}>
        <div>
          <b>{bus.dep || "-"}</b>
          <span>{bus.from_stop || from}</span>
        </div>
        <div className={styles.mid}>
          <em>{bus.duration || stopLabel(bus)}</em>
          <i />
          <span>{[stopLabel(bus), bus.distance].filter(Boolean).join(" · ")}</span>
          {Number(bus.fare) > 0 ? (
            <strong className={styles.midFare}>
              {formatFrom(Number(bus.fare), bus.fare_currency || bus.currency || "USD", {
                maximumFractionDigits: 0,
              })}
            </strong>
          ) : null}
        </div>
        <div className={styles.arr}>
          <b>
            {bus.arr || "-"}
            {bus.overnight ? <small>+1</small> : null}
          </b>
          <span>{bus.to_stop || to}</span>
        </div>
      </div>

      {bus.walk_to_stop && !open ? <p className={styles.via}>{bus.walk_to_stop}</p> : null}
      {bus.via?.length && !open && rideLegs.length > 1 ? (
        <p className={styles.via}>Change at {bus.via.slice(0, 3).join(", ")}</p>
      ) : null}

      <button
        type="button"
        className={styles.toggle}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
      >
        {open ? "Hide details" : coach ? "Trip details" : "Full route"}
      </button>

      {open ? (
        <div className={styles.detail} onClick={(e) => e.stopPropagation()}>
          {warnings.map((w) => (
            <p key={w} className={styles.warn}>
              {w}
            </p>
          ))}
          {bus.description ? <p className={styles.via}>{bus.description}</p> : null}
          {legs.length ? (
            <ol className={styles.journey}>
              {legs.map((leg, i) =>
                leg.kind === "walk" ? (
                  <WalkStep key={`w-${i}`} leg={leg} />
                ) : (
                  <RideStep key={`r-${i}`} leg={leg} />
                )
              )}
            </ol>
          ) : (
            <p className={styles.via}>
              {from} → {to}
              {bus.duration ? ` · ${bus.duration}` : ""}
            </p>
          )}
          {bus.walk_off_stop ? <p className={styles.via}>{bus.walk_off_stop}</p> : null}
          {agencies.length ? (
            <ul className={styles.agencyList}>
              {agencies.map((ag) => (
                <li key={`${ag.name}-${ag.phone}-${ag.uri}`}>
                  <strong>{ag.name || "Operator"}</strong>
                  {ag.phone ? (
                    <a href={`tel:${String(ag.phone).replace(/[^\d+]/g, "")}`}>{ag.phone}</a>
                  ) : null}
                  {ag.uri ? (
                    <button type="button" className={styles.linkBtn} onClick={(e) => openAgency(e, ag.uri)}>
                      Site
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className={styles.footer} onClick={(e) => e.stopPropagation()}>
        <p className={styles.fare}>
          <FareBlock bus={bus} formatFrom={formatFrom} />
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.ghost} onClick={openMaps}>
            Maps
          </button>
          {agencyUrl ? (
            <button type="button" className={styles.ghost} onClick={(e) => openAgency(e, agencyUrl)}>
              Tickets
            </button>
          ) : null}
          <button type="button" className={styles.book} onClick={startBook}>
            {local ? "Directions" : "Book now"}
          </button>
        </div>
      </div>
    </article>
  );
}
