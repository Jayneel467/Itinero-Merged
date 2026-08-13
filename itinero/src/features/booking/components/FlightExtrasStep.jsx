import React, { useMemo, useState } from "react";
import styles from "./FlightExtrasStep.module.css";

const TYPE_LABELS = {
  SEAT: "Seat selection",
  SEATS: "Seat selection",
  BAGGAGE: "Extra baggage",
  BAG: "Extra baggage",
  MEAL: "Meals",
  INSURANCE: "Travel insurance",
  OTHER: "Other add-ons",
};

function money(amount, currency, fallbackSym = "₹") {
  if (amount == null || !Number.isFinite(Number(amount))) return "-";
  const n = Number(amount);
  const cur = String(currency || "INR").toUpperCase();
  const sym = cur === "INR" ? "₹" : cur === "USD" ? "$" : `${cur} `;
  try {
    return `${sym}${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  } catch {
    return `${fallbackSym}${n}`;
  }
}

function groupType(g) {
  return String(g?.type || "OTHER").toUpperCase();
}

function isSeatGroup(g) {
  return groupType(g).startsWith("SEAT");
}

function isBagGroup(g) {
  const t = groupType(g);
  return t.startsWith("BAG");
}

function optionKey(opt, group) {
  return `${opt.service_id}|${opt.segment_key || group.segment_key || ""}|${opt.passenger_index ?? 0}`;
}

function buildSeatGrid(options) {
  const seats = (options || []).filter((o) => o.seat || o.available !== false);
  const byCell = new Map();
  const rows = new Set();
  const cols = new Set();

  for (const opt of seats) {
    const seat = opt.seat || {};
    let row = seat.seatRow;
    let col = seat.seatColumn;
    const code = String(seat.seatNumber || opt.name || "").toUpperCase();
    if ((row == null || !col) && code) {
      const m = code.match(/(\d+)\s*([A-Z])/);
      if (m) {
        row = Number(m[1]);
        col = m[2];
      }
    }
    if (row == null || !col) continue;
    rows.add(Number(row));
    cols.add(String(col).toUpperCase());
    byCell.set(`${row}-${String(col).toUpperCase()}`, opt);
  }

  const sortedRows = Array.from(rows).sort((a, b) => a - b);
  const sortedCols = Array.from(cols).sort();
  return { sortedRows, sortedCols, byCell, hasGrid: sortedRows.length > 0 && sortedCols.length > 0 };
}

/**
 * Post-hold extras picker: seats, bags, and any other LiteAPI ancillaries.
 */
export default function FlightExtrasStep({
  services,
  passengerLabels = [],
  currency = "INR",
  currencySym = "₹",
  basePrice = 0,
  submitting = false,
  onSkip,
  onContinue,
}) {
  const groups = Array.isArray(services?.groups) ? services.groups : [];
  const [selected, setSelected] = useState(() => new Map()); // key -> option payload
  const [activePax, setActivePax] = useState(0);
  const [seatFilter, setSeatFilter] = useState("all"); // all | window | aisle

  const extrasTotal = useMemo(() => {
    let sum = 0;
    for (const item of selected.values()) {
      const p = Number(item.price);
      if (Number.isFinite(p)) sum += p;
    }
    return sum;
  }, [selected]);

  const estimatedTotal = Number(basePrice || 0) + extrasTotal;

  function toggleOption(opt, group, { exclusive = false } = {}) {
    if (!opt?.service_id) return;
    const key = optionKey(opt, group);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
        return next;
      }
      if (exclusive) {
        // One seat/bag per passenger per segment for this group type
        const seg = opt.segment_key || group.segment_key || "";
        const pax = opt.passenger_index ?? activePax;
        const gtype = groupType(group);
        for (const [k, v] of next.entries()) {
          if (
            String(v.type || "").toUpperCase() === gtype &&
            (v.segment_key || "") === seg &&
            Number(v.passenger_index ?? 0) === Number(pax)
          ) {
            next.delete(k);
          }
        }
      }
      next.set(key, {
        service_id: opt.service_id,
        segment_key: opt.segment_key || group.segment_key || undefined,
        passenger_index: opt.passenger_index ?? activePax,
        quantity: 1,
        price: opt.price,
        currency: opt.currency || currency,
        name: opt.name,
        type: groupType(group),
      });
      return next;
    });
  }

  function buildPayload() {
    return Array.from(selected.values()).map((item) => ({
      service_id: item.service_id,
      segment_key: item.segment_key,
      passenger_index: item.passenger_index ?? 0,
      quantity: item.quantity || 1,
    }));
  }

  if (!groups.length) {
    return (
      <div className={styles.wrap}>
        <p className={styles.empty}>
          No seat or baggage add-ons are available for this fare. You can continue to payment.
        </p>
        <p className={styles.hint}>
          Paid seats and extra bags appear after hold when the airline offers them. Insurance isn’t
          available on this fare.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} disabled={submitting} onClick={() => onSkip?.()}>
            Continue to payment
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.intro}>
        Optional add-ons from the airline. Skip anytime - your fare stay is already held.
      </p>

      {passengerLabels.length > 1 ? (
        <div className={styles.paxTabs} role="tablist" aria-label="Traveller">
          {passengerLabels.map((label, idx) => (
            <button
              key={idx}
              type="button"
              role="tab"
              aria-selected={activePax === idx}
              className={`${styles.paxTab}${activePax === idx ? ` ${styles.paxTabActive}` : ""}`}
              onClick={() => setActivePax(idx)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {groups.map((group, gi) => {
        const gtype = groupType(group);
        const label = TYPE_LABELS[gtype] || group.name || gtype;
        const options = (group.options || []).filter((o) => {
          if (passengerLabels.length > 1 && o.passenger_index != null) {
            // If options are pax-scoped, show active pax; otherwise show all
            if (Number(o.passenger_index) !== activePax && Number(o.passenger_index) !== 0) {
              return false;
            }
          }
          return true;
        });

        if (isSeatGroup(group)) {
          const filtered = options.filter((o) => {
            const pos = String(o.seat?.position || "").toLowerCase();
            if (seatFilter === "window") return pos === "window";
            if (seatFilter === "aisle") return pos === "aisle";
            return true;
          });
          const grid = buildSeatGrid(filtered);

          return (
            <section key={`${gtype}-${gi}`} className={styles.section}>
              <header className={styles.sectionHead}>
                <h3>{label}</h3>
                {group.segment_key ? (
                  <span className={styles.segHint}>Segment {String(group.segment_key).slice(0, 8)}</span>
                ) : null}
              </header>
              <div className={styles.filters}>
                {[
                  ["all", "All"],
                  ["window", "Window"],
                  ["aisle", "Aisle"],
                ].map(([id, text]) => (
                  <button
                    key={id}
                    type="button"
                    className={`${styles.chip}${seatFilter === id ? ` ${styles.chipActive}` : ""}`}
                    onClick={() => setSeatFilter(id)}
                  >
                    {text}
                  </button>
                ))}
              </div>

              {grid.hasGrid ? (
                <div className={styles.seatMap} role="grid" aria-label="Seat map">
                  <div
                    className={styles.seatCols}
                    style={{ gridTemplateColumns: `28px repeat(${grid.sortedCols.length}, 1fr)` }}
                  >
                    <span />
                    {grid.sortedCols.map((c) => (
                      <span key={c} className={styles.colLabel}>
                        {c}
                      </span>
                    ))}
                  </div>
                  {grid.sortedRows.map((row) => (
                    <div
                      key={row}
                      className={styles.seatRow}
                      style={{ gridTemplateColumns: `28px repeat(${grid.sortedCols.length}, 1fr)` }}
                    >
                      <span className={styles.rowLabel}>{row}</span>
                      {grid.sortedCols.map((col) => {
                          const opt = grid.byCell.get(`${row}-${col}`);
                        if (!opt) return <span key={col} className={styles.seatEmpty} />;
                        const keyed = { ...opt, passenger_index: opt.passenger_index ?? activePax };
                        const isOn = selected.has(optionKey(keyed, group));
                        return (
                          <button
                            key={col}
                            type="button"
                            className={`${styles.seat}${isOn ? ` ${styles.seatSelected}` : ""}`}
                            title={`${opt.name || `${row}${col}`} · ${money(opt.price, opt.currency || currency, currencySym)}`}
                            disabled={submitting}
                            onClick={() =>
                              toggleOption(keyed, group, { exclusive: true })
                            }
                          >
                            <em>{col}</em>
                            <small>{money(opt.price, opt.currency || currency, currencySym)}</small>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ) : (
                <ul className={styles.optList}>
                  {filtered.slice(0, 40).map((opt) => {
                    const keyed = { ...opt, passenger_index: opt.passenger_index ?? activePax };
                    const key = optionKey(keyed, group);
                    const isOn = selected.has(key);
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          className={`${styles.optBtn}${isOn ? ` ${styles.optBtnOn}` : ""}`}
                          disabled={submitting}
                          onClick={() => toggleOption(keyed, group, { exclusive: true })}
                        >
                          <span>
                            <strong>{opt.name || "Seat"}</strong>
                            {opt.seat?.position ? (
                              <em className={styles.muted}> · {opt.seat.position}</em>
                            ) : null}
                          </span>
                          <span>{money(opt.price, opt.currency || currency, currencySym)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        }

        // Bags / meals / insurance / other - pick list (exclusive per pax+segment for bags)
        return (
          <section key={`${gtype}-${gi}`} className={styles.section}>
            <header className={styles.sectionHead}>
              <h3>{label}</h3>
            </header>
            {gtype === "INSURANCE" ? (
              <p className={styles.hint}>
                Insurance appeared on this hold from the airline feed - confirm cover details at
                payment.
              </p>
            ) : null}
            <ul className={styles.optList}>
              {options.map((opt) => {
                const keyed = {
                  ...opt,
                  passenger_index: opt.passenger_index ?? activePax,
                };
                const key = optionKey(keyed, group);
                const isOn = selected.has(key);
                const bagBits = [];
                if (opt.baggage?.weightKg) bagBits.push(`${opt.baggage.weightKg} kg`);
                if (opt.baggage?.pieceCount) bagBits.push(`${opt.baggage.pieceCount} pc`);
                return (
                  <li key={key}>
                    <button
                      type="button"
                      className={`${styles.optBtn}${isOn ? ` ${styles.optBtnOn}` : ""}`}
                      disabled={submitting}
                      onClick={() =>
                        toggleOption(keyed, group, { exclusive: isBagGroup(group) })
                      }
                    >
                      <span>
                        <strong>{opt.name || "Add-on"}</strong>
                        {bagBits.length ? (
                          <em className={styles.muted}> · {bagBits.join(" · ")}</em>
                        ) : null}
                      </span>
                      <span>{money(opt.price, opt.currency || currency, currencySym)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <div className={styles.summary}>
        <div>
          <span>Estimated total</span>
          <strong>{money(estimatedTotal, currency, currencySym)}</strong>
        </div>
        {extrasTotal > 0 ? (
          <p className={styles.muted}>
            Includes {money(extrasTotal, currency, currencySym)} in selected extras (final total
            confirmed after attach).
          </p>
        ) : (
          <p className={styles.muted}>No extras selected.</p>
        )}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.ghost}
          disabled={submitting}
          onClick={() => onSkip?.()}
        >
          Skip extras
        </button>
        <button
          type="button"
          className={styles.primary}
          disabled={submitting}
          onClick={() => onContinue?.(buildPayload())}
        >
          {selected.size ? "Add & continue" : "Continue to payment"}
        </button>
      </div>
    </div>
  );
}
