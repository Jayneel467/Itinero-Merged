import React from "react";
import {
  dayNarrative,
  formatDisplayDate,
  formatTransfer,
  minsLabel,
} from "../utils/itineraryFormat";
import styles from "./PackageItineraryList.module.css";

/**
 * Rich day-by-day itinerary - used on confirmation, checkout, and detail-adjacent views.
 */
export default function PackageItineraryList({
  days = [],
  variant = "full",
  className = "",
}) {
  const list = Array.isArray(days) ? days.filter(Boolean) : [];
  if (!list.length) {
    return (
      <p className={styles.empty}>
        Itinerary will appear here once dates are validated for this package.
      </p>
    );
  }

  const compact = variant === "compact";

  return (
    <ol className={`${styles.list} ${compact ? styles.compact : ""} ${className}`.trim()}>
      {list.map((day) => {
        const narrative = dayNarrative(day);
        const transfers = Array.isArray(day.transfers) ? day.transfers : [];
        const activities = Array.isArray(day.activities) ? day.activities : [];
        const optional = Array.isArray(day.optionalActivities) ? day.optionalActivities : [];
        const meals = Array.isArray(day.meals) ? day.meals : [];
        const mins = transfers.reduce(
          (s, t) => s + Number(t?.estimated_duration_minutes || 0),
          0
        );

        return (
          <li key={day.day} className={styles.day}>
            <div className={styles.head}>
              <strong className={styles.title}>
                Day {day.day}: {day.title || "On the road"}
              </strong>
              {day.date ? <span className={styles.date}>{formatDisplayDate(day.date)}</span> : null}
            </div>

            {narrative ? <p className={styles.narrative}>{narrative}</p> : null}

            {!compact && activities.length > 0 && (
              <div className={styles.block}>
                <span className={styles.label}>Activities</span>
                <ul>
                  {activities.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            )}

            {!compact && optional.length > 0 && (
              <div className={styles.block}>
                <span className={styles.labelOptional}>Optional</span>
                <ul>
                  {optional.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            )}

            {!compact && meals.length > 0 && (
              <div className={styles.block}>
                <span className={styles.label}>Meals</span>
                <ul>
                  {meals.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            )}

            {!compact && transfers.length > 0 && (
              <div className={styles.block}>
                <span className={styles.label}>Transfers</span>
                <ul>
                  {transfers.map((t, i) => (
                    <li key={`${day.day}-t-${i}`}>{formatTransfer(t)}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className={styles.meta}>
              {day.origin && day.destination && day.origin !== day.destination ? (
                <span>
                  {day.origin} → {day.destination}
                </span>
              ) : null}
              {day.stayCity ? <span>Stay: {day.stayCity}</span> : null}
              {day.pace ? <span className={styles.pace}>{day.pace}</span> : null}
              {mins > 0 ? <span>Road {minsLabel(mins)}</span> : null}
              {day.altitude_m ? <span>~{day.altitude_m}m</span> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
