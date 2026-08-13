import React, { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { PageLayout } from "@/components/layout";
import { tripService } from "@/features/trips/tripService";
import { trainBookUrl } from "./utils/irctcBook";
import styles from "./TrainBookingPage.module.css";

export default function TrainBookingSuccessPage() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const [params] = useSearchParams();
  const tripId = state?.tripId || params.get("trip") || "";
  const [tick, setTick] = useState(0);
  const trip = useMemo(() => (tripId ? tripService.get(tripId) : null), [tripId, tick]);
  const leg = (trip?.legs || []).find((l) => l.type === "train") || null;
  const [pnr, setPnr] = useState(leg?.pnr || "");
  const [msg, setMsg] = useState("");

  if (!trip || !leg) {
    return (
      <PageLayout>
        <div className={styles.page}>
          <p className={styles.empty}>No train booking on this device. Complete checkout first.</p>
          <Link to="/trains" className={styles.back}>
            Back to trains
          </Link>
        </div>
      </PageLayout>
    );
  }

  const checkoutUrl =
    state?.checkoutUrl ||
    leg.checkoutUrl ||
    trainBookUrl(
      {
        number: leg.number,
        from_code: leg.from_code,
        to_code: leg.to_code,
        date: leg.date,
        book_url: "",
      },
      leg.date,
      leg.class_code,
      leg.quota
    );
  const findLine =
    state?.findLine ||
    [leg.number, leg.class_code, `${leg.from_code} → ${leg.to_code}`, leg.date].filter(Boolean).join(" · ");

  const savePnr = () => {
    const next = tripService.attachTrainPnr(trip.id, pnr);
    if (!next) {
      setMsg("Enter the 10-digit PNR from the IRCTC SMS or email.");
      return;
    }
    setTick((n) => n + 1);
    setMsg("PNR saved to My trips.");
  };

  return (
    <PageLayout>
      <div className={styles.page}>
        <button type="button" className={styles.backLink} onClick={() => navigate("/trips")}>
          ← My trips
        </button>
        <p className={styles.kicker}>Trains · India · confirmation</p>
        <h1 className={styles.title}>Booking started on Itinero</h1>
        <p className={styles.lede}>
          Itinero reference <b>{leg.bookingId}</b>. Finish payment on partner checkout for{" "}
          <b>{findLine}</b>. IRCTC will SMS/email the e-ticket - that is the real confirmation. Paste the PNR
          below so it lives on your trip.
          {state?.popupBlocked ? " Partner checkout was blocked - use the button below." : ""}
        </p>

        <section className={styles.summary}>
          <em>{leg.number}</em>
          <strong>{leg.name}</strong>
          <span>
            {leg.from_code} {leg.dep || ""} → {leg.to_code} {leg.arr || ""}
          </span>
          {leg.date ? <span>{leg.date}</span> : null}
          <span>
            {leg.class_code} · {leg.quota}
          </span>
          {leg.fare ? <b>₹{Number(leg.fare).toLocaleString("en-IN")}</b> : null}
          {leg.pnr ? <b>PNR {leg.pnr}</b> : <span>Awaiting IRCTC PNR</span>}
        </section>

        {(trip.passengers || []).length ? (
          <ul className={styles.paxList}>
            {(trip.passengers || []).map((p, i) => (
              <li key={`${p.name}-${i}`}>
                {p.name}
                {p.age ? ` · ${p.age}` : ""}
                {p.gender ? ` · ${p.gender}` : ""}
                {p.berth ? ` · ${p.berth}` : ""}
              </li>
            ))}
          </ul>
        ) : null}

        <label className={styles.label}>IRCTC PNR</label>
        <div className={styles.pnrRow}>
          <input
            className={styles.phone}
            placeholder="10-digit PNR"
            inputMode="numeric"
            value={pnr}
            onChange={(e) => setPnr(e.target.value)}
          />
          <button type="button" className={styles.ctaInline} onClick={savePnr}>
            Save to trip
          </button>
        </div>
        {msg ? <p className={msg.includes("saved") ? styles.ok : styles.err}>{msg}</p> : null}

        <button type="button" className={styles.cta} onClick={() => window.open(checkoutUrl, "_blank", "noopener,noreferrer")}>
          Continue partner checkout · {leg.number} {leg.class_code}
        </button>
        {leg.pnr ? (
          <button
            type="button"
            className={styles.add}
            onClick={() => navigate(`/trains?mode=pnr&pnr=${encodeURIComponent(leg.pnr)}`)}
          >
            Check this PNR on Itinero
          </button>
        ) : null}
        <p className={styles.note}>
          Contact {trip.contact?.phone || "-"}
          {trip.contact?.email ? ` · ${trip.contact.email}` : ""}. We never store your IRCTC password.
        </p>
      </div>
    </PageLayout>
  );
}
