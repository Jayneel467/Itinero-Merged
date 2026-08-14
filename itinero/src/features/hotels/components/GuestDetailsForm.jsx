import React, { useState } from "react";
import { ShieldCheck, Plus, Info } from "lucide-react";
import styles from "./GuestDetailsForm.module.css";

const SPECIAL_REQUEST_TAGS = [
  "High floor",
  "Non-smoking room",
  "Twin beds",
  "Extra bed",
  "Late check-in",
  "Anniversary",
];

export default function GuestDetailsForm({ value, onChange }) {
  const [internal, setInternal] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    ageAgreed: false,
  });
  const formData = value || internal;
  const setFormData = onChange || setInternal;

  const [selectedTags, setSelectedTags] = useState([]);
  const [specialNote, setSpecialNote] = useState("");
  const [showAdditionalGuest, setShowAdditionalGuest] = useState(false);
  const [extraGuest, setExtraGuest] = useState({ firstName: "", lastName: "", email: "" });

  const handleChange = (e) => {
    const { name, value: next, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === "checkbox" ? checked : next,
    });
  };

  const pushExtras = (nextExtra, tags = selectedTags, note = specialNote) => {
    setFormData({
      ...formData,
      additionalGuests:
        nextExtra?.firstName || nextExtra?.lastName || nextExtra?.email ? [nextExtra] : [],
      specialRequests: tags,
      specialNote: note,
    });
  };

  const toggleTag = (tag) => {
    setSelectedTags((prev) => {
      const next = prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag];
      pushExtras(extraGuest, next, specialNote);
      return next;
    });
  };

  return (
    <div className={styles.formContainer}>
      <div className={styles.header}>
        <h2 className={styles.title}>Guest details</h2>
        <p className={styles.subtitle}>
          Name and contact for the booking holder - ID is verified by the hotel at check-in, not here.
        </p>
      </div>

      <div className={styles.securityBanner}>
        <ShieldCheck size={18} aria-hidden />
        <span>Card details stay with our payment partner. We never store your payment card.</span>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Primary guest</h3>
        <p className={styles.sectionSubtitle}>As it should appear on the reservation</p>

        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="guest-first">
              First name
            </label>
            <input
              id="guest-first"
              type="text"
              name="firstName"
              autoComplete="given-name"
              value={formData.firstName || ""}
              onChange={handleChange}
              className={styles.input}
              placeholder="First name"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="guest-last">
              Last name
            </label>
            <input
              id="guest-last"
              type="text"
              name="lastName"
              autoComplete="family-name"
              value={formData.lastName || ""}
              onChange={handleChange}
              className={styles.input}
              placeholder="Last name"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="guest-email">
              Email
            </label>
            <input
              id="guest-email"
              type="email"
              name="email"
              autoComplete="email"
              value={formData.email || ""}
              onChange={handleChange}
              className={styles.input}
              placeholder="you@email.com"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="guest-phone">
              Phone
            </label>
            <input
              id="guest-phone"
              type="tel"
              name="phone"
              autoComplete="tel"
              value={formData.phone || ""}
              onChange={handleChange}
              className={styles.input}
              placeholder="Mobile number"
              required
            />
          </div>
        </div>

        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            name="ageAgreed"
            checked={Boolean(formData.ageAgreed)}
            onChange={handleChange}
            className={styles.checkboxInput}
          />
          <span className={styles.checkboxCustom} />
          <span className={styles.checkboxText}>
            Primary guest is 18+ and will check in.
            <br />
            <span className={styles.checkboxSubtext}>
              Bring a government ID to the hotel - Itinero does not collect Aadhaar, passport, or ID numbers.
            </span>
          </span>
        </label>
      </div>

      <div className={styles.section}>
        <div className={styles.additionalGuestHeader}>
          <div>
            <h3 className={styles.sectionTitle}>Additional guest</h3>
            <p className={styles.sectionSubtitle}>Optional - for shared occupancy</p>
          </div>
          <button
            type="button"
            className={styles.addGuestBtn}
            onClick={() => setShowAdditionalGuest(!showAdditionalGuest)}
          >
            <Plus size={16} /> {showAdditionalGuest ? "Hide" : "Add guest"}
          </button>
        </div>

        {showAdditionalGuest ? (
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.label}>First name</label>
              <input
                type="text"
                className={styles.input}
                placeholder="First name"
                value={extraGuest.firstName}
                onChange={(e) => {
                  const next = { ...extraGuest, firstName: e.target.value };
                  setExtraGuest(next);
                  pushExtras(next);
                }}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Last name</label>
              <input
                type="text"
                className={styles.input}
                placeholder="Last name"
                value={extraGuest.lastName}
                onChange={(e) => {
                  const next = { ...extraGuest, lastName: e.target.value };
                  setExtraGuest(next);
                  pushExtras(next);
                }}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Email</label>
              <input
                type="email"
                className={styles.input}
                placeholder="Optional email"
                value={extraGuest.email}
                onChange={(e) => {
                  const next = { ...extraGuest, email: e.target.value };
                  setExtraGuest(next);
                  pushExtras(next);
                }}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Special requests</h3>
        <p className={styles.sectionHint}>
          <Info size={14} aria-hidden /> Requests are passed to the hotel when possible - not guaranteed.
        </p>

        <div className={styles.tagsList}>
          {SPECIAL_REQUEST_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`${styles.tagChip} ${selectedTags.includes(tag) ? styles.tagChipActive : ""}`}
              onClick={() => toggleTag(tag)}
            >
              {tag}
            </button>
          ))}
        </div>

        <textarea
          className={styles.textarea}
          placeholder="Anything else? (early check-in, celebration, accessibility…)"
          value={specialNote}
          onChange={(e) => {
            const note = e.target.value;
            setSpecialNote(note);
            pushExtras(extraGuest, selectedTags, note);
          }}
          rows={3}
        />
      </div>
    </div>
  );
}
