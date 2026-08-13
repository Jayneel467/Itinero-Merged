import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/layout";
import { tripService } from "@/features/trips/tripService";
import { readSelectedBus } from "./utils/persistSelectedBus";
import { busBookUrl, cityDirectionsUrl, coachFindLine } from "./utils/busBook";
import styles from "@/features/trains/TrainBookingPage.module.css";

function tenDigitMobile(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length >= 12 && digits.startsWith("91")) return digits.slice(-10);
  if (digits.length >= 11 && digits.startsWith("0")) return digits.slice(-10);
  if (digits.length >= 10) return digits.slice(-10);
  return "";
}

export default function BusBookingPage() {
  const navigate = useNavigate();
  const selected = useMemo(() => readSelectedBus(), []);
  const [passengers, setPassengers] = useState([{ name: "", age: "", gender: "M" }]);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  if (!selected?.operator && !selected?.dep) {
    return (
      <PageLayout>
        <div className={styles.page}>
          <p className={styles.empty}>Pick a transit first.</p>
          <Link to="/transits" className={styles.back}>
            Back to transits
          </Link>
        </div>
      </PageLayout>
    );
  }

  const bookUrl = busBookUrl({
    from: selected.from_name,
    to: selected.to_name,
    date: selected.date,
    dep: selected.dep,
    operator: selected.operator,
    bus_type: selected.bus_type,
    ac: selected.ac,
    sleeper: selected.sleeper,
    volvo: selected.volvo,
    fromStop: selected.from_stop,
    toStop: selected.to_stop,
  });
  const mapsUrl =
    selected.maps_url ||
    cityDirectionsUrl(selected.from_name, selected.to_name, {
      fromStop: selected.from_stop,
      toStop: selected.to_stop,
    });
  const findLine = coachFindLine({
    operator: selected.operator,
    dep: selected.dep,
    bus_type: selected.bus_type,
  });

  const updatePax = (i, patch) => {
    setPassengers((list) => list.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  };

  const completeBooking = () => {
    try {
      const mobile = tenDigitMobile(phone);
      const named = passengers
        .map((p) => {
          const name = String(p.name || "").trim();
          if (!name || name.length < 2) return null;
          const ageNum = Number(p.age);
          const age = Number.isFinite(ageNum) && ageNum >= 1 && ageNum <= 120 ? String(ageNum) : "30";
          return { ...p, name, age };
        })
        .filter(Boolean);
      if (!named.length) {
        setError("Add passenger full name as on ID.");
        return;
      }
      if (!mobile) {
        setError("Enter the 10-digit mobile for ticketing.");
        return;
      }
      setError("");
      const trip = tripService.recordPendingBus({
        bus: selected,
        passengers: named,
        contact: { phone: mobile },
        checkoutUrl: bookUrl,
        mapsUrl,
      });
      if (!trip?.id) {
        setError("Could not save this booking. Try again.");
        return;
      }
      const block = [
        findLine,
        ...named.map((p, i) => `${i + 1}. ${p.name} / ${p.age} / ${p.gender || "M"}`),
        `Mobile: ${mobile}`,
      ]
        .filter(Boolean)
        .join("\n");
      try {
        if (block) void navigator.clipboard?.writeText(block);
      } catch {
        /* ignore */
      }
      const popped = window.open(bookUrl, "_blank", "noopener,noreferrer");
      navigate(`/transits/book/done?trip=${encodeURIComponent(trip.id)}`, {
        state: {
          tripId: trip.id,
          checkoutUrl: bookUrl,
          mapsUrl,
          findLine,
          popupBlocked: !popped,
        },
      });
    } catch (err) {
      setError(err?.message || "Complete booking failed. Try again.");
    }
  };

  return (
    <PageLayout>
      <div className={styles.page}>
        <button type="button" className={styles.backLink} onClick={() => navigate(-1)}>
          ← Transits
        </button>
        <p className={styles.kicker}>Transits beta · checkout</p>
        <h1 className={styles.title}>Confirm passengers, then finish booking</h1>
        <p className={styles.lede}>
          Itinero cannot issue tickets in-app. Finish booking opens{" "}
          <b>{selected.operator || "this operator"}</b>
          {selected.date ? ` on ${selected.date}` : ""} on partner checkout. Pick{" "}
          <b>{selected.dep || "this departure"}</b>
          {selected.bus_type ? ` · ${selected.bus_type}` : ""} for seats and payment.
        </p>

        <section className={styles.summary}>
          <em>{selected.bus_type || "Bus"}</em>
          <strong>{selected.operator || "Coach"}</strong>
          <span>
            {selected.from_name} {selected.dep || ""} → {selected.to_name} {selected.arr || ""}
          </span>
          {selected.date ? <span>{selected.date}</span> : null}
          {selected.fare ? <b>₹{Number(selected.fare).toLocaleString("en-IN")}</b> : null}
        </section>

        {passengers.map((pax, i) => (
          <div key={i} className={styles.pax}>
            <input
              placeholder="Full name (as on ID)"
              value={pax.name}
              onChange={(e) => updatePax(i, { name: e.target.value })}
            />
            <input
              placeholder="Age"
              inputMode="numeric"
              value={pax.age}
              onChange={(e) => updatePax(i, { age: e.target.value })}
            />
            <select value={pax.gender} onChange={(e) => updatePax(i, { gender: e.target.value })}>
              <option value="M">Male</option>
              <option value="F">Female</option>
              <option value="O">Other</option>
            </select>
          </div>
        ))}
        <button
          type="button"
          className={styles.add}
          onClick={() => setPassengers((p) => [...p, { name: "", age: "", gender: "M" }])}
        >
          + Add passenger
        </button>

        <input
          className={styles.phone}
          placeholder="Mobile for ticketing"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />

        {error ? <p className={styles.err}>{error}</p> : null}

        <button type="button" className={styles.cta} onClick={completeBooking}>
          Finish booking · {selected.operator || "this bus"}
          {selected.dep ? ` · ${selected.dep}` : ""}
        </button>
        <button
          type="button"
          className={styles.add}
          onClick={() => window.open(mapsUrl, "_blank", "noopener,noreferrer")}
        >
          Open in Google Maps
        </button>
        <p className={styles.note}>
          Ticket still issues via the partner. We open this operator on this date - look for{" "}
          <b>{findLine || selected.operator || "this coach"}</b>
          {findLine ? " (copied)" : ""}.
        </p>
      </div>
    </PageLayout>
  );
}
