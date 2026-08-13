import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/layout";
import { tripService } from "@/features/trips/tripService";
import { useHomeLocationOptional } from "@/context/HomeLocationContext";
import { isTrainsMarket } from "@/constants/regionalFeatures";
import RegionalGate from "@/features/regional/RegionalGate";
import { readSelectedTrain } from "./utils/persistSelectedTrain";
import { irctcBookUrl, irctcFoodUrl, trainBookUrl, trainFoodPagePath, trainScheduleUrl, trainSeatsUrl } from "./utils/irctcBook";
import styles from "./TrainBookingPage.module.css";

const CLASSES = ["SL", "3A", "2A", "1A", "CC", "EC", "3E", "2S", "EA"];
const QUOTAS = [
  { id: "GN", label: "General" },
  { id: "TQ", label: "Tatkal" },
  { id: "LD", label: "Ladies" },
  { id: "SS", label: "Senior" },
];
const BERTHS = [
  { id: "", label: "Berth (any)" },
  { id: "LB", label: "Lower" },
  { id: "MB", label: "Middle" },
  { id: "UB", label: "Upper" },
  { id: "SL", label: "Side lower" },
  { id: "SU", label: "Side upper" },
];

function genderLabel(g) {
  if (g === "F") return "F";
  if (g === "O") return "O";
  return "M";
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function tenDigitMobile(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length >= 12 && digits.startsWith("91")) return digits.slice(-10);
  if (digits.length >= 11 && digits.startsWith("0")) return digits.slice(-10);
  if (digits.length >= 10) return digits.slice(-10);
  return "";
}

function pickMobile(...values) {
  for (const value of values) {
    const mobile = tenDigitMobile(value);
    if (mobile.length === 10) return mobile;
  }
  return "";
}

function pickEmail(...values) {
  for (const value of values) {
    if (looksLikeEmail(value)) return String(value).trim();
  }
  return "";
}

function looksLikePersonName(value) {
  const raw = String(value || "").trim();
  if (raw.length < 2 || looksLikeEmail(raw) || tenDigitMobile(raw)) return "";
  if (/\d/.test(raw)) return "";
  return raw;
}

export default function TrainBookingPage() {
  const navigate = useNavigate();
  const home = useHomeLocationOptional();
  const trainsOk = isTrainsMarket({
    countryCode: home?.countryCode,
    passportCountry: home?.passportCountry,
  });
  const selected = useMemo(() => readSelectedTrain(), []);
  const [klass, setKlass] = useState(selected?.class_code || "SL");
  const [quota, setQuota] = useState(selected?.quota || "GN");
  const [passengers, setPassengers] = useState([{ name: "", age: "", gender: "M", berth: "" }]);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [irctcUser, setIrctcUser] = useState("");
  const [error, setError] = useState("");

  if (!trainsOk) {
    return (
      <RegionalGate
        product="Trains"
        market="India"
        reason="Train checkout uses Indian Railways / IRCTC. Switch your home region or passport to India to continue."
      />
    );
  }

  if (!selected?.number) {
    return (
      <PageLayout>
        <div className={styles.page}>
          <p className={styles.empty}>Pick a train first.</p>
          <Link to="/trains" className={styles.back}>
            Back to trains
          </Link>
        </div>
      </PageLayout>
    );
  }

  const checkoutUrl = trainBookUrl({ ...selected, book_url: "" }, selected.date, klass, quota);
  const seatsUrl = trainSeatsUrl(selected, selected.date);
  const irctcUrl = irctcBookUrl(selected, selected.date, klass);
  const findLine = [
    selected.number,
    klass,
    selected.from_code && selected.to_code ? `${selected.from_code} → ${selected.to_code}` : selected.from_code || selected.to_code,
    selected.date,
  ]
    .filter(Boolean)
    .join(" · ");

  const updatePax = (i, patch) => {
    setPassengers((list) => list.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  };

  const completeBooking = () => {
    try {
      const mobile = pickMobile(phone, irctcUser, email);
      const mail = pickEmail(email, phone, irctcUser);
      const fallbackName = looksLikePersonName(phone) || looksLikePersonName(irctcUser);
      const named = passengers
        .map((p, i) => {
          const name = String(p.name || "").trim() || (i === 0 ? fallbackName : "");
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
        setError("Enter the 10-digit mobile IRCTC will SMS the e-ticket to.");
        return;
      }
      if (!mail) {
        setError("Enter the email IRCTC will send the e-ticket to.");
        return;
      }
      const irctcId = String(irctcUser || "").trim() && !tenDigitMobile(irctcUser) && !looksLikeEmail(irctcUser)
        ? String(irctcUser).trim()
        : "";
      setError("");
      const trip = tripService.recordPendingTrain({
        train: selected,
        klass,
        quota,
        passengers: named,
        contact: { phone: mobile, email: mail },
        irctcUser: irctcId,
        checkoutUrl,
      });
      if (!trip?.id) {
        setError("Could not save this booking. Try again.");
        return;
      }
      const block = [
        findLine,
        ...named.map((p, i) => `${i + 1}. ${p.name} / ${p.age} / ${genderLabel(p.gender)}${p.berth ? ` / ${p.berth}` : ""}`),
        irctcId ? `IRCTC ID: ${irctcId}` : "",
        `Mobile: ${mobile}`,
        `Email: ${mail}`,
      ]
        .filter(Boolean)
        .join("\n");
      try {
        if (block) void navigator.clipboard?.writeText(block);
      } catch {
        /* ignore */
      }
      const popped = window.open(checkoutUrl, "_blank", "noopener,noreferrer");
      navigate(`/trains/book/done?trip=${encodeURIComponent(trip.id)}`, {
        state: { tripId: trip.id, checkoutUrl, findLine, popupBlocked: !popped },
      });
    } catch (err) {
      setError(err?.message || "Complete booking failed. Try again.");
    }
  };

  return (
    <PageLayout>
      <div className={styles.page}>
        <button type="button" className={styles.backLink} onClick={() => navigate(-1)}>
          ← Trains
        </button>
        <p className={styles.kicker}>Trains · India · checkout</p>
        <h1 className={styles.title}>Complete booking on Itinero</h1>
        <p className={styles.lede}>
          Passengers stay on Itinero. Licensed partner checkout opens for{" "}
          <b>
            {selected.number} {klass}
          </b>{" "}
          ({selected.from_code} → {selected.to_code}
          {selected.date ? ` · ${selected.date}` : ""}). IRCTC still issues the e-ticket SMS/email -
          paste that PNR on the next screen.
        </p>

        <section className={styles.summary}>
          <em>{selected.number}</em>
          <strong>{selected.name}</strong>
          <span>
            {selected.from_code} {selected.dep || ""} → {selected.to_code} {selected.arr || ""}
          </span>
          {selected.date ? <span>{selected.date}</span> : null}
          {selected.duration ? <span>{selected.duration}</span> : null}
          {selected.status_text || selected.status ? <span>{selected.status_text || selected.status}</span> : null}
          {selected.fare ? <b>₹{Number(selected.fare).toLocaleString("en-IN")}</b> : null}
        </section>

        <label className={styles.label}>Class</label>
        <div className={styles.row}>
          {CLASSES.map((c) => (
            <button
              key={c}
              type="button"
              className={`${styles.chip} ${klass === c ? styles.chipOn : ""}`}
              onClick={() => setKlass(c)}
            >
              {c}
            </button>
          ))}
        </div>

        <label className={styles.label}>Quota</label>
        <div className={styles.row}>
          {QUOTAS.map((q) => (
            <button
              key={q.id}
              type="button"
              className={`${styles.chip} ${quota === q.id ? styles.chipOn : ""}`}
              onClick={() => setQuota(q.id)}
            >
              {q.label}
            </button>
          ))}
        </div>

        <label className={styles.label}>Passenger {passengers.length > 1 ? "" : "1"}</label>
        {passengers.map((pax, i) => (
          <div key={i} className={styles.pax}>
            {passengers.length > 1 ? <span className={styles.paxIndex}>Passenger {i + 1}</span> : null}
            <input
              name={`train-pax-name-${i}`}
              autoComplete="name"
              placeholder="Full name (as on ID)"
              value={pax.name}
              onChange={(e) => updatePax(i, { name: e.target.value })}
            />
            <input
              name={`train-pax-age-${i}`}
              autoComplete="off"
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
            <select
              className={styles.paxBerth}
              value={pax.berth}
              onChange={(e) => updatePax(i, { berth: e.target.value })}
            >
              {BERTHS.map((b) => (
                <option key={b.id || "any"} value={b.id}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
        ))}
        <button
          type="button"
          className={styles.add}
          onClick={() => setPassengers((p) => [...p, { name: "", age: "", gender: "M", berth: "" }])}
        >
          + Add passenger
        </button>

        <label className={styles.label} htmlFor="train-email">
          Email for e-ticket
        </label>
        <input
          id="train-email"
          className={styles.phone}
          type="email"
          name="email"
          autoComplete="email"
          placeholder="name@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label className={styles.label} htmlFor="train-mobile">
          Mobile for IRCTC SMS
        </label>
        <input
          id="train-mobile"
          className={styles.phone}
          type="tel"
          name="tel"
          autoComplete="tel"
          inputMode="numeric"
          placeholder="10-digit mobile"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <label className={styles.label} htmlFor="train-irctc">
          IRCTC user ID (optional · never password)
        </label>
        <input
          id="train-irctc"
          className={styles.phone}
          name="irctc-user"
          autoComplete="off"
          placeholder="Your IRCTC user ID"
          value={irctcUser}
          onChange={(e) => setIrctcUser(e.target.value)}
        />

        {error ? <p className={styles.err}>{error}</p> : null}

        <button type="button" className={styles.cta} onClick={completeBooking}>
          Complete booking · {selected.number} {klass}
        </button>
        <div className={styles.links}>
          <button type="button" className={styles.add} onClick={() => window.open(seatsUrl, "_blank", "noopener,noreferrer")}>
            Check seat availability
          </button>
          <button type="button" className={styles.add} onClick={() => window.open(irctcUrl, "_blank", "noopener,noreferrer")}>
            Open IRCTC login
          </button>
          <button
            type="button"
            className={styles.add}
            onClick={() =>
              navigate(
                trainFoodPagePath({
                  tab: "train",
                  trainNumber: selected.number,
                  boarding: selected.from_code,
                  date: selected.date,
                })
              )
            }
          >
            Order food on train
          </button>
          <button
            type="button"
            className={styles.add}
            onClick={() =>
              window.open(
                irctcFoodUrl({ trainNumber: selected.number, station: selected.from_code, date: selected.date }),
                "_blank",
                "noopener,noreferrer"
              )
            }
          >
            IRCTC eCatering
          </button>
          {trainScheduleUrl(selected) ? (
            <a className={styles.add} href={trainScheduleUrl(selected)} target="_blank" rel="noopener noreferrer">
              Official schedule
            </a>
          ) : null}
        </div>
        <p className={styles.note}>
          We never take the rail fare here, and never ask for your IRCTC password. Passenger names are copied for
          partner checkout. Ticket confirmation still comes from IRCTC.
        </p>
      </div>
    </PageLayout>
  );
}
