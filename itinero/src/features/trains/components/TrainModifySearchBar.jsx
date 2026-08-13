import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import usePlaceSuggest from "@/features/buses/hooks/usePlaceSuggest";
import useStationSuggest from "../hooks/useStationSuggest";
import styles from "./TrainModifySearchBar.module.css";

function ymdFromWhen(when) {
  const t = String(when || "").trim().toLowerCase();
  const d = new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (t === "today") return toYmd(d);
  d.setDate(d.getDate() + 1);
  return toYmd(d);
}

function toYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function displayStation(name, code) {
  const n = String(name || "").trim();
  const c = String(code || "").trim().toUpperCase();
  if (n && c && !/\([A-Z]{2,5}\)\s*$/.test(n)) return `${n} (${c})`;
  return n || c;
}

function fold(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\b(jn\.?|junction|station|city|cantt\.?|bus stand)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function filterCities(q, options = []) {
  const t = fold(q);
  if (t.length < 2) return [];
  return options
    .filter((c) => {
      const hay = fold([c.name, c.state, ...(c.aliases || [])].join(" "));
      return hay.startsWith(t) || hay.includes(t);
    })
    .slice(0, 10)
    .map((c) => ({
      code: c.name,
      name: c.name,
      state: c.state || "",
      label: c.name,
    }));
}

function mergePlaceItems(localCities, remotePlaces, typed) {
  const out = [];
  const seen = new Set();
  const add = (row) => {
    const key = fold(row.address || row.label || row.name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(row);
  };
  localCities.forEach(add);
  remotePlaces.forEach(add);
  const q = String(typed || "").trim();
  if (q.length >= 2 && !seen.has(fold(q))) {
    out.unshift({ name: q, label: q, address: q, state: "Use this place", code: "" });
  }
  return out.slice(0, 12);
}

function SuggestField({
  label,
  value,
  placeholder,
  enabled,
  open,
  onOpen,
  onChange,
  onPick,
  cityOptions,
  placeSuggest = false,
}) {
  const stationMode = enabled && !cityOptions && !placeSuggest;
  const { stations, isLoading } = useStationSuggest(value, { enabled: stationMode && open });
  const { places, isLoading: placeLoading } = usePlaceSuggest(value, {
    enabled: Boolean(placeSuggest) && enabled && open,
  });
  const cities = useMemo(
    () => (cityOptions && open ? filterCities(value, cityOptions) : []),
    [cityOptions, open, value]
  );
  const items = placeSuggest
    ? mergePlaceItems(cities, places, value)
    : cityOptions
      ? cities
      : stations;
  const loading = (stationMode && isLoading) || (placeSuggest && placeLoading);

  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => onOpen(true)}
        onChange={(e) => {
          onOpen(true);
          onChange(e.target.value);
        }}
      />
      {enabled && open && (items.length > 0 || loading) ? (
        <div className={styles.menu} role="listbox">
          {loading && items.length === 0 ? (
            <p className={styles.hint}>{placeSuggest ? "Finding places…" : cityOptions ? "Finding cities…" : "Finding stations…"}</p>
          ) : null}
          {items.map((stn) => (
            <button
              key={`${stn.code || ""}-${stn.address || stn.name}`}
              type="button"
              className={styles.opt}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(stn)}
            >
              <strong>{stn.name}</strong>
              {!cityOptions && !placeSuggest ? <em>{stn.code}</em> : null}
              {stn.state ? <span>{stn.state}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </label>
  );
}

export default function TrainModifySearchBar({
  from,
  to,
  when,
  fromCode = "",
  toCode = "",
  onSearch,
  fromPlaceholder = "Station or city",
  toPlaceholder = "Station or city",
  stationSuggest = true,
  cityOptions = null,
  placeSuggest = false,
  submitLabel = "Modify search",
  className = "",
}) {
  const useCities = Array.isArray(cityOptions) && cityOptions.length > 0;
  const suggestOn = useCities || stationSuggest || placeSuggest;
  const [origin, setOrigin] = useState(useCities ? from : displayStation(from, fromCode));
  const [dest, setDest] = useState(useCities ? to : displayStation(to, toCode));
  const [originCode, setOriginCode] = useState(fromCode || "");
  const [destCode, setDestCode] = useState(toCode || "");
  const [date, setDate] = useState(() => ymdFromWhen(when));
  const [open, setOpen] = useState(null);
  const barRef = useRef(null);

  useEffect(() => {
    setOrigin(useCities ? from : displayStation(from, fromCode));
    setDest(useCities ? to : displayStation(to, toCode));
    setOriginCode(fromCode || "");
    setDestCode(toCode || "");
    setDate(ymdFromWhen(when));
  }, [from, to, when, fromCode, toCode, useCities]);

  useEffect(() => {
    if (!suggestOn) return undefined;
    const close = (e) => {
      if (!barRef.current?.contains(e.target)) setOpen(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [suggestOn]);

  const submit = (e) => {
    e?.preventDefault?.();
    setOpen(null);
    onSearch?.({
      from: origin.replace(/\s*\([A-Z]{2,5}\)\s*$/, "").trim() || origin.trim(),
      to: dest.replace(/\s*\([A-Z]{2,5}\)\s*$/, "").trim() || dest.trim(),
      fromCode: originCode,
      toCode: destCode,
      when: date,
    });
  };

  return (
    <form className={`${styles.bar}${className ? ` ${className}` : ""}`} onSubmit={submit} ref={barRef}>
      <SuggestField
        label="From"
        value={origin}
        placeholder={fromPlaceholder}
        enabled={suggestOn}
        cityOptions={useCities ? cityOptions : null}
        placeSuggest={placeSuggest}
        open={open === "from"}
        onOpen={(v) => setOpen(v ? "from" : null)}
        onChange={(v) => {
          setOrigin(v);
          setOriginCode("");
        }}
        onPick={(stn) => {
          const label = placeSuggest
            ? stn.address || stn.label || stn.name
            : useCities
              ? stn.name
              : stn.label || `${stn.name} (${stn.code})`;
          setOrigin(label);
          setOriginCode(placeSuggest || useCities ? "" : stn.code);
          setOpen("to");
        }}
      />
      <button
        type="button"
        className={styles.swap}
        aria-label="Swap"
        onClick={() => {
          setOrigin(dest);
          setDest(origin);
          setOriginCode(destCode);
          setDestCode(originCode);
        }}
      >
        <ArrowLeftRight size={16} />
      </button>
      <SuggestField
        label="To"
        value={dest}
        placeholder={toPlaceholder}
        enabled={suggestOn}
        cityOptions={useCities ? cityOptions : null}
        placeSuggest={placeSuggest}
        open={open === "to"}
        onOpen={(v) => setOpen(v ? "to" : null)}
        onChange={(v) => {
          setDest(v);
          setDestCode("");
        }}
        onPick={(stn) => {
          const label = placeSuggest
            ? stn.address || stn.label || stn.name
            : useCities
              ? stn.name
              : stn.label || `${stn.name} (${stn.code})`;
          setDest(label);
          setDestCode(placeSuggest || useCities ? "" : stn.code);
          setOpen(null);
        }}
      />
      <label className={styles.field}>
        <span>Date</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <button type="submit" className={styles.search}>
        {submitLabel}
      </button>
    </form>
  );
}
