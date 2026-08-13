import React, { useEffect, useMemo, useState } from "react";
import { AIRPORTS } from "@/constants/airports";

const CABINS = [
  { id: "ECONOMY", label: "Economy" },
  { id: "PREMIUM_ECONOMY", label: "Premium economy" },
  { id: "BUSINESS", label: "Business" },
  { id: "FIRST", label: "First" },
];

/**
 * Modal widgets for missing trip slots - driven by supervisor ui_prompts.
 */
export default function ClarificationWidgets({
  prompts,
  clarification,
  onSubmit,
  disabled,
}) {
  const list = Array.isArray(prompts) ? prompts : [];
  if (!list.length) return null;

  const known = clarification?.known || {};
  const primary = list.find((p) => p.required) || list[0];

  return (
    <div className="vero-widgets">
      {primary?.type === "date_picker" && (
        <DatePickerWidget
          prompt={primary}
          travelersPrompt={list.find((p) => p.type === "travelers_cabin")}
          known={known}
          onSubmit={onSubmit}
          disabled={disabled}
        />
      )}
      {primary?.type === "airport_picker" && (
        <AirportPickerWidget
          prompt={primary}
          travelersPrompt={list.find((p) => p.type === "travelers_cabin")}
          known={known}
          onSubmit={onSubmit}
          disabled={disabled}
        />
      )}
      {primary?.type === "travelers_cabin" &&
        !list.some((p) => p.type === "date_picker" || p.type === "airport_picker") && (
          <TravelersWidget
            prompt={primary}
            known={known}
            onSubmit={onSubmit}
            disabled={disabled}
          />
        )}
    </div>
  );
}

function DatePickerWidget({ prompt, travelersPrompt, known, onSubmit, disabled }) {
  const min = prompt.min_date || new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState("");
  const [adults, setAdults] = useState(travelersPrompt?.defaults?.adults || known.adults || 1);
  const [children, setChildren] = useState(
    travelersPrompt?.defaults?.children || known.children || 0
  );
  const [cabin, setCabin] = useState(
    travelersPrompt?.defaults?.cabin || known.cabin || "ECONOMY"
  );

  function confirm() {
    if (!date || disabled) return;
    onSubmit(
      {
        depart_date: date,
        adults: Number(adults) || 1,
        children: Number(children) || 0,
        cabin,
      },
      `Depart on ${date}`
    );
  }

  return (
    <div className="vero-modal" role="dialog" aria-label={prompt.label || "Pick a date"}>
      <header className="vero-modal__header">
        <h3>{prompt.label || "Pick your departure date"}</h3>
        {(known.origin || known.destination) && (
          <p>
            {known.origin || "?"} → {known.destination || "?"}
          </p>
        )}
      </header>
      <label className="vero-modal__field">
        <span>Departure</span>
        <input
          type="date"
          min={min}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          disabled={disabled}
        />
      </label>
      {travelersPrompt && (
        <TravelersInline
          adults={adults}
          childrenCount={children}
          cabin={cabin}
          setAdults={setAdults}
          setChildren={setChildren}
          setCabin={setCabin}
          disabled={disabled}
        />
      )}
      <button
        type="button"
        className="vero-modal__cta"
        disabled={disabled || !date}
        onClick={confirm}
      >
        Search flights
      </button>
    </div>
  );
}

function AirportPickerWidget({ prompt, travelersPrompt, known, onSubmit, disabled }) {
  const [query, setQuery] = useState("");
  const [adults, setAdults] = useState(travelersPrompt?.defaults?.adults || known.adults || 1);
  const [children, setChildren] = useState(
    travelersPrompt?.defaults?.children || known.children || 0
  );
  const [cabin, setCabin] = useState(
    travelersPrompt?.defaults?.cabin || known.cabin || "ECONOMY"
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return AIRPORTS.slice(0, 8);
    return AIRPORTS.filter(
      (a) =>
        a.city.toLowerCase().includes(q) ||
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [query]);

  function pick(airport) {
    if (disabled) return;
    const field = prompt.field || "origin";
    const answers = {
      [field]: airport.code,
      adults: Number(adults) || 1,
      children: Number(children) || 0,
      cabin,
    };
    const label =
      field === "destination"
        ? `Flying to ${airport.city} (${airport.code})`
        : `Flying from ${airport.city} (${airport.code})`;
    onSubmit(answers, label);
  }

  return (
    <div className="vero-modal" role="dialog" aria-label={prompt.label || "Pick airport"}>
      <header className="vero-modal__header">
        <h3>{prompt.label || "Choose an airport"}</h3>
      </header>
      <label className="vero-modal__field">
        <span>Search city or code</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Mumbai, BOM…"
          disabled={disabled}
          autoFocus
        />
      </label>
      <ul className="vero-modal__airports">
        {filtered.map((a) => (
          <li key={a.id}>
            <button type="button" disabled={disabled} onClick={() => pick(a)}>
              <strong>{a.city}</strong>
              <span>
                {a.code} · {a.name}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {travelersPrompt && (
        <TravelersInline
          adults={adults}
          childrenCount={children}
          cabin={cabin}
          setAdults={setAdults}
          setChildren={setChildren}
          setCabin={setCabin}
          disabled={disabled}
        />
      )}
    </div>
  );
}

function TravelersWidget({ prompt, known, onSubmit, disabled }) {
  const [adults, setAdults] = useState(prompt.defaults?.adults || known.adults || 1);
  const [children, setChildren] = useState(prompt.defaults?.children || known.children || 0);
  const [cabin, setCabin] = useState(prompt.defaults?.cabin || known.cabin || "ECONOMY");

  return (
    <div className="vero-modal" role="dialog" aria-label="Travelers and cabin">
      <header className="vero-modal__header">
        <h3>{prompt.label || "Travelers & cabin"}</h3>
      </header>
      <TravelersInline
        adults={adults}
        childrenCount={children}
        cabin={cabin}
        setAdults={setAdults}
        setChildren={setChildren}
        setCabin={setCabin}
        disabled={disabled}
      />
      <button
        type="button"
        className="vero-modal__cta"
        disabled={disabled}
        onClick={() =>
          onSubmit(
            {
              adults: Number(adults) || 1,
              children: Number(children) || 0,
              cabin,
            },
            `${adults} adult${adults > 1 ? "s" : ""}, ${String(cabin).toLowerCase()}`
          )
        }
      >
        Continue
      </button>
    </div>
  );
}

function TravelersInline({
  adults,
  childrenCount,
  cabin,
  setAdults,
  setChildren,
  setCabin,
  disabled,
}) {
  return (
    <div className="vero-modal__travelers">
      <label>
        <span>Adults</span>
        <input
          type="number"
          min={1}
          max={9}
          value={adults}
          onChange={(e) => setAdults(e.target.value)}
          disabled={disabled}
        />
      </label>
      <label>
        <span>Children</span>
        <input
          type="number"
          min={0}
          max={9}
          value={childrenCount}
          onChange={(e) => setChildren(e.target.value)}
          disabled={disabled}
        />
      </label>
      <label>
        <span>Cabin</span>
        <select value={cabin} onChange={(e) => setCabin(e.target.value)} disabled={disabled}>
          {CABINS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** Auto-open overlay for the latest assistant message that has prompts. */
export function ClarificationOverlay({ open, onClose, children }) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="vero-overlay" role="presentation" onClick={onClose}>
      <div
        className="vero-overlay__panel"
        role="document"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="vero-overlay__close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {children}
      </div>
    </div>
  );
}
