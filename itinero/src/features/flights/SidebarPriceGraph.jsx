import React, { useEffect, useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import styles from "./FlightsPage.module.css";
import { useCurrency } from "@/context/CurrencyContext";
import usePriceCalendar from "./hooks/usePriceCalendar";
import {
  addWatch,
  listWatches,
  refreshWatch,
  removeWatch,
} from "@/features/account/alertService";
import { loadAccountPrefs } from "@/features/profile/accountPrefs";

function shortDay(iso) {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso.slice(5);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function PriceTooltip({ active, payload, formatMoney }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row || typeof row.price !== "number") return null;
  return (
    <div className={styles["spg-tooltip"]}>
      <strong>{formatMoney(row.price)}</strong>
      <span>{row.label}</span>
      {row.isSelected ? <em>Selected day</em> : null}
    </div>
  );
}

/**
 * Live fare sparkline for the current search route (price-calendar only - never invented).
 * Designed as a fixed, fully-visible card (not mid-clipped by sidebar scroll).
 */
export default function SidebarPriceGraph({
  minPrice = null,
  origin = "",
  destination = "",
  departDate = "",
  returnDate = "",
  tripType = "oneway",
  adults = 1,
  children = 0,
  infants = 0,
  cabin = "ECONOMY",
  enabled = true,
}) {
  const { formatMoney, currency } = useCurrency();
  const [trackPrices, setTrackPrices] = useState(false);
  const [trackMsg, setTrackMsg] = useState("");
  const [trackBusy, setTrackBusy] = useState(false);

  const routeReady =
    Boolean(origin) &&
    Boolean(destination) &&
    origin.length === 3 &&
    destination.length === 3 &&
    Boolean(departDate);

  const { pricesByDate, isStripLoading, stripDates } = usePriceCalendar({
    origin,
    destination,
    departDate,
    returnDate,
    tripType,
    adults,
    children,
    infants,
    cabin,
    seedPrice: minPrice,
    enabled: enabled && routeReady,
  });

  useEffect(() => {
    if (!routeReady) {
      setTrackPrices(false);
      return;
    }
    const from = String(origin).toUpperCase();
    const to = String(destination).toUpperCase();
    setTrackPrices(listWatches().some((w) => w.origin === from && w.destination === to));
    setTrackMsg("");
  }, [origin, destination, routeReady]);

  const chartRows = useMemo(() => {
    return stripDates
      .map((iso) => {
        const price = pricesByDate[iso];
        if (typeof price !== "number" || price <= 0) return null;
        return {
          date: iso,
          label: shortDay(iso),
          price,
          isSelected: iso === departDate,
        };
      })
      .filter(Boolean);
  }, [stripDates, pricesByDate, departDate]);

  const windowMin = useMemo(() => {
    if (!chartRows.length) return null;
    return chartRows.reduce((best, row) => (row.price < best.price ? row : best), chartRows[0]);
  }, [chartRows]);

  const selectedLive =
    typeof pricesByDate[departDate] === "number" && pricesByDate[departDate] > 0
      ? pricesByDate[departDate]
      : typeof minPrice === "number" && minPrice > 0
        ? minPrice
        : null;

  const statusLine = (() => {
    if (!routeReady) return "Search a route to load live fares.";
    if (isStripLoading && chartRows.length < 2) return "Loading nearby live fares…";
    if (chartRows.length < 2) return "Waiting on live price calendar…";
    if (windowMin && selectedLive != null && windowMin.price < selectedLive * 0.98) {
      return `Nearby low on ${windowMin.label}`;
    }
    if (selectedLive != null) return "Selected day looks competitive";
    return windowMin ? `Lowest nearby on ${windowMin.label}` : "Live calendar trend";
  })();

  const yDomain = useMemo(() => {
    if (!chartRows.length) return [0, 1];
    const vals = chartRows.map((r) => r.price);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    if (lo === hi) return [Math.max(0, lo * 0.92), hi * 1.08];
    const pad = (hi - lo) * 0.12;
    return [Math.max(0, lo - pad), hi + pad];
  }, [chartRows]);

  const onToggleTrack = async () => {
    if (!routeReady || trackBusy) return;
    const from = String(origin).toUpperCase();
    const to = String(destination).toUpperCase();
    setTrackBusy(true);
    setTrackMsg("");
    try {
      if (trackPrices) {
        const watch = listWatches().find((w) => w.origin === from && w.destination === to);
        if (watch) removeWatch(watch.id);
        setTrackPrices(false);
        setTrackMsg("Stopped watching this route.");
        return;
      }
      const prefs = loadAccountPrefs();
      if (!prefs.priceAlerts) {
        setTrackMsg("Turn on Price alerts in Profile first.");
        return;
      }
      const added = addWatch({ origin: from, destination: to, currency });
      if (!added.ok) {
        setTrackMsg(added.error || "Couldn’t start tracking.");
        return;
      }
      setTrackPrices(true);
      const refreshed = await refreshWatch(added.watch.id);
      setTrackMsg(
        refreshed.ok
          ? `Watching ${from} → ${to}.`
          : `Watching ${from} → ${to}. ${refreshed.error || "Check pending."}`
      );
    } finally {
      setTrackBusy(false);
    }
  };

  return (
    <div className={`${styles["sidebar-card"]} ${styles["spg-card"]}`}>
      <div className={styles["spg-head"]}>
        <div className={styles["spg-icon"]}>
          <TrendingUp size={18} color="#22C55E" />
        </div>
        <div className={styles["spg-head-text"]}>
          <h3 className={styles["spg-title"]}>Book Now</h3>
          <p className={styles["spg-status"]}>{statusLine}</p>
        </div>
      </div>

      <div className={styles["spg-stats"]}>
        <div className={styles["spg-stat"]}>
          <span className={styles["spg-stat-label"]}>Selected</span>
          <strong className={styles["spg-stat-value"]}>
            {selectedLive != null ? formatMoney(selectedLive) : "-"}
          </strong>
        </div>
        <div className={styles["spg-stat"]}>
          <span className={styles["spg-stat-label"]}>Nearby low</span>
          <strong className={styles["spg-stat-value"]}>
            {windowMin ? formatMoney(windowMin.price) : "-"}
          </strong>
          {windowMin ? (
            <span className={styles["spg-stat-meta"]}>{windowMin.label}</span>
          ) : null}
        </div>
      </div>

      <div className={styles["spg-chart"]} aria-label="Live fare trend nearby dates">
        {chartRows.length >= 2 ? (
          <ResponsiveContainer width="100%" height={112}>
            <AreaChart data={chartRows} margin={{ top: 8, right: 6, left: 2, bottom: 2 }}>
              <defs>
                <linearGradient id="spgFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22C55E" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#22C55E" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#F0F0F0" strokeDasharray="3 6" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#98A2B3" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={22}
                height={22}
                dy={4}
              />
              <YAxis hide domain={yDomain} width={0} />
              <Tooltip
                cursor={{ stroke: "#22C55E", strokeWidth: 1, strokeDasharray: "4 4" }}
                content={<PriceTooltip formatMoney={formatMoney} />}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke="#16A34A"
                strokeWidth={2}
                fill="url(#spgFill)"
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  if (cx == null || cy == null) return null;
                  if (payload?.isSelected) {
                    return (
                      <circle
                        key={`sel-${payload.date}`}
                        cx={cx}
                        cy={cy}
                        r={4.5}
                        fill="#F97211"
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    );
                  }
                  return (
                    <circle
                      key={`pt-${payload?.date || cx}`}
                      cx={cx}
                      cy={cy}
                      r={2.5}
                      fill="#16A34A"
                    />
                  );
                }}
                activeDot={{ r: 5, fill: "#16A34A", stroke: "#fff", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className={styles["spg-chart-empty"]}>
            {isStripLoading || (enabled && routeReady)
              ? "Fetching live min fares…"
              : "Graph needs a live search with origin, destination, and date."}
          </div>
        )}
      </div>

      {chartRows.length >= 2 ? (
        <div className={styles["spg-legend"]}>
          <span>
            <i className={styles["spg-dot-live"]} /> Live calendar
          </span>
          <span>
            <i className={styles["spg-dot-selected"]} /> Selected day
          </span>
        </div>
      ) : null}

      <div className={styles["spg-track-row"]}>
        <span className={styles["spg-track-label"]}>Track prices</span>
        <div
          className={`${styles["toggle-switch"]} ${trackPrices ? styles["toggle-on"] : ""}`}
          onClick={onToggleTrack}
          role="switch"
          aria-checked={trackPrices}
          aria-busy={trackBusy}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onToggleTrack();
            }
          }}
        >
          <div className={styles["toggle-thumb"]} />
        </div>
      </div>

      {trackMsg ? <p className={styles["spg-track-msg"]}>{trackMsg}</p> : null}
    </div>
  );
}
