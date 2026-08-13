import { useState } from "react";
import { Link } from "react-router-dom";
import { trackTrainPath, trainsSearchPath } from "@/features/vero/utils/pageFilterIntent";
import { irctcFoodUrl, trainFoodPagePath } from "../utils/irctcBook";
import styles from "./PnrStatusCard.module.css";

const IRCTC_PNR = "https://www.indianrail.gov.in/enquiry/PNR/PnrEnquiry.html";

function toneOf(code, text) {
  const blob = `${code || ""} ${text || ""}`.toUpperCase();
  if (/\bCAN(?:CEL)?/.test(blob)) return "can";
  if (/\bRAC\b/.test(blob)) return "rac";
  if (/\b(?:GN|PQ|RL|TQ|RS)?W\/?L\b|\bWAIT/.test(blob)) return "wl";
  if (/\bCNF\b|CONFIRMED/.test(blob)) return "cnf";
  return "";
}

function prettyDate(raw, ymd) {
  const src = ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : "";
  let y;
  let m;
  let d;
  if (src) [y, m, d] = src.split("-");
  else if (/^\d{2}-\d{2}-\d{4}$/.test(String(raw || ""))) {
    [d, m, y] = String(raw).split("-");
  } else return raw || "";
  const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (Number.isNaN(dt.getTime())) return raw || ymd || "";
  return dt.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function seatLine(row) {
  const seat = [row?.coach, row?.berth].filter(Boolean).join(" / ");
  if (seat) return row?.berth_type ? `${seat} · ${row.berth_type}` : seat;
  if (row?.coach_berth) return row.coach_berth;
  if (/\b(WL|RAC)\b/i.test(`${row?.quota || ""} ${row?.status_code || ""}`)) return "After chart";
  return "-";
}

function nowLine(row) {
  const code = String(row?.current_code || "");
  if (/\b(?:PQ|GN|RL|TQ|RS)?WL\b|\bRAC\b/i.test(code)) {
    const words = row?.current_status && !code.toLowerCase().includes(String(row.current_status).toLowerCase())
      ? ` · ${row.current_status}`
      : "";
    return `${code}${words}`;
  }
  return row?.current_status || code || row?.status_code || "-";
}

function chanceLine(data, row) {
  const level = row?.confirm_level || data.confirm_level;
  const pct = row?.confirm_pct ?? data.confirm_pct;
  if (!level && pct == null) return "";
  return [level, pct != null ? `~${pct}%` : ""].filter(Boolean).join(" · ");
}

export default function PnrStatusCard({ data }) {
  const [copied, setCopied] = useState(false);
  if (!data?.pnr) return null;
  const overall = data.overall_status || data.quota || data.passengers?.[0]?.status_code || "";
  const tone = toneOf(overall, data.passengers?.[0]?.current_status);
  const fromLabel = [data.from_name, data.from_code].filter(Boolean).join(" · ") || "-";
  const toLabel = [data.to_name, data.to_code].filter(Boolean).join(" · ") || "-";
  const boarding = prettyDate(data.journey_date, data.journey_ymd);
  const chance = chanceLine(data, data.passengers?.[0]);
  const paxCount = data.passenger_count || (data.passengers || []).length;

  const copyPnr = async () => {
    try {
      await navigator.clipboard.writeText(String(data.pnr));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <article className={styles.card}>
      <header className={styles.top}>
        <div>
          <p className={styles.kicker}>PNR</p>
          <h3>{data.pnr}</h3>
        </div>
        <span className={`${styles.badge} ${tone ? styles[tone] : ""}`}>{overall || "Status"}</span>
      </header>

      <p className={styles.train}>
        {data.train_number} {data.train_name}
      </p>
      <div className={styles.route}>
        <div>
          <span>From</span>
          <strong>{fromLabel}</strong>
          {data.dep ? <em>{data.dep}</em> : null}
        </div>
        <div className={styles.arrow} aria-hidden>
          →
        </div>
        <div>
          <span>To</span>
          <strong>{toLabel}</strong>
          {data.arr ? <em>{data.arr}</em> : null}
        </div>
      </div>

      <ul className={styles.meta}>
        {boarding ? <li>Boarding {boarding}</li> : null}
        {data.class_name || data.class_code ? <li>{data.class_name || data.class_code}</li> : null}
        {data.duration ? <li>{data.duration}</li> : null}
        {paxCount ? <li>{paxCount} passenger{paxCount === 1 ? "" : "s"}</li> : null}
        {data.quota_label ? <li>{data.quota_label}</li> : data.quota ? <li>{data.quota}</li> : null}
        {data.platform ? <li>PF {data.platform} (tentative)</li> : null}
        {data.chart_status ? <li>Chart: {data.chart_status}</li> : null}
      </ul>

      {chance ? (
        <p className={`${styles.chance} ${styles[tone] || ""}`}>
          <strong>{chance}</strong>
          <span>
            {data.confirm_note || data.passengers?.[0]?.confirm_note || "Partner confirmation estimate - not IRCTC."}{" "}
            Chart still {data.chart_prepared ? "prepared" : "not prepared"}.
          </span>
        </p>
      ) : data.chart_status ? (
        <p className={styles.hint}>
          {data.chart_prepared ? "Chart prepared - coach/berth on the ticket is current." : "Chart not prepared yet - coach/berth assigned after chart."}
        </p>
      ) : null}

      {(data.passengers || []).length ? (
        <ul className={styles.pax}>
          {(data.passengers || []).map((row) => (
            <li key={row.index} className={styles[toneOf(row.status_code || row.quota, row.current_status)] || undefined}>
              <div className={styles.paxTop}>
                <em>P{row.index}</em>
                <span>{row.quota || row.status_code || overall}</span>
              </div>
              <dl>
                <div>
                  <dt>Booked</dt>
                  <dd>{row.booking_status || "-"}</dd>
                </div>
                <div>
                  <dt>Now</dt>
                  <dd>{nowLine(row)}</dd>
                </div>
                <div>
                  <dt>Seat</dt>
                  <dd>{seatLine(row)}</dd>
                </div>
                {chanceLine(data, row) ? (
                  <div>
                    <dt>Chance</dt>
                    <dd>{chanceLine(data, row)}</dd>
                  </div>
                ) : null}
              </dl>
              {row.wl_booked != null && row.wl_current != null && row.wl_booked !== row.wl_current ? (
                <p className={styles.move}>Waitlist moved {row.wl_booked} → {row.wl_current} on this feed.</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.emptyPax}>Passenger rows not on this feed.</p>
      )}

      {data.cancel_risk || data.reschedule_risk ? (
        <p className={styles.stats}>
          Train notes (partner, last 2 months):{" "}
          {data.cancel_risk
            ? `cancellation ${data.cancel_risk}${data.cancel_count != null ? ` (${data.cancel_count})` : ""}`
            : null}
          {data.cancel_risk && data.reschedule_risk ? " · " : null}
          {data.reschedule_risk
            ? `reschedule ${data.reschedule_risk}${data.reschedule_count != null ? ` (${data.reschedule_count})` : ""}`
            : null}
          .
        </p>
      ) : null}

      <p className={styles.stats}>
        Food on train: IRCTC eCatering delivers to your berth when the corridor is live. PNR helps the kitchen find you.
      </p>

      <div className={styles.actions}>
        <button type="button" onClick={copyPnr}>
          {copied ? "Copied PNR" : "Copy PNR"}
        </button>
        {data.train_number ? (
          <Link to={trackTrainPath({ number: data.train_number })}>Track {data.train_number}</Link>
        ) : null}
        {data.from_code && data.to_code ? (
          <Link
            to={trainsSearchPath({
              from_code: data.from_code,
              to_code: data.to_code,
              origin: data.from_name,
              destination: data.to_name,
              date: data.journey_ymd || undefined,
            })}
          >
            Trains {data.from_code} → {data.to_code}
          </Link>
        ) : null}
        <a href={IRCTC_PNR} target="_blank" rel="noopener noreferrer">
          Check on IRCTC
        </a>
        <a href={irctcFoodUrl({ pnr: data.pnr, trainNumber: data.train_number, station: data.from_code })} target="_blank" rel="noopener noreferrer">
          IRCTC eCatering
        </a>
        <Link
          to={trainFoodPagePath({
            tab: "pnr",
            pnr: data.pnr,
            trainNumber: data.train_number,
            boarding: data.from_code,
            date: data.journey_ymd,
          })}
        >
          Order meal to berth
        </Link>
      </div>
    </article>
  );
}
