import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageLayout } from "@/components/layout";
import { tripService } from "@/features/trips/tripService";
import { useHomeLocationOptional } from "@/context/HomeLocationContext";
import { useCurrency } from "@/context/CurrencyContext";
import { isTrainsMarket } from "@/constants/regionalFeatures";
import RegionalGate from "@/features/regional/RegionalGate";
import { readSelectedTrain } from "./utils/persistSelectedTrain";
import {
  irctcBookUrl,
  irctcFoodUrl,
  trainBookUrl,
  trainFoodPagePath,
  trainScheduleUrl,
  trainSeatsUrl,
} from "./utils/irctcBook";
import {
  ArrowLeft,
  Train,
  Calendar,
  Clock,
  User,
  Users,
  ShieldCheck,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Utensils,
  FileText,
  Sparkles,
  MapPin,
  Info,
  Lock,
  Phone,
  Mail,
  CreditCard,
  Ticket,
} from "lucide-react";
import styles from "./TrainBookingPage.module.css";

const CLASSES = [
  { code: "SL", name: "Sleeper", desc: "Non-AC 3-Tier" },
  { code: "3A", name: "3 Tier AC", desc: "AC 3-Tier Sleeper" },
  { code: "2A", name: "2 Tier AC", desc: "AC 2-Tier Sleeper" },
  { code: "1A", name: "1st Class AC", desc: "First Class AC" },
  { code: "CC", name: "AC Chair Car", desc: "AC Seater" },
  { code: "EC", name: "Exec Chair", desc: "Executive AC" },
  { code: "3E", name: "3 AC Economy", desc: "Economy 3A" },
  { code: "2S", name: "2nd Sitting", desc: "Reserved Seater" },
  { code: "EA", name: "Anubhuti", desc: "Luxury Chair" },
];

const QUOTAS = [
  { id: "GN", label: "General", desc: "Standard Quota" },
  { id: "TQ", label: "Tatkal", desc: "Last-minute booking" },
  { id: "LD", label: "Ladies", desc: "Female passengers" },
  { id: "SS", label: "Senior", desc: "Senior Citizen" },
];

const BERTHS = [
  { id: "", label: "No Preference" },
  { id: "LB", label: "Lower Berth" },
  { id: "MB", label: "Middle Berth" },
  { id: "UB", label: "Upper Berth" },
  { id: "SL", label: "Side Lower" },
  { id: "SU", label: "Side Upper" },
  { id: "WS", label: "Window Seat" },
];

function genderLabel(g) {
  if (g === "F") return "Female";
  if (g === "O") return "Other";
  return "Male";
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
  const { currency, formatMoney } = useCurrency();
  const trainsOk = isTrainsMarket({
    countryCode: home?.countryCode,
    passportCountry: home?.passportCountry,
  });

  const selected = useMemo(() => readSelectedTrain(), []);
  const [klass, setKlass] = useState(selected?.class_code || "CC");
  const [quota, setQuota] = useState(selected?.quota || "GN");
  const [passengers, setPassengers] = useState([
    { name: "", age: "", gender: "M", berth: "" },
  ]);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [irctcUser, setIrctcUser] = useState("");
  const [hasInsurance, setHasInsurance] = useState(true);
  const [autoUpgrade, setAutoUpgrade] = useState(true);
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
          <div className={styles.card} style={{ textAlign: "center", padding: "48px 24px" }}>
            <Train size={48} style={{ color: "var(--muted-light)", margin: "0 auto 16px" }} />
            <h2 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "8px" }}>
              No train selected
            </h2>
            <p className={styles.empty}>Please pick a train from the search results first.</p>
            <Link to="/trains" className={styles.backBtn} style={{ marginTop: "16px", display: "inline-flex" }}>
              <ArrowLeft size={16} /> Explore Trains
            </Link>
          </div>
        </div>
      </PageLayout>
    );
  }

  const baseFarePerPax = Number(selected.fare || 440);
  const totalBaseFare = baseFarePerPax * passengers.length;
  const irctcConvenienceFee = 17.7;
  const insuranceTotal = hasInsurance ? 0.45 * passengers.length : 0;
  const grandTotal = totalBaseFare + irctcConvenienceFee + insuranceTotal;

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

  const addPassenger = () => {
    if (passengers.length >= 6) {
      setError("Maximum 6 passengers allowed per IRCTC booking.");
      return;
    }
    setError("");
    setPassengers((p) => [...p, { name: "", age: "", gender: "M", berth: "" }]);
  };

  const removePassenger = (index) => {
    if (passengers.length <= 1) return;
    setPassengers((p) => p.filter((_, i) => i !== index));
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
        setError("Please enter the full name for all passengers (as printed on Govt ID).");
        return;
      }
      if (!mobile) {
        setError("Please enter a valid 10-digit mobile number for IRCTC SMS updates.");
        return;
      }
      if (!mail) {
        setError("Please enter a valid email address to receive your e-ticket.");
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
        totalAmount: grandTotal,
        hasInsurance,
      });

      if (!trip?.id) {
        setError("Could not save this booking. Please try again.");
        return;
      }

      const block = [
        findLine,
        ...named.map(
          (p, i) =>
            `${i + 1}. ${p.name} / ${p.age} / ${genderLabel(p.gender)}${
              p.berth ? ` / ${p.berth}` : ""
            }`
        ),
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

  const isWaitlist =
    String(selected.status_text || selected.status || "")
      .toUpperCase()
      .includes("WAIT") ||
    String(selected.status_text || selected.status || "")
      .toUpperCase()
      .includes("WL");

  return (
    <PageLayout>
      <div className={styles.page}>
        {/* Navigation Breadcrumb */}
        <div className={styles.headerNav}>
          <button type="button" className={styles.backBtn} onClick={() => navigate(-1)}>
            <ArrowLeft size={16} /> Back to Trains
          </button>
          <div className={styles.stepper}>
            <span>1. Search Train</span>
            <span className={styles.stepDivider}>/</span>
            <span className={styles.stepActive}>2. Passenger & Booking</span>
            <span className={styles.stepDivider}>/</span>
            <span>3. Confirmation</span>
          </div>
        </div>

        {/* Page Title */}
        <div className={styles.pageHeader}>
          <div className={styles.kicker}>
            <Train size={13} /> Indian Railways · IRCTC Partner
          </div>
          <h1 className={styles.title}>Complete Your Train Booking</h1>
          <p className={styles.subtitle}>
            Review journey details, choose class & quota, and enter passenger information.
          </p>
        </div>

        {/* 2-Column Responsive Layout */}
        <div className={styles.layout}>
          {/* Left Column: Forms and Preferences */}
          <div className={styles.mainColumn}>
            {/* 1. Train Journey Card */}
            <div className={styles.trainBanner}>
              <div className={styles.trainBannerTop}>
                <div className={styles.trainBadges}>
                  <span className={styles.trainNumBadge}>{selected.number}</span>
                  <span className={styles.trainName}>{selected.name}</span>
                </div>
                {selected.date && (
                  <div className={styles.trainDatePill}>
                    <Calendar size={13} />
                    {selected.date}
                  </div>
                )}
              </div>

              <div className={styles.trainRouteRow}>
                <div className={styles.stationBlock}>
                  <span className={styles.stationCode}>{selected.from_code || "Origin"}</span>
                  <span className={styles.stationTime}>{selected.dep || "--:--"}</span>
                  <span className={styles.stationName} title={selected.from_name}>
                    {selected.from_name || selected.from_code}
                  </span>
                </div>

                <div className={styles.routeTimelineMid}>
                  <span className={styles.durationBadge}>
                    <Clock size={11} style={{ display: "inline", marginRight: "4px" }} />
                    {selected.duration || "Direct"}
                  </span>
                  <div className={styles.timelineBar}>
                    <div className={styles.timelineDot} />
                  </div>
                  <span style={{ fontSize: "11px", color: "#cbd5e1" }}>Daily Express</span>
                </div>

                <div className={`${styles.stationBlock} ${styles.stationEnd}`}>
                  <span className={styles.stationCode}>{selected.to_code || "Destination"}</span>
                  <span className={styles.stationTime}>{selected.arr || "--:--"}</span>
                  <span className={styles.stationName} title={selected.to_name}>
                    {selected.to_name || selected.to_code}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Class & Quota Selection */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>
                  <div className={styles.cardTitleIcon}>
                    <Ticket size={17} />
                  </div>
                  Select Class & Quota
                </h2>
                <span className={styles.cardSubtitle}>
                  Current: {klass} ({quota})
                </span>
              </div>

              <label className={styles.fieldLabel}>Travel Class</label>
              <div className={styles.classGrid}>
                {CLASSES.map((c) => {
                  const isActive = klass === c.code;
                  return (
                    <button
                      key={c.code}
                      type="button"
                      className={`${styles.classCard} ${isActive ? styles.classCardActive : ""}`}
                      onClick={() => setKlass(c.code)}
                    >
                      <span className={styles.classCode}>{c.code}</span>
                      <span className={styles.className}>{c.name}</span>
                      <span className={styles.classPrice}>
                        ₹{Number(selected.fare || 440).toLocaleString("en-IN")}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div style={{ marginTop: "20px" }}>
                <label className={styles.fieldLabel}>Booking Quota</label>
                <div className={styles.quotaList}>
                  {QUOTAS.map((q) => {
                    const isActive = quota === q.id;
                    return (
                      <button
                        key={q.id}
                        type="button"
                        className={`${styles.quotaChip} ${isActive ? styles.quotaChipActive : ""}`}
                        onClick={() => setQuota(q.id)}
                      >
                        {isActive && <CheckCircle2 size={14} />}
                        {q.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 3. IRCTC User ID Verification */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>
                  <div className={styles.cardTitleIcon}>
                    <Lock size={17} />
                  </div>
                  IRCTC Account Details
                </h2>
                <span className={styles.cardSubtitle}>Required for ticket generation</span>
              </div>

              <div className={styles.irctcBox}>
                <label className={styles.fieldLabel} htmlFor="train-irctc-id">
                  IRCTC User ID (Username)
                </label>
                <div className={styles.irctcInputGroup}>
                  <input
                    id="train-irctc-id"
                    className={styles.inputField}
                    type="text"
                    placeholder="Enter your IRCTC username (e.g. rahul_sharma92)"
                    value={irctcUser}
                    onChange={(e) => setIrctcUser(e.target.value)}
                    autoComplete="username"
                  />
                </div>
                <p className={styles.helperText}>
                  <Info size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
                  <span>
                    We never ask for your IRCTC password. Don't have an IRCTC account?{" "}
                    <a
                      href="https://www.irctc.co.in/nget/profile/user-registration"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.helperLink}
                    >
                      Register on IRCTC <ExternalLink size={11} style={{ display: "inline" }} />
                    </a>
                  </span>
                </p>
              </div>
            </div>

            {/* 4. Traveller Information */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>
                  <div className={styles.cardTitleIcon}>
                    <Users size={17} />
                  </div>
                  Passenger Details
                </h2>
                <span className={styles.cardSubtitle}>
                  {passengers.length} of 6 passengers
                </span>
              </div>

              <div className={styles.paxList}>
                {passengers.map((pax, i) => (
                  <div key={i} className={styles.paxItem}>
                    <div className={styles.paxItemHeader}>
                      <span className={styles.paxNumberBadge}>
                        <User size={14} /> Passenger {i + 1}
                      </span>
                      {passengers.length > 1 && (
                        <button
                          type="button"
                          className={styles.removePaxBtn}
                          onClick={() => removePassenger(i)}
                          title="Remove passenger"
                        >
                          <Trash2 size={13} /> Remove
                        </button>
                      )}
                    </div>

                    <div className={styles.paxInputsGrid}>
                      <div className={`${styles.fieldGroup} ${styles.nameCol}`}>
                        <label className={styles.fieldLabel}>Full Name</label>
                        <input
                          className={styles.inputField}
                          placeholder="As on Govt ID"
                          value={pax.name}
                          onChange={(e) => updatePax(i, { name: e.target.value })}
                          autoComplete="name"
                        />
                      </div>

                      <div className={`${styles.fieldGroup} ${styles.ageCol}`}>
                        <label className={styles.fieldLabel}>Age</label>
                        <input
                          className={styles.inputField}
                          placeholder="Age"
                          inputMode="numeric"
                          maxLength={3}
                          value={pax.age}
                          onChange={(e) => updatePax(i, { age: e.target.value })}
                        />
                      </div>

                      <div className={`${styles.fieldGroup} ${styles.genderCol}`}>
                        <label className={styles.fieldLabel}>Gender</label>
                        <div className={styles.genderGroup}>
                          <button
                            type="button"
                            className={`${styles.genderBtn} ${pax.gender === "M" ? styles.genderBtnActive : ""}`}
                            onClick={() => updatePax(i, { gender: "M" })}
                          >
                            Male
                          </button>
                          <button
                            type="button"
                            className={`${styles.genderBtn} ${pax.gender === "F" ? styles.genderBtnActive : ""}`}
                            onClick={() => updatePax(i, { gender: "F" })}
                          >
                            Female
                          </button>
                          <button
                            type="button"
                            className={`${styles.genderBtn} ${pax.gender === "O" ? styles.genderBtnActive : ""}`}
                            onClick={() => updatePax(i, { gender: "O" })}
                          >
                            Other
                          </button>
                        </div>
                      </div>

                      <div className={`${styles.fieldGroup} ${styles.berthCol}`}>
                        <label className={styles.fieldLabel}>Berth Preference</label>
                        <select
                          className={styles.selectField}
                          value={pax.berth}
                          onChange={(e) => updatePax(i, { berth: e.target.value })}
                        >
                          {BERTHS.map((b) => (
                            <option key={b.id || "none"} value={b.id}>
                              {b.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}

                {passengers.length < 6 && (
                  <button type="button" className={styles.addPaxBtn} onClick={addPassenger}>
                    <Plus size={16} /> Add Another Passenger (+ Travellers)
                  </button>
                )}
              </div>
            </div>

            {/* 5. Contact Information */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>
                  <div className={styles.cardTitleIcon}>
                    <Phone size={17} />
                  </div>
                  Contact Information
                </h2>
                <span className={styles.cardSubtitle}>Your e-Ticket & SMS updates will be sent here</span>
              </div>

              <div className={styles.contactGrid}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel} htmlFor="train-phone-input">
                    Mobile Number (For IRCTC SMS)
                  </label>
                  <div className={styles.phoneInputWrapper}>
                    <span className={styles.countryCodeBadge}>+91</span>
                    <input
                      id="train-phone-input"
                      className={`${styles.inputField} ${styles.phoneInput}`}
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      placeholder="98765 43210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      autoComplete="tel"
                    />
                  </div>
                </div>

                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel} htmlFor="train-email-input">
                    Email Address (For PDF e-Ticket)
                  </label>
                  <input
                    id="train-email-input"
                    className={styles.inputField}
                    type="email"
                    placeholder="yourname@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
              </div>
            </div>

            {/* 6. Travel Insurance & Add-ons */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>
                  <div className={styles.cardTitleIcon}>
                    <ShieldCheck size={17} />
                  </div>
                  Preferences & Insurance
                </h2>
                <span className={styles.cardSubtitle}>Recommended travel protection</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <label className={`${styles.prefOption} ${hasInsurance ? styles.prefOptionActive : ""}`}>
                  <input
                    type="checkbox"
                    className={styles.checkboxCustom}
                    checked={hasInsurance}
                    onChange={(e) => setHasInsurance(e.target.checked)}
                  />
                  <div className={styles.prefInfo}>
                    <div className={styles.prefTitle}>
                      <span>Travel Insurance</span>
                      <span className={styles.prefPriceBadge}>₹0.45 / person</span>
                    </div>
                    <span className={styles.prefDesc}>
                      Includes ₹10 Lakhs accident coverage & hospital assistance per IRCTC terms.
                    </span>
                  </div>
                </label>

                <label className={`${styles.prefOption} ${autoUpgrade ? styles.prefOptionActive : ""}`}>
                  <input
                    type="checkbox"
                    className={styles.checkboxCustom}
                    checked={autoUpgrade}
                    onChange={(e) => setAutoUpgrade(e.target.checked)}
                  />
                  <div className={styles.prefInfo}>
                    <div className={styles.prefTitle}>
                      <span>Consider for Free Auto-Upgrade</span>
                      <span className={styles.prefPriceBadge}>Free</span>
                    </div>
                    <span className={styles.prefDesc}>
                      Automatically upgrade to a higher class if seats remain vacant at chart preparation.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* 7. Helpful Quick Links */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>
                  <div className={styles.cardTitleIcon}>
                    <Sparkles size={17} />
                  </div>
                  Railway Quick Actions
                </h2>
              </div>
              <div className={styles.quickLinksGrid}>
                <button
                  type="button"
                  className={styles.quickLinkBtn}
                  onClick={() => window.open(seatsUrl, "_blank", "noopener,noreferrer")}
                >
                  <Ticket size={16} /> Check Live Seat Status <ExternalLink size={12} />
                </button>
                <button
                  type="button"
                  className={styles.quickLinkBtn}
                  onClick={() => window.open(irctcUrl, "_blank", "noopener,noreferrer")}
                >
                  <Lock size={16} /> IRCTC Official Login <ExternalLink size={12} />
                </button>
                <button
                  type="button"
                  className={styles.quickLinkBtn}
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
                  <Utensils size={16} /> Order Food on Train
                </button>
                {trainScheduleUrl(selected) && (
                  <a
                    className={styles.quickLinkBtn}
                    href={trainScheduleUrl(selected)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <FileText size={16} /> Train Schedule <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Sticky Summary & Fare Breakdown */}
          <div className={styles.sidebarColumn}>
            <div className={styles.summaryCard}>
              <div className={styles.summaryHeader}>
                <h3 className={styles.summaryTitle}>Fare Summary</h3>
                <span
                  className={`${styles.statusPill} ${
                    isWaitlist ? styles.statusWaitlist : styles.statusAvailable
                  }`}
                >
                  {selected.status_text || (isWaitlist ? "WAITLIST" : "AVAILABLE")}
                </span>
              </div>

              {/* Journey Mini Snapshot */}
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                  <span style={{ fontWeight: 700, color: "var(--ink)" }}>
                    {selected.number} · {selected.name}
                  </span>
                  <span style={{ fontWeight: 700, color: "var(--accent)" }}>
                    {klass} · {quota}
                  </span>
                </div>
                <div style={{ fontSize: "12px", color: "var(--muted)" }}>
                  {selected.from_code} ({selected.dep || "--:--"}) → {selected.to_code} (
                  {selected.arr || "--:--"})
                </div>
                {selected.date && (
                  <div style={{ fontSize: "12px", color: "var(--muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                    <Calendar size={12} /> {selected.date}
                  </div>
                )}
              </div>

              <div className={styles.fareBreakdown}>
                <div className={styles.fareRow}>
                  <span>
                    Base Fare ({passengers.length} {passengers.length > 1 ? "Travellers" : "Traveller"})
                  </span>
                  <span className={styles.fareValue}>
                    {formatMoney(totalBaseFare, "INR")}
                  </span>
                </div>

                <div className={styles.fareRow}>
                  <span>IRCTC Convenience Fee</span>
                  <span className={styles.fareValue}>
                    {formatMoney(irctcConvenienceFee, "INR")}
                  </span>
                </div>

                {hasInsurance && (
                  <div className={styles.fareRow}>
                    <span>Travel Insurance</span>
                    <span className={styles.fareValue}>
                      {formatMoney(insuranceTotal, "INR")}
                    </span>
                  </div>
                )}

                <div className={styles.fareTotalRow}>
                  <span className={styles.fareTotalLabel}>Total Payable</span>
                  <span className={styles.fareTotalValue}>
                    {formatMoney(grandTotal, "INR")}
                  </span>
                </div>
              </div>

              {error && (
                <div className={styles.errorBanner}>
                  <AlertCircle size={18} style={{ flexShrink: 0 }} />
                  <span>{error}</span>
                </div>
              )}

              <button type="button" className={styles.primaryCta} onClick={completeBooking}>
                <Lock size={17} /> Proceed to Book · {formatMoney(grandTotal, "INR")}
              </button>

              <div className={styles.trustList}>
                <div className={styles.trustItem}>
                  <ShieldCheck size={16} /> Authorized IRCTC Partner Handoff
                </div>
                <div className={styles.trustItem}>
                  <CheckCircle2 size={16} /> Instant PNR SMS & WhatsApp Delivery
                </div>
                <div className={styles.trustItem}>
                  <Lock size={16} /> 100% Secure Checkout & Free Assistance
                </div>
              </div>
            </div>

            <div className={styles.noticeFooter}>
              <strong>Note:</strong> We never store your IRCTC password. Passenger details are seamlessly copied for partner checkout. Official ticket confirmation SMS & email will be issued directly by IRCTC.
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
