import React, { useMemo } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { PageLayout } from "@/components/layout";
import { tripService } from "@/features/trips/tripService";
import { busBookUrl, cityDirectionsUrl, coachFindLine } from "./utils/busBook";
import styles from "@/features/trains/TrainBookingPage.module.css";

export default function BusBookingSuccessPage() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const [params] = useSearchParams();
  const tripId = state?.tripId || params.get("trip") || "";
  const trip = useMemo(() => (tripId ? tripService.get(tripId) : null), [tripId]);
  const leg = (trip?.legs || []).find((l) => l.type === "bus") || null;

  if (!trip || !leg) {
    return (
      <PageLayout>
        <div className={styles.page}>
          <p className={styles.empty}>No transit booking on this device. Complete checkout first.</p>
          <Link to="/transits" className={styles.back}>
            Back to transits
          </Link>
        </div>
      </PageLayout>
    );
  }

  const checkoutUrl =
    state?.checkoutUrl ||
    leg.checkoutUrl ||
    busBookUrl({
      from: leg.from_name,
      to: leg.to_name,
      date: leg.date,
      dep: leg.dep,
      operator: leg.operator,
      bus_type: leg.bus_type,
      ac: leg.ac,
      sleeper: leg.sleeper,
      volvo: leg.volvo,
      fromStop: leg.from_stop,
      toStop: leg.to_stop,
    });
  const mapsUrl =
    state?.mapsUrl ||
    leg.mapsUrl ||
    cityDirectionsUrl(leg.from_name, leg.to_name, {
      fromStop: leg.from_stop,
      toStop: leg.to_stop,
    });
  const findLine =
    state?.findLine ||
    coachFindLine({
      operator: leg.operator,
      dep: leg.dep,
      bus_type: leg.bus_type,
    });
  const kindLabel = leg.kind === "coach" ? "Coach" : "Transit";

  return (
    <PageLayout>
      <div className={styles.page}>
        <button type="button" className={styles.backLink} onClick={() => navigate("/trips")}>
          ← My trips
        </button>
        <p className={styles.kicker}>Transits beta · confirmation</p>
        <h1 className={styles.title}>Booking started on Itinero</h1>
        <p className={styles.lede}>
          Itinero reference <b>{leg.bookingId}</b>. Finish seats and payment on partner checkout
          {findLine ? (
            <>
              {" "}
              for <b>{findLine}</b>
            </>
          ) : null}
          . The partner issues the ticket - that is the real confirmation.
          {state?.popupBlocked ? " Partner checkout was blocked - use the button below." : ""}
        </p>

        <section className={styles.summary}>
          <em>{leg.bus_type || kindLabel}</em>
          <strong>{leg.operator || kindLabel}</strong>
          <span>
            {leg.from_name} {leg.dep || ""} → {leg.to_name} {leg.arr || ""}
          </span>
          {leg.date ? <span>{leg.date}</span> : null}
          {leg.fare ? <b>₹{Number(leg.fare).toLocaleString("en-IN")}</b> : null}
          <span>Awaiting partner ticket</span>
        </section>

        {(trip.passengers || []).length ? (
          <ul className={styles.paxList}>
            {(trip.passengers || []).map((p, i) => (
              <li key={`${p.name}-${i}`}>
                {p.name}
                {p.age ? ` · ${p.age}` : ""}
                {p.gender ? ` · ${p.gender}` : ""}
              </li>
            ))}
          </ul>
        ) : null}

        <button
          type="button"
          className={styles.cta}
          onClick={() => window.open(checkoutUrl, "_blank", "noopener,noreferrer")}
        >
          Continue partner checkout · {leg.operator || kindLabel}
          {leg.dep ? ` · ${leg.dep}` : ""}
        </button>
        <button
          type="button"
          className={styles.add}
          onClick={() => window.open(mapsUrl, "_blank", "noopener,noreferrer")}
        >
          Open in Google Maps
        </button>
        <p className={styles.note}>
          Contact {trip.contact?.phone || "-"}
          {trip.contact?.email ? ` · ${trip.contact.email}` : ""}. Itinero does not issue transit tickets
          in-app.
        </p>
      </div>
    </PageLayout>
  );
}
