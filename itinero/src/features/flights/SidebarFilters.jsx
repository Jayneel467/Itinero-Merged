import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import styles from "./FlightsPage.module.css";

function FilterAccordion({ title, children, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className={styles["filter-section"]}>
      <div className={styles["filter-header"]} onClick={() => setIsOpen(!isOpen)}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#001439" }}>{title}</span>
        {isOpen ? <ChevronUp size={16} color="#888" /> : <ChevronDown size={16} color="#888" />}
      </div>
      {isOpen && <div style={{ marginTop: 15 }}>{children}</div>}
    </div>
  );
}

/**
 * Sidebar filters driven by the live result set (no invented airline/price counts).
 */
export default function SidebarFilters({
  priceBounds = { min: 0, max: 0 },
  airlineCounts = [],
  stopCounts = { Direct: 0, "1 Stop": 0, "2+ Stops": 0 },
  filters,
  onChange,
}) {
  const minBound = priceBounds.min || 0;
  const maxBound = priceBounds.max || 0;
  const [minPrice, setMinPrice] = useState(minBound);
  const [maxPrice, setMaxPrice] = useState(maxBound);
  const [airlineSearch, setAirlineSearch] = useState("");

  useEffect(() => {
    setMinPrice(minBound);
    setMaxPrice(filters?.maxPrice ?? maxBound);
  }, [minBound, maxBound, filters?.maxPrice]);

  const selectedAirlines = filters?.airlines || [];
  const selectedStops = filters?.stops || [];
  const selectedDepartureTimes = filters?.departureTimes || [];
  const selectedArrivalTimes = filters?.arrivalTimes || [];
  const duration = filters?.maxDurationHours ?? 24;

  const emit = (patch) => onChange?.({ ...filters, ...patch });

  const handleClearAll = () => {
    setMinPrice(minBound);
    setMaxPrice(maxBound);
    setAirlineSearch("");
    onChange?.({
      maxPrice: null,
      airlines: [],
      stops: [],
      departureTimes: [],
      arrivalTimes: [],
      maxDurationHours: null,
    });
  };

  const range = Math.max(1, maxBound - minBound);
  const minPercent = maxBound > minBound ? ((minPrice - minBound) / range) * 100 : 0;
  const maxPercent = maxBound > minBound ? ((maxPrice - minBound) / range) * 100 : 100;

  const visibleAirlines = airlineCounts.filter((a) =>
    a.name.toLowerCase().includes(airlineSearch.toLowerCase())
  );

  const fmt = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;

  return (
    <div className={styles["sidebar-card"]} style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, color: "#001439", fontWeight: 700 }}>Filters</h2>
        <span className={styles["filter-header-clear"]} onClick={handleClearAll} style={{ cursor: "pointer" }}>
          Clear All
        </span>
      </div>

      {maxBound > minBound ? (
        <div className={styles["filter-section"]} style={{ borderTop: "1px solid #EBEBEB", paddingTop: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 15 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: "#001439" }}>Price Range</span>
            <span style={{ fontWeight: 700, fontSize: 13, color: "#001439" }}>
              {fmt(minPrice)} – {fmt(maxPrice)}
            </span>
          </div>
          <input
            type="range"
            min={minBound}
            max={maxBound}
            value={maxPrice}
            onChange={(e) => {
              const v = Number(e.target.value);
              setMaxPrice(v);
              emit({ maxPrice: v });
            }}
            className={styles["custom-slider-input"]}
            style={{ width: "100%", accentColor: "#F97211" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#888" }}>
            <span>{fmt(minBound)}</span>
            <span style={{ width: `${maxPercent - minPercent}%` }} />
            <span>{fmt(maxBound)}</span>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
          Price filters appear after live fares load.
        </p>
      )}

      <FilterAccordion title="Airlines" defaultOpen>
        <div className={styles["filter-input-wrap"]}>
          <input
            type="text"
            placeholder="Search Airline"
            className={styles["filter-input"]}
            value={airlineSearch}
            onChange={(e) => setAirlineSearch(e.target.value)}
          />
        </div>
        {visibleAirlines.length === 0 && (
          <p style={{ fontSize: 12, color: "#888" }}>No airlines in current results.</p>
        )}
        {visibleAirlines.map((airline) => (
          <div key={airline.name} className={styles["filter-checkbox-item"]}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", cursor: "pointer" }}>
              <input
                type="checkbox"
                className={styles["filter-checkbox"]}
                checked={selectedAirlines.includes(airline.name)}
                onChange={() => {
                  const next = selectedAirlines.includes(airline.name)
                    ? selectedAirlines.filter((a) => a !== airline.name)
                    : [...selectedAirlines, airline.name];
                  emit({ airlines: next });
                }}
              />
              <span className={styles["filter-checkbox-label"]}>{airline.name}</span>
            </label>
            <span className={styles["filter-checkbox-count"]}>{airline.count}</span>
          </div>
        ))}
      </FilterAccordion>

      <FilterAccordion title="Stops">
        {["Direct", "1 Stop", "2+ Stops"].map((stop) => (
          <div key={stop} className={styles["filter-checkbox-item"]}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", cursor: "pointer" }}>
              <input
                type="checkbox"
                className={styles["filter-checkbox"]}
                checked={selectedStops.includes(stop)}
                onChange={() => {
                  const next = selectedStops.includes(stop)
                    ? selectedStops.filter((s) => s !== stop)
                    : [...selectedStops, stop];
                  emit({ stops: next });
                }}
              />
              <span className={styles["filter-checkbox-label"]}>{stop}</span>
            </label>
            <span className={styles["filter-checkbox-count"]}>{stopCounts[stop] || 0}</span>
          </div>
        ))}
      </FilterAccordion>

      <FilterAccordion title="Departure Time">
        {[
          ["morning", "Morning (06:00 - 11:59)"],
          ["afternoon", "Afternoon (12:00 - 17:59)"],
          ["evening", "Evening (18:00 - 23:59)"],
        ].map(([id, label]) => (
          <div key={id} className={styles["filter-checkbox-item"]}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", cursor: "pointer" }}>
              <input
                type="checkbox"
                className={styles["filter-checkbox"]}
                checked={selectedDepartureTimes.includes(id)}
                onChange={() => {
                  const next = selectedDepartureTimes.includes(id)
                    ? selectedDepartureTimes.filter((t) => t !== id)
                    : [...selectedDepartureTimes, id];
                  emit({ departureTimes: next });
                }}
              />
              <span className={styles["filter-checkbox-label"]}>{label}</span>
            </label>
          </div>
        ))}
      </FilterAccordion>

      <FilterAccordion title="Arrival Time">
        {[
          ["morning", "Morning (06:00 - 11:59)"],
          ["afternoon", "Afternoon (12:00 - 17:59)"],
          ["evening", "Evening (18:00 - 23:59)"],
        ].map(([id, label]) => (
          <div key={id} className={styles["filter-checkbox-item"]}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", cursor: "pointer" }}>
              <input
                type="checkbox"
                className={styles["filter-checkbox"]}
                checked={selectedArrivalTimes.includes(id)}
                onChange={() => {
                  const next = selectedArrivalTimes.includes(id)
                    ? selectedArrivalTimes.filter((t) => t !== id)
                    : [...selectedArrivalTimes, id];
                  emit({ arrivalTimes: next });
                }}
              />
              <span className={styles["filter-checkbox-label"]}>{label}</span>
            </label>
          </div>
        ))}
      </FilterAccordion>

      <FilterAccordion title="Duration">
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 13, color: "#666", fontWeight: 600 }}>
              Up to {duration} hours
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={48}
            value={duration}
            onChange={(e) => emit({ maxDurationHours: Number(e.target.value) })}
            className={styles["custom-slider-input"]}
            style={{ width: "100%", accentColor: "#F97211" }}
          />
        </div>
      </FilterAccordion>

      <div style={{ paddingTop: 12, borderTop: "1px solid #EBEBEB", marginTop: 12 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#888", textTransform: "uppercase" }}>
          Refundable Flights
        </p>
        <p style={{ margin: "6px 0 0", fontSize: 11, color: "#B7BFCC" }}>
          Refund rules are confirmed with the airline at payment — not filterable from the live feed.
        </p>
      </div>
    </div>
  );
}
