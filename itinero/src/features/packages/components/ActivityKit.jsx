import React from "react";
import { Backpack, Bike, ExternalLink, Mountain, Sparkles } from "lucide-react";
import { isKlookEnabled, klookHref } from "@/services/klookAffiliate";
import styles from "./ActivityKit.module.css";

function kitIcon(id) {
  if (id === "biking") return Bike;
  if (id === "scuba" || id === "surfing" || id === "rafting") return Backpack;
  if (id === "hiking" || id === "trekking") return Mountain;
  return Backpack;
}

function rentalHref(link) {
  if (!link) return "";
  return klookHref(link.kind || "search", {
    city: link.city || "",
    query: link.query || "",
  });
}

export default function ActivityKit({ kit, compact = false, onOpenInfo, onAskVero }) {
  const kits = kit?.kits || [];
  const packing = kit?.packing || [];
  const documents = kit?.documents || [];
  if (!kits.length && !packing.length && !documents.length) return null;

  if (compact) {
    const labels = kits.map((k) => k.label);
    return (
      <button type="button" className={styles.teaser} onClick={onOpenInfo}>
        <Backpack size={16} aria-hidden />
        <span>
          <strong>Gear & rentals</strong>
          {labels.length ? ` · ${labels.join(" · ")}` : ""}
          {" · how to hire on the ground"}
        </span>
      </button>
    );
  }

  const klookOn = isKlookEnabled();

  return (
    <div className={styles.wrap} id="gear">
      <div className={styles.head}>
        <h3>Gear & rentals</h3>
        <p>
          What to fly with, how to hire locally, and what to check before you pay. Ask the hotel
          desk or Vero first — you do not need to leave Itinero.
        </p>
      </div>

      {kits.map((row) => {
        const Icon = kitIcon(row.id);
        return (
          <article key={row.id} className={styles.card} data-mode={row.mode}>
            <div className={styles.cardHead}>
              <span className={styles.icon} aria-hidden>
                <Icon size={18} />
              </span>
              <div>
                <p className={styles.kicker}>{row.mode === "local" ? "Optional here" : "This trip"}</p>
                <h4>{row.label}</h4>
              </div>
            </div>
            {row.headline ? <p className={styles.headline}>{row.headline}</p> : null}

            {(row.how_to || []).length ? (
              <div className={styles.howTo}>
                <p className={styles.colLabel}>How to get it on the ground</p>
                <ol>
                  {row.how_to.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
            ) : null}

            {(row.check || []).length ? (
              <div className={styles.checkWrap}>
                <p className={styles.colLabel}>Check before you pay</p>
                <ul className={styles.check}>
                  {row.check.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className={styles.cols}>
              {row.bring?.length ? (
                <div>
                  <p className={styles.colLabel}>Bring</p>
                  <ul>
                    {row.bring.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {row.rent?.length ? (
                <div>
                  <p className={styles.colLabel}>Rent locally</p>
                  <ul>
                    {row.rent.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {row.skip_if_renting?.length ? (
                <div>
                  <p className={styles.colLabel}>Leave at home if renting</p>
                  <ul>
                    {row.skip_if_renting.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className={styles.links}>
              {onAskVero && row.vero_prompt ? (
                <button
                  type="button"
                  className={styles.askBtn}
                  onClick={() => onAskVero(row.vero_prompt)}
                >
                  <Sparkles size={14} aria-hidden />
                  Ask Vero where to rent
                </button>
              ) : null}
              {klookOn
                ? (row.where || []).map((link) => (
                    <a
                      key={link.query || link.label}
                      href={rentalHref(link)}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.rentBtnOptional}
                    >
                      {link.label || "Optional partner pre-book"}
                      <ExternalLink size={14} aria-hidden />
                    </a>
                  ))
                : null}
            </div>

            {(row.notes || []).map((n) => (
              <p key={n} className={styles.note}>
                {n}
              </p>
            ))}
          </article>
        );
      })}

      {packing.length ? (
        <div className={styles.extra}>
          <p className={styles.colLabel}>Trip packing notes</p>
          <ul>
            {packing.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {documents.length ? (
        <div className={styles.extra}>
          <p className={styles.colLabel}>Documents</p>
          <ul>
            {documents.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
