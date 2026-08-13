import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  Compass,
  ExternalLink,
  FileText,
  HeartPulse,
  Map,
  Phone,
  Plane,
  Plug,
  ShieldAlert,
  Sparkles,
  Wallet,
} from "lucide-react";
import styles from "./PackageTripHub.module.css";

function hotelHref({ city, checkIn, checkOut, guests }) {
  const p = new URLSearchParams();
  if (city) p.set("city", city);
  if (checkIn) p.set("checkIn", checkIn);
  if (checkOut) p.set("checkOut", checkOut);
  if (guests) p.set("guests", String(guests));
  return `/hotels?${p}`;
}

function flightHref({ origin, iata, checkIn, checkOut, guests }) {
  const p = new URLSearchParams();
  if (origin) p.set("from", origin);
  if (iata) p.set("to", iata);
  if (checkIn) p.set("depart", checkIn);
  if (checkOut) p.set("return", checkOut);
  p.set("adults", String(guests || 1));
  p.set("cabin", "Economy");
  p.set("trip", "Return");
  return `/flights?${p}`;
}

export default function PackageTripHub({
  dest,
  intel,
  pkg,
  origin,
  checkIn,
  checkOut,
  guests = 2,
  isDomestic = false,
  compact = false,
  onAskVero,
  onOpenInfo,
}) {
  const city = dest?.city || pkg?.stay?.city || (pkg?.destinations || []).filter(Boolean)[0] || "";
  const country = dest?.country || "";
  const iata =
    dest?.iata ||
    pkg?.flightGateway?.airport ||
    pkg?.flight?.gatewayAirport ||
    pkg?.flight?.airport ||
    "";
  const exploreSlug = dest?.slug || dest?.id || "";
  const title = pkg?.title || city || "this trip";

  const stayLinks = useMemo(() => {
    const rows = [];
    if (exploreSlug) {
      rows.push({
        to: `/explore/${exploreSlug}`,
        icon: Compass,
        label: `Explore ${city || country}`,
        hint: "Visa, seasons, culture",
      });
    }
    if (city) {
      rows.push({
        to: hotelHref({ city, checkIn, checkOut, guests }),
        icon: Building2,
        label: `Hotels in ${city}`,
        hint: "Live stays on Itinero",
      });
    }
    rows.push({
      to: flightHref({ origin, iata, checkIn, checkOut, guests }),
      icon: Plane,
      label: iata ? `Flights to ${iata}` : "Search flights",
      hint: origin ? `From ${origin}` : "Pick origin on flights",
    });
    if (city) {
      rows.push({
        to: `/packages?q=${encodeURIComponent(city)}`,
        icon: Map,
        label: `More ${city} packages`,
        hint: "Stay on Itinero",
      });
    }
    return rows;
  }, [exploreSlug, city, country, checkIn, checkOut, guests, origin, iata]);

  const askCity = () =>
    onAskVero?.(
      `I am looking at ${title}${city ? ` in ${city}` : ""}${
        country ? `, ${country}` : ""
      }. Give me on-the-ground intel: getting around, money, safety, packing, and where to rent gear near my hotel. Keep me on Itinero — no brochure fluff.`
    );

  if (compact) {
    return (
      <div className={styles.teaser}>
        <div className={styles.teaserHead}>
          <p className={styles.kicker}>Stay on Itinero</p>
          <h3>City intel, stays, flights — without leaving</h3>
        </div>
        {intel?.gettingAround?.[0] ? (
          <p className={styles.teaserLead}>{intel.gettingAround[0]}</p>
        ) : null}
        <div className={styles.stayRail}>
          {stayLinks.map((row) => {
            const Icon = row.icon;
            return (
              <Link key={row.to} to={row.to} className={styles.stayLink}>
                <Icon size={16} aria-hidden />
                <strong>{row.label}</strong>
                <span>{row.hint}</span>
              </Link>
            );
          })}
          {onAskVero ? (
            <button type="button" className={styles.stayAsk} onClick={askCity}>
              <Sparkles size={16} aria-hidden />
              <strong>Ask Vero</strong>
              <span>Visa, rentals, timing</span>
            </button>
          ) : null}
        </div>
        {onOpenInfo ? (
          <button type="button" className={styles.moreBtn} onClick={onOpenInfo}>
            Full city intel, documents, gear →
          </button>
        ) : null}
      </div>
    );
  }

  const healthReq = intel?.health?.required || [];
  const healthRec = (intel?.health?.recommended || []).slice(0, 4);
  const alerts = intel?.alerts || [];

  return (
    <div className={styles.wrap} id="trip-hub">
      <div className={styles.head}>
        <p className={styles.kicker}>Stay on Itinero</p>
        <h3>
          {city ? `${city}${country ? `, ${country}` : ""}` : title} — everything you need here
        </h3>
        <p>
          Getting around, money, documents, and gear live on this page. Ask Vero for anything
          still missing. Partner sites are optional last.
        </p>
      </div>

      <div className={styles.stayRail}>
        {stayLinks.map((row) => {
          const Icon = row.icon;
          return (
            <Link key={row.to} to={row.to} className={styles.stayLink}>
              <Icon size={16} aria-hidden />
              <strong>{row.label}</strong>
              <span>{row.hint}</span>
            </Link>
          );
        })}
        {onAskVero ? (
          <button type="button" className={styles.stayAsk} onClick={askCity}>
            <Sparkles size={16} aria-hidden />
            <strong>Ask Vero</strong>
            <span>Anything this page does not cover</span>
          </button>
        ) : null}
      </div>

      {alerts.length ? (
        <div className={styles.alerts}>
          {alerts.map((a) => (
            <span key={a.label || a}>{a.label || a}</span>
          ))}
        </div>
      ) : null}

      {intel ? (
        <>
          <div className={styles.grid}>
            {(intel.gettingAround || []).length ? (
              <article className={styles.card}>
                <h4>Getting around</h4>
                <ul>
                  {intel.gettingAround.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </article>
            ) : null}
            <article className={styles.card}>
              <h4>
                <Wallet size={14} aria-hidden /> Money
              </h4>
              <p>
                {intel.currency?.code
                  ? `${intel.currency.code} · ${intel.currency.name}`
                  : "Local currency"}
              </p>
              {intel.currency?.tip ? <p>{intel.currency.tip}</p> : null}
              {intel.money?.cards ? <p>{intel.money.cards}</p> : null}
              {intel.money?.atm ? <p>{intel.money.atm}</p> : null}
              {intel.money?.tipping ? <p>{intel.money.tipping}</p> : null}
            </article>
            <article className={styles.card}>
              <h4>
                <ShieldAlert size={14} aria-hidden /> Safety
              </h4>
              {intel.safety?.level ? <p className={styles.meta}>{intel.safety.level}</p> : null}
              <ul>
                {(intel.safety?.tips || []).map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </article>
            <article className={styles.card}>
              <h4>
                <Plug size={14} aria-hidden /> Everyday
              </h4>
              {intel.plugs ? <p>Plugs: {intel.plugs}</p> : null}
              {(intel.language || []).length ? (
                <p>Language: {intel.language.join(", ")}</p>
              ) : null}
              {intel.timezone ? <p>Time: {intel.timezone}</p> : null}
              {intel.emergency?.all || intel.emergency?.police ? (
                <p>
                  <Phone size={12} aria-hidden /> Emergency:{" "}
                  {intel.emergency.all || intel.emergency.police}
                  {intel.emergency.note ? ` · ${intel.emergency.note}` : ""}
                </p>
              ) : null}
            </article>
          </div>

          {(intel.culture || intel.packing || intel.documents) && (
            <div className={styles.split}>
              {(intel.culture || []).length ? (
                <article className={styles.card}>
                  <h4>Culture</h4>
                  <ul>
                    {intel.culture.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </article>
              ) : null}
              {(intel.packing || []).length ? (
                <article className={styles.card}>
                  <h4>Pack from intel</h4>
                  <ul className={styles.chips}>
                    {intel.packing.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </article>
              ) : null}
              {(intel.documents || []).length ? (
                <article className={styles.card}>
                  <h4>
                    <FileText size={14} aria-hidden /> Documents
                  </h4>
                  <ul className={styles.chips}>
                    {intel.documents.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </article>
              ) : null}
            </div>
          )}

          {intel.when ? (
            <article className={styles.card}>
              <h4>When to go</h4>
              <p>
                <strong>Best:</strong> {intel.when.best || "Check local seasons."}
                {intel.when.avoid ? (
                  <>
                    {" "}
                    <strong>Mind:</strong> {intel.when.avoid}
                  </>
                ) : null}
              </p>
            </article>
          ) : null}

          {!isDomestic ? (
            <div className={styles.split}>
              <article className={`${styles.card} ${styles.warn}`}>
                <h4>
                  <FileText size={14} aria-hidden /> Visa & entry
                </h4>
                <p>{intel.visa?.indian || intel.visa?.general || "Ask Vero with your passport nationality."}</p>
                {onAskVero ? (
                  <button
                    type="button"
                    className={styles.inlineAsk}
                    onClick={() =>
                      onAskVero(
                        `Do I need a visa or ETA for ${country || city} on this Itinero package? Ask my passport nationality if missing. Official sources only.`
                      )
                    }
                  >
                    <Sparkles size={14} aria-hidden /> Ask Vero about visas
                  </button>
                ) : null}
                {(intel.official || []).length ? (
                  <p className={styles.official}>
                    Official (leaves site):{" "}
                    {intel.official.map((o, i) => (
                      <React.Fragment key={o.href || o.label}>
                        {i > 0 ? " · " : null}
                        <a href={o.href} target="_blank" rel="noreferrer">
                          {o.label} <ExternalLink size={11} aria-hidden />
                        </a>
                      </React.Fragment>
                    ))}
                  </p>
                ) : null}
              </article>
              <article className={styles.card}>
                <h4>
                  <HeartPulse size={14} aria-hidden /> Health snapshot
                </h4>
                {intel.health?.malaria ? <p>{intel.health.malaria}</p> : null}
                {intel.health?.water ? <p>{intel.health.water}</p> : null}
                {intel.health?.altitude ? <p>{intel.health.altitude}</p> : null}
                {healthReq.length ? (
                  <ul>
                    {healthReq.map((v) => (
                      <li key={v.name}>
                        <strong>{v.name}.</strong> {v.note}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {healthRec.length ? (
                  <ul className={styles.chips}>
                    {healthRec.map((v) => (
                      <li key={v.name}>{v.name}</li>
                    ))}
                  </ul>
                ) : null}
                {onAskVero ? (
                  <button
                    type="button"
                    className={styles.inlineAsk}
                    onClick={() =>
                      onAskVero(
                        `Health notes for ${city || country}: vaccines, malaria, water, altitude. Clinic-confirm language, not a prescription.`
                      )
                    }
                  >
                    <Sparkles size={14} aria-hidden /> Ask Vero about health
                  </button>
                ) : null}
              </article>
            </div>
          ) : null}

          {intel.disclaimer ? <p className={styles.disclaimer}>{intel.disclaimer}</p> : null}
        </>
      ) : (
        <p className={styles.fallback}>
          City intel is loading from Explore. Use the links above, or ask Vero for visa, money,
          and rental how-tos for this stay.
        </p>
      )}
    </div>
  );
}
