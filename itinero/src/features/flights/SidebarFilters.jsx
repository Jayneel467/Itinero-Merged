import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import styles from "./FlightsPage.module.css";
import { useCurrency } from "@/context/CurrencyContext";

function FilterAccordion({ title, children, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className={styles["filter-section"]}>
      <div className={styles["filter-header"]} onClick={() => setIsOpen(!isOpen)}>
        <span className="text-[13px] font-bold text-[#001439] dark:text-white">{title}</span>
        {isOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
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
  const { formatMoney } = useCurrency();
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
  // null = no cap (needed for long-haul connections that run 30-60h+)
  const duration = filters?.maxDurationHours;

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

  const visibleAirlines = airlineCounts.filter((a) =>
    a.name.toLowerCase().includes(airlineSearch.toLowerCase())
  );

  const fmt = (n) => formatMoney(n);

  return (
    <div className={styles["sidebar-card"]}>
      <div className="flex justify-between items-center mb-5">
        <h2 className="m-0 text-lg text-[#001439] dark:text-white font-bold">Filters</h2>
        <span className={styles["filter-header-clear"]} onClick={handleClearAll} style={{ cursor: "pointer" }}>
          Clear All
        </span>
      </div>

      {maxBound > minBound ? (
        <div className={`${styles["filter-section"]} border-t border-gray-200 dark:border-white/10 pt-5`}>
          <div className="flex justify-between items-center mb-3.5">
            <span className="font-bold text-[13px] text-[#001439] dark:text-white">Price Range</span>
            <span className="font-bold text-[13px] text-[#001439] dark:text-white">
              {fmt(minPrice)} - {fmt(maxPrice)}
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
            className={styles["price-range-input"]}
            aria-label="Maximum price"
          />
          <div className={styles["filter-price-bounds"]}>
            <span>{fmt(minBound)}</span>
            <span>{fmt(maxBound)}</span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
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
          <p className="text-xs text-gray-500 dark:text-gray-400">No airlines in current results.</p>
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
          <div className="flex justify-between mb-2.5">
            <span className="text-[13px] text-gray-500 dark:text-gray-400 font-semibold">
              {duration == null ? "Any duration" : `Up to ${duration} hours`}
            </span>
            {duration != null && (
              <button
                type="button"
                onClick={() => emit({ maxDurationHours: null })}
                className="border-0 bg-transparent text-[#F97211] text-xs font-bold cursor-pointer p-0"
              >
                Clear
              </button>
            )}
          </div>
          <input
            type="range"
            min={1}
            max={120}
            value={duration ?? 120}
            onChange={(e) => emit({ maxDurationHours: Number(e.target.value) })}
            className={styles["custom-slider-input"]}
            style={{ width: "100%", accentColor: "#F97211" }}
          />
        </div>
      </FilterAccordion>

      <div className="pt-3 border-t border-gray-200 dark:border-white/10 mt-3">
        <p className="m-0 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">
          Refundable Flights
        </p>
        <p className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">
          Refund rules are confirmed with the airline at payment - not filterable from the live feed.
        </p>
      </div>
    </div>
  );
}

