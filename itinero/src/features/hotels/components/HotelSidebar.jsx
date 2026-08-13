import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext";
import LetVeroFilter from "@/components/LetVeroFilter/LetVeroFilter";
import styles from "../HotelsPage.module.css";

function Accordion({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <>
      <button
        type="button"
        className={styles.filterSectionCollapsed}
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <h4 style={{ margin: 0 }}>{title}</h4>
        {open ? (
          <ChevronUp size={14} color="#888" />
        ) : (
          <ChevronDown size={14} color="#888" />
        )}
      </button>
      {open && <div className={styles.filterSection}>{children}</div>}
      <div className={styles.filterDivider} />
    </>
  );
}

const EMPTY_FILTERS = {
  areas: [],
  stars: [],
  minRating: null,
  maxPrice: null,
  freeCancellation: false,
  breakfast: false,
  nearAirport: false,
  keywords: [],
  matchIds: [],
};

/**
 * Live hotel filters - facets from current results (no hardcoded Bangalore / ₹).
 */
export function HotelSidebar({
  hotels = [],
  filters = EMPTY_FILTERS,
  onChange,
  onAskVero,
  onVeroFilter,
}) {
  const { formatMoney } = useCurrency();
  const [showAllAreas, setShowAllAreas] = useState(false);

  const priceBounds = useMemo(() => {
    const prices = hotels
      .map((h) => Number(h.pricePerNight) || Number(h.totalPrice) || 0)
      .filter((p) => p > 0);
    if (!prices.length) return { min: 0, max: 0 };
    return { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) };
  }, [hotels]);

  const areaFacets = useMemo(() => {
    const map = new Map();
    for (const h of hotels) {
      const area = (h.area || h.city || "City center").trim() || "City center";
      // Drop feed noise (image counters, bare plot addresses)
      if (/^\d+\s*\/\s*\d+$/.test(area)) continue;
      if (/^\d+[A-Za-z]?\s*(&|and)\s*\d+/i.test(area)) continue;
      const price = Number(h.pricePerNight) || Number(h.totalPrice) || 0;
      const prev = map.get(area) || { name: area, count: 0, minPrice: Infinity };
      prev.count += 1;
      if (price > 0 && price < prev.minPrice) prev.minPrice = price;
      map.set(area, prev);
    }
    return Array.from(map.values())
      .map((a) => ({
        ...a,
        minPrice: Number.isFinite(a.minPrice) ? a.minPrice : null,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [hotels]);

  const starFacets = useMemo(() => {
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const h of hotels) {
      const s = Math.min(5, Math.max(0, Number(h.stars) || 0));
      if (s >= 1) counts[s] = (counts[s] || 0) + 1;
    }
    return [5, 4, 3, 2, 1].filter((s) => counts[s] > 0).map((s) => ({ stars: s, count: counts[s] }));
  }, [hotels]);

  const [maxPrice, setMaxPrice] = useState(filters.maxPrice ?? priceBounds.max);

  useEffect(() => {
    setMaxPrice(filters.maxPrice ?? priceBounds.max);
  }, [filters.maxPrice, priceBounds.max]);

  const emit = (patch) => onChange?.({ ...filters, ...patch });

  const clearAll = () => {
    setMaxPrice(priceBounds.max);
    onChange?.({ ...EMPTY_FILTERS });
  };

  const applyVeroText = (text) => {
    if (onVeroFilter) return onVeroFilter(text, { priceBounds, areaFacets, hotels });
    if (onAskVero) onAskVero();
    return text?.trim() ? "Opened Vero - describe your stay there." : "";
  };

  const toggleArea = (name) => {
    const cur = filters.areas || [];
    emit({
      areas: cur.includes(name) ? cur.filter((a) => a !== name) : [...cur, name],
    });
  };

  const toggleStar = (stars) => {
    const cur = filters.stars || [];
    emit({
      stars: cur.includes(stars) ? cur.filter((s) => s !== stars) : [...cur, stars],
    });
  };

  const visibleAreas = showAllAreas ? areaFacets : areaFacets.slice(0, 6);
  const range = Math.max(1, priceBounds.max - priceBounds.min);
  const pct =
    priceBounds.max > priceBounds.min
      ? ((Math.min(maxPrice || priceBounds.max, priceBounds.max) - priceBounds.min) / range) * 100
      : 100;

  return (
    <div className={styles.sidebar}>
      <LetVeroFilter
        subtitle="Describe the stay you want."
        placeholder={`Try: “4★ near airport under ${formatMoney(priceBounds.max || 200)} with breakfast”`}
        buttonLabel="Ask Vero"
        onApply={applyVeroText}
        onClear={clearAll}
      />

      <div className={styles.filtersCard}>
        <div className={styles.filtersHeader}>
          <h3>Filters</h3>
          <button type="button" className={styles.clearAllBtn} onClick={clearAll}>
            Clear All
          </button>
        </div>

        <div className={styles.filterDivider} />

        {areaFacets.length > 0 && (
          <>
            <div className={styles.filterSection}>
              <h4>Where to stay</h4>
              {visibleAreas.map((area) => (
                <label key={area.name} className={styles.filterCheckbox}>
                  <input
                    type="checkbox"
                    checked={(filters.areas || []).includes(area.name)}
                    onChange={() => toggleArea(area.name)}
                  />
                  <span className={styles.checkboxLabel}>
                    {area.name}
                    <span style={{ color: "#98A2B3", fontWeight: 500 }}> ({area.count})</span>
                  </span>
                  <span className={styles.checkboxPrice}>
                    {area.minPrice != null ? formatMoney(area.minPrice) : "-"}
                  </span>
                </label>
              ))}
              {areaFacets.length > 6 && (
                <button
                  type="button"
                  className={styles.showMoreBtn}
                  onClick={() => setShowAllAreas((v) => !v)}
                >
                  {showAllAreas ? "Show less" : "Show more"}
                </button>
              )}
            </div>
            <div className={styles.filterDivider} />
          </>
        )}

        <Accordion title="Price" defaultOpen>
          <div style={{ padding: "0 0 8px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
              <span>{formatMoney(priceBounds.min)}</span>
              <span>Up to {formatMoney(maxPrice || priceBounds.max)}</span>
            </div>
            <input
              type="range"
              min={priceBounds.min || 0}
              max={priceBounds.max || 100}
              value={maxPrice || priceBounds.max || 0}
              disabled={!priceBounds.max}
              onChange={(e) => setMaxPrice(Number(e.target.value))}
              onMouseUp={() => emit({ maxPrice: maxPrice || null })}
              onTouchEnd={() => emit({ maxPrice: maxPrice || null })}
              style={{ width: "100%", accentColor: "#F97211" }}
              aria-valuenow={maxPrice}
              aria-valuemin={priceBounds.min}
              aria-valuemax={priceBounds.max}
            />
            <div
              style={{
                height: 4,
                background: `linear-gradient(90deg, #F97211 ${pct}%, #E4E7EC ${pct}%)`,
                borderRadius: 4,
                marginTop: -8,
                pointerEvents: "none",
                opacity: 0.35,
              }}
            />
          </div>
        </Accordion>

        {starFacets.length > 0 && (
          <Accordion title="Hotel class" defaultOpen>
            {starFacets.map(({ stars, count }) => (
              <label key={stars} className={styles.filterCheckbox}>
                <input
                  type="checkbox"
                  checked={(filters.stars || []).includes(stars)}
                  onChange={() => toggleStar(stars)}
                />
                <span className={styles.checkboxLabel}>
                  {"★".repeat(stars)}
                  <span style={{ color: "#98A2B3", fontWeight: 500 }}> ({count})</span>
                </span>
              </label>
            ))}
          </Accordion>
        )}

        <Accordion title="Review score">
          {[
            { label: "9+ Superb", value: 9 },
            { label: "8+ Very good", value: 8 },
            { label: "7+ Good", value: 7 },
            { label: "6+ Pleasant", value: 6 },
          ].map((opt) => (
            <label key={opt.value} className={styles.filterCheckbox}>
              <input
                type="radio"
                name="minRating"
                checked={filters.minRating === opt.value}
                onChange={() => emit({ minRating: opt.value })}
              />
              <span className={styles.checkboxLabel}>{opt.label}</span>
            </label>
          ))}
          {filters.minRating != null && (
            <button
              type="button"
              className={styles.showMoreBtn}
              onClick={() => emit({ minRating: null })}
            >
              Clear rating
            </button>
          )}
        </Accordion>

        <Accordion title="Freebies" defaultOpen>
          <label className={styles.filterCheckbox}>
            <input
              type="checkbox"
              checked={!!filters.freeCancellation}
              onChange={(e) => emit({ freeCancellation: e.target.checked })}
            />
            <span className={styles.checkboxLabel}>Free cancellation</span>
          </label>
          <label className={styles.filterCheckbox}>
            <input
              type="checkbox"
              checked={!!filters.breakfast}
              onChange={(e) => emit({ breakfast: e.target.checked })}
            />
            <span className={styles.checkboxLabel}>Breakfast included</span>
          </label>
        </Accordion>
      </div>
    </div>
  );
}

export { EMPTY_FILTERS };
